"""
Response formatting utilities for RAG system
Handles assembly and formatting of RAG results for frontend
"""

from typing import List, Dict, Any, Optional


def assemble_questions(rag_results: List[Dict[str, Any]], direct_results: Optional[List] = None) -> List[Dict[str, Any]]:
    """
    Assemble question list from RAG results
    
    Args:
        rag_results: List of RAG evaluation results
        direct_results: Deprecated parameter kept for backward compatibility
    
    Returns:
        List of formatted question dictionaries with all required fields
        Includes direct_response and direct_correct fields with default values for frontend compatibility
    """
    questions = []
    for i, rag_item in enumerate(rag_results):
        # Get evidence retrieval analysis result
        evidence_retrieval = rag_item.get('evidence_retrieval_analysis', {})
        
        questions.append({
            'id': i,
            'query': rag_item['query'],
            'answer': rag_item['answer'],
            'rag_response': rag_item['response'],
            'direct_response': '',  # Keep field for frontend compatibility
            'rag_correct': rag_item['correct'],
            'direct_correct': False,  # Keep field for frontend compatibility
            'supporting_sentences': rag_item.get('supporting_sentences', []),
            'retrieved_docs': rag_item.get('retrieved_docs', []),
            'backup_docs': rag_item.get('backup_docs', []),
            'raw_response': rag_item.get('raw_response', ''),
            'evidence_list': rag_item.get('evidence_list', []),
            'evidence_retrieval_analysis': evidence_retrieval,
            'error_type': rag_item.get('error_type', 'unknown'),
        })
    return questions
