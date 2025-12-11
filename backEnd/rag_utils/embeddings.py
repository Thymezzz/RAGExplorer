"""
Embedding functions and classes for RAG system
Uses embedding API
"""

from typing import List
import requests
from tenacity import retry, stop_after_attempt, wait_exponential

from .config import embedding_api_models, embedding_api_base_url
from .rate_limiter import get_next_api_key


def initialize_embedding_function(embedding_model_name: str, api_key: str = None, base_url: str = None):
    """
    Initialize embedding model (embedding API)
    
    Args:
        embedding_model_name: Name of the embedding model
        api_key: Optional API key (will use default from config if not provided)
        base_url: Optional base URL (will use default from config if not provided)
    Returns:
        EmbeddingAPI instance
    Raises:
        ValueError: If model is not supported
    """
    if embedding_model_name not in embedding_api_models:
        raise ValueError(
            f"❌ Unsupported embedding model: {embedding_model_name}\n"
            f"Supported embedding models: {', '.join(embedding_api_models)}"
        )
    print(f"✅ Using embedding API: {embedding_model_name}")
    return SiliconFlowEmbeddings(model=embedding_model_name)


class SiliconFlowEmbeddings:
    """Embedding API interface"""
    
    def __init__(self, model: str = "Qwen/Qwen3-Embedding-0.6B", api_key: str = None):
        """Initialize SiliconFlow embeddings"""
        self.model = model
        from .rate_limiter import get_next_api_key
        self.api_key = api_key or get_next_api_key()
        self.base_url = embedding_api_base_url
        
        if not self.api_key:
            raise ValueError(
                "Embedding API key not found. "
                "Please set API KEY in config.py (EMBEDDING_API_KEYS)"
            )
    
    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=3))
    def _call_api(self, texts: List[str]) -> List[List[float]]:
        """Call SiliconFlow embedding API"""
        if isinstance(texts, str):
            texts = [texts]
        
        from .rate_limiter import _siliconflow_rate_limiter, is_rate_limit_error, get_next_api_key
        _siliconflow_rate_limiter.wait_if_needed(self.api_key, texts)
        
        try:
            response = requests.post(
                f"{self.base_url}/embeddings",
                json={"model": self.model, "input": texts},
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            if "data" in result:
                return [item["embedding"] for item in result["data"]]
            else:
                raise ValueError(f"Unexpected API response format: {result}")
        except requests.exceptions.RequestException as e:
            # Check for rate limit and switch API key
            if is_rate_limit_error(str(e)):
                print(f"🔄 Rate limit detected, switching API key...")
                self.api_key = get_next_api_key()
                return self._call_api(texts)
            print(f"❌ Embedding API error: {str(e)}")
            raise
    
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of documents"""
        if not texts:
            return []
        
        # Process in batches for large document sets
        batch_size = 25
        if len(texts) > batch_size:
            print(f"📦 Processing {len(texts)} documents in batches...")
            all_embeddings = []
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i + batch_size]
                batch_num = i // batch_size + 1
                total_batches = (len(texts) + batch_size - 1) // batch_size
                print(f"  Batch {batch_num}/{total_batches}")
                all_embeddings.extend(self._call_api(batch))
            return all_embeddings
        else:
            return self._call_api(texts)
    
    def embed_query(self, text: str) -> List[float]:
        """Generate embedding for a single query"""
        if not text or not text.strip():
            raise ValueError("Query text cannot be empty")
        
        embeddings = self._call_api([text.strip()])
        return embeddings[0] if embeddings else []
