const API_BASE_URL = "http://localhost:6006";
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  // Create an AbortController with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: controller.signal,
      ...options,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error (${response.status}):`, errorText);
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`
      );
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Request timeout - backend processing took too long, please try again later"
      );
    }
    throw error;
  }
}

export interface ParameterGroup {
  groupId: string;
  groupLabel: string;
  parameters: Array<{ id: string; label: string }>;
}

export interface ParameterConfiguration {
  parameterGroups: ParameterGroup[];
  columnResults: unknown[];
}

export type ErrorType =
  | "correct"
  | "missing_content"
  | "missed_top_ranked_documents"
  | "not_in_context"
  | "not_extracted"
  | "wrong_format"
  | "incorrect_specificity"
  | "incomplete"
  | "unknown";

interface BackendEvidence {
  author: string;
  category: string;
  fact: string;
  published_at: string;
  source: string;
  title: string;
  url: string;
}

export interface Evidence {
  author: string;
  category: string;
  fact: string;
  published_at: string;
  source: string;
  title: string;
  url: string;
}

export interface HitCounts {
  context_hits: number;
  backup_hits: number;
  total_evidence: number;
}

export interface RetrievalAnalysisData {
  evidence_list: Evidence[];
  evidence_to_doc_ids_map: { [key: string]: number[] };
  context_doc_ids: number[];
  retrieved_pool_doc_ids: number[];
  hit_counts: HitCounts;
  evidence_ranks: (number | null)[];
  ap: number;
}

export interface Question {
  id: string;
  query: string;
  answer: string;
  rag_response: string;
  direct_response: string;
  rag_correct: boolean;
  direct_correct: boolean;
  error_type: ErrorType;
  supporting_sentences: string[];
  retrieved_docs: string[]; //[id, similarity, ?, text]
  backup_docs: string[]; //[id, similarity, ?, text]
  raw_response: string;
  evidence_list: BackendEvidence[];
  evidence_retrieval_analysis: RetrievalAnalysisData;
}

export interface EvaluationResult {
  ragAccuracy: number;
  directAccuracy: number;
  ragRecall: number;
  ragMrr: number;
  ragMap: number;
  totalQuestions: number;
  fromCache?: boolean;
}

export interface QuestionsResult {
  questions: Question[];
  selectedParameters: BackendConfigurationData;
}

export interface QueryWithContextResult {
  answer: string;
  raw_answer: string;
  supporting_sentences: string[];
  question: string;
  context: string;
  ground_truth: string;
  is_correct: boolean;
  selectedParameters: string[];
}

export interface BackendConfigurationData {
  values: Record<string, string[]>;
  selectionModes: Record<string, "single" | "multiple">;
}

export interface DocumentChunkResult {
  chunks: unknown[];
  doc_ids_queried: string[];
  selectedParameters: string[];
}

// Dataset related type definitions
export interface DatasetMetadata {
  name: string;
  filename: string;
  upload_time: string;
  question_count?: number;
  document_count?: number;
  file_hash: string;
  file_size?: number;
  original_filename?: string;
}

export interface UploadQuestionsResult {
  message: string;
  dataset_id: string;
  filename: string;
  question_count: number;
  metadata: DatasetMetadata;
}

export interface UploadCorpusResult {
  message: string;
  dataset_id: string;
  filename: string;
  document_count: number;
  metadata: DatasetMetadata;
}

export interface DatasetListResult {
  datasets: {
    questions: DatasetMetadata[];
    corpus: DatasetMetadata[];
  };
  total_questions: number;
  total_corpus: number;
}

export async function getParameterConfiguration(): Promise<ParameterConfiguration> {
  return apiRequest("/get_parameter_configuration");
}

export async function evaluateConfiguration(
  selectedParameters: BackendConfigurationData,
  concurrentWorkers: number = 1
): Promise<EvaluationResult> {
  return apiRequest("/evaluate_configuration", {
    method: "POST",
    body: JSON.stringify({
      selectedParameters,
      concurrentWorkers,
    }),
  });
}

/**
 * Answer question using provided context
 */
export async function queryWithContext(
  selectedParameters: BackendConfigurationData,
  question: string,
  context: string,
  ground_truth: string
): Promise<QueryWithContextResult> {
  return apiRequest("/query_with_context", {
    method: "POST",
    body: JSON.stringify({
      selectedParameters,
      question,
      context,
      ground_truth,
    }),
  });
}

export async function getQuestions(
  selectedParameters: BackendConfigurationData,
  filter?: { correct?: boolean }
): Promise<QuestionsResult> {
  return apiRequest("/get_questions", {
    method: "POST",
    body: JSON.stringify({
      selectedParameters: {
        values: selectedParameters.values,
      },
      filter,
    }),
  });
}

async function apiFileUpload(
  endpoint: string,
  formData: FormData,
  options: RequestInit = {}
) {
  const url = `${API_BASE_URL}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...options.headers,
      },
      body: formData,
      signal: controller.signal,
      ...options,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      console.error(`API Error (${response.status}):`, errorData);
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${
          errorData.error || response.statusText
        }`
      );
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Request timeout - backend processing took too long, please try again later"
      );
    }
    throw error;
  }
}

export async function uploadQuestionsDataset(
  file: File,
  name?: string
): Promise<UploadQuestionsResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (name) {
    formData.append("name", name);
  }

  return apiFileUpload("/dataset/upload/questions", formData);
}

export async function uploadCorpusDataset(
  file: File,
  name?: string
): Promise<UploadCorpusResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (name) {
    formData.append("name", name);
  }

  return apiFileUpload("/dataset/upload/corpus", formData);
}

/**
 * List all uploaded datasets
 * @param type Dataset type: 'questions' | 'corpus' | 'all' (default)
 */
export async function listDatasets(
  type: "questions" | "corpus" | "all" = "all"
): Promise<DatasetListResult> {
  return apiRequest(`/dataset/list?type=${type}`);
}
