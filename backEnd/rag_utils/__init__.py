"""
RAG Core Module
Contains core functionalities for RAG system including embedding, reranking, and vector store operations.
"""

from .embeddings import (
    initialize_embedding_function,
    SiliconFlowEmbeddings
)

from .reranker import (
    initialize_rerank_function,
    rerank_documents,
    RerankFailedError,
    SiliconFlowReranker
)

from .vectorstore import (
    load_or_create_vectorstore
)

from .utils import (
    calculate_cosine_similarity,
    format_docs
)

from .rate_limiter import (
    SiliconFlowRateLimiter,
    _siliconflow_rate_limiter,
    get_next_api_key,
    is_rate_limit_error
)

from .json_parser import (
    parse_json_safely
)

from .api import (
    call_openai_api
)

from .response_parser import (
    parse_rag_response
)

from .evaluator import (
    evaluate_response
)

from .error_analysis import (
    analyze_error_type
)

from .evidence_analyzer import (
    check_evidence_retrieval
)

# Cache management
from .cache_manager import (
    generate_cache_filename,
    save_individual_cache,
    load_individual_cache,
    normalize_embedding_model_name
)

# Parameter generation
from .parameter_generator import (
    generate_llm_parameters,
    generate_embedding_parameters,
    generate_rerank_parameters,
    PARAMETER_GROUPS
)

# Workflow factory
from .workflow_factory import (
    load_questions_dataset,
    create_workflow
)

# Response formatting
from .response_formatter import (
    assemble_questions
)

# Dataset management
from .dataset_manager import (
    DatasetManager
)

__all__ = [
    # Embedding functions and classes
    'initialize_embedding_function',
    'SentenceTransformerEmbeddings',
    'SiliconFlowEmbeddings',
    
    # Reranker functions and classes
    'initialize_rerank_function',
    'rerank_documents',
    'RerankFailedError',
    'SiliconFlowReranker',
    
    # Vectorstore functions
    'load_or_create_vectorstore',
    
    # Utility functions
    'calculate_cosine_similarity',
    'format_docs',
    
    # Rate limiter
    'SiliconFlowRateLimiter',
    '_siliconflow_rate_limiter',
    'get_next_api_key',
    'is_rate_limit_error',
    
    # JSON parsing functions
    'parse_json_safely',
    
    # API functions
    'call_openai_api',
    
    # Response parsing functions
    'parse_rag_response',
    
    # Evaluation functions
    'evaluate_response',
    
    # Error analysis functions
    'analyze_error_type',
    
    # Evidence analysis functions
    'check_evidence_retrieval',
    
    # Cache management functions
    'generate_cache_filename',
    'save_individual_cache',
    'load_individual_cache',
    'normalize_embedding_model_name',
    
    # Parameter generation functions
    'generate_llm_parameters',
    'generate_embedding_parameters',
    'generate_rerank_parameters',
    'PARAMETER_GROUPS',
    
    # Workflow factory functions
    'load_questions_dataset',
    'create_workflow',
    
    # Response formatting functions
    'assemble_questions',
    
    # Dataset management
    'DatasetManager',
]
