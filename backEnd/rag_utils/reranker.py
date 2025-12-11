"""
Reranker functions and classes for RAG system
Uses rerank API
"""

from typing import List, Tuple
import requests
from tenacity import retry, stop_after_attempt, wait_exponential
from .config import rerank_api_models, embedding_api_base_url


class RerankFailedError(Exception):
    """Exception raised when rerank operation fails"""
    pass


def initialize_rerank_function(rerank_model_name: str):
    """
    Initialize rerank model (rerank API)
    
    Args:
        rerank_model_name: Name of the rerank model
        
    Returns:
        Rerank API instance or None
        
    Raises:
        ValueError: If model is not supported
    """
    if not rerank_model_name or rerank_model_name == "none":
        return None
    
    if rerank_model_name not in rerank_api_models:
        raise ValueError(
            f"❌ Unsupported rerank model: {rerank_model_name}\n"
            f"Supported rerank models: {', '.join(rerank_api_models)}"
        )
    
    print(f"✅ Using rerank API: {rerank_model_name}")
    return SiliconFlowReranker(model=rerank_model_name)


def rerank_documents(query: str, docs, scores: List[float], rerank_function, raise_on_error: bool = False) -> Tuple[List, List[float]]:
    """
    Rerank documents using rerank API
    
    Args:
        query: Query text
        docs: List of documents
        scores: Corresponding cosine similarity scores (for fallback)
        rerank_function: Rerank API instance
        raise_on_error: If True, raise RerankFailedError on failure; if False, fallback to original order
            
    Returns:
        Tuple of (reranked documents, rerank scores)
        
    Raises:
        RerankFailedError: When raise_on_error=True and rerank fails
    """
    if not rerank_function or not docs:
        return docs, scores
    
    try:
        # Use rerank API
        documents_text = [doc.page_content for doc in docs]
        rerank_results = rerank_function.rerank(query, documents_text)
        
        # Rearrange documents by rerank model order, use rerank scores
        reranked_docs = []
        reranked_scores = []
        
        for result in rerank_results:
            doc_index = result['index']
            rerank_score = result.get('relevance_score', 0.0)
            reranked_docs.append(docs[doc_index])
            reranked_scores.append(rerank_score)
        
        return reranked_docs, reranked_scores
        
    except Exception as e:
        error_msg = f"Rerank failed: {str(e)}"
        print(f"❌ {error_msg}")
        if raise_on_error:
            raise RerankFailedError(error_msg) from e
        else:
            print(f"   Falling back to original order")
            return docs, scores


class SiliconFlowReranker:
    """Rerank API interface"""
    
    def __init__(self, model: str = "BAAI/bge-reranker-v2-m3", api_key: str = None):
        self.model = model
        from .rate_limiter import get_next_api_key
        self.api_key = api_key or get_next_api_key()
        self.base_url = embedding_api_base_url
        
        if not self.api_key:
            raise ValueError(
                "Rerank API key not found. "
                "Please set API KEY in config.py (EMBEDDING_API_KEYS)"
            )
    
    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=3))
    def rerank(self, query: str, documents: List[str], top_k: int = None) -> List[dict]:
        """
        Rerank documents
        
        Args:
            query: Query text
            documents: List of documents
            top_k: Return top k results, if None return all
            
        Returns:
            List of reranked documents, each containing {'index': int, 'relevance_score': float}
        """
        # Rate limit check (before sending request)
        # For rerank, need to calculate total tokens for query + all documents
        all_texts = [query] + documents
        from .rate_limiter import _siliconflow_rate_limiter
        _siliconflow_rate_limiter.wait_if_needed(self.api_key, all_texts)
        
        url = f"{self.base_url}/rerank"
        
        payload = {
            "model": self.model,
            "query": query,
            "documents": documents
        }
        
        if top_k is not None:
            payload["top_k"] = top_k
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            
            result = response.json()
            if "results" in result:
                return result["results"]
            else:
                raise Exception(f"Unexpected API response format: {result}")
                
        except requests.exceptions.RequestException as e:
            # Check for rate limit error and switch API key
            from .rate_limiter import is_rate_limit_error, get_next_api_key
            if is_rate_limit_error(str(e)):
                print(f"🔄 Rate limit detected, switching API key...")
                self.api_key = get_next_api_key()
                return self.rerank(query, documents, top_k)
            
            print(f"❌ Rerank API request failed: {str(e)}")
            raise
        except Exception as e:
            print(f"❌ Rerank API error: {str(e)}")
            raise