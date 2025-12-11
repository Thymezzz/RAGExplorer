"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import ConfigurationView from "./ConfigurationView";
import ChessboardAnalysisPlot from "./ChessboardAnalysisPlot";
import QueryView from "./QueryView";
import TextView from "./TextView";
import ComparisonView, { ChunkData } from "./ComparisonView";
import { EvaluationResult, Question, getQuestions } from "@/server/server";
import { SankeyChart } from "./SankeyView";

// define backend format configuration data type
export interface BackendConfigurationData {
  values: Record<string, string[]>;
  selectionModes: Record<string, "single" | "multiple">;
}

export interface CompareData {
  config1: {
    evaluationResult: EvaluationResult | null;
    questions: Question[];
    selectedParameters: BackendConfigurationData;
  };
  config2: {
    evaluationResult: EvaluationResult | null;
    questions: Question[];
    selectedParameters: BackendConfigurationData;
  };
}

export interface Chunk {
  id: string;
  document: string;
  metadata: {
    chunk_id: string;
    chunk_index: number;
    chunk_size: number;
  };
}

export default function Dashboard() {
  const [plotConfigurations, setPlotConfigurations] = useState<
    BackendConfigurationData[]
  >([]);
  const [comparisonData, setComparisonData] = useState<CompareData>({
    config1: {
      evaluationResult: null,
      questions: [],
      selectedParameters: { values: {}, selectionModes: {} },
    },
    config2: {
      evaluationResult: null,
      questions: [],
      selectedParameters: { values: {}, selectionModes: {} },
    },
  });

  // Manage combined selection state of Sankey chart
  const [sankeySelection, setSankeySelection] = useState<{
    questionIds: string[];
    elementId: string;
  } | null>(null);

  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);

  // Handle chunk click callback
  const handleChunkClick = useCallback(
    (chunkData: ChunkData | null, configType: "config1" | "config2" | null) => {
      if (chunkData && configType) {
        setClickedChunkData({ chunkData, configType });
        setClickedTestData(null); // Clear test data
      } else {
        setClickedChunkData(null); // Clear chunk data
      }
    },
    []
  );

  // Handle test click callback
  const handleTestClick = useCallback(
    (testData: Question | null, configType: "config1" | "config2" | null) => {
      if (testData && configType) {
        setClickedTestData({ testData, configType });
        setClickedChunkData(null); // Clear chunk data
      } else {
        setClickedTestData(null); // Clear test data
      }
    },
    []
  );

  // Add clicked information state
  const [clickedChunkData, setClickedChunkData] = useState<{
    chunkData: {
      id: string;
      similarity: number;
      content: string;
      text: string;
      isSelected: boolean;
      isRetrieved: boolean;
      isBackup: boolean;
      isEvidence: boolean;
    };
    configType: "config1" | "config2";
  } | null>(null);

  const [clickedTestData, setClickedTestData] = useState<{
    testData: Question;
    configType: "config1" | "config2";
  } | null>(null);

  // Derive ID list and element ID from combined state
  const sankeySelectionIds = useMemo(
    () => sankeySelection?.questionIds ?? null,
    [sankeySelection]
  );
  const selectedSankeyElementId = useMemo(
    () => sankeySelection?.elementId ?? null,
    [sankeySelection]
  );

  // Clear clicked data when selectedQueryId changes
  useEffect(() => {
    setClickedChunkData(null);
    setClickedTestData(null);
  }, [selectedQueryId]);

  // Clear selected question when question list changes
  useEffect(() => {
    // Check if the currently selected question still exists in the new question lists
    if (selectedQueryId) {
      const existsInConfig1 = comparisonData.config1.questions.some(
        (q) => q.id === selectedQueryId
      );
      const existsInConfig2 = comparisonData.config2.questions.some(
        (q) => q.id === selectedQueryId
      );

      // If the selected question does not exist in either configuration, clear the selection
      if (!existsInConfig1 && !existsInConfig2) {
        setSelectedQueryId(null);
      }
    }
  }, [
    comparisonData.config1.questions,
    comparisonData.config2.questions,
    selectedQueryId,
  ]);

  // When evaluation results in comparisonData change, asynchronously fetch questions data
  useEffect(() => {
    const fetchQuestionsForConfigs = async () => {
      // Check if config1 needs to fetch questions
      const config1HasResult =
        comparisonData.config1.evaluationResult?.ragAccuracy !== -1;
      const config1HasParams =
        Object.keys(comparisonData.config1.selectedParameters.values).length >
        0;
      const config1NeedsQuestions =
        config1HasResult &&
        config1HasParams &&
        comparisonData.config1.questions.length === 0;

      // Check if config2 needs to fetch questions
      const config2HasResult =
        comparisonData.config2.evaluationResult?.ragAccuracy !== -1;
      const config2HasParams =
        Object.keys(comparisonData.config2.selectedParameters.values).length >
        0;
      const config2NeedsQuestions =
        config2HasResult &&
        config2HasParams &&
        comparisonData.config2.questions.length === 0;

      if (!config1NeedsQuestions && !config2NeedsQuestions) {
        return; // No need to fetch any questions
      }

      const promises: Promise<void>[] = [];

      // Fetch questions for config1
      if (config1NeedsQuestions) {
        promises.push(
          getQuestions(comparisonData.config1.selectedParameters)
            .then((result) => {
              setComparisonData((prev) => ({
                ...prev,
                config1: {
                  ...prev.config1,
                  questions: result.questions,
                },
              }));
            })
            .catch((error) => {
              console.error("Failed to fetch config1 questions:", error);
            })
        );
      }

      // Fetch questions for config2
      if (config2NeedsQuestions) {
        promises.push(
          getQuestions(comparisonData.config2.selectedParameters)
            .then((result) => {
              setComparisonData((prev) => ({
                ...prev,
                config2: {
                  ...prev.config2,
                  questions: result.questions,
                },
              }));
            })
            .catch((error) => {
              console.error("Failed to fetch config2 questions:", error);
            })
        );
      }

      // Wait for all requests to complete
      await Promise.allSettled(promises);
    };

    fetchQuestionsForConfigs();
  }, [
    comparisonData.config1.evaluationResult,
    comparisonData.config2.evaluationResult,
    comparisonData.config1.selectedParameters,
    comparisonData.config2.selectedParameters,
    comparisonData.config1.questions.length,
    comparisonData.config2.questions.length,
  ]);

  // Derive QueryList instead of using independent state
  const queryList = useMemo((): CompareData => {
    if (!sankeySelectionIds) {
      return comparisonData;
    }

    const filterQuestions = (questions: Question[] | undefined) =>
      questions
        ? questions.filter((q) => sankeySelectionIds.includes(q.id))
        : [];

    return {
      config1: {
        ...comparisonData.config1,
        questions: filterQuestions(comparisonData.config1.questions),
      },
      config2: {
        ...comparisonData.config2,
        questions: filterQuestions(comparisonData.config2.questions),
      },
    };
  }, [comparisonData, sankeySelectionIds]);

  // Clear selected question when the displayed question list changes
  useEffect(() => {
    // Check if the currently selected question still exists in the displayed question list
    if (selectedQueryId) {
      const existsInQueryList =
        queryList.config1.questions.some((q) => q.id === selectedQueryId) ||
        queryList.config2.questions.some((q) => q.id === selectedQueryId);

      // If the selected question does not exist in the displayed question list, clear the selection
      if (!existsInQueryList) {
        setSelectedQueryId(null);
      }
    }
  }, [queryList, selectedQueryId]);

  // Handle adding configuration to plot - replace mode (only keep the latest configuration)
  const handleAddToPlot = (config: BackendConfigurationData) => {
    setPlotConfigurations([config]); // Replace with an array containing only the new configuration
  };

  // Handle query selection change
  const handleQuerySelection = (query: string | null) => {
    setSelectedQueryId(query);
  };

  const handleResetSelection = () => {
    setSankeySelection(null);
  };

  // useEffect(() => {
  //   if (selectedQueryId === null) {
  //     console.log("No query selected");
  //     setAllChunks({ config1: [], config2: [] });
  //     return;
  //   }

  //   const fetchChunks = async () => {
  //     const getDocIdsForConfig = (config: {
  //       evaluationResult: EvaluationResult | null;
  //     }) => {
  //       const question = config.evaluationResult?.questions.find(
  //         (q) => q.id === selectedQueryId
  //       );
  //       if (!question) {
  //         return [];
  //       }
  //       const retrievedDocIds =
  //         question.retrieved_docs?.map((doc) => doc[0]) ?? [];
  //       const backupDocIds = question.backup_docs?.map((doc) => doc[0]) ?? [];
  //       return [...new Set([...retrievedDocIds, ...backupDocIds])];
  //     };

  //     const docIds1 = getDocIdsForConfig(comparisonData.config1);
  //     const docIds2 = getDocIdsForConfig(comparisonData.config2);
  //     const config1_chunks =
  //       docIds1.length > 0
  //         ? await getDocumentChunks(
  //             comparisonData.config1.selectedParameters,
  //             docIds1
  //           )
  //         : [];
  //     const config2_chunks =
  //       docIds2.length > 0
  //         ? await getDocumentChunks(
  //             comparisonData.config2.selectedParameters,
  //             docIds2
  //           )
  //         : [];
  //     // console.log("docIds1", docIds1);
  //     // console.log("config1_chunks", config1_chunks);
  //     // console.log("docIds2", docIds2);
  //     // console.log("config2_chunks", config2_chunks);
  //     setAllChunks({
  //       config1: config1_chunks,
  //       config2: config2_chunks,
  //     });
  //   };

  //   fetchChunks();
  // }, [comparisonData, selectedQueryId]);

  return (
    <div className="flex w-full h-full">
      <div className="w-[350px] h-full p-4">
        <ConfigurationView onAddToPlot={handleAddToPlot} />
      </div>
      <div className="flex-1 h-full">
        <div className="flex-1 h-1/2 flex">
          <div className="flex-1 h-full p-4 pl-0">
            <ChessboardAnalysisPlot
              configurations={plotConfigurations}
              onSelectionChange={useCallback((data) => {
                setComparisonData(data);
                setSankeySelection(null); // Reset Sankey selection when new data is selected
              }, [])}
            />
          </div>
          <div className="w-[400px] h-full p-4 pl-0">
            <SankeyChart
              data={comparisonData}
              onSelectionChange={setSankeySelection}
              selectedElementId={selectedSankeyElementId}
            />
          </div>
        </div>
        <div className="flex-1 h-1/2 flex p-4 pl-0 pt-0">
          <div className="w-full h-full bg-white rounded-lg shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] outline outline-1 outline-offset-[-1px] outline-200 flex flex-col">
            {/* Common Header */}
            <div className="px-4 py-3 flex-shrink-0">
              <div className="text-600 text-xl font-bold font-['DIN_Alternate']">
                Instance Diagnosis
              </div>
            </div>

            {/* Content Container */}
            <div className="flex-1 flex flex-row min-h-0">
              <div className="w-[400px] h-full overflow-hidden p-2 pr-0">
                <QueryView
                  queryList={queryList}
                  selectedQueryId={selectedQueryId}
                  onQuerySelect={handleQuerySelection}
                />
              </div>
              <div className="flex-1 h-full overflow-hidden px-0 py-2">
                <ComparisonView
                  comparisonData={comparisonData}
                  selectedQueryId={selectedQueryId}
                  onChunkClick={handleChunkClick}
                  onTestClick={handleTestClick}
                />
              </div>
              <div className="w-[450px] h-full overflow-hidden p-2">
                <TextView
                  comparisonData={comparisonData}
                  selectedQueryId={selectedQueryId}
                  clickedChunkData={clickedChunkData}
                  clickedTestData={clickedTestData}
                  // chunks={allChunks}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
