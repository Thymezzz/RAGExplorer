import os
from typing import List, Tuple, Optional, Dict, Any
from dataclasses import dataclass

from langchain_openai import ChatOpenAI
from langchain.docstore.document import Document as LangchainDocument

from string import Template

from rag_utils.config import api_key, base_url, rag_prompt_with_quotes_json

from rag_utils import (
    calculate_cosine_similarity, 
    initialize_embedding_function,
    initialize_rerank_function,
    load_or_create_vectorstore,
    format_docs,
    rerank_documents,
    RerankFailedError
)

os.environ["TOKENIZERS_PARALLELISM"] = "false"

@dataclass
class RAGConfig:
    """RAG configuration class for storing all configurable parameters"""
    rag_response_model: str = "gpt-4o-mini"
    embedding_model: str = "Qwen/Qwen3-Embedding-0.6B"
    rerank_model: Optional[str] = None
    
    chunk_size: int = 1000
    chunk_overlap: int = 100
    
    k: int = 5
    rerank_range: int = 20
    
    corpus_name: str = "corpus"
    dataset_manager: Optional[Any] = None
    
    prompt_template: str = rag_prompt_with_quotes_json
    
    api_key: str = api_key
    base_url: str = base_url
    
    cache_dir: str = "./cache"


class OptimizedRAG:
    """Optimized RAG system class focused on configuration and efficient caching"""
    
    def __init__(self, config: RAGConfig):
        """Initialize RAG system"""
        self.config = config
        self.vectorstore = None
        self.llm = None
        self.embedding_function = None
        self.rerank_function = None
        
        self._initialize_components()
    
    def _initialize_components(self):
        """Initialize all components"""
        self.llm = ChatOpenAI(
            api_key=self.config.api_key, 
            base_url=self.config.base_url, 
            model=self.config.rag_response_model
        )
        
        self.embedding_function = initialize_embedding_function(
            self.config.embedding_model, 
            self.config.api_key, 
            self.config.base_url
        )
        
        self.rerank_function = initialize_rerank_function(self.config.rerank_model)
        
        self.vectorstore = load_or_create_vectorstore(
            self.embedding_function,
            self.config.corpus_name,
            self.config.dataset_manager,
            self.config.chunk_size,
            self.config.chunk_overlap,
            self.config.cache_dir
        )
    
    def _rerank_documents(self, query: str, docs: List[LangchainDocument], scores: List[float]) -> Tuple[List[LangchainDocument], List[float]]:
        """Rerank documents"""
        return rerank_documents(query, docs, scores, self.rerank_function, raise_on_error=True)
    
    def format_docs(self, docs: List[LangchainDocument]) -> str:
        """Format documents as context string"""
        return format_docs(docs)
    
    def rag_workflow(self, query: str) -> Tuple[List[float], List[Tuple[int, float, List[str], str]], List[Tuple[int, float, List[str], str]], str]:
        """Execute RAG workflow"""
        embedding_vector = self.embedding_function.embed_query(query)
        
        docs = self.vectorstore.similarity_search_by_vector(
            embedding=embedding_vector, 
            k=self.config.rerank_range
        )
        
        if not docs:
            return embedding_vector, [], [], "No documents found for the given query."
        
        doc_ids = [int(doc.metadata["chunk_id"]) for doc in docs]
        
        doc_vectors = []
        for doc_id in doc_ids:
            doc_vector = self.vectorstore._collection.get(
                ids=[str(doc_id)], 
                include=['embeddings']
            )['embeddings'][0]
            doc_vectors.append(doc_vector)
        
        all_scores = [
            calculate_cosine_similarity(embedding_vector, doc_vec) 
            for doc_vec in doc_vectors
        ]
        
        if self.config.rerank_model and self.rerank_function:
            try:
                docs, all_scores = self._rerank_documents(query, docs, all_scores)
                doc_ids = [int(doc.metadata["chunk_id"]) for doc in docs]
            except RerankFailedError as e:
                print(f"⚠️ Rerank failed, returning empty response for retry: {str(e)}")
                return embedding_vector, [], [], ""
        
        top_k_doc_ids = doc_ids[:self.config.k]
        top_k_scores = all_scores[:self.config.k]
        top_k_docs = docs[:self.config.k]
        
        backup_docs_list = docs[self.config.k:] if len(docs) > self.config.k else []
        backup_doc_ids = doc_ids[self.config.k:] if len(doc_ids) > self.config.k else []
        backup_scores = all_scores[self.config.k:] if len(all_scores) > self.config.k else []
        
        retrieved_docs = [(doc_id, score, [], doc.page_content) for doc_id, score, doc in zip(top_k_doc_ids, top_k_scores, top_k_docs)]
        backup_docs = [(doc_id, score, [], doc.page_content) for doc_id, score, doc in zip(backup_doc_ids, backup_scores, backup_docs_list)]
        
        context = self.format_docs(top_k_docs)
        prompt = Template(self.config.prompt_template).substitute(context=context, question=query)
        
        try:
            response = self.llm.invoke(prompt)
            response_text = response.content if hasattr(response, 'content') else str(response)
        except Exception as e:
            print(f"LLM invocation failed: {e}")
            response_text = f"Error generating response: {str(e)}"
        
        return embedding_vector, retrieved_docs, backup_docs, response_text
    
    def query_with_context(self, query: str, context: str) -> str:
        """Answer question using provided context"""
        prompt = Template(self.config.prompt_template).substitute(context=context, question=query)
        try:
            response = self.llm.invoke(prompt)
            response_text = response.content if hasattr(response, 'content') else str(response)
        except Exception as e:
            print(f"LLM invocation failed: {e}")
            response_text = f"Error generating response: {str(e)}"
        return response_text

    def get_chunks_by_ids(self, doc_ids: List[str]) -> List[Dict[str, Any]]:
        """Retrieve document chunks by IDs"""
        if not doc_ids:
            return []
            
        string_doc_ids = [str(doc_id) for doc_id in doc_ids]
            
        results = self.vectorstore._collection.get(
            ids=string_doc_ids,
            include=['metadatas', 'documents']
        )
        
        chunks_by_id = {}
        if results and results.get('ids'):
            for i, chunk_id in enumerate(results['ids']):
                chunks_by_id[chunk_id] = {
                    'id': chunk_id,
                    'document': results['documents'][i] if results.get('documents') and i < len(results['documents']) else None,
                    'metadata': results['metadatas'][i] if results.get('metadatas') and i < len(results['metadatas']) else None,
                }
        
        formatted_results = [chunks_by_id[doc_id] for doc_id in string_doc_ids if doc_id in chunks_by_id]
                
        return formatted_results


def create_rag_system(
    rag_response_model: str = "gpt-4o-mini",
    embedding_model: str = "Qwen/Qwen3-Embedding-0.6B",
    rerank_model: Optional[str] = None,
    chunk_size: int = 2000,
    chunk_overlap: int = 200,
    k: int = 5,
    rerank_range: int = 20,
    corpus_name: str = "corpus",
    dataset_manager = None,
    cache_dir: str = "./cache"
) -> OptimizedRAG:
    """Create optimized RAG system"""
    config = RAGConfig(
        rag_response_model=rag_response_model,
        embedding_model=embedding_model,
        rerank_model=rerank_model,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        k=k,
        rerank_range=rerank_range,
        corpus_name=corpus_name,
        dataset_manager=dataset_manager,
        cache_dir=cache_dir
    )
    
    return OptimizedRAG(config)
    
