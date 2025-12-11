"use client";

import React from "react";
import { BackendConfigurationData, CompareData } from "./Dashboard";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { evaluateConfiguration, EvaluationResult } from "../server/server";

// Utility function: Truncate parameter label at the first space
const truncateLabelBySpace = (label: string): string => {
  const spaceIndex = label.indexOf(" ");
  return spaceIndex > 0 ? label.substring(0, spaceIndex) : label;
};

// Utility function: Simplify parameter value, following backend file naming logic
const simplifyParameterValue = (value: string, paramKey: string): string => {
  // If contains "/", only show the part after the last "/"
  if (value.includes("/")) {
    const parts = value.split("/");
    value = parts[parts.length - 1];
  }

  // Apply additional simplification rules based on parameter type
  switch (paramKey) {
    case "rag_response_model":
    case "evaluate_model":
      // Remove gpt-, claude- prefixes
      return value.replace("gpt-", "gpt").replace("claude-", "claude");

    case "embedding_model":
      // Replace Embedding- with Emb
      return value.replace("Embedding-", "Emb-");

    case "rerank_model":
      // Rerank model stays as is (already simplified)
      return value;

    case "k":
    case "rerank_range":
    case "chunk_size":
    case "chunk_overlap":
      // Numeric parameters stay unchanged
      return value;

    default:
      // Other parameters stay as is
      return value;
  }
};

// Utility function: Truncate middle part, showing front and back characters
const truncateMiddle = (
  text: string,
  maxLength: number = 16,
  frontRatio: number = 0.5,
  backRatio: number = 0.3
): string => {
  if (text.length <= maxLength) {
    return text;
  }

  // Calculate available characters (minus 3 for ellipsis)
  const availableChars = maxLength - 3;

  // Calculate front and back character counts based on ratio
  let frontChars = Math.floor(availableChars * frontRatio);
  let backChars = Math.floor(availableChars * backRatio);

  // Ensure sum of front and back characters doesn't exceed available characters
  if (frontChars + backChars > availableChars) {
    const ratio = availableChars / (frontChars + backChars);
    frontChars = Math.floor(frontChars * ratio);
    backChars = availableChars - frontChars;
  }

  // Ensure at least some characters are displayed
  if (frontChars < 3) frontChars = 3;
  if (backChars < 2) backChars = 2;

  const front = text.substring(0, frontChars);
  const back = text.substring(text.length - backChars);
  return `${front}...${back}`;
};

export default function ChessboardAnalysisPlot({
  configurations,
  onSelectionChange,
}: {
  configurations: BackendConfigurationData[];
  onSelectionChange: (data: CompareData) => void;
}) {
  // Evaluation metric selection state
  const [selectedMetric, setSelectedMetric] = useState<string>("accuracy");

  // Evaluation metric options
  const metricOptions = [
    { value: "accuracy", label: "Accuracy" },
    { value: "recall", label: "Recall@k" },
    { value: "mrr", label: "MRR" },
    { value: "map", label: "MAP" },
  ];

  // Get the corresponding value based on the selected metric
  const getMetricValue = useCallback(
    (result: EvaluationResult): number => {
      const value = (() => {
        switch (selectedMetric) {
          case "accuracy":
            return result.ragAccuracy;
          case "recall":
            return result.ragRecall;
          case "mrr":
            return result.ragMrr;
          case "map":
            return result.ragMap;
          default:
            return result.ragAccuracy;
        }
      })();

      return value;
    },
    [selectedMetric]
  );

  // Determine whether to show percentage based on the selected metric
  const shouldShowPercentage = (): boolean => {
    return selectedMetric === "accuracy";
  };

  // Get display format based on the selected metric
  const getMetricDisplayValue = (result: EvaluationResult): string => {
    const value = getMetricValue(result);
    const displayValue = shouldShowPercentage()
      ? `${value.toFixed(0)}%`
      : value.toFixed(2);

    return displayValue;
  };

  // Chessboard state management (column-based)
  const [pieces, setPieces] = useState<{ [key: string]: boolean }>({});
  const [selectedCols, setSelectedCols] = useState<number[]>([]);
  const [calculatedResults, setCalculatedResults] = useState<{
    [colIndex: number]: EvaluationResult;
  }>({});
  const [loadingCols, setLoadingCols] = useState<Set<number>>(new Set());
  const fetchingRef = useRef<{ [key: number]: boolean }>({});

  // Sorting state
  const [isSorted, setIsSorted] = useState<boolean>(false);
  const [columnOrder, setColumnOrder] = useState<number[]>([]);

  // Hover state for column highlighting
  const [hoveredColIndex, setHoveredColIndex] = useState<number | null>(null);

  // Force update counter to avoid infinite loops
  const [updateCounter, setUpdateCounter] = useState<number>(0);

  // Get the configuration parameters for a specific column
  const getColConfiguration = useCallback(
    (
      colIndex: number,
      currentPieces: { [key: string]: boolean }
    ): Array<{ groupId: string; parameterId: string }> => {
      const selectedParams: Array<{ groupId: string; parameterId: string }> =
        [];

      if (configurations.length === 0) return selectedParams;

      const firstConfig = configurations[0];
      // Iterate over all parameters, including single and multiple modes
      Object.entries(firstConfig.selectionModes).forEach(([key, mode]) => {
        const values = firstConfig.values[key]; // Use backend key directly
        if (mode === "single") {
          // single mode: use the first value directly
          if (values && values.length > 0) {
            selectedParams.push({
              groupId: key, // Use backend groupId directly
              parameterId: values[0], // Use id value directly
            });
          }
        } else if (mode === "multiple") {
          // multiple mode: find the selected value in this column
          values?.forEach((value, valueIndex) => {
            const pieceKey = `${colIndex}-${valueIndex}-${key}`; // Note: rowIndex is now valueIndex

            if (currentPieces[pieceKey]) {
              // Use the passed currentPieces
              selectedParams.push({
                groupId: key, // Use backend groupId directly
                parameterId: value, // Use id value directly
              });
            }
          });
        }
      });

      return selectedParams;
    },
    [configurations]
  );

  // Update Dashboard's comparisonData when selected columns or results change
  useEffect(() => {
    const [first, second] = selectedCols;

    const getFormattedColParameters = (
      colIndex: number | undefined
    ): BackendConfigurationData => {
      if (colIndex === undefined) {
        return { values: {}, selectionModes: {} };
      }
      const colConfig = getColConfiguration(colIndex, pieces);
      const formattedParams: { [key: string]: string[] } = {};

      colConfig.forEach(({ groupId, parameterId }) => {
        if (!formattedParams[groupId]) {
          formattedParams[groupId] = [];
        }
        formattedParams[groupId].push(parameterId);
      });

      // Get selection modes from the first configuration
      const firstConfig = configurations[0];
      return {
        values: formattedParams,
        selectionModes: firstConfig?.selectionModes || {},
      };
    };

    // Only pass basic evaluation results and parameters, questions are handled by Dashboard
    onSelectionChange({
      config1: {
        evaluationResult:
          first !== undefined ? calculatedResults[first] || null : null,
        questions: [], // Empty array, Dashboard is responsible for populating
        selectedParameters: getFormattedColParameters(first),
      },
      config2: {
        evaluationResult:
          second !== undefined ? calculatedResults[second] || null : null,
        questions: [], // Empty array, Dashboard is responsible for populating
        selectedParameters: getFormattedColParameters(second),
      },
    });
  }, [
    selectedCols,
    calculatedResults,
    onSelectionChange,
    pieces,
    getColConfiguration,
    configurations,
  ]);

  // Clear previous state when configurations change
  useEffect(() => {
    setPieces({});
    setSelectedCols([]);
    setCalculatedResults({});
    setLoadingCols(new Set());
    fetchingRef.current = {};
    setIsSorted(false); // Reset sorting state
    setColumnOrder([]); // Reset column order
    setUpdateCounter((prev) => prev + 1); // Trigger update
  }, [configurations]);

  // Handle column selection logic
  const handleColSelection = (colIndex: number, checked: boolean) => {
    setSelectedCols((prev) => {
      if (checked) {
        if (prev.length >= 2) {
          return prev; // Do not allow selecting more than two columns
        }
        return [...prev, colIndex];
      } else {
        return prev.filter((index) => index !== colIndex);
      }
    });
  };

  // Function to fetch accuracy from the backend
  const fetchAccuracy = useCallback(
    async (
      colIndex: number,
      selectedParams: Array<{ groupId: string; parameterId: string }>
    ) => {
      if (fetchingRef.current[colIndex]) {
        return;
      }

      fetchingRef.current[colIndex] = true;
      setLoadingCols((prev) => new Set(prev).add(colIndex));

      try {
        const firstConfig = configurations[0];
        const values: Record<string, string[]> = {};
        selectedParams.forEach(({ groupId, parameterId }) => {
          if (!values[groupId]) {
            values[groupId] = [];
          }
          values[groupId].push(parameterId);
        });
        const selectionModes = firstConfig.selectionModes;
        const backendConfig = { values, selectionModes };
        const concurrentWorkers = 5;
        const result = await evaluateConfiguration(
          backendConfig,
          concurrentWorkers
        );

        setCalculatedResults((prev) => ({
          ...prev,
          [colIndex]: result as unknown as EvaluationResult,
        }));
      } catch (error) {
        console.error(`Column ${colIndex + 1} - Request failed:`, error);
        setCalculatedResults((prev) => ({
          ...prev,
          [colIndex]: {
            ragAccuracy: -1,
            ragRecall: -1,
            ragMrr: -1,
            ragMap: -1,
            directAccuracy: -1,
            totalQuestions: 0,
          } as EvaluationResult,
        }));
      } finally {
        fetchingRef.current[colIndex] = false;
        setLoadingCols((prev) => {
          const newSet = new Set(prev);
          newSet.delete(colIndex);
          return newSet;
        });
      }
    },
    [configurations]
  );

  // Get all parameters with 'multiple' selection mode
  const getMultipleParameters = useCallback(() => {
    if (configurations.length === 0) return [];

    const multipleParams: Array<{
      key: string; // Now use backend groupId
      label: string;
      values: string[];
    }> = [];

    const firstConfig = configurations[0];

    // Check if each parameter is in 'multiple' mode
    Object.entries(firstConfig.selectionModes).forEach(([key, mode]) => {
      if (mode === "multiple") {
        const values = firstConfig.values[key]; // Use backend key directly
        if (values && values.length > 0) {
          multipleParams.push({
            key: key, // Use backend groupId
            label: getParameterLabel(key),
            values: values,
          });
        }
      }
    });

    return multipleParams;
  }, [configurations]);

  // Parameter label mapping
  const getParameterLabel = (key: string): string => {
    const labelMap: Record<string, string> = {
      // Mapping from backend groupId to display label
      rag_response_model: "Response",
      embedding_model: "Embedding",
      rerank_model: "Rerank",
      evaluate_model: "Evaluate",
      k: "K",
      chunk_size: "Chunksize",
      chunk_overlap: "Overlap",
      rerank_range: "Range",
      dataset_name: "Dataset",
    };
    return labelMap[key] || key;
  };

  const multipleParams = useMemo(
    () => getMultipleParameters(),
    [getMultipleParameters]
  );

  // Calculate the actual number of columns based on the parameter space
  const actualCols = useMemo(() => {
    return multipleParams.reduce((total, param) => {
      return total * param.values.length;
    }, 1);
  }, [multipleParams]);

  // Initialize column order when actualCols changes
  // Note: This is a fallback, but columnOrder is primarily set in the updateCounter effect
  useEffect(() => {
    if (actualCols > 0 && columnOrder.length === 0) {
      // Only initialize if columnOrder is empty (fallback case)
      setColumnOrder(Array.from({ length: actualCols }, (_, i) => i));
    }
  }, [actualCols, columnOrder.length]);

  // Re-sort when selectedMetric changes and we're currently in sorted state
  useEffect(() => {
    if (isSorted && actualCols > 0) {
      const sortedOrder = Array.from({ length: actualCols }, (_, i) => i)
        .filter((colIndex) => {
          // Only include columns that have valid results
          const result = calculatedResults[colIndex];
          return result && getMetricValue(result) !== -1;
        })
        .sort((a, b) => {
          const scoreA = getMetricValue(calculatedResults[a]);
          const scoreB = getMetricValue(calculatedResults[b]);
          return scoreB - scoreA; // High to low
        })
        .concat(
          // Add columns without results at the end
          Array.from({ length: actualCols }, (_, i) => i).filter((colIndex) => {
            const result = calculatedResults[colIndex];
            return !result || getMetricValue(result) === -1;
          })
        );

      setColumnOrder(sortedOrder);
    }
  }, [selectedMetric, isSorted, actualCols, calculatedResults, getMetricValue]);

  // Sorting functions
  const handleSort = useCallback(() => {
    if (!isSorted) {
      // Sort by score (high to low)
      const sortedOrder = Array.from({ length: actualCols }, (_, i) => i)
        .filter((colIndex) => {
          // Only include columns that have valid results
          const result = calculatedResults[colIndex];
          return result && getMetricValue(result) !== -1;
        })
        .sort((a, b) => {
          const scoreA = getMetricValue(calculatedResults[a]);
          const scoreB = getMetricValue(calculatedResults[b]);
          return scoreB - scoreA; // High to low
        })
        .concat(
          // Add columns without results at the end
          Array.from({ length: actualCols }, (_, i) => i).filter((colIndex) => {
            const result = calculatedResults[colIndex];
            return !result || getMetricValue(result) === -1;
          })
        );

      setColumnOrder(sortedOrder);
      setIsSorted(true);
    } else {
      // Restore original order
      setColumnOrder(Array.from({ length: actualCols }, (_, i) => i));
      setIsSorted(false);
    }
  }, [isSorted, actualCols, calculatedResults, getMetricValue]);

  // Generate all possible configuration combinations automatically
  const generateAllCombinations = useCallback(
    (
      paramsToUse: Array<{
        key: string;
        label: string;
        values: string[];
      }>
    ) => {
      if (paramsToUse.length === 0) return {};

      const newPieces: { [key: string]: boolean } = {};

      // Generate all possible combinations using cartesian product
      const generateCombinations = (params: typeof paramsToUse): number[][] => {
        if (params.length === 0) return [[]];

        const [first, ...rest] = params;
        const restCombinations = generateCombinations(rest);
        const combinations: number[][] = [];

        for (let i = 0; i < first.values.length; i++) {
          for (const restCombo of restCombinations) {
            combinations.push([i, ...restCombo]);
          }
        }

        return combinations;
      };

      const allCombinations = generateCombinations(paramsToUse);

      // Place pieces for each combination
      allCombinations.forEach((combination, colIndex) => {
        combination.forEach((valueIndex, paramIndex) => {
          const param = paramsToUse[paramIndex];
          const key = `${colIndex}-${valueIndex}-${param.key}`;
          newPieces[key] = true;
        });
      });

      return newPieces;
    },
    []
  );

  // Stats for the right-side column, based on the average of calculated results
  const rightStats = useMemo(() => {
    const stats: { [key: string]: (number | null)[] } = {};

    multipleParams.forEach((param) => {
      stats[param.key] = param.values.map((value, valueIndex) => {
        // Find all completed columns for this parameter value
        const completedCols = Object.keys(calculatedResults)
          .map(Number)
          .filter((colIndex) => {
            const key = `${colIndex}-${valueIndex}-${param.key}`;
            return pieces[key]; // A piece exists at this position
          });

        if (completedCols.length === 0) {
          return null; // No data
        }

        // Calculate the average, excluding error states
        const validCols = completedCols.filter(
          (colIndex) => getMetricValue(calculatedResults[colIndex]) !== -1
        );

        if (validCols.length === 0) {
          return null; // No valid data
        }

        const sum = validCols.reduce((acc, colIndex) => {
          return acc + getMetricValue(calculatedResults[colIndex]);
        }, 0);

        return sum / validCols.length;
      });
    });

    return stats;
  }, [multipleParams, calculatedResults, pieces, getMetricValue]);

  // Auto-place all pieces when configurations change
  useEffect(() => {
    if (updateCounter > 0 && configurations.length > 0) {
      // Get current multipleParams at the time of effect execution
      const currentMultipleParams = getMultipleParameters();

      // Calculate actualCols based on current params
      const currentActualCols = currentMultipleParams.reduce((total, param) => {
        return total * param.values.length;
      }, 1);

      if (currentActualCols > 0) {
        console.log("ChessboardAnalysisPlot: Processing configuration update", {
          currentMultipleParams,
          currentActualCols,
        });

        setTimeout(() => {
          // Initialize column order first
          const newColumnOrder = Array.from(
            { length: currentActualCols },
            (_, i) => i
          );
          setColumnOrder(newColumnOrder);

          // Generate all combinations
          const allPieces =
            currentMultipleParams.length > 0
              ? generateAllCombinations(currentMultipleParams)
              : {};

          setPieces(allPieces);

          // Trigger batch processing for all complete configurations
          // Use a function that captures current values
          setTimeout(() => {
            // Find all complete columns using current values
            // Use a function to get current state values
            setCalculatedResults((prevResults) => {
              setLoadingCols((prevLoadingCols) => {
                const completeCols: number[] = [];

                for (let col = 0; col < currentActualCols; col++) {
                  const isColComplete =
                    currentMultipleParams.length === 0 ||
                    currentMultipleParams.every((param) => {
                      return param.values.some((_, valueIndex) => {
                        const checkKey = `${col}-${valueIndex}-${param.key}`;
                        return allPieces[checkKey];
                      });
                    });

                  if (isColComplete) {
                    const currentCalculatedResult = prevResults[col];
                    // Only process columns that don't have results yet or failed previously
                    if (
                      (currentCalculatedResult === undefined ||
                        getMetricValue(currentCalculatedResult) === -1) &&
                      !prevLoadingCols.has(col) &&
                      !fetchingRef.current[col]
                    ) {
                      completeCols.push(col);
                    }
                  }
                }

                // Process requests in batches
                const batchSize = 3;
                const processBatch = (startIndex: number) => {
                  const batch = completeCols.slice(
                    startIndex,
                    startIndex + batchSize
                  );

                  if (batch.length === 0) {
                    return;
                  }

                  // Process current batch
                  batch.forEach((col) => {
                    const selectedParams = getColConfiguration(col, allPieces);
                    fetchAccuracy(col, selectedParams);
                  });

                  // Schedule next batch after a delay
                  if (startIndex + batchSize < completeCols.length) {
                    setTimeout(() => {
                      processBatch(startIndex + batchSize);
                    }, 2000); // 2 second delay between batches
                  }
                };

                // Start processing if there are complete columns
                if (completeCols.length > 0) {
                  setTimeout(() => {
                    processBatch(0);
                  }, 500); // Initial delay
                }

                return prevLoadingCols;
              });
              return prevResults;
            });
          }, 200); // Additional delay to ensure pieces state is updated
        }, 100); // Small delay to ensure state is cleared first
      } else {
        // If no columns, clear everything
        setColumnOrder([]);
        setPieces({});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateCounter]); // Only depend on updateCounter to avoid infinite loops

  // Piece placement logic - only one piece per column per parameter group
  const togglePiece = (col: number, row: number, paramKey: string) => {
    const key = `${col}-${row}-${paramKey}`;

    setPieces((prev) => {
      const newPieces = { ...prev };

      if (prev[key]) {
        // If a piece already exists, remove it
        delete newPieces[key];
      } else {
        // If no piece exists, first clear any other pieces in the same column for this parameter
        const param = multipleParams.find((p) => p.key === paramKey);
        if (param) {
          param.values.forEach((_, valueIndex) => {
            const existingKey = `${col}-${valueIndex}-${paramKey}`;
            delete newPieces[existingKey];
          });
        }

        // Then place a piece at the current position
        newPieces[key] = true;
      }

      // For manual piece placement, still trigger immediate API call
      const isNewColComplete = multipleParams.every((param) => {
        return param.values.some((_, valueIndex) => {
          const checkKey = `${col}-${valueIndex}-${param.key}`;
          return newPieces[checkKey];
        });
      });

      const currentCalculatedResult = calculatedResults[col];

      if (
        isNewColComplete &&
        (currentCalculatedResult === undefined ||
          getMetricValue(currentCalculatedResult) === -1) &&
        !loadingCols.has(col)
      ) {
        setTimeout(() => {
          const selectedParams = getColConfiguration(col, newPieces);
          fetchAccuracy(col, selectedParams);
        }, 0);
      }

      return newPieces;
    });
  };

  // Generate grid layout: accuracy row + parameter rows + checkbox row
  const generateGridRows = useCallback(() => {
    const elementHeight = 30;
    const padding = 10;
    const minHeight = 100;

    // Fixed rows: first row for accuracy, last for selection
    const accuracyRow = "60px";
    const checkboxRow = "25px";

    // Calculate parameter rows dynamically
    const paramRows = [];
    for (let i = 0; i < multipleParams.length; i++) {
      const param = multipleParams[i];
      const calculatedHeight = param.values.length * elementHeight + padding;
      const finalHeight = Math.max(calculatedHeight, minHeight);
      paramRows.push(`${finalHeight}px`);
    }

    // If no parameters, add a placeholder row
    if (paramRows.length === 0) {
      paramRows.push(`${minHeight}px`);
    }

    return `${accuracyRow} ${paramRows.join(" ")} ${checkboxRow}`;
  }, [multipleParams]);

  const gridRows = useMemo(() => generateGridRows(), [generateGridRows]);

  // Render vertical connecting lines
  const renderVerticalConnectingLine = (colIndex: number) => {
    const colPieces = Object.keys(pieces)
      .filter((k) => k.startsWith(`${colIndex}-`))
      .map((k) => {
        const [, rowIndexStr, paramKey] = k.split("-");
        return { rowIndex: parseInt(rowIndexStr), paramKey };
      });

    if (colPieces.length < 2) return null;

    const piecePositions = colPieces
      .map((p) => {
        const paramIndex = multipleParams.findIndex(
          (mp) => mp.key === p.paramKey
        );
        if (paramIndex === -1) return null;
        const param = multipleParams[paramIndex];
        return { ...p, paramIndex, param };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => a.paramIndex - b.paramIndex);

    if (piecePositions.length < 2) return null;

    const rows = gridRows
      .split(" ")
      .map((s) => parseFloat(s.replace("px", "")));
    const rowGap = 4;

    const getCellCenterOffset = (piece: (typeof piecePositions)[0]) => {
      let offset = rows[0] + rowGap; // accuracy row + gap
      for (let i = 0; i < piece.paramIndex; i++) {
        offset += rows[1 + i] + rowGap;
      }
      const paramRowHeight = rows[1 + piece.paramIndex];
      const valueCellHeight = paramRowHeight / piece.param.values.length;
      return offset + piece.rowIndex * valueCellHeight + valueCellHeight / 2;
    };

    const firstPiece = piecePositions[0];
    const lastPiece = piecePositions[piecePositions.length - 1];

    const lineStart = getCellCenterOffset(firstPiece);
    const lineHeight = getCellCenterOffset(lastPiece) - lineStart;

    if (lineHeight <= 0) return null;

    return (
      <div
        key={`line-${colIndex}`}
        className="absolute w-px bg-500 left-1/2 -translate-x-1/2 pointer-events-none z-10"
        style={{
          top: `${lineStart}px`,
          height: `${lineHeight}px`,
        }}
      />
    );
  };

  return (
    <div className="w-full h-full flex justify-center">
      <div className="w-full max-w-full h-full bg-white rounded-lg shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] outline outline-1 outline-offset-[-1px] outline-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex-shrink-0 flex items-center justify-between">
          <div className="text-600 text-xl font-bold font-['DIN_Alternate']">
            Performance Overview
          </div>

          {/* Sort Button */}
          {configurations.length > 0 && actualCols > 0 && (
            <button
              onClick={handleSort}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                isSorted
                  ? "bg-200 text-600 hover:bg-300"
                  : "bg-200 text-600 hover:bg-300"
              }`}
              title={isSorted ? "Restore Original Order" : "Sort by Score"}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`transition-transform duration-200 ${
                  isSorted ? "rotate-180" : ""
                }`}
              >
                <path d="M3 6h18M7 12h10m-7 6h4" />
              </svg>
              {isSorted ? "Restore" : "Sort"}
            </button>
          )}
        </div>

        {/* Content - Unified Grid Layout */}
        <div className="flex-1 overflow-auto">
          {configurations.length === 0 ? (
            /* Empty state placeholder */
            <div className="w-full h-full flex items-center justify-center">
              <div
                className="text-gray-400 text-lg text-center"
                style={{ fontFamily: "Times New Roman" }}
              >
                <div>Add configuration to view analysis</div>
                <div className="text-sm mt-1">
                  Click &quot;Update&quot; in Component Configuration
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg relative h-full flex flex-col px-4 py-1">
              <div
                className="grid gap-1 h-full"
                style={{
                  gridTemplateRows: gridRows,
                  gridTemplateColumns: `auto 150px 1fr auto`,
                }}
              >
                {/* Main chessboard area (spans all rows in the 3rd column) */}
                <div className="row-start-1 row-span-full col-start-3 flex relative min-h-0 overflow-hidden">
                  {/* Horizontal baseline across the entire board */}
                  <div
                    className="absolute h-px bg-200 pointer-events-none"
                    style={{
                      top: "60px", // Positioned above the accuracy row
                      left: 0,
                      right: 0,
                    }}
                  ></div>

                  {/* Chessboard columns */}
                  <div
                    className="h-full flex gap-0 justify-start"
                    style={{
                      overflowX: actualCols > 27 ? "auto" : "hidden",
                      overflowY: "hidden",
                      width: "100%",
                    }}
                  >
                    {columnOrder.map((originalColIndex, displayIndex) => (
                      <div
                        key={`${originalColIndex}-${
                          isSorted ? "sorted" : "original"
                        }`}
                        className={`grid gap-1 relative ${
                          actualCols > 27 ? "w-6 flex-shrink-0" : "flex-1"
                        }`}
                        style={{
                          gridTemplateRows: gridRows,
                          minWidth: actualCols > 27 ? "24px" : "auto",
                          width:
                            actualCols > 27 ? "24px" : `${100 / actualCols}%`,
                        }}
                        onMouseEnter={() =>
                          setHoveredColIndex(originalColIndex)
                        }
                        onMouseLeave={() => setHoveredColIndex(null)}
                      >
                        {/* Vertical Connecting Line */}
                        {renderVerticalConnectingLine(originalColIndex)}
                        {/* Accuracy bar chart row */}
                        <div className="flex flex-col items-center justify-start">
                          <div className="flex flex-col items-center gap-1 w-full h-full">
                            {loadingCols.has(originalColIndex) ? (
                              <div className="flex flex-col items-center gap-1">
                                <span
                                  className="text-xs text-500 "
                                  style={{ writingMode: "vertical-rl" }}
                                >
                                  eval...
                                </span>
                                <div className="w-2 h-2 bg-500 rounded-full animate-pulse"></div>
                              </div>
                            ) : calculatedResults[originalColIndex] !==
                              undefined ? (
                              getMetricValue(
                                calculatedResults[originalColIndex]
                              ) === -1 ? (
                                <div
                                  className="flex flex-col items-center gap-1 w-full h-full cursor-pointer hover:opacity-80"
                                  onClick={() => {
                                    const selectedParams = getColConfiguration(
                                      originalColIndex,
                                      pieces
                                    );
                                    fetchAccuracy(
                                      originalColIndex,
                                      selectedParams
                                    );
                                  }}
                                  title="Retry"
                                >
                                  <span className="text-xs text-red-500  h-4 text-center">
                                    Retry
                                  </span>
                                  <div className="flex-1 flex items-end">
                                    <div
                                      className="bg-red-300 w-4 rounded-t"
                                      style={{ height: "30px" }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <span className="text-xs text-500  h-4 text-center">
                                    {getMetricDisplayValue(
                                      calculatedResults[originalColIndex]
                                    )}
                                  </span>
                                  <div className="flex-1 flex items-end">
                                    <div
                                      className={`w-4 rounded-t transition-colors duration-200 ${
                                        hoveredColIndex === originalColIndex
                                          ? "bg-300 shadow-lg"
                                          : "bg-200"
                                      }`}
                                      style={{
                                        height: `${
                                          shouldShowPercentage()
                                            ? (getMetricValue(
                                                calculatedResults[
                                                  originalColIndex
                                                ]
                                              ) /
                                                100) *
                                              45
                                            : (getMetricValue(
                                                calculatedResults[
                                                  originalColIndex
                                                ]
                                              ) /
                                                1) *
                                              45
                                        }px`,
                                      }}
                                    />
                                  </div>
                                </>
                              )
                            ) : (
                              <div className="flex flex-col items-center gap-2 w-full h-full">
                                <span className="text-xs text-300  h-4 text-center">
                                  ---%
                                </span>
                                <div className="flex-1 flex items-end">
                                  <div
                                    className="border border-200 border-b-0 w-4 rounded-t bg-transparent"
                                    style={{
                                      height: "30px",
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Piece placement area - parameter rows */}
                        {multipleParams.map((param, rowIndex) => (
                          <div
                            key={`param-${rowIndex}-${originalColIndex}`}
                            className={`flex flex-col gap-0 border-t border-b border-100 bg-200 pt-2 pb-2 ${
                              displayIndex === 0 ? "rounded-l-lg" : ""
                            } ${
                              displayIndex === actualCols - 1
                                ? "rounded-r-lg"
                                : ""
                            }`}
                            style={{
                              borderLeftWidth: displayIndex === 0 ? "1px" : "0",
                              borderRightWidth:
                                displayIndex === actualCols - 1 ? "1px" : "0",
                            }}
                          >
                            {param.values.map((value, valueIndex) => {
                              const key = `${originalColIndex}-${valueIndex}-${param.key}`;
                              const hasPiece = pieces[key];
                              return (
                                <div
                                  key={`${rowIndex}-${valueIndex}-${originalColIndex}`}
                                  className="flex items-center justify-center cursor-pointer hover:bg-100 relative flex-1"
                                  onClick={() =>
                                    togglePiece(
                                      originalColIndex,
                                      valueIndex,
                                      param.key
                                    )
                                  }
                                  title={`Column ${originalColIndex + 1}, ${
                                    param.label
                                  }: ${value}`}
                                >
                                  <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-300"></div>
                                  {hasPiece && (
                                    <div className="w-4 h-4 bg-500 rounded-full shadow-sm relative z-20" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}

                        {/* Selection box row */}
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() =>
                              handleColSelection(
                                originalColIndex,
                                !selectedCols.includes(originalColIndex)
                              )
                            }
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs font-bold transition-colors duration-200 ${
                              selectedCols.includes(originalColIndex)
                                ? selectedCols.indexOf(originalColIndex) === 0
                                  ? "bg-config1 border-config1 text-white"
                                  : "bg-config2 border-config2 text-white"
                                : "border-[var(--200)] bg-white hover:bg-100"
                            }`}
                            title={
                              selectedCols.includes(originalColIndex)
                                ? `Config ${
                                    selectedCols.indexOf(originalColIndex) + 1
                                  }`
                                : "Select for comparison"
                            }
                          >
                            {selectedCols.includes(originalColIndex)
                              ? selectedCols.indexOf(originalColIndex) + 1
                              : ""}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Static Headers and Stats (Cols 1, 2, 4) */}
                {/* Row 1: Accuracy */}
                <div />
                <div className="bg-200 rounded-lg p-2 flex items-center justify-center">
                  <div className="flex items-center justify-center gap-1">
                    {/* Dropdown menu */}
                    <select
                      value={selectedMetric}
                      onChange={(e) => {
                        const newMetric = e.target.value;
                        // console.log(
                        //   `切换评估指标: ${selectedMetric} -> ${newMetric}`
                        // );
                        setSelectedMetric(newMetric);
                      }}
                      className="text-sm text-500  bg-transparent border-none outline-none cursor-pointer"
                    >
                      {metricOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div />

                {/* Rows 2-4: Parameter specific rows */}
                {multipleParams.map((param) => (
                  <React.Fragment key={param.key}>
                    {/* Col 1: Parameter Label */}
                    <div className="bg-200 rounded-lg p-2 flex justify-center items-center">
                      <div className="text-500 text-base font-normal  whitespace-nowrap">
                        {truncateLabelBySpace(param.label)}
                      </div>
                    </div>
                    {/* Col 2: Parameter Values */}
                    <div className="bg-200 rounded-lg p-2 flex flex-col justify-center items-center">
                      <div
                        className="grid gap-0 h-full w-full"
                        style={{
                          gridTemplateRows: `repeat(${param.values.length}, 1fr)`,
                        }}
                      >
                        {param.values.map((value, valueIndex) => {
                          // Check if this parameter value is selected in the hovered column
                          const isSelectedInHoveredCol =
                            hoveredColIndex !== null &&
                            pieces[
                              `${hoveredColIndex}-${valueIndex}-${param.key}`
                            ];
                          // First simplify parameter value, then truncate
                          const simplifiedValue = simplifyParameterValue(
                            value,
                            param.key
                          );
                          const displayValue = truncateMiddle(
                            simplifiedValue,
                            18,
                            0.5,
                            0.3
                          );
                          return (
                            <div
                              key={`${param.key}-${value}`}
                              className={`w-full rounded flex justify-center items-center overflow-hidden relative group transition-colors duration-200 ${
                                isSelectedInHoveredCol
                                  ? "bg-300 opacity-80"
                                  : ""
                              }`}
                            >
                              <div
                                className={`text-sm font-normal  text-center leading-tight transition-colors duration-200 ${
                                  isSelectedInHoveredCol
                                    ? "text-500 font-semibold"
                                    : "text-500"
                                }`}
                                style={{
                                  writingMode: "horizontal-tb",
                                  maxWidth: "140px",
                                  overflow: "hidden",
                                  whiteSpace: "nowrap",
                                }}
                                title={value}
                              >
                                {displayValue}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Col 4: Stats */}
                    <div className="flex flex-col h-full overflow-hidden relative pt-2 pb-2">
                      <div className="absolute top-0 bottom-0 left-0 w-px bg-200"></div>
                      {param.values.map((value, valueIndex) => {
                        const statValue = rightStats[param.key]?.[valueIndex];
                        const hasData =
                          statValue !== null && statValue !== undefined;
                        // Check if this parameter value is selected in the hovered column
                        const isSelectedInHoveredCol =
                          hoveredColIndex !== null &&
                          pieces[
                            `${hoveredColIndex}-${valueIndex}-${param.key}`
                          ];
                        return (
                          <div
                            key={`stat-${param.key}-${valueIndex}`}
                            className="flex items-center"
                            style={{ height: `${100 / param.values.length}%` }}
                          >
                            <div className="relative flex items-center w-12 h-full">
                              <div
                                className={`my-auto rounded-r transition-colors duration-200 ${
                                  hasData
                                    ? isSelectedInHoveredCol
                                      ? "bg-300 shadow-lg"
                                      : "bg-200"
                                    : "border border-200 bg-transparent"
                                }`}
                                style={{
                                  width: hasData
                                    ? `${
                                        shouldShowPercentage()
                                          ? (statValue / 100) * 50
                                          : (statValue / 1) * 50
                                      }px`
                                    : "50px",
                                  height: "70%",
                                  maxHeight: "22px",
                                  minHeight: "16px",
                                }}
                                title={`${value}: ${
                                  hasData
                                    ? shouldShowPercentage()
                                      ? `${statValue.toFixed(0)}%`
                                      : statValue.toFixed(2)
                                    : "No data"
                                }`}
                              />
                              <div
                                className={`text-xs  absolute left-1 top-1/2 transform -translate-y-1/2 transition-colors duration-200 ${
                                  hasData
                                    ? isSelectedInHoveredCol
                                      ? "text-500 font-semibold"
                                      : "text-500"
                                    : "text-300"
                                }`}
                              >
                                {hasData
                                  ? shouldShowPercentage()
                                    ? `${statValue.toFixed(0)}%`
                                    : statValue.toFixed(2)
                                  : "---"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </React.Fragment>
                ))}

                {/* Last Row: Checkbox row placeholder */}
                <div />
                <div />
                <div />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
