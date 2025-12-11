"""
Evidence retrieval analysis utilities.

Analyzes the quality and coverage of evidence retrieval in RAG systems,
calculating metrics like recall, precision, MRR, and AP.
"""

from typing import List, Dict, Any, Tuple, Set


def check_evidence_retrieval(
    evidence_list: List[Dict], 
    retrieved_docs: List[Tuple[int, float]], 
    backup_docs: List[Tuple[int, float]],
    vectorstore: Any = None
) -> Dict[str, Any]:
    """
    Analyze evidence retrieval quality.
    
    Calculates various retrieval metrics:
    - Context hits: Relevant docs in final context
    - Backup hits: Relevant docs retrieved but not in context
    - Average Precision (AP): Quality of ranking
    - Mean Reciprocal Rank (MRR): Position of first relevant doc
    
    Args:
        evidence_list: List of evidence items with 'fact' and 'title' keys
        retrieved_docs: List of (doc_id, score) tuples in final LLM context
        backup_docs: List of (doc_id, score) tuples retrieved but not in context
        vectorstore: Vector store object for finding evidence doc IDs
        
    Returns:
        Dict containing analysis parameters and hit count statistics:
        - 'evidence_list': Original evidence list
        - 'evidence_to_doc_ids_map': Mapping from evidence index to real doc IDs
        - 'context_doc_ids': Doc IDs in final context
        - 'retrieved_pool_doc_ids': Complete initial retrieval pool doc IDs
        - 'hit_counts': Dict with 'context_hits', 'backup_hits', 'total_evidence'
        - 'ap': Average Precision score
        - 'mrr_score': Mean Reciprocal Rank score
    """
    if not evidence_list:
        return {'status': 'No evidence provided.'}
    
    if not vectorstore:
        return {'status': 'Vectorstore not provided.'}

    # 1. Calculate document ID sets for classification
    context_doc_ids: Set[int] = {int(doc_id) for doc_id, _ in retrieved_docs}
    backup_doc_ids: Set[int] = {int(doc_id) for doc_id, _ in backup_docs}
    retrieved_pool_doc_ids: Set[int] = context_doc_ids.union(backup_doc_ids)
    
    # 2. Create mapping from evidence to real doc IDs
    evidence_to_doc_ids_map: Dict[int, List[int]] = {}
    
    for idx, evidence in enumerate(evidence_list):
        try:
            fact = evidence.get('fact', '')
            title = evidence.get('title', '')
            
            if not fact:
                evidence_to_doc_ids_map[idx] = []
                continue
            
            search_results = vectorstore.get(
                where_document={"$contains": fact}, 
                where={'title': title} if title else None
            )
            
            if search_results and 'ids' in search_results:
                found_ids = [int(doc_id) for doc_id in search_results['ids']]
                evidence_to_doc_ids_map[idx] = found_ids
            else:
                evidence_to_doc_ids_map[idx] = []
                
        except Exception as e:
            print(f"Error processing evidence at index {idx}: {str(e)}")
            evidence_to_doc_ids_map[idx] = []

    # 3. Calculate hit counts and metrics
    
    # Collect all true doc IDs for quick lookup
    all_true_doc_ids = set()
    for doc_ids in evidence_to_doc_ids_map.values():
        all_true_doc_ids.update(doc_ids)
    
    # Calculate hit counts
    context_hits = len(context_doc_ids.intersection(all_true_doc_ids))
    # backup_hits is number of hits in entire pool but not in final context
    backup_hits = len(retrieved_pool_doc_ids.intersection(all_true_doc_ids)) - context_hits
    
    # ---- Calculate AP and MRR ----
    
    all_retrieved_docs_with_rank = list(enumerate(retrieved_docs + backup_docs, 1))
    
    total_relevant_docs = len(all_true_doc_ids)
    relevant_docs_found_count = 0
    ap_sum = 0.0
    first_hit_rank = 0  # For MRR

    for rank, (doc_id, _) in all_retrieved_docs_with_rank:
        if doc_id in all_true_doc_ids:
            # This is a relevant document
            relevant_docs_found_count += 1
            
            # Calculate Precision@k
            precision_at_k = relevant_docs_found_count / rank
            ap_sum += precision_at_k
            
            # If first hit, record rank for MRR
            if first_hit_rank == 0:
                first_hit_rank = rank

    # Final calculation of AP and MRR
    ap = ap_sum / total_relevant_docs if total_relevant_docs > 0 else 0.0
    mrr = 1.0 / first_hit_rank if first_hit_rank > 0 else 0.0

    # 4. Return all prepared data
    return {
        'evidence_list': evidence_list,
        'evidence_to_doc_ids_map': evidence_to_doc_ids_map,
        'context_doc_ids': list(context_doc_ids), 
        'retrieved_pool_doc_ids': list(retrieved_pool_doc_ids),
        'hit_counts': {
            'context_hits': context_hits,
            'backup_hits': backup_hits,
            'total_evidence': len(all_true_doc_ids)
        },
        'ap': ap,  # Average Precision for this query
        'mrr_score': mrr  # MRR for this individual question
    }
