"""
Test script for workflow_optimized.py
Tests batch evaluation functionality with different configurations
"""

from rag_utils import DatasetManager
from workflow import SimpleWorkflow


def test_batch_evaluation(dataset_manager, default_corpus):
    """Test batch evaluation functionality"""
    print("\n🔍 TEST: Batch Evaluation")
    print("-" * 40)
    
    try:
        test_dataset = [
            {
                'query': 'Which individual is implicated in both inflating the value of a Manhattan apartment to a figure not yet achieved in New York City\'s real estate history, according to \'Fortune\', and is also accused of adjusting this apartment\'s valuation to compensate for a loss in another asset\'s worth, as reported by \'The Age\'?',
                'answer': 'Donald Trump',
                'evidence_list': [
                    {
                        "author": "Michael R. Sisak, The Associated Press",
                        "category": "business",
                        "fact": "No apartment in New York City has ever sold for close to that amount, James said.",
                        "published_at": "2023-09-26T21:11:15+00:00",
                        "source": "Fortune",
                        "title": "Donald Trump defrauded banks with 'fantasy' to build his real estate empire, judge rules in a major repudiation against the former president",
                        "url": "https://fortune.com/2023/09/26/donald-trump-fraud-banks-insurers-real-estate-judge-new-york/"
                    },
                    {
                        "author": "Tom Maloney",
                        "category": "business",
                        "fact": "The prosecution argues that was to mask a drop in the value of one of his other properties.",
                        "published_at": "2023-11-07T22:22:05+00:00",
                        "source": "The Age",
                        "title": "The $777 million surprise: Donald Trump is getting richer",
                        "url": "https://www.theage.com.au/business/companies/the-777-million-surprise-donald-trump-is-getting-richer-20231108-p5eicf.html?ref=rss&utm_medium=rss&utm_source=rss_business"
                    }
                ]
            },
            {
                'query': 'Who is the figure associated with generative AI technology whose departure from OpenAI was considered shocking according to Fortune, and is also the subject of a prevailing theory suggesting a lack of full truthfulness with the board as reported by TechCrunch?',
                'answer': 'Sam Altman',
                'evidence_list': [
                    {
                        "author": "Matt O'Brien, The Associated Press",
                        "category": "business",
                        "fact": "Altman's exit \"is indeed shocking as he has been the face of\" generative AI technology, said Gartner analyst Arun Chandrasekaran.",
                        "published_at": "2023-11-18T15:33:09+00:00",
                        "source": "Fortune",
                        "title": "OpenAI's ex-chairman accuses board of going rogue in firing Altman: 'Sam and I are shocked and saddened by what the board did'",
                        "url": "https://fortune.com/2023/11/18/how-did-openai-fire-sam-altman-greg-brockman-rogue-board/"
                    },
                    {
                        "author": "Devin Coldewey",
                        "category": "technology",
                        "fact": "Based on the board's language and the way these giant tech companies work, this is the prevailing theory floating around right now.",
                        "published_at": "2023-11-18T00:09:53+00:00",
                        "source": "TechCrunch",
                        "title": "WTF is going on at OpenAI? We have theories",
                        "url": "https://techcrunch.com/2023/11/17/wtf-is-going-on-at-openai-sam-altman-fired/"
                    }
                ]
            }
        ]
        
        configurations = [
            ("Qwen/Qwen3-Reranker-0.6B", SimpleWorkflow(
                embedding_model="Qwen/Qwen3-Embedding-4B", 
                rerank_model="Qwen/Qwen3-Reranker-0.6B", 
                chunk_size=2000,
                k=3,
                rerank_range=30,
                corpus_name=default_corpus,
                dataset_manager=dataset_manager
            )),
            ("Qwen/Qwen3-Reranker-4B", SimpleWorkflow(
                embedding_model="Qwen/Qwen3-Embedding-4B", 
                rerank_model="Qwen/Qwen3-Reranker-4B", 
                chunk_size=2000,
                k=3,
                rerank_range=30,
                corpus_name=default_corpus,
                dataset_manager=dataset_manager
            )),
        ]

        for label, workflow in configurations:
            print(f"\n🧪 Testing configuration: {label}")
            batch_result = workflow.batch_evaluate_configuration(test_dataset, 2)

            assert 'rag_result' in batch_result
            assert 'rag_accuracy' in batch_result

            print(f"   RAG accuracy: {batch_result['rag_accuracy']:.2f}%")
            print(f"   RAG recall: {batch_result['rag_recall']:.4f}")
            print(f"   RAG MRR: {batch_result['rag_mrr']:.4f}")
            print(f"   RAG MAP: {batch_result['rag_map']:.4f}")
            
            rag_results = batch_result['rag_result'].get('results', [])
            if not rag_results:
                print("   ⚠️ No retrieval details obtained")
            else:
                for idx, (qa_item, rag_item) in enumerate(zip(test_dataset, rag_results), start=1):
                    if not rag_item:
                        print(f"\n   🔎 Query {idx}: Missing retrieval result data")
                        continue
                    query_preview = qa_item['query'][:80].replace("\n", " ")
                    print(f"\n   🔎 Query {idx}: {query_preview}{'...' if len(qa_item['query']) > 80 else ''}")
                    retrieved_docs = rag_item.get('retrieved_docs') or []
                    if not retrieved_docs:
                        print("      ⚠️ No retrieved documents")
                    else:
                        for doc_rank, doc_info in enumerate(retrieved_docs, start=1):
                            doc_id, score, _, doc_text = doc_info
                            snippet = doc_text.strip().replace("\n", " ")
                            if len(snippet) > 120:
                                snippet = snippet[:117] + "..."
                            print(f"      #{doc_rank} chunk_id={doc_id} score={score:.4f} snippet=\"{snippet}\"")

                    backup_docs = rag_item.get('backup_docs') or []
                    if not backup_docs:
                        print("      ℹ️ No backup retrieval documents")
                    else:
                        print("      🔁 Backup retrieval documents:")
                        for doc_rank, doc_info in enumerate(backup_docs, start=1):
                            doc_id, score, _, doc_text = doc_info
                            snippet = doc_text.strip().replace("\n", " ")
                            if len(snippet) > 120:
                                snippet = snippet[:117] + "..."
                            print(f"         · #{doc_rank} chunk_id={doc_id} score={score:.4f} snippet=\"{snippet}\"")

        print("\n✅ Batch evaluation test passed")
        return True
        
    except Exception as e:
        print(f"❌ Batch evaluation test failed: {str(e)}")
        return False


def main():
    """Main test runner"""
    print("=" * 80)
    print("🧪 WORKFLOW OPTIMIZED FUNCTIONALITY TEST")
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
    
    # Run tests
    print("\n🚀 Starting comprehensive workflow tests...")
    
    try:
        test_result = test_batch_evaluation(dataset_manager, default_corpus)
        
        if test_result:
            print("\n✅ All tests passed")
        else:
            print("\n❌ Some tests failed")
    
    except Exception as e:
        print(f"\n❌ Test execution failed: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    main()
