"use client";

import { useState, useEffect, useRef } from "react";
import {
  getParameterConfiguration,
  ParameterConfiguration,
  uploadQuestionsDataset,
  uploadCorpusDataset,
  listDatasets,
  DatasetMetadata,
} from "../server/server";
import ParameterSelector from "./ParameterSelector";

export interface ConfigurationState {
  dataset: string[];
  corpus: string[];
  responseModels: string[];
  embeddingModels: string[];
  rerankModels: string[];
  evaluateModels: string[];
  k: string[];
  chunkSize: string[];
  overlap: string[];
  rerankRange: string[];
}

export interface SelectionMode {
  responseModels: "single" | "multiple";
  embeddingModels: "single" | "multiple";
  rerankModels: "single" | "multiple";
  evaluateModels: "single" | "multiple";
  k: "single" | "multiple";
  chunkSize: "single" | "multiple";
  overlap: "single" | "multiple";
  rerankRange: "single" | "multiple";
}

// Mapping from backend groupId to frontend config keys
const GROUP_ID_TO_CONFIG_KEY: Record<string, keyof ConfigurationState> = {
  dataset: "dataset",
  corpus: "corpus",
  rag_response_model: "responseModels",
  embedding_model: "embeddingModels",
  rerank_model: "rerankModels",
  evaluate_model: "evaluateModels",
  k: "k",
  chunk_size: "chunkSize",
  chunk_overlap: "overlap",
  rerank_range: "rerankRange",
};

const GROUP_ID_TO_SELECTION_MODE_KEY: Record<string, keyof SelectionMode> = {
  rag_response_model: "responseModels",
  embedding_model: "embeddingModels",
  rerank_model: "rerankModels",
  evaluate_model: "evaluateModels",
  k: "k",
  chunk_size: "chunkSize",
  chunk_overlap: "overlap",
  rerank_range: "rerankRange",
};

interface ConfigurationViewProps {
  onAddToPlot?: (config: {
    values: Record<string, string[]>;
    selectionModes: Record<string, "single" | "multiple">;
  }) => void;
}

export default function ConfigurationView({
  onAddToPlot,
}: ConfigurationViewProps) {
  const [configData, setConfigData] = useState<ParameterConfiguration | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ConfigurationState>({
    dataset: ["None"],
    corpus: ["None"],
    responseModels: ["None"],
    embeddingModels: ["None"],
    rerankModels: ["None"],
    evaluateModels: ["None"],
    k: ["None"],
    chunkSize: ["None"],
    overlap: ["None"],
    rerankRange: ["None"],
  });

  const [selectionModes, setSelectionModes] = useState<SelectionMode>({
    responseModels: "single",
    embeddingModels: "multiple",
    rerankModels: "multiple",
    evaluateModels: "single",
    k: "single",
    chunkSize: "multiple",
    overlap: "single",
    rerankRange: "single",
  });

  // Add custom parameters state
  const [customParameters, setCustomParameters] = useState<
    Record<string, { id: string; label: string }[]>
  >({});

  // Dataset upload panel state
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadTab, setUploadTab] = useState<"questions" | "corpus">(
    "questions"
  );
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [uploadedDatasets, setUploadedDatasets] = useState<{
    questions: DatasetMetadata[];
    corpus: DatasetMetadata[];
  }>({ questions: [], corpus: [] });

  // Use ref to track the latest selectionModes value
  const selectionModesRef = useRef(selectionModes);

  // Update ref whenever selectionModes changes
  useEffect(() => {
    selectionModesRef.current = selectionModes;
    // console.log("SelectionModes updated:", selectionModes);
  }, [selectionModes]);

  // Function to get default values for each category
  const getDefaultValues = (
    configData: ParameterConfiguration | null
  ): ConfigurationState => {
    if (!configData?.parameterGroups) {
      return {
        dataset: ["None"],
        corpus: ["None"],
        responseModels: ["None"],
        embeddingModels: ["None"],
        rerankModels: ["None"],
        evaluateModels: ["None"],
        k: ["None"],
        chunkSize: ["None"],
        overlap: ["None"],
        rerankRange: ["None"],
      };
    }

    const defaultConfig: ConfigurationState = {
      dataset: ["None"],
      corpus: ["None"],
      responseModels: ["None"],
      embeddingModels: ["None"],
      rerankModels: ["None"],
      evaluateModels: ["None"],
      k: ["None"],
      chunkSize: ["None"],
      overlap: ["None"],
      rerankRange: ["None"],
    };

    // Set first element for each category
    configData.parameterGroups.forEach((group) => {
      const configKey = GROUP_ID_TO_CONFIG_KEY[group.groupId];
      if (configKey && group.parameters && group.parameters.length > 0) {
        defaultConfig[configKey] = [group.parameters[0].id];
      }
    });

    return defaultConfig;
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await getParameterConfiguration();
        setConfigData(data);
        // Set default values after fetching config data
        setConfig(getDefaultValues(data));
        console.log("Config data:", data);
      } catch (error) {
        console.error("Failed to fetch parameter configuration:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  // Load uploaded datasets list
  useEffect(() => {
    if (showUploadPanel) {
      loadUploadedDatasets();
    }
  }, [showUploadPanel]);

  const loadUploadedDatasets = async () => {
    try {
      const result = await listDatasets("all");
      setUploadedDatasets(result.datasets);
    } catch (error) {
      console.error("Failed to load uploaded datasets:", error);
    }
  };

  const handleDatasetChange = (dataset: string) => {
    setConfig((prev) => ({ ...prev, dataset: [dataset] }));
  };

  const handleDatasetUpload = () => {
    setShowUploadPanel(true);
    setUploadStatus(null);
    setUploadTab("questions");
  };

  const handleCorpusUpload = () => {
    setShowUploadPanel(true);
    setUploadStatus(null);
    setUploadTab("corpus");
  };

  const handleCloseUploadPanel = () => {
    setShowUploadPanel(false);
    setUploadStatus(null);
    setUploading(false);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !uploading) {
      handleCloseUploadPanel();
    }
  };

  const handleFileUpload = async (file: File, type: "questions" | "corpus") => {
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith(".json")) {
      setUploadStatus({
        type: "error",
        message: "Only JSON format files are supported",
      });
      return;
    }

    setUploading(true);
    setUploadStatus(null);

    try {
      let result;
      if (type === "questions") {
        result = await uploadQuestionsDataset(file);
      } else {
        result = await uploadCorpusDataset(file);
      }

      setUploadStatus({
        type: "success",
        message: `${
          type === "questions" ? "Questions" : "Corpus"
        } uploaded successfully! Dataset ID: ${result.dataset_id}`,
      });

      // Refresh uploaded datasets list
      await loadUploadedDatasets();

      // Automatically add the uploaded dataset to the configuration
      if (type === "questions") {
        handleAddCustomContent("dataset", result.dataset_id);
      } else if (type === "corpus") {
        handleAddCustomContent("corpus", result.dataset_id);
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        setUploadStatus(null);
      }, 3000);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Upload failed, please try again";
      setUploadStatus({
        type: "error",
        message: errorMessage,
      });
    } finally {
      setUploading(false);
    }
  };

  const toggleSelectionMode = (category: keyof SelectionMode) => {
    // console.log(
    //   `Toggling selection mode for ${category}, current mode:`,
    //   selectionModes[category]
    // );
    setSelectionModes((prev) => {
      const newMode = prev[category] === "single" ? "multiple" : "single";
      // console.log(`Setting ${category} mode to:`, newMode);

      // When switching from multiple to single, ensure only the first selected value is retained
      if (newMode === "single") {
        setConfig((prevConfig) => {
          const currentValues = prevConfig[category] as string[];
          const firstValue =
            currentValues.length > 0 ? currentValues[0] : "None";
          return {
            ...prevConfig,
            [category]: [firstValue],
          };
        });
      }

      return {
        ...prev,
        [category]: newMode,
      };
    });
  };

  const handleParameterChange = (
    category: keyof ConfigurationState,
    value: string
  ) => {
    // Get the current actual selection mode
    const currentMode =
      selectionModesRef.current[category as keyof SelectionMode];

    if (currentMode === "single") {
      // In single mode, directly replace with the new selection
      setConfig((prev) => ({ ...prev, [category]: [value] }));
    } else {
      // In multiple mode, toggle the selection state
      setConfig((prev) => {
        const currentValues = prev[category] as string[];
        const newValues = currentValues.includes(value)
          ? currentValues.filter((v) => v !== value)
          : [...currentValues, value];
        return { ...prev, [category]: newValues };
      });
    }
  };

  const handleAddToPlot = () => {
    // Use ref to get the latest selectionModes value to avoid stale closure issues
    const latestSelectionModes = selectionModesRef.current;

    // Convert frontend config to backend original format
    // Create a config object with backend groupId as keys
    const backendFormatConfig: Record<string, string[]> = {};
    const backendFormatSelectionModes: Record<string, "single" | "multiple"> =
      {};

    // Reverse mapping: from frontend key to backend groupId
    const frontendToBackendMapping: Record<string, string> = {
      dataset: "dataset",
      corpus: "corpus",
      responseModels: "rag_response_model",
      embeddingModels: "embedding_model",
      rerankModels: "rerank_model",
      evaluateModels: "evaluate_model",
      k: "k",
      chunkSize: "chunk_size",
      overlap: "chunk_overlap",
      rerankRange: "rerank_range",
    };

    const frontendToBackendSelectionMapping: Record<
      keyof SelectionMode,
      string
    > = {
      responseModels: "rag_response_model",
      embeddingModels: "embedding_model",
      rerankModels: "rerank_model",
      evaluateModels: "evaluate_model",
      k: "k",
      chunkSize: "chunk_size",
      overlap: "chunk_overlap",
      rerankRange: "rerank_range",
    };

    // Convert config values - only handle main config fields, excluding custom fields
    Object.entries(config).forEach(([frontendKey, values]) => {
      // Skip custom fields
      if (frontendKey.startsWith("custom")) return;

      const backendKey = frontendToBackendMapping[frontendKey];
      if (backendKey) {
        backendFormatConfig[backendKey] = values;
      }
    });

    // Convert selection modes
    Object.entries(latestSelectionModes).forEach(([frontendKey, mode]) => {
      const backendKey =
        frontendToBackendSelectionMapping[frontendKey as keyof SelectionMode];
      if (backendKey) {
        backendFormatSelectionModes[backendKey] = mode;
      }
    });
    // Ensure dataset and corpus are also in selectionModes and set to 'single'
    backendFormatSelectionModes["dataset"] = "single";
    backendFormatSelectionModes["corpus"] = "single";

    const completeConfig = {
      values: backendFormatConfig,
      selectionModes: backendFormatSelectionModes,
    };

    console.log(
      "Complete config being sent (backend original format):",
      completeConfig
    );

    // Call the parent component's callback if provided
    if (onAddToPlot) {
      onAddToPlot(
        completeConfig as {
          values: Record<string, string[]>;
          selectionModes: Record<string, "single" | "multiple">;
        }
      );
    }
  };

  const handleReset = () => {
    // Reset to default values (first element of each category)
    setConfig(getDefaultValues(configData));
    // Reset custom parameters
    setCustomParameters({});
    // Reset selection modes to default state
    setSelectionModes({
      responseModels: "multiple",
      embeddingModels: "multiple",
      rerankModels: "multiple",
      evaluateModels: "single",
      k: "single",
      chunkSize: "single",
      overlap: "single",
      rerankRange: "single",
    });
  };

  // Handle adding custom content
  const handleAddCustomContent = (
    category: keyof ConfigurationState,
    content: string
  ) => {
    if (!content.trim()) return;

    const trimmedContent = content.trim();

    // Update custom parameters state
    setCustomParameters((prev) => {
      const currentCustomParams = prev[category] || [];
      const newCustomParam = { id: trimmedContent, label: trimmedContent };

      // Check if it already exists
      if (!currentCustomParams.some((param) => param.id === trimmedContent)) {
        return {
          ...prev,
          [category]: [...currentCustomParams, newCustomParam],
        };
      }
      return prev;
    });

    setConfig((prev) => {
      const currentValues = prev[category] as string[];
      // If the current value is ["None"], replace it
      const newValues = currentValues.includes("None")
        ? [trimmedContent]
        : [...currentValues, trimmedContent];
      return { ...prev, [category]: newValues };
    });
  };

  // Get merged parameters (original parameters + custom parameters)
  const getMergedParameters = (
    originalParams: { id: string; label: string }[],
    category: keyof ConfigurationState
  ) => {
    const customParams = customParameters[category] || [];
    return [...originalParams, ...customParams];
  };

  if (loading) {
    return (
      <div className="w-full h-full bg-100 flex items-center justify-center">
        <div className="text-500">Loading configuration...</div>
      </div>
    );
  }

  // Get dataset parameters (special case - always single select)
  const datasetParams =
    configData?.parameterGroups?.find((g) => g.groupId === "dataset")
      ?.parameters || [];

  return (
    <>
      {/* Dataset upload modal */}
      {showUploadPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={handleBackdropClick}
        >
          <div
            className="bg-white rounded-lg shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] outline outline-1 outline-offset-[-1px] outline-200 w-[480px] max-h-[600px] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="px-4 py-3 flex-shrink-0 border-b border-200 flex items-center justify-between">
              <div className="text-600 text-xl font-bold">
                Upload {uploadTab === "questions" ? "Questions" : "Corpus"}
              </div>
              <button
                onClick={handleCloseUploadPanel}
                className="w-5 h-5 flex items-center justify-center hover:bg-300 rounded transition-colors"
                disabled={uploading}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5"
                    stroke="#777777"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            {/* Modal content */}
            <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
              <div className="flex flex-col gap-3">
                {/* Upload area */}
                <div className="flex flex-col gap-2">
                  <div className="text-500 text-md font-medium">
                    Upload {uploadTab === "questions" ? "Questions" : "Corpus"}{" "}
                    JSON File
                  </div>
                  <FileUploadArea
                    onFileSelect={(file) => handleFileUpload(file, uploadTab)}
                    uploading={uploading}
                  />
                </div>

                {/* Upload status message */}
                {uploadStatus && (
                  <div
                    className={`p-2 rounded text-xs ${
                      uploadStatus.type === "success"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {uploadStatus.message}
                  </div>
                )}

                {/* Uploaded datasets list */}
                <div className="flex flex-col gap-2">
                  <div className="text-500 text-md font-medium">
                    Uploaded{" "}
                    {uploadTab === "questions" ? "Questions" : "Corpus"}
                  </div>
                  <div className="max-h-[180px] overflow-y-auto border border-200 rounded">
                    {uploadTab === "questions" ? (
                      uploadedDatasets.questions.length > 0 ? (
                        <div className="divide-y divide-200">
                          {uploadedDatasets.questions.map((dataset, index) => (
                            <div
                              key={index}
                              className="px-3 py-2 hover:bg-100 transition-colors"
                            >
                              <div className="text-600 text-xs font-medium">
                                {dataset.name}
                              </div>
                              <div className="text-500 text-xs mt-1">
                                {dataset.question_count} questions ·{" "}
                                {new Date(
                                  dataset.upload_time
                                ).toLocaleDateString("en-US")}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3 py-4 text-500 text-xs text-center">
                          No questions uploaded yet
                        </div>
                      )
                    ) : uploadedDatasets.corpus.length > 0 ? (
                      <div className="divide-y divide-200">
                        {uploadedDatasets.corpus.map((dataset, index) => (
                          <div
                            key={index}
                            className="px-3 py-2 hover:bg-100 transition-colors"
                          >
                            <div className="text-600 text-xs font-medium">
                              {dataset.name}
                            </div>
                            <div className="text-500 text-xs mt-1">
                              {dataset.document_count} documents ·{" "}
                              {new Date(dataset.upload_time).toLocaleDateString(
                                "en-US"
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-4 text-500 text-xs text-center">
                        No corpus uploaded yet
                      </div>
                    )}
                  </div>
                </div>

                {/* Format requirements */}
                <div className="p-2 bg-100 rounded">
                  <div className="text-500 text-xs font-medium mb-1">
                    Format Requirements:
                  </div>
                  <div className="text-500 text-xs space-y-1">
                    {uploadTab === "questions" ? (
                      <>
                        <div>
                          • JSON array, each item requires query and answer
                        </div>
                        <div>• Optional: question_type, evidence_list</div>
                      </>
                    ) : (
                      <>
                        <div>• JSON array, each item requires body field</div>
                        <div>
                          • Optional: title, author, url and other metadata
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-4 py-3 flex-shrink-0 border-t border-200 flex justify-end">
              <button
                onClick={handleCloseUploadPanel}
                disabled={uploading}
                className={`px-3 py-1.5 bg-200 rounded outline outline-1 outline-400 transition-colors text-500 text-sm ${
                  uploading ? "opacity-50 cursor-not-allowed" : "hover:bg-300"
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full h-full flex justify-center">
        <div className="w-full h-full bg-white rounded-lg shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] outline outline-1 outline-offset-[-1px] outline-200 flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 flex-shrink-0">
            <div className="text-600 text-xl font-bold font-['DIN_Alternate']">
              Component Configuration
            </div>
          </div>

          {/* Content Container */}
          <div className="flex-1 overflow-y-auto px-4 min-h-0">
            <div className="flex flex-col gap-2">
              {/* Dataset Section */}
              <ParameterSelector
                title="Dataset"
                parameters={getMergedParameters(datasetParams, "dataset")}
                selectedValues={config.dataset}
                selectionMode="single"
                onSelectionModeChange={() => {}}
                onValueChange={(value) => handleDatasetChange(value)}
                showSwitch={false}
                customHeader={
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDatasetUpload();
                    }}
                    className="w-4 h-4 mr-2.5 flex items-center justify-center hover:bg-300 rounded transition-colors"
                  >
                    <svg
                      width="16"
                      height="17"
                      viewBox="0 0 16 17"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M14 10.5V13.1667C14 13.5203 13.8595 13.8594 13.6095 14.1095C13.3594 14.3595 13.0203 14.5 12.6667 14.5H3.33333C2.97971 14.5 2.64057 14.3595 2.39052 14.1095C2.14048 13.8594 2 13.5203 2 13.1667V10.5M11.3333 5.83333L8 2.5M8 2.5L4.66667 5.83333M8 2.5V10.5"
                        stroke="#777777"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                }
              />

              {/* Parameter Groups */}
              {configData?.parameterGroups
                ?.filter((group) => group.groupId !== "dataset") // Exclude dataset as it's handled separately
                ?.map((group) => {
                  const configKey = GROUP_ID_TO_CONFIG_KEY[group.groupId];
                  const selectionModeKey =
                    GROUP_ID_TO_SELECTION_MODE_KEY[group.groupId];

                  // Corpus doesn't need selectionModeKey as it's always single mode
                  if (!configKey) {
                    console.warn(`Unknown groupId: ${group.groupId}`);
                    return null;
                  }

                  // For corpus, use fixed "single" mode; for others, check if selectionModeKey exists
                  if (group.groupId !== "corpus" && !selectionModeKey) {
                    console.warn(`Unknown groupId: ${group.groupId}`);
                    return null;
                  }

                  // Corpus should only support single selection mode, like dataset
                  const showSwitch = group.groupId !== "corpus";
                  const currentSelectionMode =
                    group.groupId === "corpus"
                      ? ("single" as const)
                      : selectionModes[selectionModeKey];

                  return (
                    <ParameterSelector
                      key={group.groupId}
                      title={group.groupLabel}
                      parameters={getMergedParameters(
                        group.parameters,
                        configKey
                      )}
                      selectedValues={config[configKey]}
                      selectionMode={currentSelectionMode}
                      onSelectionModeChange={() =>
                        group.groupId !== "corpus" &&
                        toggleSelectionMode(selectionModeKey)
                      }
                      onValueChange={(value) =>
                        handleParameterChange(configKey, value)
                      }
                      showSwitch={showSwitch}
                      showCustomAdd={group.groupId !== "corpus"}
                      onAddCustomContent={
                        group.groupId !== "corpus"
                          ? (content) =>
                              handleAddCustomContent(configKey, content)
                          : undefined
                      }
                      customHeader={
                        group.groupId === "corpus" ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCorpusUpload();
                            }}
                            className="w-4 h-4 mr-2.5 flex items-center justify-center hover:bg-300 rounded transition-colors"
                          >
                            <svg
                              width="16"
                              height="17"
                              viewBox="0 0 16 17"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M14 10.5V13.1667C14 13.5203 13.8595 13.8594 13.6095 14.1095C13.3594 14.3595 13.0203 14.5 12.6667 14.5H3.33333C2.97971 14.5 2.64057 14.3595 2.39052 14.1095C2.14048 13.8594 2 13.5203 2 13.1667V10.5M11.3333 5.83333L8 2.5M8 2.5L4.66667 5.83333M8 2.5V10.5"
                                stroke="#777777"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        ) : undefined
                      }
                    />
                  );
                })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pb-3 pr-3 flex justify-end gap-5 flex-shrink-0">
            <button
              onClick={handleAddToPlot}
              className="p-2 bg-200 rounded-lg outline outline-1 outline-offset-[-1px] outline-400 inline-flex justify-center items-center gap-2 hover:bg-300 transition-colors"
            >
              <div className="text-500 text-sm font-normal font-['time']">
                Update
              </div>
            </button>
            <button
              onClick={handleReset}
              className="p-2 bg-200 rounded-lg outline outline-1 outline-offset-[-1px] outline-400 inline-flex justify-center items-center gap-2 hover:bg-300 transition-colors"
            >
              <div className="text-500 text-sm font-normal">Reset</div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// File upload area component
interface FileUploadAreaProps {
  onFileSelect: (file: File) => void;
  uploading: boolean;
}

function FileUploadArea({ onFileSelect, uploading }: FileUploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith(".json")) {
      onFileSelect(file);
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded p-3 transition-colors ${
        dragActive
          ? "border-600 bg-100"
          : "border-300 hover:border-400 cursor-pointer"
      } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => !uploading && fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
        disabled={uploading}
      />
      <div className="flex flex-col items-center justify-center gap-1.5">
        {uploading ? (
          <>
            <div className="w-6 h-6 border-2 border-600 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-500 text-xs">Uploading...</div>
          </>
        ) : (
          <>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-500"
            >
              <path
                d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 2V8H20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="text-600 text-xs font-medium">
              Click or drag file to upload
            </div>
            <div className="text-500 text-xs">JSON format supported</div>
          </>
        )}
      </div>
    </div>
  );
}
