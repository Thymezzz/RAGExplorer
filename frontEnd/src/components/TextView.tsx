import { CompareData, Chunk } from "./Dashboard";
import { useMemo, useState } from "react";
import { ChunkData } from "./ComparisonView";
import { Question } from "@/server/server";

interface TextViewProps {
  comparisonData: CompareData;
  selectedQueryId: string | null;
  clickedChunkData?: {
    chunkData: ChunkData;
    configType: "config1" | "config2";
  } | null;
  clickedTestData?: {
    testData: Question;
    configType: "config1" | "config2";
  } | null;
}

interface ConfigSectionProps {
  config: Question | undefined;
  configTitle: string;
  isExpanded: boolean;
  onToggle: () => void;
}

// Optimized edit distance calculation (with early exit)
function calculateEditDistance(
  str1: string,
  str2: string,
  maxDistance: number = 2
): number {
  const m = str1.length;
  const n = str2.length;

  // Quick check: if length difference already exceeds the threshold, return immediately
  if (Math.abs(m - n) > maxDistance) {
    return maxDistance + 1;
  }

  // For short strings, use a simplified algorithm
  if (m <= 3 || n <= 3) {
    let distance = 0;
    const minLen = Math.min(m, n);
    for (let i = 0; i < minLen; i++) {
      if (str1[i].toLowerCase() !== str2[i].toLowerCase()) {
        distance++;
      }
    }
    distance += Math.abs(m - n);
    return distance;
  }

  // Use rolling arrays to optimize space complexity
  let prevRow = Array(n + 1).fill(0);
  let currRow = Array(n + 1).fill(0);

  // Initialize the first row
  for (let j = 0; j <= n; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    let minInRow = i; // Used for early exit check

    for (let j = 1; j <= n; j++) {
      if (str1[i - 1].toLowerCase() === str2[j - 1].toLowerCase()) {
        currRow[j] = prevRow[j - 1];
      } else {
        currRow[j] = Math.min(
          prevRow[j] + 1, // Deletion
          currRow[j - 1] + 1, // Insertion
          prevRow[j - 1] + 1 // Substitution
        );
      }
      minInRow = Math.min(minInRow, currRow[j]);
    }

    // Early exit: if the minimum value in the current row exceeds the threshold, return immediately
    if (minInRow > maxDistance) {
      return maxDistance + 1;
    }

    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[n];
}

// Optimized fuzzy matching function
function findFuzzyMatches(
  text: string,
  phrase: string,
  maxDistance: number = 1
): Array<{ start: number; end: number; text: string; score: number }> {
  const matches: Array<{
    start: number;
    end: number;
    text: string;
    score: number;
  }> = [];
  const phraseLength = phrase.length;

  // Limit text length to avoid processing excessively long text
  const MAX_TEXT_LENGTH = 2000;
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.substring(0, MAX_TEXT_LENGTH);
  }

  // Use exact matching for very short phrases
  if (phraseLength < 3) {
    const regex = new RegExp(
      `(${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi"
    );
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[1].length,
        text: match[1],
        score: 1.0,
      });
    }
    return matches;
  }

  // Limit search range
  const minLength = Math.max(
    phraseLength - maxDistance,
    Math.floor(phraseLength * 0.8)
  );
  const maxLength = Math.min(phraseLength + maxDistance, phraseLength * 1.2);

  // Performance optimization: limit the maximum number of search iterations
  const maxIterations = Math.min(text.length * 2, 1000);
  let iterations = 0;

  // First try exact matching, if found return immediately
  const exactRegex = new RegExp(
    `(${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi"
  );
  let exactMatch;
  while ((exactMatch = exactRegex.exec(text)) !== null) {
    matches.push({
      start: exactMatch.index,
      end: exactMatch.index + exactMatch[1].length,
      text: exactMatch[1],
      score: 1.0,
    });
  }

  // If exact matches are found, return immediately
  if (matches.length > 0) {
    return matches;
  }

  // Only perform fuzzy matching if no exact matches are found
  for (
    let windowSize = Math.floor(minLength);
    windowSize <= Math.ceil(maxLength);
    windowSize++
  ) {
    for (let i = 0; i <= text.length - windowSize; i++) {
      iterations++;
      if (iterations > maxIterations) {
        break;
      }

      const substring = text.substring(i, i + windowSize);

      // Quick pre-check, skip if first character difference is too large
      const firstCharMatch =
        phrase[0].toLowerCase() === substring[0].toLowerCase();
      const lastCharMatch =
        phrase[phrase.length - 1].toLowerCase() ===
        substring[substring.length - 1].toLowerCase();

      if (!firstCharMatch && !lastCharMatch && maxDistance === 1) {
        continue; // Skip obviously non-matching cases
      }

      const distance = calculateEditDistance(phrase, substring, maxDistance);

      if (distance <= maxDistance) {
        const similarity =
          1 - distance / Math.max(phrase.length, substring.length);

        // Only keep matches with high similarity
        if (similarity < 0.6) {
          continue;
        }

        // Check for overlap with existing matches
        const hasOverlap = matches.some(
          (existing) => i < existing.end && i + windowSize > existing.start
        );

        if (!hasOverlap) {
          matches.push({
            start: i,
            end: i + windowSize,
            text: substring,
            score: similarity,
          });
        } else {
          // If overlapping, keep the one with higher similarity
          const overlappingIndex = matches.findIndex(
            (existing) =>
              i < existing.end &&
              i + windowSize > existing.start &&
              existing.score < similarity
          );

          if (overlappingIndex !== -1) {
            matches[overlappingIndex] = {
              start: i,
              end: i + windowSize,
              text: substring,
              score: similarity,
            };
          }
        }
      }
    }
    if (iterations > maxIterations) {
      break;
    }
  }

  // Sort by similarity and keep only the top 3 matches
  return matches.sort((a, b) => b.score - a.score).slice(0, 3);
}

// Highlight matching text (supports fuzzy matching)
// fuzzyMatchThreshold: maximum allowed edit distance (number of character differences)
// - 0: exact match
// - 1: allow 1 character difference (default, best performance)
// - 2: allow 2 character differences
// enableFuzzyMatch: whether to enable fuzzy matching (enabled by default)
function highlightText(
  text: string,
  supportingSentences: string[],
  evidenceFacts: string[],
  fuzzyMatchThreshold: number = 2, // maximum allowed edit distance
  enableFuzzyMatch: boolean = true // whether to enable fuzzy matching
): React.ReactNode {
  if (
    !evidenceFacts ||
    (evidenceFacts.length === 0 && !supportingSentences) ||
    supportingSentences.length === 0
  ) {
    return text;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const matches: Array<{
    start: number;
    end: number;
    text: string;
    type: "evidence" | "supporting";
    score: number;
  }> = [];

  // collect evidence matches
  evidenceFacts.forEach((phrase) => {
    let phraseMatches;

    if (enableFuzzyMatch && fuzzyMatchThreshold > 0) {
      // use fuzzy matching
      phraseMatches = findFuzzyMatches(text, phrase, fuzzyMatchThreshold);
    } else {
      // use exact matching
      phraseMatches = [];
      const regex = new RegExp(
        `(${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
        "gi"
      );
      let match;
      while ((match = regex.exec(text)) !== null) {
        phraseMatches.push({
          start: match.index,
          end: match.index + match[1].length,
          text: match[1],
          score: 1.0,
        });
      }
    }

    phraseMatches.forEach((match) => {
      matches.push({
        start: match.start,
        end: match.end,
        text: match.text,
        type: "evidence",
        score: match.score,
      });
    });
  });

  // collect supporting sentences matches
  supportingSentences.forEach((phrase) => {
    let phraseMatches;

    if (enableFuzzyMatch && fuzzyMatchThreshold > 0) {
      // use fuzzy matching
      phraseMatches = findFuzzyMatches(text, phrase, fuzzyMatchThreshold);
    } else {
      // use exact matching
      phraseMatches = [];
      const regex = new RegExp(
        `(${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
        "gi"
      );
      let match;
      while ((match = regex.exec(text)) !== null) {
        phraseMatches.push({
          start: match.index,
          end: match.index + match[1].length,
          text: match[1],
          score: 1.0,
        });
      }
    }

    phraseMatches.forEach((match) => {
      matches.push({
        start: match.start,
        end: match.end,
        text: match.text,
        type: "supporting",
        score: match.score,
      });
    });
  });

  // Sort by position
  matches.sort((a, b) => a.start - b.start);

  // Handle overlapping matches, merge matches at the same position
  const mergedMatches: Array<{
    start: number;
    end: number;
    text: string;
    types: ("evidence" | "supporting")[];
    score: number;
  }> = [];

  for (const match of matches) {
    const overlappingMatch = mergedMatches.find(
      (existing) => match.start < existing.end && match.end > existing.start
    );

    if (overlappingMatch) {
      // If there is overlap, extend the range and add types
      overlappingMatch.start = Math.min(overlappingMatch.start, match.start);
      overlappingMatch.end = Math.max(overlappingMatch.end, match.end);
      overlappingMatch.score = Math.max(overlappingMatch.score, match.score);
      if (!overlappingMatch.types.includes(match.type)) {
        overlappingMatch.types.push(match.type);
      }
    } else {
      // If no overlap, create a new match
      mergedMatches.push({
        start: match.start,
        end: match.end,
        text: match.text,
        types: [match.type],
        score: match.score,
      });
    }
  }

  // Build highlighted text
  mergedMatches.forEach((match, index) => {
    // Add text before the match
    if (match.start > lastIndex) {
      parts.push(text.slice(lastIndex, match.start));
    }

    // Add highlighted matched text
    const hasEvidence = match.types.includes("evidence");
    const hasSupporting = match.types.includes("supporting");

    let className = "text-500 font-medium underline decoration-2";
    let style: React.CSSProperties = {};

    if (hasEvidence && hasSupporting) {
      // Double highlight: show two types of underlines simultaneously
      style = {
        textDecoration: "underline",
        textDecorationColor: "var(--evidence)",
        borderBottom: "2px solid var(--supporting)",
        paddingBottom: "1px",
      };
    } else if (hasEvidence) {
      // Only evidence
      className += " decoration-evidence";
      style = { textDecorationColor: "var(--evidence)" };
    } else if (hasSupporting) {
      // Only supporting
      className += " decoration-supporting";
      style = { textDecorationColor: "var(--supporting)" };
    }

    parts.push(
      <span
        key={`${match.types.join("-")}-${match.start}-${index}`}
        className={className}
        style={style}
      >
        {text.slice(match.start, match.end)}
      </span>
    );

    lastIndex = match.end;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function ConfigSection({
  config,
  configTitle,
  isExpanded,
  onToggle,
}: ConfigSectionProps) {
  if (!config) return null;

  // Prepare highlight phrases
  const supportingSentences: string[] = [];
  const evidenceFacts: string[] = [];

  // Add phrases from supporting_sentences
  if (config.supporting_sentences) {
    supportingSentences.push(...config.supporting_sentences);
  }

  // Add phrases from evidence_list facts
  if (config.evidence_list) {
    config.evidence_list.forEach((evidence) => {
      if (evidence.fact) {
        evidenceFacts.push(evidence.fact);
      }
    });
  }

  // Get color based on error_type
  const getErrorTypeColor = (errorType: string) => {
    switch (errorType) {
      case "correct":
        return "text-theme";
      case "missing_content":
        return "text-fp1";
      case "missed_top_ranked_documents":
        return "text-fp2";
      case "not_in_context":
        return "text-fp3";
      case "not_extracted":
        return "text-fp4";
      case "wrong_format":
        return "text-fp5";
      case "incorrect_specificity":
        return "text-fp6";
      case "incomplete":
        return "text-fp7";
      case "unknown":
        return "text-500";
      default:
        return "text-500";
    }
  };

  return (
    <div className="space-y-2">
      {/* Config Title */}
      <div
        className="h-8 px-2 bg-gradient-to-r from-200 to-white rounded-md flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div
          className={`text-lg font-normal font-['Zen_Old_Mincho'] ${
            configTitle === "Config 1"
              ? "text-config1"
              : configTitle === "Config 2"
              ? "text-config2"
              : "text-500"
          }`}
        >
          {configTitle}
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`transition-transform duration-200 ${
            isExpanded ? "rotate-0" : "rotate-90"
          }`}
        >
          <path
            d="M4.5 3L7.5 6L4.5 9"
            stroke="#777777"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {isExpanded && (
        <>
          <div className="p-4 rounded-lg border border-100">
            <div className="flex items-center justify-between mb-2">
              <h4
                className={`font-medium ${
                  config.rag_correct ? "text-theme" : "text-wrong"
                }`}
              >
                RAG Response
              </h4>
              <span
                className={config.rag_correct ? "text-theme" : "text-wrong"}
              >
                {config.rag_correct ? "✓" : "✗"}
              </span>
            </div>
            <p
              className={`text-sm  ${
                config.rag_correct ? "text-theme" : "text-wrong"
              }`}
            >
              {config.rag_response}
            </p>
          </div>

          {/* <div className="p-4 rounded-lg border border-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-500">Direct Response</h4>
              <span className={config.direct_correct ? "text-theme" : "text-wrong"}>
                {config.direct_correct ? "✓" : "✗"}
              </span>
            </div>
            <p className="text-sm text-400">{config.direct_response}</p>
          </div> */}

          {/* Retrieved Documents */}
          {config.retrieved_docs && config.retrieved_docs.length > 0 && (
            <div className="p-4 rounded-lg border border-100">
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-medium text-500">Retrieved Chunks</h4>
                {(evidenceFacts.length > 0 ||
                  supportingSentences.length > 0) && (
                  <div className="flex flex-col gap-1 text-xs">
                    {evidenceFacts.length > 0 && (
                      <span className="text-500 px-1 flex items-center gap-1">
                        <span className="w-3 h-0.5 bg-evidence"></span>
                        Evidence text
                      </span>
                    )}
                    {supportingSentences.length > 0 && (
                      <span className="text-500 px-1 flex items-center gap-1">
                        <span className="w-3 h-0.5 bg-supporting"></span>
                        Supporting text
                      </span>
                    )}
                    {evidenceFacts.length > 0 &&
                      supportingSentences.length > 0 && (
                        <span className="text-500 px-1 flex items-center gap-1">
                          <span className="w-3 h-0.5 bg-evidence"></span>
                          <span className="w-3 h-0.5 bg-supporting"></span>
                          Both evidence & supporting
                        </span>
                      )}
                    <span className="text-300 px-1">Normal text</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {config.retrieved_docs.map((doc, docIndex) => {
                  // Check if it is an array format [id, similarity, ?, text]
                  if (
                    Array.isArray(doc) &&
                    doc.length === 4 &&
                    typeof doc[0] === "number" &&
                    typeof doc[1] === "number"
                  ) {
                    return (
                      <div
                        key={docIndex}
                        className="p-3 rounded-lg border border-100"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-500">
                            Chunk {doc[0]}
                          </h5>
                          <span className="text-xs text-gray-500">
                            Similarity: {Number(doc[1]).toFixed(5)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-300 text-justify">
                            {highlightText(
                              doc[3],
                              supportingSentences,
                              evidenceFacts
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  // If it is a string format, check if it is a JSON format array (format: "[id, similarity, '', text]")
                  const docString = String(doc);
                  if (docString.startsWith("[") && docString.endsWith("]")) {
                    try {
                      const parsedDoc = JSON.parse(docString);
                      if (Array.isArray(parsedDoc) && parsedDoc.length >= 4) {
                        const [chunkId, similarity, empty, text] = parsedDoc;
                        return (
                          <div
                            key={docIndex}
                            className="p-3 rounded-lg border border-100"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="text-sm font-medium text-500">
                                Chunk {chunkId}
                              </h5>
                              <span className="text-xs text-gray-500">
                                Similarity: {similarity}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-300 text-justify">
                                {highlightText(
                                  text,
                                  supportingSentences,
                                  evidenceFacts
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      }
                    } catch (e) {
                      // If JSON parsing fails, continue with default handling
                    }
                  }
                  // If it is a plain string format, display the text directly
                  return (
                    <div
                      key={docIndex}
                      className="p-3 rounded-lg border border-100"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-sm font-medium text-500">
                          Chunk {docIndex + 1}
                        </h5>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-300 text-justify">
                          {highlightText(
                            docString,
                            supportingSentences,
                            evidenceFacts
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {config.error_type && config.error_type !== "correct" && (
            <div className="p-4 rounded-lg border border-100">
              <h4
                className={`font-medium mb-2 ${getErrorTypeColor(
                  config.error_type
                )}`}
              >
                Error Type
              </h4>
              <span
                className={`py-1 text-sm rounded ${getErrorTypeColor(
                  config.error_type
                )}`}
              >
                {config.error_type
                  .split("_")
                  .join(" ")
                  .charAt(0)
                  .toUpperCase() +
                  config.error_type.split("_").join(" ").slice(1)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TextView({
  comparisonData,
  selectedQueryId,
  clickedChunkData,
  clickedTestData,
}: TextViewProps) {
  // Add state to control the expansion/collapse of each section
  const [expandedSections, setExpandedSections] = useState({
    question: true,
    groundTruth: true,
    clickedChunk: true,
    clickedTestData: true,
    config1: true,
    config2: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const selectedQuestion = useMemo(() => {
    if (selectedQueryId === null) return null;

    const q1 = comparisonData.config1.questions.find(
      (q) => q.id === selectedQueryId
    );
    const q2 = comparisonData.config2.questions.find(
      (q) => q.id === selectedQueryId
    );

    if (!q1 && !q2) return null;

    return {
      id: selectedQueryId,
      config1: q1,
      config2: q2,
    };
  }, [comparisonData, selectedQueryId]);

  return (
    <div className="w-full h-full flex justify-center">
      <div className="w-full h-full flex flex-col">
        {/* Content Container */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
          {selectedQuestion ? (
            <div className="space-y-4">
              {/* Question Section */}
              <div className="space-y-2">
                {/* Question Title */}
                <div
                  className="h-8 px-2 bg-gradient-to-r from-200 to-white rounded-md flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleSection("question")}
                >
                  <div className="text-500 text-lg font-normal font-['Zen_Old_Mincho']">
                    Question
                  </div>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={`transition-transform duration-200 ${
                      expandedSections.question ? "rotate-0" : "rotate-90"
                    }`}
                  >
                    <path
                      d="M4.5 3L7.5 6L4.5 9"
                      stroke="#777777"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                {/* Question Content */}
                {expandedSections.question && (
                  <div className="p-4 rounded-lg border border-100">
                    <p className="text-sm text-400">
                      {selectedQuestion.config1?.query}
                    </p>
                  </div>
                )}
              </div>

              {/* Ground Truth Section */}
              <div className="space-y-2">
                {/* Ground Truth Title */}
                <div
                  className="h-8 px-2 bg-gradient-to-r from-200 to-white rounded-md flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleSection("groundTruth")}
                >
                  <div className="text-500 text-lg font-normal font-['Zen_Old_Mincho']">
                    Ground Truth
                  </div>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={`transition-transform duration-200 ${
                      expandedSections.groundTruth ? "rotate-0" : "rotate-90"
                    }`}
                  >
                    <path
                      d="M4.5 3L7.5 6L4.5 9"
                      stroke="#777777"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                {/* Ground Truth Content */}
                {expandedSections.groundTruth && (
                  <div className="p-4 rounded-lg border border-100">
                    <p className="text-sm text-400">
                      {selectedQuestion.config1?.answer}
                    </p>
                  </div>
                )}
              </div>

              {/* Clicked Chunk Section - Only show when clickedChunkData exists */}
              {clickedChunkData && (
                <div className="space-y-2">
                  {/* Chunk Title */}
                  <div
                    className="h-8 px-2 bg-gradient-to-r from-200 to-white rounded-md flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleSection("clickedChunk")}
                  >
                    <div className="text-500 text-lg font-normal font-['Zen_Old_Mincho']">
                      Clicked Chunk ({clickedChunkData.configType})
                    </div>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className={`transition-transform duration-200 ${
                        expandedSections.clickedChunk ? "rotate-0" : "rotate-90"
                      }`}
                    >
                      <path
                        d="M4.5 3L7.5 6L4.5 9"
                        stroke="#777777"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  {/* Chunk Content */}
                  {expandedSections.clickedChunk && (
                    <div className="p-4 rounded-lg border border-100">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-500">
                            Chunk ID: {clickedChunkData.chunkData.id}
                          </span>
                          <span className="text-xs text-gray-500">
                            Similarity:{" "}
                            {clickedChunkData.chunkData.similarity.toFixed(5)}
                          </span>
                        </div>
                        <p className="text-sm text-400">
                          {(() => {
                            // Get evidence data for the currently selected question
                            const currentConfig =
                              clickedChunkData.configType === "config1"
                                ? selectedQuestion?.config1
                                : selectedQuestion?.config2;

                            const supportingSentences: string[] = [];
                            const evidenceFacts: string[] = [];

                            // Add phrases from supporting_sentences
                            if (currentConfig?.supporting_sentences) {
                              supportingSentences.push(
                                ...currentConfig.supporting_sentences
                              );
                            }

                            // Add phrases from evidence_list facts
                            if (currentConfig?.evidence_list) {
                              currentConfig.evidence_list.forEach(
                                (evidence) => {
                                  if (evidence.fact) {
                                    evidenceFacts.push(evidence.fact);
                                  }
                                }
                              );
                            }

                            return highlightText(
                              clickedChunkData.chunkData.text,
                              supportingSentences,
                              evidenceFacts
                            );
                          })()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Clicked Test Data Section - Only show when clickedTestData exists */}
              {clickedTestData && (
                <ConfigSection
                  config={clickedTestData.testData}
                  configTitle={`Test Details (${clickedTestData.configType})`}
                  isExpanded={expandedSections.clickedTestData}
                  onToggle={() => toggleSection("clickedTestData")}
                />
              )}

              <div className="space-y-4">
                {/* Config 1 */}
                <ConfigSection
                  config={selectedQuestion.config1}
                  configTitle="Config 1"
                  isExpanded={expandedSections.config1}
                  onToggle={() => toggleSection("config1")}
                />

                {/* Config 2 */}
                <ConfigSection
                  config={selectedQuestion.config2}
                  configTitle="Config 2"
                  isExpanded={expandedSections.config2}
                  onToggle={() => toggleSection("config2")}
                />
              </div>
            </div>
          ) : (
            <div
              className="flex items-center justify-center h-full text-400 text-sm"
              style={{ fontFamily: "Times New Roman" }}
            >
              <p>Select a question to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
