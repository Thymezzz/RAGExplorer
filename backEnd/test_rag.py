"""
Test script for rag_optimized.py
Tests RAG system functionality with different configurations
"""

from rag_utils import DatasetManager
from rag import create_rag_system


def test_basic_functionality(dataset_manager, default_corpus):
    """Test basic functionality"""
    print("\n🔍 TEST 1: Basic RAG Functionality")
    print("-" * 40)
    
    try:
        rag_system = create_rag_system(
            corpus_name=default_corpus,
            dataset_manager=dataset_manager
        )
        test_query = "What is artificial intelligence?"
        
        embedding_vector, retrieved_docs, backup_docs, response = rag_system.rag_workflow(test_query)
        
        assert len(embedding_vector) > 0, "Embedding vector should not be empty"
        assert len(retrieved_docs) > 0, "Should retrieve some documents"
        assert len(response) > 0, "Should generate a response"
        
        print("✅ Basic functionality test passed")
        print(f"   Embedding dimensions: {len(embedding_vector)}")
        print(f"   Retrieved docs: {len(retrieved_docs)}")
        print(f"   Backup docs: {len(backup_docs)}")
        print(f"   Response length: {len(response)} characters")
        
        return True
        
    except Exception as e:
        print(f"❌ Basic functionality test failed: {str(e)}")
        return False


def test_configuration_options(dataset_manager, default_corpus):
    """Test different configuration options"""
    print("\n🔍 TEST 2: Configuration Options")
    print("-" * 40)
    
    configurations = [
        {
            "name": "Default Configuration",
            "config": {
                "corpus_name": default_corpus,
                "dataset_manager": dataset_manager
            }
        },
        {
            "name": "Custom k and chunk size",
            "config": {
                "k": 3,
                "chunk_size": 1000,
                "chunk_overlap": 100,
                "corpus_name": default_corpus,
                "dataset_manager": dataset_manager
            }
        },
        {
            "name": "With rerank model",
            "config": {
                "rerank_model": "Qwen/Qwen3-Reranker-0.6B",
                "k": 5,
                "corpus_name": default_corpus,
                "dataset_manager": dataset_manager
            }
        }
    ]
    
    test_query = "What is deep learning?"
    success_count = 0
    
    for config_info in configurations:
        try:
            print(f"\n   Testing: {config_info['name']}")
            
            rag_system = create_rag_system(**config_info['config'])
            
            embedding_vector, retrieved_docs, backup_docs, response = rag_system.rag_workflow(test_query)
            
            assert len(embedding_vector) > 0
            assert len(retrieved_docs) > 0
            assert len(response) > 0
            
            print(f"   ✅ {config_info['name']} passed")
            success_count += 1
            
        except Exception as e:
            print(f"   ❌ {config_info['name']} failed: {str(e)}")
    
    print(f"\n   📊 Configuration test results: {success_count}/{len(configurations)} passed")
    return success_count == len(configurations)


def test_query_with_context_function(dataset_manager, default_corpus):
    """Test query with custom context functionality"""
    print("\n🔍 TEST 3: Query with Context Function")
    print("-" * 40)
    
    try:
        rag_system = create_rag_system(
            corpus_name=default_corpus,
            dataset_manager=dataset_manager
        )
        test_query = "What is the capital of France?"
        test_context = "Paris is the capital of France. It is known as the City of Light."
        
        response = rag_system.query_with_context(test_query, test_context)
        
        assert len(response) > 0, "Query with context should generate a response"
        
        print("✅ Query with context function test passed")
        print(f"   Response length: {len(response)} characters")
        return True
        
    except Exception as e:
        print(f"❌ Query with context function test failed: {str(e)}")
        return False


def test_error_handling(dataset_manager, default_corpus):
    """Test error handling"""
    print("\n🔍 TEST 4: Error Handling")
    print("-" * 40)
    
    try:
        # Test 1: Invalid embedding model should raise exception
        print("   Testing invalid embedding model...")
        exception_raised = False
        try:
            invalid_rag = create_rag_system(
                embedding_model="invalid_model_that_does_not_exist",
                corpus_name=default_corpus,
                dataset_manager=dataset_manager
            )
            print("   ❌ Expected exception was not raised for invalid model")
        except Exception as e:
            exception_raised = True
            print(f"   ✅ Invalid model correctly raised exception: {type(e).__name__}")
        
        if not exception_raised:
            print("❌ Error handling test failed: No exception for invalid model")
            return False
        
        print("✅ Error handling test passed")
        return True
        
    except Exception as e:
        print(f"❌ Error handling test failed unexpectedly: {str(e)}")
        return False


def test_document_retrieval(dataset_manager, default_corpus):
    """Test document retrieval functionality"""
    print("\n🔍 TEST 5: Document Retrieval Quality")
    print("-" * 40)
    
    try:
        rag_system = create_rag_system(
            k=5, 
            rerank_range=20,
            corpus_name=default_corpus,
            dataset_manager=dataset_manager
        )
        test_query = "What is the difference between supervised and unsupervised learning?"
        
        embedding_vector, retrieved_docs, backup_docs, response = rag_system.rag_workflow(test_query)
        
        assert len(retrieved_docs) <= 5, "Should not retrieve more than k documents"
        assert len(retrieved_docs) + len(backup_docs) <= 20, "Total should not exceed rerank_range"
        
        if retrieved_docs:
            for doc_id, score, keywords, doc_text in retrieved_docs:
                assert isinstance(doc_id, int), "Document ID should be integer"
                assert isinstance(score, (int, float)), "Score should be numeric"
                assert 0 <= score <= 1, "Cosine similarity should be between 0 and 1"
                assert isinstance(keywords, list), "Keywords should be a list"
                assert isinstance(doc_text, str), "Document text should be string"
        
        print("✅ Document retrieval quality test passed")
        print(f"   Retrieved docs: {len(retrieved_docs)}")
        print(f"   Backup docs: {len(backup_docs)}")
        
        if retrieved_docs:
            scores = [score for _, score, _, _ in retrieved_docs]
            print(f"   Similarity range: {min(scores):.4f} - {max(scores):.4f}")
        
        return True
        
    except Exception as e:
        print(f"❌ Document retrieval test failed: {str(e)}")
        return False


def main():
    """Main test runner"""
    print("=" * 80)
    print("🧪 COMPREHENSIVE RAG SYSTEM FUNCTIONALITY TEST")
    print("=" * 80)
    
    # Initialize DatasetManager
    dataset_manager = DatasetManager("./uploaded_datasets")
    
    # List available datasets
    datasets_info = dataset_manager.list_datasets('all')
    print("\n📚 Available datasets:")
    print(f"   Questions: {[d['name'] for d in datasets_info['datasets']['questions']]}")
    print(f"   Corpus: {[d['name'] for d in datasets_info['datasets']['corpus']]}")
    
    # Select corpus
    available_corpus = datasets_info['datasets']['corpus']
    if available_corpus:
        default_corpus = available_corpus[0]['name']
        print(f"\n✅ Using corpus: {default_corpus}")
    else:
        print("\n⚠️ No corpus found in uploaded_datasets, tests may fail")
        default_corpus = "corpus"
    
    # Define tests
    tests = [
        lambda: test_basic_functionality(dataset_manager, default_corpus),
        lambda: test_configuration_options(dataset_manager, default_corpus),
        lambda: test_query_with_context_function(dataset_manager, default_corpus),
        lambda: test_error_handling(dataset_manager, default_corpus),
        lambda: test_document_retrieval(dataset_manager, default_corpus)
    ]
    
    # Run tests
    print("\n🚀 Starting comprehensive functionality tests...")
    
    passed_tests = 0
    total_tests = len(tests)
    
    for test_func in tests:
        try:
            if test_func():
                passed_tests += 1
        except Exception as e:
            print(f"❌ Test crashed: {str(e)}")
            import traceback
            traceback.print_exc()
    
    # Print summary
    print("\n" + "=" * 80)
    print("📊 TEST RESULTS SUMMARY")
    print("=" * 80)
    print(f"✅ Passed: {passed_tests}/{total_tests}")
    print(f"❌ Failed: {total_tests - passed_tests}/{total_tests}")
    
    if passed_tests == total_tests:
        print("🎉 All tests passed! RAG system is working correctly.")
    else:
        print("⚠️  Some tests failed. Please check the implementation.")
    
    print("=" * 80)


if __name__ == '__main__':
    main()
