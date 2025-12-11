"""
Error type analysis for RAG systems.

Classifies different types of failures in RAG systems using a systematic
error categorization framework (FP1-FP7).
"""

from typing import Dict, Any
from string import Template

from .json_parser import parse_json_safely
from .api import call_openai_api
from .config import generation_error_analysis_prompt


def analyze_error_type(query: str, is_correct: bool, response: str, ground_truth: str, 
                      evidence_retrieval_analysis: Dict[str, Any],
                      raw_response: str,
                      evaluate_model: str = "gpt-4o-mini") -> Dict[str, Any]:
    """
    Analyze RAG system error type using systematic classification.
    
    Classifies errors into categories:
    - Correct: No error
    - FP1: Missing content (should answer "insufficient information")
    - FP2: Missed top ranked documents in retrieval
    - FP3: Not in context (retrieved but not in final context)
    - FP4: Not extracted (evidence in context but not used)
    - FP5: Wrong format (invalid JSON structure)
    - FP6: Incorrect specificity (too broad or narrow)
    - FP7: Incomplete answer (missing key information)
    
    Args:
        query: User query
        is_correct: Whether response is correct
        response: RAG system answer
        ground_truth: Correct answer
        evidence_retrieval_analysis: Evidence retrieval analysis result
        raw_response: Raw RAG system answer
        evaluate_model: Evaluation model
        
    Returns:
        Dict containing error type and details
    """
    # --- Step 1: Correctness Check ---
    if is_correct:
        return {
            'error_type': 'correct',
            'description': 'The response is correct.'
        }

    # --- Step 2: Basic Errors (Highest Priority) ---
    # FP1: Missing Content
    gt_is_insufficient = "insufficient information" in ground_truth.lower()
    res_is_insufficient = "insufficient information" in response.lower()
    if gt_is_insufficient and not res_is_insufficient:
        return {
            'error_type': 'missing_content',  # FP1
            'description': 'Should have answered "insufficient information", but gave a different answer.'
        }

    # FP5: Wrong Format
    # Check JSON format and structure
    response_data = parse_json_safely(raw_response)
    
    # If JSON can't be parsed or is not dict, it's a format error (FP5)
    if response_data is None or not isinstance(response_data, dict):
        return {
            'error_type': 'wrong_format',  # FP5
            'description': 'The output format is incorrect (response is not a valid JSON object).'
        }
    
    # JSON parsing successful, check for required keys
    has_supporting_sentences = 'supporting_sentences' in response_data
    has_final_answer = 'final_answer' in response_data
    
    # If missing final_answer or supporting_sentences, it's content missing issue, classify as FP7 (incomplete)
    if not has_final_answer or not has_supporting_sentences:
        return {
            'error_type': 'incomplete',  # FP7
            'description': 'The answer is incomplete (missing final_answer or supporting_sentences key).'
        }

    # --- Step 3: Retrieval Pipeline Errors ---
    hit_counts = evidence_retrieval_analysis.get('hit_counts')
    if hit_counts and hit_counts['total_evidence'] > 0:
        total_evidence = hit_counts['total_evidence']
        context_hits = hit_counts['context_hits']
        backup_hits = hit_counts['backup_hits']
        total_hits = context_hits + backup_hits

        retrieval_coverage_ratio = total_hits / total_evidence
        context_coverage_ratio = context_hits / total_evidence

        # FP2: Missed Top Ranked Documents
        if retrieval_coverage_ratio < 0.7:  # Threshold 70%
            return {
                'error_type': 'missed_top_ranked_documents',  # FP2
                'description': f'Only {retrieval_coverage_ratio:.1%} of relevant evidence was ranked in the initial retrieval pool (threshold: 70%).',
                'details': hit_counts
            }
        
        # FP3: Not in Context
        if context_coverage_ratio < 0.7:  # Threshold 70%
            return {
                'error_type': 'not_in_context',  # FP3
                'description': f'Only {context_coverage_ratio:.1%} of relevant evidence was selected for the final context (threshold: 70%).',
                'details': hit_counts
            }

    # --- Step 4: Generation Pipeline Errors ---
    # If code reaches here, retrieval is considered "good enough" (coverage >= 70%)
    
    # 4a. Deterministic judgment: if all relevant evidence in context but still wrong
    if hit_counts and hit_counts['total_evidence'] > 0:
        context_hits = hit_counts['context_hits']
        total_evidence = hit_counts['total_evidence']
        
        if context_hits == total_evidence:
            return {
                'error_type': 'not_extracted',  # FP4
                'description': 'All relevant evidence was in the context, but the LLM failed to extract the key information correctly.',
                'details': hit_counts
            }
    
    # 4b. Other generation errors: use LLM call to distinguish
    context_coverage_for_prompt = "N/A"
    if hit_counts and hit_counts['total_evidence'] > 0:
        context_coverage_for_prompt = f"{(hit_counts['context_hits'] / hit_counts['total_evidence']):.0%}"

    # Use prompt template from config
    prompt_template = Template(generation_error_analysis_prompt)
    generation_error_prompt = prompt_template.substitute(
        context_coverage=context_coverage_for_prompt,
        query=query,
        ground_truth=ground_truth,
        response=response,
        raw_response=raw_response
    )
    
    try:
        messages = [{"role": "user", "content": generation_error_prompt}]
        llm_verdict = call_openai_api(messages, model=evaluate_model).strip().lower().replace("(fp4)", "").replace("(fp6)", "").replace("(fp7)", "").strip()

        if llm_verdict in ['incorrect_specificity', 'incomplete']:
            error_descriptions = {
                'incorrect_specificity': "The answer's concept scope is incorrect (too broad or too narrow).",
                'incomplete': 'The answer is incomplete and is missing key information.'
            }
            return {
                'error_type': llm_verdict,
                'description': error_descriptions[llm_verdict]
            }
    except Exception as e:
        print(f"Error during generation link analysis: {e}")
        # Fallback if LLM call fails
        return {
            'error_type': 'unknown',
            'description': 'Generation error analysis failed.'
        }

    # --- Step 5: Final Fallback ---
    return {
        'error_type': 'unknown',
        'description': 'Could not match the issue to a known error type.'
    }
