"""
Utility functions for RAG system
Includes cosine similarity calculation and document formatting
"""

import numpy as np


def calculate_cosine_similarity(vec1, vec2):
    """
    Calculate cosine similarity between two vectors
    
    Args:
        vec1: First vector
        vec2: Second vector
    
    Returns:
        Cosine similarity value
    """
    vec1 = np.array(vec1)
    vec2 = np.array(vec2)
    return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))


def format_docs(docs):
    """Format documents as context string"""
    return "\n\n".join(doc.page_content for doc in docs)
