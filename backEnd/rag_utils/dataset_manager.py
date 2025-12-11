"""Dataset management module for handling upload, validation, and storage operations"""

import os
import json
import hashlib
from datetime import datetime
from werkzeug.utils import secure_filename


class DatasetManager:
    
    def __init__(self, dataset_dir="./uploaded_datasets"):
        self.dataset_dir = dataset_dir
        self.questions_dir = os.path.join(dataset_dir, "questions")
        self.corpus_dir = os.path.join(dataset_dir, "corpus")
        self.allowed_extensions = {'json'}
        
        os.makedirs(self.questions_dir, exist_ok=True)
        os.makedirs(self.corpus_dir, exist_ok=True)
    
    def allowed_file(self, filename):
        return '.' in filename and filename.rsplit('.', 1)[1].lower() in self.allowed_extensions
    
    def calculate_content_hash(self, content):
        """Calculate SHA256 hash of content, return first 16 characters"""
        return hashlib.sha256(content).hexdigest()[:16]
    
    def validate_questions_json(self, data):
        """Validate questions dataset JSON format"""
        if not isinstance(data, list):
            return False, "Questions dataset must be a JSON array"
        
        required_fields = ['query', 'answer']
        for i, item in enumerate(data):
            if not isinstance(item, dict):
                return False, f"Item {i+1} must be an object"
            for field in required_fields:
                if field not in item:
                    return False, f"Item {i+1} missing required field: {field}"
        
        return True, None
    
    def validate_corpus_json(self, data):
        """Validate corpus dataset JSON format"""
        if not isinstance(data, list):
            return False, "Corpus dataset must be a JSON array"
        
        for i, item in enumerate(data):
            if not isinstance(item, dict):
                return False, f"Item {i+1} must be an object"
            if 'body' not in item:
                return False, f"Item {i+1} missing required field: body"
        
        return True, None
    
    def save_dataset(self, file_content, original_filename, custom_name, dataset_type):
        """Save dataset file with validation and hash-based naming"""
        data = json.loads(file_content.decode('utf-8'))
        
        if dataset_type == 'questions':
            is_valid, error_msg = self.validate_questions_json(data)
            target_dir = self.questions_dir
            count_key = 'question_count'
        else:
            is_valid, error_msg = self.validate_corpus_json(data)
            target_dir = self.corpus_dir
            count_key = 'document_count'
        
        if not is_valid:
            raise ValueError(error_msg)
        
        if custom_name:
            base_name = secure_filename(custom_name)
        else:
            base_name = secure_filename(original_filename.rsplit('.', 1)[0])
        
        file_hash = self.calculate_content_hash(file_content)
        final_filename = f"{base_name}_{file_hash}.json"
        file_path = os.path.join(target_dir, final_filename)
        
        if os.path.exists(file_path):
            metadata = self._load_metadata(file_path)
            if not metadata:
                metadata = {
                    "name": base_name,
                    "filename": final_filename,
                    "upload_time": datetime.now().isoformat(),
                    count_key: len(data),
                    "file_hash": file_hash
                }
            
            return {
                "exists": True,
                "message": "File already exists (same content)",
                "dataset_id": base_name,
                "filename": final_filename,
                count_key: len(data),
                "metadata": metadata
            }
        
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        metadata = {
            "name": base_name,
            "filename": final_filename,
            "upload_time": datetime.now().isoformat(),
            count_key: len(data),
            "file_hash": file_hash,
            "original_filename": original_filename
        }
        self._save_metadata(file_path, metadata)
        
        return {
            "exists": False,
            "message": f"{dataset_type} uploaded successfully",
            "dataset_id": base_name,
            "filename": final_filename,
            count_key: len(data),
            "metadata": metadata
        }
    
    def _load_metadata(self, file_path):
        metadata_path = file_path.replace('.json', '_metadata.json')
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                return None
        return None
    
    def _save_metadata(self, file_path, metadata):
        metadata_path = file_path.replace('.json', '_metadata.json')
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
    
    def list_datasets(self, dataset_type='all'):
        """List all uploaded datasets"""
        result = {
            "questions": [],
            "corpus": []
        }
        
        if dataset_type in ['all', 'questions']:
            result["questions"] = self._list_directory(
                self.questions_dir, 
                'question_count'
            )
        
        if dataset_type in ['all', 'corpus']:
            result["corpus"] = self._list_directory(
                self.corpus_dir, 
                'document_count'
            )
        
        result["questions"].sort(key=lambda x: x.get('upload_time', ''), reverse=True)
        result["corpus"].sort(key=lambda x: x.get('upload_time', ''), reverse=True)
        
        return {
            "datasets": result,
            "total_questions": len(result["questions"]),
            "total_corpus": len(result["corpus"])
        }
    
    def _list_directory(self, directory, count_key):
        datasets = []
        
        for filename in os.listdir(directory):
            if filename.endswith('.json') and not filename.endswith('_metadata.json'):
                file_path = os.path.join(directory, filename)
                metadata = self._load_metadata(file_path)
                
                if not metadata:
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        metadata = {
                            "name": filename.rsplit('_', 1)[0] if '_' in filename else filename.rsplit('.', 1)[0],
                            "filename": filename,
                            count_key: len(data) if isinstance(data, list) else 0,
                            "upload_time": datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
                        }
                    except Exception:
                        continue
                
                metadata['file_size'] = os.path.getsize(file_path)
                datasets.append(metadata)
        
        return datasets
    
    def delete_dataset(self, dataset_id, dataset_type):
        """Delete specified dataset"""
        target_dir = self.questions_dir if dataset_type == 'questions' else self.corpus_dir
        deleted_files = []
        safe_dataset_id = secure_filename(dataset_id)
        
        for filename in os.listdir(target_dir):
            if filename.startswith(safe_dataset_id + '_') and filename.endswith('.json'):
                file_path = os.path.join(target_dir, filename)
                metadata_path = file_path.replace('.json', '_metadata.json')
                
                if os.path.exists(file_path):
                    os.remove(file_path)
                    deleted_files.append(filename)
                
                if os.path.exists(metadata_path):
                    os.remove(metadata_path)
        
        if not deleted_files:
            raise FileNotFoundError(f"Dataset not found: {dataset_id}")
        
        return {
            "message": f"{dataset_type} deleted successfully",
            "deleted_files": deleted_files,
            "dataset_id": dataset_id
        }
    
    def get_dataset_path(self, dataset_id, dataset_type='questions'):
        """Get full path to dataset file"""
        target_dir = self.questions_dir if dataset_type == 'questions' else self.corpus_dir
        safe_dataset_id = secure_filename(dataset_id)
        
        if os.path.exists(os.path.join(target_dir, safe_dataset_id)):
            return os.path.join(target_dir, safe_dataset_id)
        
        for filename in os.listdir(target_dir):
            if filename.startswith(safe_dataset_id + '_') and filename.endswith('.json') and not filename.endswith('_metadata.json'):
                return os.path.join(target_dir, filename)
        
        raise FileNotFoundError(f"Dataset not found: {dataset_id}")
