import concurrent.futures
from typing import List, Dict, Any, Optional
from tqdm import tqdm

from rag_utils.config import *
from rag_utils import (
    parse_rag_response,
    evaluate_response,
    analyze_error_type,
    check_evidence_retrieval,
)
from rag import create_rag_system

# Save progress every 20 questions
test_size = 20

class SimpleWorkflow:
    """Simplified RAG workflow class - focused on core functionality"""
    
    def __init__(self, 
                 rag_response_model: str = "gpt-4o-mini",
                 embedding_model: str = "Qwen/Qwen3-Embedding-0.6B",
                 rerank_model: Optional[str] = None,
                 evaluate_model: str = "gpt-4o-mini",
                 k: int = 5,
                 chunk_size: int = 1000,
                 chunk_overlap: int = 100,
                 rerank_range: int = 20,
                 corpus_name: str = "",
                 dataset_manager = None):
        """Initialize simplified workflow"""
        self.rag_response_model = rag_response_model
        self.embedding_model = embedding_model
        self.rerank_model = rerank_model
        self.evaluate_model = evaluate_model
        self.k = k
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.rerank_range = rerank_range
        self.corpus_name = corpus_name
        self.dataset_manager = dataset_manager
        
        # RAG system lazy initialization
        self.rag_system = None
        
        print(f"SimpleWorkflow initialized: corpus={corpus_name}, eval_model={evaluate_model}")
    
    def _ensure_rag_system(self):
        """Ensure RAG system is initialized (lazy loading)"""
        if self.rag_system is None:
            print("Initializing RAG system...")
            self.rag_system = create_rag_system(
                rag_response_model=self.rag_response_model,
                embedding_model=self.embedding_model,
                rerank_model=self.rerank_model,
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap,
                k=self.k,
                rerank_range=self.rerank_range,
                corpus_name=self.corpus_name,
                dataset_manager=self.dataset_manager
            )
            print(f"RAG system initialized: {self.rag_response_model}, {self.embedding_model}, corpus={self.corpus_name}")
    
    def query_rag_with_details(self, query: str) -> Dict[str, Any]:
        """Query RAG system and return detailed information"""
        try:
            self._ensure_rag_system()
            _, retrieved_docs, backup_docs, response = self.rag_system.rag_workflow(query)
            
            if response is None or not response:
                if not response:
                    print("⚠️ RAG system returned empty response (possible rerank failure or other error)")
                else:
                    print("⚠️ RAG system returned None response")
                return {
                    'answer': "",
                    'supporting_sentences': [],
                    'retrieved_docs': retrieved_docs if retrieved_docs else [],
                    'backup_docs': backup_docs if backup_docs else [],
                    'raw_response': ""
                }
                
            parsed_response, supporting_sentences = parse_rag_response(response)
            
            return {
                'answer': parsed_response,
                'supporting_sentences': supporting_sentences,
                'retrieved_docs': retrieved_docs,
                'backup_docs': backup_docs,
                'raw_response': response
            }
        except Exception as e:
            print(f"❌ RAG query error: {e}")
            return {
                'answer': "",
                'supporting_sentences': [],
                'retrieved_docs': [],
                'backup_docs': [],
                'raw_response': ""
            }
    
    def _process_rag_question(self, qa_item: Dict) -> Dict[str, Any]:
        """Process a single RAG question"""
        
        query = qa_item['query']
        answer = qa_item['answer']
        evidence_list = qa_item.get('evidence_list', [])
        
        rag_details = self.query_rag_with_details(query)
        is_rag_correct = evaluate_response(query, rag_details['answer'], answer, self.evaluate_model)
        
        # Extract doc_id and score, ignore keywords and text
        retrieved_docs_simple = [(doc[0], doc[1]) for doc in rag_details['retrieved_docs']]
        backup_docs_simple = [(doc[0], doc[1]) for doc in rag_details['backup_docs']]
        
        evidence_retrieval_analysis = check_evidence_retrieval(
            evidence_list=evidence_list,
            retrieved_docs=retrieved_docs_simple,
            backup_docs=backup_docs_simple,
            vectorstore=self.rag_system.vectorstore if self.rag_system else None
        )
        
        error_analysis = analyze_error_type(
            query=query,
            is_correct=is_rag_correct,
            response=rag_details['answer'],
            raw_response=rag_details['raw_response'],
            ground_truth=answer,
            evidence_retrieval_analysis=evidence_retrieval_analysis
        )
        
        return {
            'query': query,
            'response': rag_details['answer'],
            'answer': answer,
            'correct': is_rag_correct,
            'supporting_sentences': rag_details['supporting_sentences'],
            'retrieved_docs': rag_details['retrieved_docs'],
            'backup_docs': rag_details['backup_docs'],
            'raw_response': rag_details['raw_response'],
            'evidence_list': evidence_list,
            'evidence_retrieval_analysis': evidence_retrieval_analysis,
            'error_type': error_analysis['error_type'],
            'error_description': error_analysis['description'],
        }
    

    def _test_rag_concurrent(self, qa_dataset: List[Dict], max_workers: int,
                             results_placeholder: Optional[List] = None, 
                             save_func: Optional[callable] = None) -> Dict[str, Any]:
        """Test RAG system concurrently with checkpoint resume support"""
        self._ensure_rag_system()
        
        if results_placeholder is None:
            results_placeholder = [None] * len(qa_dataset)
        
        completed_count = sum(1 for i in range(len(results_placeholder)) 
                            if i < len(results_placeholder) and results_placeholder[i] is not None)
        print(f"📊 Concurrent checkpoint status: {completed_count}/{len(qa_dataset)} completed")
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_index = {
                executor.submit(self._process_rag_question, qa_item): i
                for i, qa_item in enumerate(qa_dataset)
                if i >= len(results_placeholder) or results_placeholder[i] is None
            }
            
            if not future_to_index:
                print(f"✅ All questions completed, no processing needed")
                rag_correct = sum(1 for r in results_placeholder if r and r.get('correct'))
                rag_accuracy = (rag_correct / len(qa_dataset)) * 100 if qa_dataset else 0
                return {
                    'accuracy': rag_accuracy,
                    'correct': rag_correct,
                    'total': len(qa_dataset),
                    'results': results_placeholder
                }
            
            processed_count = 0
            if future_to_index:
                for future in tqdm(concurrent.futures.as_completed(future_to_index), 
                                 total=len(future_to_index), desc=f"RAG concurrent test (workers={max_workers})"):
                    index = future_to_index[future]
                    try:
                        result = future.result()
                        raw_response = result.get('raw_response', '') if isinstance(result, dict) else ''
                        response = result.get('response', '') if isinstance(result, dict) else ''
                        
                        if not raw_response or not response:
                            qa_item = qa_dataset[index]
                            print(f"⚠️ Invalid RAG result (empty response), will not save for retry: {qa_item['query'][:50]}...")
                            print(f"   raw_response empty: {not raw_response}, response empty: {not response}")
                        else:
                            results_placeholder[index] = result
                    except Exception as e:
                        qa_item = qa_dataset[index]
                        print(f"❌ RAG processing error: {qa_item['query'][:50]}... error: {e}")
                    finally:
                        processed_count += 1
                        if save_func and processed_count % 10 == 0:
                            save_func()
        
        correct = sum(1 for r in results_placeholder if r and r.get('correct'))
        accuracy = (correct / len(qa_dataset)) * 100 if qa_dataset else 0
        print(f"RAG concurrent accuracy: {accuracy:.2f}% ({correct}/{len(qa_dataset)})")
        
        return {
            'accuracy': accuracy,
            'correct': correct,
            'total': len(qa_dataset),
            'results': results_placeholder
        }

    def batch_evaluate_configuration(self, qa_dataset: List[Dict], concurrent_workers: int = 1,
                                     cache_item: Optional[Dict] = None, 
                                     save_callback: Optional[callable] = None) -> Dict[str, Any]:
        """Batch evaluate configuration with concurrent processing and checkpoint resume support"""
        print(f"Batch evaluating configuration: {len(qa_dataset)} questions, workers: {concurrent_workers}")
        
        rag_results_placeholder = cache_item.get('rag_result', {}).get('results') if cache_item else None

        if concurrent_workers <= 1:
            rag_result = self._test_rag_sequential(qa_dataset, 
                                                   results_placeholder=rag_results_placeholder, 
                                                   save_func=save_callback)
        else:
            rag_result = self._test_rag_concurrent(qa_dataset, concurrent_workers, 
                                                 results_placeholder=rag_results_placeholder, 
                                                 save_func=save_callback)
        
        total_context_hits = 0  # 总命中数
        total_evidence_count = 0  # 总evidence数
        total_reciprocal_rank = 0.0
        total_ap = 0.0
        questions_with_analysis = 0
        retrieval_eligible_questions = 0
        
        for result in rag_result['results']:
            if result and 'evidence_retrieval_analysis' in result:
                evidence_analysis = result['evidence_retrieval_analysis']
                questions_with_analysis += 1

                if 'hit_counts' in evidence_analysis:
                    hit_counts = evidence_analysis['hit_counts']
                    total_evidence = hit_counts.get('total_evidence', 0)
                    context_hits = hit_counts.get('context_hits', 0)
                    
                    if total_evidence > 0:
                        total_context_hits += context_hits
                        total_evidence_count += total_evidence
                        retrieval_eligible_questions += 1
                
                if 'mrr_score' in evidence_analysis:
                    mrr_score = evidence_analysis['mrr_score']
                    total_reciprocal_rank += mrr_score
                
                if 'ap' in evidence_analysis:
                    total_ap += evidence_analysis['ap']
        
        overall_recall_at_k = (total_context_hits / total_evidence_count) if total_evidence_count > 0 else 0.0
        avg_mrr = (total_reciprocal_rank / retrieval_eligible_questions) if retrieval_eligible_questions > 0 else 0.0
        avg_map = (total_ap / retrieval_eligible_questions) if retrieval_eligible_questions > 0 else 0.0
        
        print(f"📊 Recall calculation details:")
        print(f"   Total evidence hits: {total_context_hits}")
        print(f"   Total evidence count: {total_evidence_count}")
        print(f"   Overall recall: {overall_recall_at_k:.4f}")
        print(f"   Questions with retrieval analysis: {questions_with_analysis}")
        print(f"   Retrieval-eligible questions: {retrieval_eligible_questions}")
        print(f"   Average MRR: {avg_mrr:.4f}")
        print(f"   Average MAP: {avg_map:.4f}")
        
        if cache_item is not None:
            cache_item['rag_result'] = rag_result
            cache_item['rag_accuracy'] = rag_result['accuracy']
            cache_item['rag_recall'] = overall_recall_at_k
            cache_item['rag_mrr'] = avg_mrr
            cache_item['rag_map'] = avg_map
            cache_item['total_questions'] = len(qa_dataset)
            cache_item['retrieval_eligible_questions'] = retrieval_eligible_questions
            cache_item['correct_answers'] = rag_result['correct']
            if save_callback:
                save_callback()

        return {
            'rag_result': rag_result,
            'rag_accuracy': rag_result['accuracy'],
            'rag_recall': overall_recall_at_k,
            'rag_mrr': avg_mrr,
            'rag_map': avg_map,
            'total_questions': len(qa_dataset),
            'retrieval_eligible_questions': retrieval_eligible_questions,
            'correct_answers': rag_result['correct']
        }
    
    def _test_rag_sequential(self, qa_dataset: List[Dict],
                             results_placeholder: Optional[List] = None, 
                             save_func: Optional[callable] = None) -> Dict[str, Any]:
        """Test RAG system sequentially with checkpoint resume support"""
        self._ensure_rag_system()
        
        if results_placeholder is None:
            results_placeholder = [None] * len(qa_dataset)
        
        completed_count = sum(1 for i in range(len(results_placeholder)) 
                            if i < len(results_placeholder) and results_placeholder[i] is not None)
        remaining_count = len(qa_dataset) - completed_count
        
        print(f"📊 Checkpoint status: {completed_count}/{len(qa_dataset)} completed, {remaining_count} pending")
        
        processed_count = 0
        total_items = len(qa_dataset)
        pbar = tqdm(total=total_items, desc="RAG sequential test", initial=completed_count)
        
        for i, qa_item in enumerate(qa_dataset):
            if i < len(results_placeholder) and results_placeholder[i] is not None:
                continue

            query = qa_item['query']
            answer = qa_item['answer']
            evidence_list = qa_item.get('evidence_list', [])
            
            rag_details = self.query_rag_with_details(query)
            is_rag_correct = evaluate_response(query, rag_details['answer'], answer, self.evaluate_model)
            retrieved_docs_simple = [(doc[0], doc[1]) for doc in rag_details['retrieved_docs']]
            backup_docs_simple = [(doc[0], doc[1]) for doc in rag_details['backup_docs']]
            
            evidence_retrieval_analysis = check_evidence_retrieval(
                evidence_list=evidence_list,
                retrieved_docs=retrieved_docs_simple,
                backup_docs=backup_docs_simple,
                vectorstore=self.rag_system.vectorstore if self.rag_system else None
            )
            
            error_analysis = analyze_error_type(
                query=query,
                is_correct=is_rag_correct,
                response=rag_details['answer'],
                ground_truth=answer,
                evidence_retrieval_analysis=evidence_retrieval_analysis,
                raw_response=rag_details['raw_response'],
            )
            
            result = {
                'query': query,
                'response': rag_details['answer'],
                'answer': answer,
                'correct': is_rag_correct,
                'supporting_sentences': rag_details['supporting_sentences'],
                'retrieved_docs': rag_details['retrieved_docs'],
                'backup_docs': rag_details['backup_docs'],
                'raw_response': rag_details['raw_response'],
                'evidence_list': evidence_list,
                'evidence_retrieval_analysis': evidence_retrieval_analysis,
                'error_type': error_analysis['error_type'],
                'error_description': error_analysis['description'],
            }
            results_placeholder[i] = result
            processed_count += 1
            
            pbar.update(1)

            if save_func and processed_count % test_size == 0:
                save_func()
        
        pbar.close()
        rag_correct = sum(1 for r in results_placeholder if r and r.get('correct'))
        rag_accuracy = (rag_correct / len(qa_dataset)) * 100 if qa_dataset else 0
        
        return {
            'accuracy': rag_accuracy,
            'correct': rag_correct,
            'total': len(qa_dataset),
            'results': results_placeholder
        }
