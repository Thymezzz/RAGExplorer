"""
RAG response parsing utilities.

Handles parsing of RAG system responses to extract
structured information like final answers and supporting sentences.
"""

import json
from typing import Tuple, List

from .json_parser import parse_json_safely


def parse_rag_response(raw_response) -> Tuple[str, List[str]]:
    """
    Parse RAG generated response, extract supporting sentences and final answer.
    Return raw response if parsing fails.
    
    Args:
        raw_response (str): Raw response text from RAG, expected to be JSON format
                           with 'supporting_sentences' and 'final_answer' keys
        
    Returns:
        tuple: (final_answer, supporting_sentences)
            - final_answer (str): Extracted final answer or raw response
            - supporting_sentences (list): List of supporting sentences
    """
    # Check if raw_response is None or empty
    if raw_response is None:
        return "", []
    
    # Ensure raw_response is string type
    if not isinstance(raw_response, str):
        raw_response = str(raw_response)
    
    # Try JSON parsing
    try:
        # Use shared JSON parsing function
        response_data = parse_json_safely(raw_response)
        
        if response_data is None:
            return raw_response, []
        
        # Extract supporting_sentences and final_answer
        if isinstance(response_data, dict):
            supporting_sentences = response_data.get('supporting_sentences', [])
            final_answer = response_data.get('final_answer', raw_response)
            
            # Ensure supporting_sentences is list type
            if not isinstance(supporting_sentences, list):
                supporting_sentences = [str(supporting_sentences)] if supporting_sentences else []
            
            # Ensure final_answer is string type
            if not isinstance(final_answer, str):
                final_answer = str(final_answer) if final_answer else ""
            
            return final_answer, supporting_sentences
        else:
            # Not dictionary format, return raw response
            return raw_response, []
    
    except (json.JSONDecodeError, KeyError, TypeError, ValueError, SyntaxError) as e:
        # JSON parsing failed, return raw response
        print(f"JSON parsing failed, returning raw response: {str(e)}")
        print(f"Raw response content: {raw_response[:200]}...")
        if "'" in raw_response:
            print("⚠️ Detected single quotes, may be JSON format issue (should use double quotes)")
        return raw_response, []
