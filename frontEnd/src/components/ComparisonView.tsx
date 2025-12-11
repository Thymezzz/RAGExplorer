import { CompareData } from "./Dashboard";
import { useMemo, useState, useEffect, useRef } from "react";
import * as d3 from "d3";
import { queryWithContext, Question, ErrorType } from "@/server/server";

interface ComparisonViewProps {
  comparisonData: CompareData;
  selectedQueryId: string | null;
  onChunkClick?: (
    chunkData: ChunkData | null,
    configType: "config1" | "config2" | null
  ) => void;
  onTestClick?: (
    testData: Question | null,
    configType: "config1" | "config2" | null
  ) => void;
}

export interface QueryWithContextHistory {
  id: string;
  answer: string;
  raw_answer: string;
  supporting_sentences: string[];
  question: string;
  context: string;
  ground_truth: string;
  selectedParameters: string[];
  isCorrect: boolean;
  selectedChunks: string[];
  timestamp: number;
  addPointY?: number;
}

export interface ChunkData {
  id: string;
  similarity: number;
  content: string;
  text: string; // Actual text content of the chunk
  isSelected: boolean;
  isRetrieved: boolean; // Whether it's in retrieved_docs
  isBackup: boolean; // Whether it's in backup_docs
  isEvidence: boolean; // Whether it's an evidence point
}

export default function ComparisonView({
  comparisonData,
  selectedQueryId,
  onChunkClick,
  onTestClick,
}: ComparisonViewProps) {
  const [config1History, setConfig1History] = useState<
    QueryWithContextHistory[]
  >([]);
  const [config2History, setConfig2History] = useState<
    QueryWithContextHistory[]
  >([]);
  const [selectedConfig1Chunks, setSelectedConfig1Chunks] = useState<string[]>(
    []
  );
  const [selectedConfig2Chunks, setSelectedConfig2Chunks] = useState<string[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState<
    "config1" | "config2" | null
  >(null);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.3);
  const [clickedAnswerId, setClickedAnswerId] = useState<string | null>(null);
  const [clickedChunkIds, setClickedChunkIds] = useState<Set<string>>(
    new Set()
  );
  const [selectionMode, setSelectionMode] = useState<
    "config1" | "config2" | null
  >(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Parse chunk data
  const processedData = useMemo(() => {
    if (selectedQueryId === null || selectedQueryId === "") return null;

    const question1 = comparisonData.config1.questions.find(
      (q) => q.id === selectedQueryId
    );
    const question2 = comparisonData.config2.questions.find(
      (q) => q.id === selectedQueryId
    );

    if (!question1 || !question2) return null;
    console.log("question1", question1);
    console.log("question2", question2);
    // Process config1 chunks
    const config1Chunks: ChunkData[] = [];

    // Get all document IDs from evidence_to_doc_ids_map in evidence_retrieval_analysis
    const config1EvidenceIds = new Set<number>();
    if (question1.evidence_retrieval_analysis?.evidence_to_doc_ids_map) {
      // Iterate through each value (document ID array) in evidence_to_doc_ids_map
      Object.values(
        question1.evidence_retrieval_analysis.evidence_to_doc_ids_map
      ).forEach((docIds) => {
        if (Array.isArray(docIds)) {
          docIds.forEach((docId) => config1EvidenceIds.add(docId));
        }
      });
    }

    // Add chunks from retrieved_docs
    question1.retrieved_docs.forEach((doc) => {
      if (Array.isArray(doc) && doc.length >= 2) {
        config1Chunks.push({
          id: doc[0],
          similarity: parseFloat(doc[1]) || 0,
          content: `Retrieved chunk ${doc[0]}`,
          text: doc[3] || "", // Get text content from doc[3]
          isSelected: false,
          isRetrieved: true,
          isBackup: false,
          isEvidence: config1EvidenceIds.has(doc[0]),
        });
      }
    });

    // Add chunks from backup_docs
    question1.backup_docs.forEach((doc) => {
      if (Array.isArray(doc) && doc.length >= 2) {
        const existingChunk = config1Chunks.find(
          (chunk) => chunk.id === doc[0]
        );
        if (!existingChunk) {
          config1Chunks.push({
            id: doc[0],
            similarity: parseFloat(doc[1]) || 0,
            content: `Backup chunk ${doc[0]}`,
            text: doc[3] || "", // Get text content from doc[3]
            isSelected: false,
            isRetrieved: false,
            isBackup: true,
            isEvidence: config1EvidenceIds.has(doc[0]),
          });
        }
      }
    });

    // Process config2 chunks
    const config2Chunks: ChunkData[] = [];

    // Get all document IDs from evidence_to_doc_ids_map in evidence_retrieval_analysis
    const config2EvidenceIds = new Set<number>();
    if (question2.evidence_retrieval_analysis?.evidence_to_doc_ids_map) {
      // Iterate through each value (document ID array) in evidence_to_doc_ids_map
      Object.values(
        question2.evidence_retrieval_analysis.evidence_to_doc_ids_map
      ).forEach((docIds) => {
        if (Array.isArray(docIds)) {
          docIds.forEach((docId) => config2EvidenceIds.add(docId));
        }
      });
    }

    // Add chunks from retrieved_docs
    question2.retrieved_docs.forEach((doc) => {
      if (Array.isArray(doc) && doc.length >= 2) {
        config2Chunks.push({
          id: doc[0],
          similarity: parseFloat(doc[1]) || 0,
          content: `Retrieved chunk ${doc[0]}`,
          text: doc[3] || "", // Get text content from doc[3]
          isSelected: false,
          isRetrieved: true,
          isBackup: false,
          isEvidence: config2EvidenceIds.has(doc[0]),
        });
      }
    });

    // Add chunks from backup_docs
    question2.backup_docs.forEach((doc) => {
      if (Array.isArray(doc) && doc.length >= 2) {
        const existingChunk = config2Chunks.find(
          (chunk) => chunk.id === doc[0]
        );
        if (!existingChunk) {
          config2Chunks.push({
            id: doc[0],
            similarity: parseFloat(doc[1]) || 0,
            content: `Backup chunk ${doc[0]}`,
            text: doc[3] || "", // Get text content from doc[3]
            isSelected: false,
            isRetrieved: false,
            isBackup: true,
            isEvidence: config2EvidenceIds.has(doc[0]),
          });
        }
      }
    });

    // Sort by similarity
    config1Chunks.sort((a, b) => b.similarity - a.similarity);
    config2Chunks.sort((a, b) => b.similarity - a.similarity);
    return {
      question1,
      question2,
      config1Chunks,
      config2Chunks,
    };
  }, [selectedQueryId, comparisonData]);

  // Clear all selection states when selectedQueryId changes
  useEffect(() => {
    setSelectedConfig1Chunks([]);
    setSelectedConfig2Chunks([]);
    setClickedAnswerId(null);
    setClickedChunkIds(new Set());
    setSelectionMode(null);
  }, [selectedQueryId]);

  // Initialize history records
  useEffect(() => {
    if (processedData) {
      // Add default history record for config1
      const defaultConfig1History: QueryWithContextHistory = {
        id: "default-1",
        answer: processedData.question1.rag_response,
        raw_answer: processedData.question1.rag_response, // Use rag_response as raw_answer
        supporting_sentences: [], // Default empty array
        question: processedData.question1.query, // Use original question
        context: "", // Default empty string
        ground_truth: processedData.question1.answer, // Use answer as ground_truth
        selectedParameters: [], // Default empty array
        isCorrect: processedData.question1.rag_correct,
        selectedChunks: processedData.question1.retrieved_docs.map((doc) =>
          Array.isArray(doc) ? doc[0] : doc
        ),
        timestamp: Date.now(),
      };

      // Add default history record for config2
      const defaultConfig2History: QueryWithContextHistory = {
        id: "default-2",
        answer: processedData.question2.rag_response,
        raw_answer: processedData.question2.rag_response, // Use rag_response as raw_answer
        supporting_sentences: [], // Default empty array
        question: processedData.question2.query, // Use original question
        context: "", // Default empty string
        ground_truth: processedData.question2.answer, // Use answer as ground_truth
        selectedParameters: [], // Default empty array
        isCorrect: processedData.question2.rag_correct,
        selectedChunks: processedData.question2.retrieved_docs.map((doc) =>
          Array.isArray(doc) ? doc[0] : doc
        ),
        timestamp: Date.now(),
      };

      setConfig1History([defaultConfig1History]);
      setConfig2History([defaultConfig2History]);
    }
  }, [processedData]);

  // Convert QueryWithContextHistory to Question format
  const convertToQuestionFormat = (
    history: QueryWithContextHistory,
    originalQuestion: Question,
    configType: "config1" | "config2"
  ): Question => {
    // Get detailed information of selected chunks
    const chunks =
      configType === "config1"
        ? processedData?.config1Chunks
        : processedData?.config2Chunks;
    const selectedChunkDetails =
      chunks?.filter((chunk) => history.selectedChunks.includes(chunk.id)) ||
      [];

    // Build retrieved_docs array, format: [question id, similarity, empty value, text]
    const retrievedDocsArray = selectedChunkDetails.map((chunk) =>
      JSON.stringify([chunk.id, chunk.similarity, "", chunk.text])
    );

    return {
      id: history.id,
      query: history.question,
      answer: history.ground_truth,
      rag_response: history.answer,
      direct_response: "", // No direct_response for counterfact test
      rag_correct: history.isCorrect,
      direct_correct: false, // No direct_correct for counterfact test
      error_type: "unknown" as ErrorType, // Use default error type
      supporting_sentences: history.supporting_sentences,
      retrieved_docs: retrievedDocsArray,
      backup_docs: [], // No backup_docs for counterfact test
      raw_response: history.raw_answer,
      evidence_list: originalQuestion.evidence_list || [],
      evidence_retrieval_analysis:
        originalQuestion.evidence_retrieval_analysis || {
          evidence_list: [],
          evidence_to_doc_ids_map: {},
          context_doc_ids: [],
          retrieved_pool_doc_ids: [],
          hit_counts: {
            context_hits: 0,
            backup_hits: 0,
            total_evidence: 0,
          },
        },
    };
  };

  // Handle query with custom context request
  const handleQueryWithContext = async (
    configType: "config1" | "config2",
    selectedChunks: string[],
    addPointY?: number
  ) => {
    if (!processedData || selectedChunks.length === 0) return;

    setIsLoading(true);
    setLoadingConfig(configType);
    try {
      const question =
        configType === "config1"
          ? processedData.question1
          : processedData.question2;
      const selectedParameters =
        configType === "config1"
          ? comparisonData.config1.selectedParameters
          : comparisonData.config2.selectedParameters;
      console.log("selectedParameters", selectedParameters);
      // Build context by getting actual chunk text content based on selectedChunks
      const chunks =
        configType === "config1"
          ? processedData.config1Chunks
          : processedData.config2Chunks;

      const selectedChunkTexts = selectedChunks
        .map((chunkId) => {
          const chunk = chunks.find((c) => c.id === chunkId);
          return chunk ? chunk.text : "";
        })
        .filter((text) => text.length > 0);
      const context = selectedChunkTexts.join("\n");

      const result = await queryWithContext(
        selectedParameters,
        question.query,
        context,
        question.answer // Pass ground_truth
      );

      // Create new history record
      const newHistory: QueryWithContextHistory = {
        id: `query-context-${Date.now()}`,
        answer: result.answer,
        raw_answer: result.raw_answer, // New field
        supporting_sentences: result.supporting_sentences, // New field
        question: result.question, // New field
        context: result.context, // New field
        ground_truth: result.ground_truth, // New field
        selectedParameters: result.selectedParameters, // New field
        isCorrect: result.is_correct, // Use evaluation result
        selectedChunks: selectedChunks,
        timestamp: Date.now(),
        addPointY: addPointY,
      };

      // Update history for corresponding configuration
      if (configType === "config1") {
        setConfig1History((prev) => [...prev, newHistory]);
      } else {
        setConfig2History((prev) => [...prev, newHistory]);
      }
    } catch (error) {
      console.error("Query with context request failed:", error);
    } finally {
      setIsLoading(false);
      setLoadingConfig(null);
    }
  };

  // Calculate text similarity
  const calculateTextSimilarity = (text1: string, text2: string): number => {
    if (!text1 || !text2) return 0;

    // Convert text to lowercase and tokenize
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    // Calculate Jaccard similarity
    const set1 = new Set(words1);
    const set2 = new Set(words2);

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  };

  // Match similar chunks
  const matchedChunks = useMemo(() => {
    if (!processedData) return [];

    const matches: Array<{
      config1Chunk: ChunkData;
      config2Chunk: ChunkData;
      similarity: number;
    }> = [];

    processedData.config1Chunks.forEach((chunk1) => {
      processedData.config2Chunks.forEach((chunk2) => {
        const textSimilarity = calculateTextSimilarity(
          chunk1.text,
          chunk2.text
        );
        if (textSimilarity > similarityThreshold) {
          // Similarity threshold
          matches.push({
            config1Chunk: chunk1,
            config2Chunk: chunk2,
            similarity: textSimilarity,
          });
        }
      });
    });

    // Sort by similarity and deduplicate (each chunk only matches the most similar one)
    const sortedMatches = matches.sort((a, b) => b.similarity - a.similarity);
    const uniqueMatches: typeof matches = [];
    const usedConfig1 = new Set<string>();
    const usedConfig2 = new Set<string>();

    sortedMatches.forEach((match) => {
      if (
        !usedConfig1.has(match.config1Chunk.id) &&
        !usedConfig2.has(match.config2Chunk.id)
      ) {
        uniqueMatches.push(match);
        usedConfig1.add(match.config1Chunk.id);
        usedConfig2.add(match.config2Chunk.id);
      }
    });

    return uniqueMatches;
  }, [processedData, similarityThreshold]);

  // Toggle chunk selection state
  const toggleChunkSelection = (
    configType: "config1" | "config2",
    chunkId: string
  ) => {
    if (configType === "config1") {
      setSelectedConfig1Chunks((prev) =>
        prev.includes(chunkId)
          ? prev.filter((id) => id !== chunkId)
          : [...prev, chunkId]
      );
    } else {
      setSelectedConfig2Chunks((prev) =>
        prev.includes(chunkId)
          ? prev.filter((id) => id !== chunkId)
          : [...prev, chunkId]
      );
    }
  };

  // Draw similarity coordinate axes
  useEffect(() => {
    if (!svgRef.current || !processedData) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 700;
    const height = 440;
    const margin = { top: 40, right: 120, bottom: 30, left: 60 };

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Create main container
    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Create independent similarity ranges for each configuration
    const config1Similarities = processedData.config1Chunks.map(
      (c) => c.similarity
    );
    const config2Similarities = processedData.config2Chunks.map(
      (c) => c.similarity
    );

    const config1MinSimilarity = Math.min(...config1Similarities);
    const config1MaxSimilarity = Math.max(...config1Similarities);
    const config2MinSimilarity = Math.min(...config2Similarities);
    const config2MaxSimilarity = Math.max(...config2Similarities);

    // Add margin for each configuration
    const config1Range = config1MaxSimilarity - config1MinSimilarity;
    const config2Range = config2MaxSimilarity - config2MinSimilarity;
    const config1Padding = config1Range * 0.1;
    const config2Padding = config2Range * 0.1;

    const config1AdjustedMin = Math.max(
      0,
      config1MinSimilarity - config1Padding
    );
    const config1AdjustedMax = Math.min(
      1,
      config1MaxSimilarity + config1Padding
    );
    const config2AdjustedMin = Math.max(
      0,
      config2MinSimilarity - config2Padding
    );
    const config2AdjustedMax = Math.min(
      1,
      config2MaxSimilarity + config2Padding
    );

    // Create two independent similarity scales
    const config1SimilarityScale = d3
      .scaleLinear()
      .domain([config1AdjustedMin, config1AdjustedMax])
      .range([chartHeight, 0]);

    const config2SimilarityScale = d3
      .scaleLinear()
      .domain([config2AdjustedMin, config2AdjustedMax])
      .range([chartHeight, 0]);

    // Create two vertical similarity axes
    const axisWidth = 60; // Widen axis to 60px
    const axisSpacing = 180; // Increase axis spacing

    // Left axis (Config1)
    const leftAxisG = g
      .append("g")
      .attr("transform", `translate(${chartWidth / 2 - axisSpacing / 2}, 0)`);

    leftAxisG
      .append("rect")
      .attr("x", -axisWidth / 2)
      .attr("y", 0)
      .attr("width", axisWidth)
      .attr("height", chartHeight)
      .attr("fill", "#E0E0E0");

    // Right axis (Config2)
    const rightAxisG = g
      .append("g")
      .attr("transform", `translate(${chartWidth / 2 + axisSpacing / 2}, 0)`);

    rightAxisG
      .append("rect")
      .attr("x", -axisWidth / 2)
      .attr("y", 0)
      .attr("width", axisWidth)
      .attr("height", chartHeight)
      .attr("fill", "#E0E0E0");

    // Add similarity labels
    [leftAxisG, rightAxisG].forEach((axisG, axisIndex) => {
      // Title
      axisG
        .append("text")
        .attr("x", 0)
        .attr("y", -25)
        .attr("text-anchor", "middle")
        .attr("font-family", "Times New Roman")
        .attr("font-size", "16")
        .attr("font-weight", "bold")
        .attr("fill", axisIndex === 0 ? "var(--config1)" : "var(--config2)")
        .text(`Config ${axisIndex + 1}`);

      // Numeric labels - use corresponding configuration's range
      const currentScale =
        axisIndex === 0 ? config1SimilarityScale : config2SimilarityScale;
      const currentMax =
        axisIndex === 0 ? config1AdjustedMax : config2AdjustedMax;
      const currentMin =
        axisIndex === 0 ? config1AdjustedMin : config2AdjustedMin;

      axisG
        .append("text")
        .attr("x", 0)
        .attr("y", currentScale(currentMax) - 10)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "14")
        .attr("fill", "var(--500)")
        .text(currentMax.toFixed(2));

      axisG
        .append("text")
        .attr("x", 0)
        .attr("y", currentScale(currentMin) + 15)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "14")
        .attr("fill", "var(--500)")
        .text(currentMin.toFixed(2));
    });

    // Calculate positions of all chunk points (distributed by similarity)
    const config1Positions = processedData.config1Chunks.map((chunk) => {
      const y = config1SimilarityScale(chunk.similarity);
      return { chunk, y };
    });

    const config2Positions = processedData.config2Chunks.map((chunk) => {
      const y = config2SimilarityScale(chunk.similarity);
      return { chunk, y };
    });

    // Calculate total number of answer points
    const totalAnswers = Math.max(config1History.length, config2History.length);
    const answerSpacing = 60; // Spacing between answer points
    const startY = chartHeight / 2 - ((totalAnswers - 1) * answerSpacing) / 2; // Start from center

    // Draw Config1 answer points
    const config1AnswerG = g
      .append("g")
      .attr("class", "config1-answers")
      .attr("transform", `translate(15, 0)`);

    config1History.forEach((history, index) => {
      // If addPointY exists, use original position, otherwise use calculated position
      const y =
        history.addPointY !== undefined
          ? history.addPointY
          : startY + index * answerSpacing;

      const answerG = config1AnswerG
        .append("g")
        .attr("class", "answer-point")
        .attr("data-id", history.id)
        .style("cursor", "pointer")
        .on("click", () => {
          const newClickedAnswerId =
            clickedAnswerId === history.id ? null : history.id;
          setClickedAnswerId(newClickedAnswerId);
          if (onTestClick && processedData) {
            if (newClickedAnswerId) {
              const questionData = convertToQuestionFormat(
                history,
                processedData.question1,
                "config1"
              );
              onTestClick(questionData, "config1");
            } else {
              onTestClick(null, null);
            }
          }
        });

      // Answer points (circles)
      answerG
        .append("circle")
        .attr("cx", 0)
        .attr("cy", y)
        .attr("r", 12)
        .attr("fill", history.isCorrect ? "var(--theme)" : "var(--wrong)")
        .attr("stroke", clickedAnswerId === history.id ? "var(--500)" : "none")
        .attr("stroke-width", clickedAnswerId === history.id ? 2 : 0);

      // Answer labels
      answerG
        .append("text")
        .attr("x", -60)
        .attr("y", y)
        .attr("text-anchor", "start")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "12")
        .attr("fill", "var(--500)")
        .text(index === 0 ? "Original" : `Test ${index}`);
    });

    // Draw Config1 add new test point
    const config1AddY = startY + config1History.length * answerSpacing;
    const config1AddG = config1AnswerG
      .append("g")
      .attr("class", "add-test-point")
      .style("cursor", "pointer")
      .on("click", () => {
        // Enter Config1 selection mode
        setSelectionMode("config1");
        // Clear previous selections and connections
        setSelectedConfig1Chunks([]);
        setSelectedConfig2Chunks([]);
        setClickedChunkIds(new Set());
      });

    // Add new test point (dashed circle)
    config1AddG
      .append("circle")
      .attr("cx", 0)
      .attr("cy", config1AddY)
      .attr("r", 12)
      .attr("fill", "none")
      .attr(
        "stroke",
        selectionMode === "config1" ? "var(--highlight)" : "#9CA3AF"
      )
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "3,3");

    // Add new test point (+ sign)
    config1AddG
      .append("text")
      .attr("x", 0)
      .attr("y", config1AddY)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "16")
      .attr(
        "fill",
        selectionMode === "config1" ? "var(--highlight)" : "#9CA3AF"
      )
      .text(
        loadingConfig === "config1"
          ? "loading..."
          : selectionMode === "config1"
          ? "selecting..."
          : "+"
      );

    // Draw Config2 answer points
    const config2AnswerG = g
      .append("g")
      .attr("class", "config2-answers")
      .attr("transform", `translate(${chartWidth - 20}, 0)`);

    config2History.forEach((history, index) => {
      // If addPointY exists, use the original position; otherwise, use the calculated position
      const y =
        history.addPointY !== undefined
          ? history.addPointY
          : startY + index * answerSpacing;

      const answerG = config2AnswerG
        .append("g")
        .attr("class", "answer-point")
        .attr("data-id", history.id)
        .style("cursor", "pointer")
        .on("click", () => {
          const newClickedAnswerId =
            clickedAnswerId === history.id ? null : history.id;
          setClickedAnswerId(newClickedAnswerId);
          // Call the callback function from the parent component
          if (onTestClick && processedData) {
            if (newClickedAnswerId) {
              // Pass data when an answer is selected
              const questionData = convertToQuestionFormat(
                history,
                processedData.question2,
                "config2"
              );
              onTestClick(questionData, "config2");
            } else {
              // Pass null to clear data when deselected
              onTestClick(null, null);
            }
          }
        });

      // Answer points (circles)
      answerG
        .append("circle")
        .attr("cx", 0)
        .attr("cy", y)
        .attr("r", 12)
        .attr("fill", history.isCorrect ? "var(--theme)" : "var(--wrong)")
        .attr("stroke", clickedAnswerId === history.id ? "var(--500)" : "none")
        .attr("stroke-width", clickedAnswerId === history.id ? 2 : 0);

      // Answer labels
      answerG
        .append("text")
        .attr("x", 60)
        .attr("y", y)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "12")
        .attr("fill", "var(--500)")
        .text(index === 0 ? "Original" : `Test ${index}`);
    });

    // Draw Config2 add new test point
    const config2AddY = startY + config2History.length * answerSpacing;
    const config2AddG = config2AnswerG
      .append("g")
      .attr("class", "add-test-point")
      .style("cursor", "pointer")
      .on("click", () => {
        // Enter Config2 selection mode
        setSelectionMode("config2");
        // Clear previous selections and connections
        setSelectedConfig1Chunks([]);
        setSelectedConfig2Chunks([]);
        setClickedChunkIds(new Set());
      });

    // Add new test point (dashed circle)
    config2AddG
      .append("circle")
      .attr("cx", 0)
      .attr("cy", config2AddY)
      .attr("r", 12)
      .attr("fill", "none")
      .attr(
        "stroke",
        selectionMode === "config2" ? "var(--highlight)" : "#9CA3AF"
      )
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "3,3");

    // Add new test point (+ sign)
    config2AddG
      .append("text")
      .attr("x", 0)
      .attr("y", config2AddY)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "16")
      .attr(
        "fill",
        selectionMode === "config2" ? "var(--highlight)" : "#9CA3AF"
      )
      .text(
        loadingConfig === "config2"
          ? "loading..."
          : selectionMode === "config2"
          ? "selecting..."
          : "+"
      );

    // Draw matching connections
    matchedChunks.forEach((match) => {
      // Find positions
      const config1Pos = config1Positions.find(
        (p) => p.chunk.id === match.config1Chunk.id
      );
      const config2Pos = config2Positions.find(
        (p) => p.chunk.id === match.config2Chunk.id
      );

      const y1 = config1Pos
        ? config1Pos.y
        : config1SimilarityScale(match.config1Chunk.similarity);
      const y2 = config2Pos
        ? config2Pos.y
        : config2SimilarityScale(match.config2Chunk.similarity);
      const x1 = chartWidth / 2 - axisSpacing / 2 + 35; // Connect to the right edge of Config1 point (adjusted for new chunk width)
      const x2 = chartWidth / 2 + axisSpacing / 2 - 35; // Connect to the left edge of Config2 point (adjusted for new chunk width)

      // Bezier curve connection
      const controlPoint1X = x1 + (x2 - x1) * 0.25;
      const controlPoint1Y = y1;
      const controlPoint2X = x1 + (x2 - x1) * 0.75;
      const controlPoint2Y = y2;

      // Check if related to clicked chunk
      const isRelatedToClickedChunk =
        clickedChunkIds.has(match.config1Chunk.id) ||
        clickedChunkIds.has(match.config2Chunk.id);

      g.append("path")
        .attr(
          "d",
          `M ${x1} ${y1} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${x2} ${y2}`
        )
        .attr("fill", "none")
        .attr("stroke", isRelatedToClickedChunk ? "var(--500)" : "var(--200)") // Adjust color based on click state
        .attr("stroke-width", Math.max(1, match.similarity * 3)) // Adjust stroke width based on similarity
        .attr("opacity", isRelatedToClickedChunk ? 0.8 : 0.3) // Adjust opacity based on click state
        .style("pointer-events", "none");
    });

    // Draw Config1 answer points to chunk connections
    config1History.forEach((history, index) => {
      const answerY =
        history.addPointY !== undefined
          ? history.addPointY
          : startY + index * answerSpacing;

      history.selectedChunks.forEach((chunkId) => {
        const chunkPosition = config1Positions.find(
          (pos) => pos.chunk.id === chunkId
        );

        if (chunkPosition) {
          const x1 = 15 + 12; // Right edge of Config1 answer point (radius 12px)
          const y1 = answerY;
          const x2 = chartWidth / 2 - axisSpacing / 2 - 35; // Left edge of Config1 chunk axis (adjusted for new chunk width)
          const y2 = chunkPosition.y;

          // Bezier curve connection
          const controlPoint1X = x1 + (x2 - x1) * 0.3;
          const controlPoint1Y = y1;
          const controlPoint2X = x1 + (x2 - x1) * 0.7;
          const controlPoint2Y = y2;

          g.append("path")
            .attr(
              "d",
              `M ${x1} ${y1} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${x2} ${y2}`
            )
            .attr("fill", "none")
            .attr(
              "stroke",
              clickedAnswerId === history.id ? "var(--400)" : "var(--200)"
            ) // Adjust color based on click state
            .attr("stroke-width", 2)
            .attr("opacity", clickedAnswerId === history.id ? 0.7 : 0.4) // Adjust opacity based on click state
            .style("pointer-events", "none");
        }
      });
    });

    // Draw Config2 answer points to chunk connections
    config2History.forEach((history, index) => {
      const answerY =
        history.addPointY !== undefined
          ? history.addPointY
          : startY + index * answerSpacing;

      history.selectedChunks.forEach((chunkId) => {
        const chunkPosition = config2Positions.find(
          (pos) => pos.chunk.id === chunkId
        );

        if (chunkPosition) {
          const x1 = chartWidth - 20 - 12; // Left edge of Config2 answer point (radius 12px)
          const y1 = answerY;
          const x2 = chartWidth / 2 + axisSpacing / 2 + 35; // Right edge of Config2 chunk axis
          const y2 = chunkPosition.y;

          // Bezier curve connection
          const controlPoint1X = x1 + (x2 - x1) * 0.3;
          const controlPoint1Y = y1;
          const controlPoint2X = x1 + (x2 - x1) * 0.7;
          const controlPoint2Y = y2;

          g.append("path")
            .attr(
              "d",
              `M ${x1} ${y1} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${x2} ${y2}`
            )
            .attr("fill", "none")
            .attr(
              "stroke",
              clickedAnswerId === history.id ? "var(--400)" : "var(--200)"
            ) // Adjust color based on click state
            .attr("stroke-width", 2)
            .attr("opacity", clickedAnswerId === history.id ? 0.7 : 0.4) // Adjust opacity based on click state
            .style("pointer-events", "none");
        }
      });
    });

    // Draw Config1 added new test point to selected chunks connections (only in selection mode)
    if (selectedConfig1Chunks.length > 0 && selectionMode === "config1") {
      const addY = config1AddY;

      selectedConfig1Chunks.forEach((chunkId) => {
        const chunkPosition = config1Positions.find(
          (pos) => pos.chunk.id === chunkId
        );

        if (chunkPosition) {
          const x1 = 15 + 12; // Right edge of Config1 added new test point (radius 12px)
          const y1 = addY;
          const x2 = chartWidth / 2 - axisSpacing / 2 - 35; // Left edge of Config1 chunk axis
          const y2 = chunkPosition.y;

          // Bezier curve connection
          const controlPoint1X = x1 + (x2 - x1) * 0.3;
          const controlPoint1Y = y1;
          const controlPoint2X = x1 + (x2 - x1) * 0.7;
          const controlPoint2Y = y2;

          g.append("path")
            .attr(
              "d",
              `M ${x1} ${y1} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${x2} ${y2}`
            )
            .attr("fill", "none")
            .attr("stroke", "var(--highlight)")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "3,3")
            .attr("opacity", 0.6) // Reduce opacity to make the line lighter
            .style("pointer-events", "none");
        }
      });
    }

    // Draw Config2 added new test point to selected chunks connections (only in selection mode)
    if (selectedConfig2Chunks.length > 0 && selectionMode === "config2") {
      const addY = config2AddY;

      selectedConfig2Chunks.forEach((chunkId) => {
        const chunkPosition = config2Positions.find(
          (pos) => pos.chunk.id === chunkId
        );

        if (chunkPosition) {
          const x1 = chartWidth - 20 - 12; // Left edge of Config2 added new test point (radius 12px)
          const y1 = addY;
          const x2 = chartWidth / 2 + axisSpacing / 2 + 35; // Right edge of Config2 chunk axis
          const y2 = chunkPosition.y;

          // Bezier curve connection
          const controlPoint1X = x1 + (x2 - x1) * 0.3;
          const controlPoint1Y = y1;
          const controlPoint2X = x1 + (x2 - x1) * 0.7;
          const controlPoint2Y = y2;

          g.append("path")
            .attr(
              "d",
              `M ${x1} ${y1} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${x2} ${y2}`
            )
            .attr("fill", "none")
            .attr("stroke", "var(--highlight)")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "3,3")
            .attr("opacity", 0.6) // Reduce opacity to make the line lighter
            .style("pointer-events", "none");
        }
      });
    }

    // Draw Config1 chunk points
    config1Positions.forEach(({ chunk, y }) => {
      const chunkG = leftAxisG
        .append("g")
        .attr("class", "chunk-point")
        .attr("data-id", chunk.id)
        .style("cursor", selectionMode === "config1" ? "pointer" : "default")
        .on("mouseenter", function (event) {
          // Show larger clickable area on hover
          d3.select(this)
            .select("rect")
            .transition()
            .duration(200)
            .attr("width", 75)
            .attr("height", 10)
            .attr("x", -37.5)
            .attr("y", y - 5);

          // Show tooltip
          const tooltip = d3
            .select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("background", "var(--500)")
            .style("color", "white")
            .style("padding", "8px")
            .style("border-radius", "4px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("z-index", "1000");

          tooltip.html(`
            <div><strong>Chunk ID:</strong> ${chunk.id}</div>
            <div><strong>Similarity:</strong> ${chunk.similarity.toFixed(
              3
            )}</div>
            
          `);

          tooltip
            .style("left", event.pageX + 10 + "px")
            .style("top", event.pageY - 10 + "px");
        })
        .on("mouseleave", function () {
          // Restore original size on mouse leave
          d3.select(this)
            .select("rect")
            .transition()
            .duration(200)
            .attr("width", 70)
            .attr("height", 8)
            .attr("x", -35)
            .attr("y", y - 4);

          // Remove tooltip
          d3.selectAll(".tooltip").remove();
        })
        .on("click", () => {
          const isCurrentlyClicked = clickedChunkIds.has(chunk.id);

          // If not in selection mode, handle chunk detail display
          if (selectionMode !== "config1") {
            if (onChunkClick) {
              if (isCurrentlyClicked) {
                // Clear data when deselected
                onChunkClick(null, null);
              } else {
                // Pass data when selected
                onChunkClick(chunk, "config1");
              }
            }
          }

          // Toggle chunk selection regardless of selection mode
          toggleChunkSelection("config1", chunk.id);

          // Show connection lines
          setClickedChunkIds((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(chunk.id)) {
              newSet.delete(chunk.id);
            } else {
              newSet.add(chunk.id);
            }
            return newSet;
          });
        });

      // Config1 chunk rectangles
      chunkG
        .append("rect")
        .attr("x", -35)
        .attr("y", y - 4)
        .attr("width", 70)
        .attr("height", 8)
        .attr("rx", 3)
        .attr(
          "fill",
          selectedConfig1Chunks.includes(chunk.id)
            ? "var(--highlight)" // Selected chunk color
            : chunk.isEvidence
            ? "var(--evidence)" // Evidence points highlighted in orange
            : "var(--400)"
        )
        .attr(
          "stroke",
          selectedConfig1Chunks.includes(chunk.id)
            ? "var(--highlight)" // Selected chunk border
            : "none"
        )
        .attr("stroke-width", chunk.isEvidence ? 3 : 2);
    });

    // Draw Config2 chunk points
    config2Positions.forEach(({ chunk, y }) => {
      const chunkG = rightAxisG
        .append("g")
        .attr("class", "chunk-point")
        .attr("data-id", chunk.id)
        .style("cursor", selectionMode === "config2" ? "pointer" : "default")
        .on("mouseenter", function (event) {
          // Show larger clickable area on hover
          d3.select(this)
            .select("rect")
            .transition()
            .duration(200)
            .attr("width", 75)
            .attr("height", 10)
            .attr("x", -37.5)
            .attr("y", y - 5);

          // Show tooltip
          const tooltip = d3
            .select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("background", "var(--500)")
            .style("color", "white")
            .style("padding", "8px")
            .style("border-radius", "4px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("z-index", "1000");

          tooltip.html(`
            <div><strong>Chunk ID:</strong> ${chunk.id}</div>
            <div><strong>Similarity:</strong> ${chunk.similarity.toFixed(
              3
            )}</div>
          `);

          tooltip
            .style("left", event.pageX + 10 + "px")
            .style("top", event.pageY - 10 + "px");
        })
        .on("mouseleave", function () {
          // Restore original size on mouse leave
          d3.select(this)
            .select("rect")
            .transition()
            .duration(200)
            .attr("width", 70)
            .attr("height", 8)
            .attr("x", -35)
            .attr("y", y - 4);

          // Remove tooltip
          d3.selectAll(".tooltip").remove();
        })
        .on("click", () => {
          // Check if the current chunk is already selected (for showing connection lines)
          const isCurrentlyClicked = clickedChunkIds.has(chunk.id);

          // If not in selection mode, handle chunk detail display
          if (selectionMode !== "config2") {
            if (onChunkClick) {
              if (isCurrentlyClicked) {
                // Clear data when deselected
                onChunkClick(null, null);
              } else {
                // Pass data when selected
                onChunkClick(chunk, "config2");
              }
            }
          }

          // Toggle chunk selection regardless of selection mode
          toggleChunkSelection("config2", chunk.id);

          // Show connection lines
          setClickedChunkIds((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(chunk.id)) {
              newSet.delete(chunk.id);
            } else {
              newSet.add(chunk.id);
            }
            return newSet;
          });
        });

      // Chunk rectangle
      chunkG
        .append("rect")
        .attr("x", -35)
        .attr("y", y - 4)
        .attr("width", 70)
        .attr("height", 8)
        .attr("rx", 3)
        .attr(
          "fill",
          selectedConfig2Chunks.includes(chunk.id)
            ? "var(--highlight)" // Selected chunk color
            : chunk.isEvidence
            ? "var(--evidence)" // Evidence chunk color
            : "var(--400)"
        )
        .attr(
          "stroke",
          selectedConfig2Chunks.includes(chunk.id)
            ? "var(--highlight)" // Selected chunk border
            : "none"
        )
        .attr("stroke-width", chunk.isEvidence ? 3 : 2);
    });
    const legendX = 150;
    const legendWidth = 110;
    const legendHeight = 150;

    // Draw legend background
    const legendG = g
      .append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${chartWidth - 150}, -20)`);

    // Add legend background box
    legendG
      .append("rect")
      .attr("x", legendX)
      .attr("y", -5)
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", "rgba(255, 255, 255, 0.95)")
      .attr("stroke", "var(--200)")
      .attr("stroke-width", 1);

    // Legend title
    legendG
      .append("text")
      .attr("x", legendX + legendWidth / 2)
      .attr("y", 15)
      .attr("text-anchor", "middle")
      .attr("font-family", "Times New Roman")
      .attr("font-size", "16")
      .attr("font-weight", "500")
      .attr("fill", "var(--700)")
      .text("Legend");

    // Separator line
    legendG
      .append("line")
      .attr("x1", legendX)
      .attr("x2", legendX + legendWidth)
      .attr("y1", 25)
      .attr("y2", 25)
      .attr("stroke", "var(--200)")
      .attr("stroke-width", 1);

    // Legend items configuration
    const legendItems = [
      { type: "rect", color: "var(--400)", label: "Chunk", y: 40 },
      { type: "rect", color: "var(--highlight)", label: "Selected", y: 58 },
      { type: "rect", color: "var(--evidence)", label: "Evidence", y: 58 + 18 },
      {
        type: "circle",
        color: "var(--theme)",
        label: "Correct",
        y: 58 + 18 + 18,
      },
      {
        type: "circle",
        color: "var(--wrong)",
        label: "Incorrect",
        y: 58 + 18 + 18 + 18,
      },
      {
        type: "circle",
        color: "none",
        stroke: "var(--400)",
        dash: true,
        label: "Add New Test",
        y: 58 + 18 + 18 + 18 + 18,
      },
    ];

    // Draw legend items
    legendItems.forEach((item, index) => {
      const itemGroup = legendG
        .append("g")
        .attr("class", `legend-item-${index}`);

      if (item.type === "rect") {
        itemGroup
          .append("rect")
          .attr("x", legendX + 10)
          .attr("y", item.y - 2)
          .attr("width", 14)
          .attr("height", 6)
          .attr("rx", 2)
          .attr("ry", 2)
          .attr("fill", item.color)
          .attr("stroke", "none");
      } else if (item.type === "circle") {
        const circle = itemGroup
          .append("circle")
          .attr("cx", legendX + 17)
          .attr("cy", item.y)
          .attr("r", 5)
          .attr("fill", item.color || "none")
          .attr("stroke", item.stroke || "none")
          .attr("stroke-width", 1.5);

        if (item.dash) {
          circle.attr("stroke-dasharray", "3,3");
        }
      }

      itemGroup
        .append("text")
        .attr("x", legendX + 30)
        .attr("y", item.y)
        .attr("dominant-baseline", "middle")
        .attr("font-family", "Times New Roman")
        .attr("font-size", "12")
        .attr("font-weight", "500")
        .attr("fill", "var(--600)")
        .text(item.label);
    });

    // Add execute and cancel buttons (only shown in selection mode)
    if (selectionMode === "config1") {
      // Execute and cancel buttons for Config1
      const config1ExecuteG = config1AnswerG
        .append("g")
        .attr("class", "execute-button")
        .attr("transform", `translate(0, ${config1AddY + 25})`)
        .style("cursor", "pointer")
        .on("click", () => {
          if (selectedConfig1Chunks.length > 0) {
            handleQueryWithContext("config1", selectedConfig1Chunks);
            setSelectionMode(null);
            setSelectedConfig1Chunks([]);
            setSelectedConfig2Chunks([]);
          }
        });

      // Config1 execute button (✓)
      config1ExecuteG
        .append("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", 10)
        .attr("fill", "var(--theme)")
        .attr("stroke", "var(--500)")
        .attr("stroke-width", 1);

      config1ExecuteG
        .append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "14")
        .attr("font-weight", "bold")
        .attr("fill", "white")
        .text("✓");

      // Config1 cancel button (✗)
      const config1CancelG = config1AnswerG
        .append("g")
        .attr("class", "cancel-button")
        .attr("transform", `translate(25, ${config1AddY + 25})`)
        .style("cursor", "pointer")
        .on("click", () => {
          setSelectionMode(null);
          setSelectedConfig1Chunks([]);
          setSelectedConfig2Chunks([]);
          setClickedChunkIds(new Set());
        });

      config1CancelG
        .append("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", 10)
        .attr("fill", "var(--wrong)")
        .attr("stroke", "var(--500)")
        .attr("stroke-width", 1);

      config1CancelG
        .append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "14")
        .attr("font-weight", "bold")
        .attr("fill", "white")
        .text("✗");
    }

    if (selectionMode === "config2") {
      // Config2 execute and cancel buttons
      const config2ExecuteG = config2AnswerG
        .append("g")
        .attr("class", "execute-button")
        .attr("transform", `translate(0, ${config2AddY + 25})`)
        .style("cursor", "pointer")
        .on("click", () => {
          if (selectedConfig2Chunks.length > 0) {
            handleQueryWithContext("config2", selectedConfig2Chunks);
            setSelectionMode(null);
            setSelectedConfig1Chunks([]);
            setSelectedConfig2Chunks([]);
          }
        });

      // Config2 execute button (✓)
      config2ExecuteG
        .append("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", 10)
        .attr("fill", "var(--theme)")
        .attr("stroke", "var(--500)")
        .attr("stroke-width", 1);

      config2ExecuteG
        .append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "14")
        .attr("font-weight", "bold")
        .attr("fill", "white")
        .text("✓");

      // Config2 cancel button (✗)
      const config2CancelG = config2AnswerG
        .append("g")
        .attr("class", "cancel-button")
        .attr("transform", `translate(-25, ${config2AddY + 25})`)
        .style("cursor", "pointer")
        .on("click", () => {
          setSelectionMode(null);
          setSelectedConfig1Chunks([]);
          setSelectedConfig2Chunks([]);
          setClickedChunkIds(new Set());
        });

      config2CancelG
        .append("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", 10)
        .attr("fill", "var(--wrong)")
        .attr("stroke", "var(--500)")
        .attr("stroke-width", 1);

      config2CancelG
        .append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "14")
        .attr("font-weight", "bold")
        .attr("fill", "white")
        .text("✗");
    }
  }, [
    processedData,
    selectedConfig1Chunks,
    selectedConfig2Chunks,
    matchedChunks,
    config1History,
    config2History,
    isLoading,
    loadingConfig,
    clickedAnswerId,
    clickedChunkIds,
    selectionMode,
  ]);

  if (selectedQueryId === null || selectedQueryId === "" || !processedData) {
    return (
      <div
        className="flex items-center justify-center h-full text-gray-400 text-sm"
        style={{ fontFamily: "Times New Roman" }}
      >
        <p>Select a question to view the detailed comparison</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 flex items-center justify-center p-1">
        <svg
          ref={svgRef}
          width="700"
          height="450"
          viewBox="0 0 700 450"
          preserveAspectRatio="xMidYMid meet"
        />
      </div>
    </div>
  );
}
