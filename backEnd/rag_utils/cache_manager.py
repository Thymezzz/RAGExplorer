"""
Cache management utilities for RAG system
Handles cache file naming, saving, and loading
"""

import os
import pickle
from typing import Dict, Any


def normalize_embedding_model_name(embedding_model: str) -> str:
    """Normalize embedding model name, unify Pro version with standard version"""
    # Map Pro version model name to standard version
    normalized_name = embedding_model.replace('Pro/BAAI/bge-m3', 'BAAI/bge-m3')
    return normalized_name


def generate_cache_filename(selected_params: Dict[str, Any], cache_version: str = "v2.0") -> str:
    """
    Generate independent cache filename based on configuration parameters
    
    Args:
        selected_params: Selected parameters dictionary
        cache_version: Cache version
        
    Returns:
        Cache filename
    """
    # Extract key parameters for filename
    core_params = {
        'dataset': selected_params.get('dataset', ['MultiHop-RAG'])[0],
        'rag_response_model': selected_params.get('rag_response_model', ['gpt-4o-mini'])[0],
        'embedding_model': selected_params.get('embedding_model', ['Qwen/Qwen3-Embedding-0.6B'])[0],
        'rerank_model': selected_params.get('rerank_model', ['none'])[0],
        'evaluate_model': selected_params.get('evaluate_model', ['gpt-4o-mini'])[0],
        'k': selected_params.get('k', ['5'])[0],
        'rerank_range': selected_params.get('rerank_range', ['20'])[0],
        'chunk_size': selected_params.get('chunk_size', ['1000'])[0],
        'chunk_overlap': selected_params.get('chunk_overlap', ['100'])[0],
    }
    
    # Generate filename-friendly string
    dataset_short = core_params['dataset'].replace('MultiHop-RAG', 'MultiHopRAG').replace('yixuantt/', '')
    rag_model_short = core_params['rag_response_model'].replace('gpt-', 'gpt').replace('anthropic/', '').replace('claude-', 'claude')
    
    # Normalize embedding model name for consistent cache naming
    normalized_embedding_model = normalize_embedding_model_name(core_params['embedding_model'])
    embedding_model_short = normalized_embedding_model.split('/')[-1].replace('Embedding-', 'Emb')
    
    # Handle rerank model name, keep Pro version and standard version naming consistent
    rerank_model = core_params['rerank_model']
    if rerank_model != 'none':
        # Map Pro version to standard version naming
        rerank_model_short = rerank_model.replace('Pro/BAAI/bge-reranker-v2-m3', 'BAAI/bge-reranker-v2-m3')
    else:
        rerank_model_short = ''
    evaluate_model_short = core_params['evaluate_model'].replace('gpt-', 'gpt').replace('anthropic/', '').replace('claude-', 'claude')
    
    filename = f"cache_{dataset_short}_{rag_model_short}_{embedding_model_short}_{rerank_model_short}_{evaluate_model_short}_k{core_params['k']}_rerank{core_params['rerank_range']}_chunk{core_params['chunk_size']}_overlap{core_params['chunk_overlap']}_{cache_version}"
    
    # Replace special characters in filename
    filename = filename.replace('/', '_').replace('-', '_').replace('.', '_')
    filename = filename + '.pkl'
    
    return filename


def save_individual_cache(selected_params: Dict[str, Any], cache_data: dict, cache_dir: str = "./cache", cache_version: str = "v2.0") -> str:
    """
    Save cache for single configuration as independent file
    
    Args:
        selected_params: Selected parameters dictionary
        cache_data: Cache data to save
        cache_dir: Cache directory
        cache_version: Cache version
        
    Returns:
        Saved file path
    """
    try:
        # Ensure cache directory exists
        os.makedirs(cache_dir, exist_ok=True)
        
        # Generate filename
        filename = generate_cache_filename(selected_params, cache_version)
        cache_file = os.path.join(cache_dir, filename)
        
        # Save cache
        with open(cache_file, 'wb') as f:
            pickle.dump(cache_data, f)
        
        return cache_file
        
    except Exception as e:
        print(f"⚠️ Failed to save individual cache file: {e}")
        raise


def load_individual_cache(selected_params: Dict[str, Any], cache_dir: str = "./cache", cache_version: str = "v2.0") -> dict:
    """
    Load cache for single configuration from independent file
    
    Args:
        selected_params: Selected parameters dictionary
        cache_dir: Cache directory
        cache_version: Cache version
        
    Returns:
        Loaded cache data, returns empty dict if not exists
    """
    try:
        # Generate filename
        filename = generate_cache_filename(selected_params, cache_version)
        cache_file = os.path.join(cache_dir, filename)
        
        if os.path.exists(cache_file):
            with open(cache_file, 'rb') as f:
                cache_data = pickle.load(f)
            print(f"✅ Successfully loaded individual cache file: {cache_file}")
            return cache_data
        else:
            print(f"📁 Individual cache file does not exist: {cache_file}")
            return {}
            
    except Exception as e:
        print(f"⚠️ Failed to load individual cache file: {e}")
        return {}
