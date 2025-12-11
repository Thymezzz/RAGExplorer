
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

api_key = os.getenv("LLM_API_KEY", "")
base_url = os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1")

rag_response_model = "gpt-4o-mini"

DEFAULT_TEMPERATURE = 0
DEFAULT_SEED = 42
DEFAULT_TOP_P = 0.1


rag_prompt_with_quotes_json='''
You are a highly precise assistant for question-answering tasks using retrieved context. Your goal is to be as concise as possible and provide the answer in a specific JSON format. Your response should contain ONLY the JSON object and nothing else.

Follow these steps:
1. Read the context carefully and identify all sentences that directly support the answer to the question.
2. For each supporting sentence, extract the exact text without adding any extra quotation marks.
3. Based on the rules below, formulate the final answer:
    - If the question can be answered with a simple 'Yes' or 'No', the 'final_answer' field MUST be 'Yes' or 'No'.
    - For all other questions, the 'final_answer' field should be a concise answer of at most three words.
4. If no answer can be determined from the context, the 'supporting_sentences' field should be an empty array, and the 'final_answer' should be 'Insufficient information'.

Format your response as a single JSON object with two keys:
- 'supporting_sentences': An array of strings, where each string is a supporting sentence.
- 'final_answer': A string containing your final answer.

Do not include any other text or explanation outside of the JSON object.

Question: $question
Context: $context'''


evaluate_prompt_with_query='''
Just respond with "True" or "False".
You are an assistant for evaluating answers.
You will be given a question, a reference answer and a predicted answer.
Determine whether the predicted final answer is semantically consistent with the reference answer in the context of the given question.
Only respond with "True" if they mean the same thing; otherwise, respond with "False".
Do not explain your reasoning. Output only "True" or "False".

Question: $question
Reference Answer: $ground_truth
Predicted Answer: $predicted_answer 
'''

generation_error_analysis_prompt='''
Based on the information below, select the most appropriate error type from ['incorrect_specificity', 'incomplete', 'unknown'] to describe the RAG system's response.
Note: The context provided to the LLM contained approximately $context_coverage of the total required evidence.

- **incorrect_specificity (FP6)**: The answer is generally correct but too broad or too specific for the question.
- **incomplete (FP7)**: The answer is missing some parts, even though the information was available in the context.
- **unknown**: A generation error that does not fit any of the above categories.

---
[Input Information]
- User Question: "$query"
- Ground Truth Answer: "$ground_truth"
- RAG System's Final Answer: "$response"
- RAG System's Raw Response (for context): "$raw_response"
---
[Your Task]
Return only the most appropriate error type name (e.g., incorrect_specificity).
'''

embedding_api_base_url = os.getenv("EMBEDDING_API_BASE_URL", "https://api.siliconflow.cn/v1")
embedding_api_models = [
    "Pro/BAAI/bge-m3",
    "Qwen/Qwen3-Embedding-0.6B",
    "Qwen/Qwen3-Embedding-4B",
    "Qwen/Qwen3-Embedding-8B",
    "netease-youdao/bce-embedding-base_v1",
    "BAAI/bge-large-en-v1.5",
    "BAAI/bge-large-zh-v1.5"
]
rerank_api_models = [
    "Pro/BAAI/bge-reranker-v2-m3",
    "Qwen/Qwen3-Reranker-0.6B",
    "Qwen/Qwen3-Reranker-4B",
    "Qwen/Qwen3-Reranker-8B",
    "netease-youdao/bce-reranker-base_v1"
]

# Load API keys from environment variable (comma-separated)
embedding_api_keys_str = os.getenv("EMBEDDING_API_KEYS", "")
EMBEDDING_API_KEYS = [key.strip() for key in embedding_api_keys_str.split(",") if key.strip()]