"""
Parameter generation utilities for RAG system
Generates parameter configurations for models and settings
"""

import json
from typing import List, Dict, Any
from .config import embedding_api_models, rerank_api_models


def generate_llm_parameters() -> List[Dict[str, str]]:
    """Generate LLM model parameter list from available models"""
    common_models = [
        "google/gemini-2.0-flash-001",
        "google/gemini-2.5-flash",
        "deepseek/deepseek-chat-v3-0324",
        "openai/gpt-5-mini",
        "openai/gpt-4o-mini",
        "x-ai/grok-3-mini",
        "qwen/qwen3-30b-a3b",
        "meta-llama/llama-3.3-70b-instruct"
    ]
    
    # Try to read available models from saved JSON file
    try:
        with open('models_data.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
            available_models = data.get('data', [])
    except FileNotFoundError:
        # If file doesn't exist, auto-call extract_models.py to generate data
        try:
            import subprocess
            print("models_data.json not found, auto-fetching latest model data...")
            
            # Call extract_models.py script (using conda environment)
            result = subprocess.run(['conda', 'run', '-n', 'ragvis', 'python', 'extract_models.py'], 
                                  capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                # Retry reading the generated JSON file
                with open('models_data.json', 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    available_models = data.get('data', [])
                print(f"Successfully fetched {len(available_models)} model data")
            else:
                print(f"Failed to fetch model data: {result.stderr}")
                # Fallback to common models
                available_models = [{"id": model, "name": model} for model in common_models]
                
        except Exception as e:
            print(f"Error auto-fetching model data: {e}")
            # Fallback to common models
            available_models = [{"id": model, "name": model} for model in common_models]
    
    # Create model ID to name mapping
    model_map = {model["id"]: model["name"] for model in available_models}
    
    parameters = []
    
    # First add common models
    for model_id in common_models:
        if model_id in model_map:
            display_name = model_map[model_id]
            # Simplify display name
            display_name = display_name.replace("OpenAI: ", "").replace("Anthropic: ", "").replace("Google: ", "")
            parameters.append({"id": model_id, "label": display_name})
    
    # Then add other models (sorted by price, from free to paid)
    other_models = []
    for model in available_models:
        model_id = model["id"]
        if model_id not in common_models:
            # Calculate price for sorting
            pricing = model.get("pricing", {})
            prompt_price = float(pricing.get("prompt", 0))
            completion_price = float(pricing.get("completion", 0))
            total_price = prompt_price + completion_price
            
            display_name = model["name"].replace("OpenAI: ", "").replace("Anthropic: ", "").replace("Google: ", "")
            other_models.append({
                "id": model_id, 
                "label": display_name,
                "price": total_price
            })
    
    # Sort by price (free models first)
    other_models.sort(key=lambda x: x["price"])
    
    # Add to parameter list
    for model in other_models:
        parameters.append({"id": model["id"], "label": model["label"]})
    
    return parameters


def generate_embedding_parameters() -> List[Dict[str, str]]:
    """Generate embedding model parameter list from config"""
    parameters = []
    for model in embedding_api_models:
        # Generate friendly display name
        display_name = model.replace("BAAI/", "").replace("Qwen/", "").replace("jinaai/", "").replace("nvidia/", "").replace("intfloat/", "").replace("Alibaba-NLP/", "").replace("Pro/", "").replace("netease-youdao/", "")
        parameters.append({"id": model, "label": display_name})
    return parameters


def generate_rerank_parameters() -> List[Dict[str, str]]:
    """Generate rerank model parameter list from config"""
    parameters = [{"id": "none", "label": "No Reranking"}]  # Add no reranking option
    for model in rerank_api_models:
        if model:  # Skip empty string
            # Generate friendly display name
            display_name = model.replace("BAAI/", "").replace("Qwen/", "").replace("Pro/", "").replace("netease-youdao/", "")
            parameters.append({"id": model, "label": display_name})
    return parameters


# Parameter configuration groups
PARAMETER_GROUPS = [
    {
        "groupId": "rag_response_model",
        "groupLabel": "Response Models",
        "parameters": generate_llm_parameters()
    },
    {
        "groupId": "embedding_model",
        "groupLabel": "Embedding Models",
        "parameters": generate_embedding_parameters()
    },
    {
        "groupId": "rerank_model",
        "groupLabel": "Rerank Models",
        "parameters": generate_rerank_parameters()
    },
    {
        "groupId": "evaluate_model",
        "groupLabel": "Evaluate Models",
        "parameters": generate_llm_parameters()
    },
    {
        "groupId": "k",
        "groupLabel": "Top K",
        "parameters": [
            {"id": "3", "label": "3 chunks"},
            {"id": "5", "label": "5 chunks"},
            {"id": "10", "label": "10 chunks"}
        ]
    },
    {
        "groupId": "rerank_range",
        "groupLabel": "Rerank Range",
        "parameters": [
            {"id": "20", "label": "20 chunks"},
            {"id": "30", "label": "30 chunks"},
            {"id": "50", "label": "50 chunks"}
        ]
    },
    {
        "groupId": "chunk_size",
        "groupLabel": "Chunk Size",
        "parameters": [
            {"id": "500", "label": "500 tokens"},
            {"id": "1000", "label": "1000 tokens"},
            {"id": "1500", "label": "1500 tokens"},
            {"id": "2000", "label": "2000 tokens"}
        ]
    },
    {
        "groupId": "chunk_overlap",
        "groupLabel": "Chunk Overlap",
        "parameters": [
            {"id": "100", "label": "100 tokens"},
            {"id": "200", "label": "200 tokens"},
            {"id": "300", "label": "300 tokens"}
        ]
    }
]
