"""
Vector store operations for RAG system
Handles loading, creating, and managing Chroma vector stores
"""

import os
import time
import json
import traceback
from filelock import FileLock
from typing import Any
from tqdm import tqdm


def normalize_embedding_model_name(embedding_model: str) -> str:
    """Normalize embedding model name, unify Pro version with standard version"""
    normalized_name = embedding_model.replace('Pro/BAAI/bge-m3', 'BAAI/bge-m3')
    return normalized_name


def load_or_create_vectorstore(embedding_function, corpus_name: str, dataset_manager,
                              chunk_size: int, chunk_overlap: int, cache_dir: str):
    """
    Load or create vector store - supports loading corpus from DatasetManager
    
    Args:
        embedding_function: Embedding function
        corpus_name: Corpus name (user-uploaded corpus filename)
        dataset_manager: DatasetManager instance for loading corpus data
        chunk_size: Chunk size
        chunk_overlap: Chunk overlap
        cache_dir: Cache directory
    """
    from langchain_chroma import Chroma
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    from langchain_community.vectorstores.utils import filter_complex_metadata
    from langchain.docstore.document import Document as LangchainDocument
    
    # Get embedding model name
    embedding_model_name = getattr(embedding_function, 'model', 'unknown_model')
    if hasattr(embedding_function, 'client') and hasattr(embedding_function.client, 'model'):
        embedding_model_name = embedding_function.client.model
    
    # Normalize embedding model name
    normalized_embedding_model_name = normalize_embedding_model_name(embedding_model_name)
    
    # Generate vectorstore directory path - use corpus_name instead of dataset_name
    safe_embedding_model = normalized_embedding_model_name.replace("/", "_").replace("-", "_")
    safe_corpus_name = corpus_name.replace("/", "_").replace("-", "_")
    
    dir_name = f"vectorstore_{safe_embedding_model}_{safe_corpus_name}_chunk{chunk_size}_overlap{chunk_overlap}"
    vectorstore_dir = f"{cache_dir}/{dir_name}"
    
    lock_path = f"{vectorstore_dir}.lock"
    
    # Check if vectorstore is valid
    def is_vectorstore_valid(vectorstore_dir, max_retries=2):
        """Check if vectorstore is complete and valid"""
        if not os.path.exists(vectorstore_dir):
            return False
        for attempt in range(max_retries):
            try:
                test_vectorstore = Chroma(
                    persist_directory=vectorstore_dir,
                    embedding_function=embedding_function
                )
                count = test_vectorstore._collection.count()
                del test_vectorstore
                if count > 0:
                    return True
                return False
            except Exception as e:
                if attempt == max_retries - 1:
                    error_str = str(e).lower()
                    if 'readonly' in error_str or 'permission' in error_str or 'locked' in error_str:
                        return False
                    if attempt < max_retries - 1:
                        time.sleep(0.5)
                    continue
        return False
    
    # Clean up orphaned lock files
    if os.path.exists(lock_path):
        lock_file_mtime = os.path.getmtime(lock_path)
        current_time = time.time()
        lock_age = current_time - lock_file_mtime
        
        if lock_age > 600:  # 10 minutes
            if os.path.exists(vectorstore_dir):
                if not is_vectorstore_valid(vectorstore_dir):
                    try:
                        print(f"🧹 Found corrupted vectorstore, cleaning: {vectorstore_dir}")
                        import shutil
                        shutil.rmtree(vectorstore_dir, ignore_errors=True)
                        time.sleep(0.5)
                        os.remove(lock_path)
                    except Exception as e:
                        print(f"⚠️ Error cleaning corrupted vectorstore: {e}")
            else:
                try:
                    print(f"🧹 Found orphaned lock file, cleaning: {lock_path}")
                    os.remove(lock_path)
                except Exception as e:
                    print(f"⚠️ Error cleaning orphaned lock file: {e}")

    # Use file lock to ensure only one process can create database
    lock = FileLock(lock_path, timeout=600)  # 10 minute timeout
    try:
        with lock:
            # If vectorstore exists and is valid, load directly
            if os.path.exists(vectorstore_dir) and is_vectorstore_valid(vectorstore_dir):
                print(f"✅ Vectorstore exists, loading: {vectorstore_dir}")
                vectorstore = Chroma(
                    persist_directory=vectorstore_dir,
                    embedding_function=embedding_function
                )
                print(f"Loaded vectorstore with {vectorstore._collection.count()} documents")
                return vectorstore
            
            # Vectorstore does not exist or is invalid, need to create
            print(f"📁 Creating new vectorstore: {vectorstore_dir}")
            
            # Load corpus data from DatasetManager
            if dataset_manager is None:
                raise ValueError("dataset_manager cannot be None, unable to load corpus data")
            
            corpus_path = dataset_manager.get_dataset_path(corpus_name, 'corpus')
            if not os.path.exists(corpus_path):
                raise FileNotFoundError(f"Corpus file not found: {corpus_path}")
            
            # Read corpus JSON file
            with open(corpus_path, 'r', encoding='utf-8') as f:
                corpus_data = json.load(f)
            
            print(f"Loaded {len(corpus_data)} documents from {corpus_path}")
            
            # Convert to LangchainDocument format
            docs = []
            for doc in tqdm(corpus_data, desc="Converting documents"):
                # Corpus file format: {body: str, title: str (optional), ...}
                if 'body' in doc:
                    page_content = doc['body']
                    metadata = {key: value for key, value in doc.items() if key != 'body'}
                    docs.append(LangchainDocument(page_content=page_content, metadata=metadata))
            
            print(f"Created {len(docs)} LangchainDocument objects")
            
            # Document chunking
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size, 
                chunk_overlap=chunk_overlap
            )
            splits = text_splitter.split_documents(docs)
            print(f"Document chunking complete, {len(splits)} chunks")
            
            # Add ID information to each chunk
            for index, split in enumerate(splits):
                split.metadata['chunk_id'] = str(index)
            
            # Create vectorstore
            vectorstore = Chroma.from_documents(
                documents=filter_complex_metadata(splits),
                embedding=embedding_function,
                ids=[split.metadata['chunk_id'] for split in splits],
                persist_directory=vectorstore_dir
            )
            print(f"Vectorstore creation complete, {vectorstore._collection.count()} documents")
            return vectorstore
            
    except Exception as e:
        print(f"❌ Error loading or creating vectorstore: {e}")
        traceback.print_exc()
        # Clean up possible residual files if creation fails
        if os.path.exists(vectorstore_dir):
            try:
                import shutil
                shutil.rmtree(vectorstore_dir, ignore_errors=True)
            except:
                pass
        raise
    finally:
        # Clean up lock file
        try:
            if os.path.exists(lock_path):
                os.remove(lock_path)
        except:
            pass
