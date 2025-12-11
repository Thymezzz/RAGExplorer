"""
Workflow creation utilities for RAG system
Handles workflow instantiation and dataset loading
"""

import os
import json
from typing import Dict, Any, List
from workflow import SimpleWorkflow

def load_questions_dataset(dataset_name: str, dataset_manager) -> List[Dict]:
    """
    Load question dataset from DatasetManager
    
    Args:
        dataset_name: Question dataset name
        dataset_manager: DatasetManager instance
    
    Returns:
        Question list
    """
    if dataset_manager is None:
        raise ValueError("dataset_manager cannot be None, unable to load questions dataset")
    
    questions_path = dataset_manager.get_dataset_path(dataset_name, 'questions')
    if not os.path.exists(questions_path):
        raise FileNotFoundError(f"Question dataset file not found: {questions_path}")
    
    # Read question dataset JSON file
    with open(questions_path, 'r', encoding='utf-8') as f:
        questions_data = json.load(f)
    
    print(f"Loaded {len(questions_data)} questions from {questions_path}")
    return questions_data


def create_workflow(selected_params: Dict[str, Any], dataset_manager=None):
    """
    Create workflow instance based on selected parameters
    
    Args:
        selected_params: Selected parameters dictionary with format {'param_name': ['value'], ...}
        dataset_manager: Dataset manager instance for loading user uploaded datasets
        
    Returns:
        SimpleWorkflow instance with batch_evaluate_configuration method
    """
    
    rag_response_model = selected_params.get('rag_response_model', ['gpt-4o-mini'])[0]
    embedding_model = selected_params.get('embedding_model', ['Qwen/Qwen3-Embedding-0.6B'])[0]
    rerank_model = selected_params.get('rerank_model', ['none'])[0]
    evaluate_model = selected_params.get('evaluate_model', ['gpt-4o-mini'])[0]
    k = int(selected_params.get('k', ['5'])[0])
    rerank_range = int(selected_params.get('rerank_range', ['20'])[0])
    chunk_size = int(selected_params.get('chunk_size', ['1000'])[0])
    chunk_overlap = int(selected_params.get('chunk_overlap', ['100'])[0])
    corpus_name = selected_params.get('corpus', ['corpus'])[0]
    
    if rerank_model == 'none':
        rerank_model = None
    
    # Create SimpleWorkflow instance with batch_evaluate_configuration method
    return SimpleWorkflow(
        rag_response_model=rag_response_model,
        embedding_model=embedding_model,
        rerank_model=rerank_model,
        evaluate_model=evaluate_model,
        k=k,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        rerank_range=rerank_range,
        corpus_name=corpus_name,
        dataset_manager=dataset_manager,
    )
