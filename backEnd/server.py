from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import traceback
import json

from rag_utils import (
    assemble_questions, 
    PARAMETER_GROUPS, 
    create_workflow, 
    parse_rag_response,
    save_individual_cache, 
    load_individual_cache,
    load_questions_dataset,
    evaluate_response,
    DatasetManager
)

app = Flask(__name__)
CORS(app)

# Cache settings
CACHE_DIR = "./cache"
CACHE_VERSION = "v2.0"
os.makedirs(CACHE_DIR, exist_ok=True)

dataset_manager = DatasetManager("./uploaded_datasets")

@app.route('/get_parameter_configuration', methods=['GET'])
def get_parameter_configuration():
    """
    Get parameter configuration, dataset and corpus sections are dynamically loaded from uploaded datasets
    """
    try:
        all_datasets_result = dataset_manager.list_datasets('all')
        
        dataset_parameters = []
        questions_list = all_datasets_result.get('datasets', {}).get('questions', [])
        
        for dataset_info in questions_list:
            dataset_id = dataset_info.get('name', '')
            question_count = dataset_info.get('question_count', 0)
            label = f"{dataset_id} ({question_count} questions)"
            
            if dataset_id:
                dataset_parameters.append({
                    "id": dataset_id,
                    "label": label
                })
        
        corpus_parameters = []
        corpus_list = all_datasets_result.get('datasets', {}).get('corpus', [])
        
        for corpus_info in corpus_list:
            corpus_id = corpus_info.get('name', '')
            document_count = corpus_info.get('document_count', 0)
            label = f"{corpus_id} ({document_count} documents)"
            
            if corpus_id:
                corpus_parameters.append({
                    "id": corpus_id,
                    "label": label
                })
        
        # Build parameter groups dynamically
        parameter_groups = [
            {
                "groupId": "dataset",
                "groupLabel": "Dataset",
                "parameters": dataset_parameters
            },
            {
                "groupId": "corpus",
                "groupLabel": "Corpus",
                "parameters": corpus_parameters
            }
        ]
        
        # Add other parameter groups from PARAMETER_GROUPS
        for group in PARAMETER_GROUPS:
            if group['groupId'] not in ['dataset', 'corpus']:
                parameter_groups.append(group)
        
        return jsonify({
            "parameterGroups": parameter_groups,
            "columnResults": []
        })
        
    except Exception as e:
        print(f"❌ Error in get_parameter_configuration: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/evaluate_configuration', methods=['POST'])
def evaluate_configuration():
    try:
        data = request.get_json()
        selected_params = data.get('selectedParameters', {}).get('values', {})
        concurrent_workers = data.get('concurrentWorkers', 1)  # Concurrency parameter
        print(f"selected_params: {selected_params}, concurrent_workers: {concurrent_workers}")
        
        dataset_name = selected_params.get('dataset', [])[0] if selected_params.get('dataset') else None
        if not selected_params:
            return jsonify({"error": "Dataset parameter is required"}), 400
        
        print(f"Received dataset parameter: {dataset_name}")

        cached_result = load_individual_cache(selected_params, CACHE_DIR, CACHE_VERSION)
        
        qa_dataset = load_questions_dataset(dataset_name, dataset_manager)
        total_questions_in_dataset = len(qa_dataset)
        print(f"📊 Loaded {total_questions_in_dataset} questions from dataset")
        
        # Check if dataset is complete
        if cached_result:
            rag_results = cached_result.get('rag_result', {}).get('results', [])
            
            # Check if RAG result list is not None and length matches
            if rag_results is not None and all(r is not None for r in rag_results) and len(rag_results) == total_questions_in_dataset:
                print(f"✅ Returning complete results from individual cache file")
                # Extract metric data from cache
                cached_metrics = {
                    "ragAccuracy": cached_result.get('ragAccuracy'),
                    "directAccuracy": None,  # Reserved field for frontend compatibility, no longer used
                    "ragRecall": cached_result.get('ragRecall'),
                    "ragMrr": cached_result.get('ragMrr'),
                    "ragMap": cached_result.get('ragMap'),
                    "totalQuestions": cached_result.get('totalQuestions'),
                    "concurrentWorkers": cached_result.get('concurrentWorkers', concurrent_workers)
                }
                return jsonify({**cached_metrics, "fromCache": True})
            else:
                print(f"⚠️ Individual cache incomplete, will continue computing missing parts...")
        else:
            print(f"❌ Cache not found, starting real-time computation...")
        
        workflow = create_workflow(selected_params, dataset_manager)

        # If no cache, initialize a new cache item
        if not cached_result:
            print(f"🆕 Creating new individual cache item")
            cached_result = {
                "rag_result": {"results": [None] * len(qa_dataset)},
                "concurrentWorkers": concurrent_workers
            }
        else:
            print(f"♻️ Using existing cache, continuing incomplete evaluation")
        
        # Perform batch evaluation with concurrency and cache
        evaluation_result = workflow.batch_evaluate_configuration(
            qa_dataset=qa_dataset,
            concurrent_workers=concurrent_workers,
            cache_item=cached_result,
            save_callback=lambda: save_individual_cache(selected_params, cached_result, CACHE_DIR, CACHE_VERSION)
        )
        
        final_result = {
            "ragAccuracy": evaluation_result['rag_accuracy'],
            "directAccuracy": None,  # Reserved field for frontend compatibility, no longer used
            "ragRecall": evaluation_result['rag_recall'],
            "ragMrr": evaluation_result['rag_mrr'],
            "ragMap": evaluation_result['rag_map'],
            "totalQuestions": evaluation_result['total_questions'],
            "concurrentWorkers": concurrent_workers
        }
        
        cached_result.update(final_result)
        save_individual_cache(selected_params, cached_result, CACHE_DIR, CACHE_VERSION)
        
        return jsonify({**final_result, "fromCache": False})
        
    except Exception as e:
        print(f"❌ Error in evaluate_configuration: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/query_with_context', methods=['POST'])
def query_with_context():
    """Answer question using provided context instead of retrieved documents"""
    try:
        data = request.get_json()
        selected_params = data.get('selectedParameters', {}).get('values', {})
        question = data.get('question', '')
        context = data.get('context', '')
        ground_truth = data.get('ground_truth', '')
        
        if not selected_params:
            return jsonify({"error": "No parameters selected"}), 400
        
        if not question:
            return jsonify({"error": "Question is required"}), 400
        
        if not context:
            return jsonify({"error": "Context is required"}), 400
        
        workflow = create_workflow(selected_params, dataset_manager)
        workflow._ensure_rag_system()
        rag_system = workflow.rag_system
        
        raw_answer = rag_system.query_with_context(question, context)
        
        final_answer, supporting_sentences = parse_rag_response(raw_answer)
        
        is_correct = False
        if ground_truth:
            try:
                evaluate_model = selected_params.get('evaluate_model', ['gpt-4o-mini'])[0]
                is_correct = evaluate_response(question, final_answer, ground_truth, evaluate_model)
            except Exception as eval_error:
                print(f"⚠️ Evaluation failed: {str(eval_error)}")
                is_correct = False
        
        return jsonify({
            "answer": final_answer,
            "raw_answer": raw_answer,
            "supporting_sentences": supporting_sentences,
            "question": question,
            "context": context,
            "ground_truth": ground_truth,
            "is_correct": is_correct,
            "selectedParameters": selected_params
        })
        
    except Exception as e:
        print(f"❌ Error in query_with_context: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/get_questions', methods=['POST'])
def get_questions():
    """Get question details based on configuration parameters"""
    try:
        data = request.get_json()
        selected_params = data.get('selectedParameters', {}).get('values', {})
        question_filter = data.get('filter', {})
        
        if not selected_params:
            return jsonify({"error": "selectedParameters is required"}), 400
        
        cached_result = load_individual_cache(selected_params, CACHE_DIR, CACHE_VERSION)
        
        if not cached_result:
            return jsonify({"error": "Cache for this configuration not found. Please run an evaluation first."}), 404
        
        rag_results = cached_result.get('rag_result', {}).get('results', [])
        
        if not rag_results:
            return jsonify({"error": "RAG evaluation results not found in cache"}), 404
        
        if any(r is None for r in rag_results):
            return jsonify({"error": "RAG evaluation results incomplete"}), 404
        
        questions = assemble_questions(rag_results)
        
        filtered_questions = questions
        if question_filter:
            if 'correct' in question_filter:
                is_correct = question_filter['correct']
                filtered_questions = [q for q in questions if q.get('ragCorrect') == is_correct]
        
        return jsonify({
            "questions": filtered_questions,
            "selectedParameters": selected_params
        })
        
    except Exception as e:
        print(f"❌ Error in get_questions: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/dataset/upload/questions', methods=['POST'])
def upload_questions_dataset():
    """
    Upload questions dataset JSON file
    Receives multipart/form-data format file upload
    """
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({"error": "Empty filename"}), 400
        
        if not dataset_manager.allowed_file(file.filename):
            return jsonify({"error": "Only JSON files are supported"}), 400
        
        custom_name = request.form.get('name', '').strip()
        
        file_content = file.read()
        
        try:
            result = dataset_manager.save_dataset(
                file_content=file_content,
                original_filename=file.filename,
                custom_name=custom_name,
                dataset_type='questions'
            )
            
            if result['exists']:
                print(f"⚠️ Questions dataset already exists: {result['filename']}")
            else:
                print(f"✅ Questions dataset uploaded successfully: {result['filename']}, {result['question_count']} questions total")
            
            response_data = {
                "message": result['message'],
                "dataset_id": result['dataset_id'],
                "filename": result['filename'],
                "question_count": result['question_count'],
                "metadata": result['metadata']
            }
            
            return jsonify(response_data), 200
            
        except (ValueError, json.JSONDecodeError) as e:
            return jsonify({"error": str(e)}), 400
        
    except Exception as e:
        print(f"❌ Error in upload_questions_dataset: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/dataset/upload/corpus', methods=['POST'])
def upload_corpus_dataset():
    """
    Upload corpus dataset JSON file
    Receives multipart/form-data format file upload
    """
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({"error": "Empty filename"}), 400
        
        if not dataset_manager.allowed_file(file.filename):
            return jsonify({"error": "Only JSON files are supported"}), 400
        
        custom_name = request.form.get('name', '').strip()
        
        file_content = file.read()
        
        try:
            result = dataset_manager.save_dataset(
                file_content=file_content,
                original_filename=file.filename,
                custom_name=custom_name,
                dataset_type='corpus'
            )
            
            if result['exists']:
                print(f"⚠️ Corpus dataset already exists: {result['filename']}")
            else:
                print(f"✅ Corpus dataset uploaded successfully: {result['filename']}, {result['document_count']} documents total")
            
            response_data = {
                "message": result['message'],
                "dataset_id": result['dataset_id'],
                "filename": result['filename'],
                "document_count": result['document_count'],
                "metadata": result['metadata']
            }
            
            return jsonify(response_data), 200
            
        except (ValueError, json.JSONDecodeError) as e:
            return jsonify({"error": str(e)}), 400
        
    except Exception as e:
        print(f"❌ Error in upload_corpus_dataset: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/dataset/list', methods=['GET'])
def list_datasets():
    """
    List all uploaded datasets
    Supports filtering questions or corpus datasets
    """
    try:
        dataset_type = request.args.get('type', 'all')  # 'questions', 'corpus', 'all'
        
        result = dataset_manager.list_datasets(dataset_type)
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"❌ Error in list_datasets: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("🚀 Starting server with individual cache file system")
    print(f"📁 Cache directory: {CACHE_DIR}")
    app.run(host='0.0.0.0', port=6006, debug=False)
