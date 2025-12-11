"""
Response evaluation utilities.

Provides functions for evaluating RAG system responses against ground truth answers
using LLM-based evaluation.
"""

from .api import call_openai_api
from .config import evaluate_prompt_with_query


def evaluate_response(query: str, response: str, ground_truth: str, evaluate_model: str = "gpt-4o-mini") -> bool:
    """
    Evaluate response correctness - generic function.
    
    Uses an LLM to determine if a predicted answer is semantically consistent
    with the ground truth answer in the context of the given question.
    
    Args:
        query: User question
        response: Response to evaluate
        ground_truth: Correct answer
        evaluate_model: Model to use for evaluation
        
    Returns:
        bool: Whether response is correct
    """
    try:
        eval_prompt = evaluate_prompt_with_query
        messages = [{
            "role": "user", 
            "content": eval_prompt.replace('$question', query)
                                .replace('$ground_truth', ground_truth)
                                .replace('$predicted_answer', response)
        }]
        
        full_response = call_openai_api(messages, model=evaluate_model)
        normalized_response = full_response.strip().lower()
        
        positive_responses = {'true', 'yes', 'correct', 'right'}
        return normalized_response in positive_responses
        
    except Exception as e:
        print(f"Evaluation error: {e}")
        return False
