import React, { useMemo, useRef, useEffect, useState } from "react";
import { sankey, sankeyLinkHorizontal, SankeyLink } from "d3-sankey";
import * as d3 from "d3";
import { CompareData } from "./Dashboard";
import { Question, ErrorType } from "@/server/server";

interface SankeyChartProps {
  data: CompareData;
  onSelectionChange: (
    selection: { questionIds: string[]; elementId: string } | null
  ) => void;
  selectedElementId: string | null;
}

// define color mapping for error types
const ERROR_TYPE_COLOR_VAR: { [key in ErrorType]?: string } = {
  correct: "--theme",
  missing_content: "--fp1",
  missed_top_ranked_documents: "--fp2",
  not_in_context: "--fp3",
  not_extracted: "--fp4",
  wrong_format: "--fp5",
  incorrect_specificity: "--fp6",
  incomplete: "--fp7",
  unknown: "--fp8",
};

// define mapping from error types to simplified labels
const ERROR_TYPE_LABEL: { [key in ErrorType]: string } = {
  correct: "Correct",
  missing_content: "FP1",
  missed_top_ranked_documents: "FP2",
  not_in_context: "FP3",
  not_extracted: "FP4",
  wrong_format: "FP5",
  incorrect_specificity: "FP6",
  incomplete: "FP7",
  unknown: "FP8",
};

export const SankeyChart = ({
  data,
  onSelectionChange,
  selectedElementId,
}: SankeyChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 300 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        // Reserve space for header and padding
        const availableHeight = height - 60; // Account for header and padding
        const availableWidth = width - 24; // Account for horizontal padding
        setDimensions({
          width: Math.max(200, availableWidth),
          height: Math.max(150, availableHeight),
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    // Use ResizeObserver for more precise container size changes
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateDimensions);
      resizeObserver.disconnect();
    };
  }, []);

  const { width, height } = dimensions;

  const graph = useMemo(() => {
    if (
      !data.config1?.questions ||
      !data.config2?.questions ||
      data.config1.questions.length === 0 ||
      data.config2.questions.length === 0
    ) {
      return { nodes: [], links: [] };
    }

    const { config1, config2 } = data;
    const getErrorType = (q: Question): ErrorType => q.error_type || "unknown";

    const config1Questions = config1.questions || [];
    const config2Questions = config2.questions || [];

    const nodesData = [
      ...Array.from(new Set(config1Questions.map(getErrorType))).map((type) => {
        const questionIds = config1Questions
          .filter((q) => getErrorType(q) === type)
          .map((q) => q.id);
        return {
          id: `cfg1-${type}`,
          type,
          questionIds,
          value: Math.max(questionIds.length, 1),
        };
      }),
      ...Array.from(new Set(config2Questions.map(getErrorType))).map((type) => {
        const questionIds = config2Questions
          .filter((q) => getErrorType(q) === type)
          .map((q) => q.id);
        return {
          id: `cfg2-${type}`,
          type,
          questionIds,
          value: Math.max(questionIds.length, 1),
        };
      }),
    ];

    if (nodesData.length === 0) {
      return { nodes: [], links: [] };
    }

    const linksData: {
      source: string;
      target: string;
      value: number;
      questionIds: string[];
    }[] = [];
    const q1Map = new Map(config1Questions.map((q) => [q.id, getErrorType(q)]));

    for (const q2 of config2Questions) {
      if (q1Map.has(q2.id)) {
        const q1ErrorType = q1Map.get(q2.id) as ErrorType;
        const q2ErrorType = getErrorType(q2);
        const source = `cfg1-${q1ErrorType}`;
        const target = `cfg2-${q2ErrorType}`;
        const existingLink = linksData.find(
          (l) => l.source === source && l.target === target
        );
        if (existingLink) {
          existingLink.value += 1;
          existingLink.questionIds.push(q2.id);
        } else {
          linksData.push({ source, target, value: 1, questionIds: [q2.id] });
        }
      }
    }

    linksData.forEach((link) => {
      link.value = Math.max(link.value, 1);
    });

    const sankeyGenerator = sankey()
      .nodeId((d: { id: string }) => d.id)
      .nodeWidth(130)
      .nodePadding(15)
      .extent([
        [1, 1],
        [width - 1, height - 1],
      ]);

    const nodesCopy = nodesData.map((d) => ({ ...d }));
    const linksCopy = linksData.map((l) => ({ ...l }));

    // Calculate total flow for each node (inflow + outflow)
    const nodeFlowMap = new Map<string, number>();

    // Initialize node flow with the node's own value
    nodesCopy.forEach((node) => {
      nodeFlowMap.set(node.id, node.value || 0);
    });

    // Accumulate link flow
    linksCopy.forEach((link) => {
      const sourceFlow = nodeFlowMap.get(link.source) || 0;
      const targetFlow = nodeFlowMap.get(link.target) || 0;
      nodeFlowMap.set(link.source, sourceFlow + link.value);
      nodeFlowMap.set(link.target, targetFlow + link.value);
    });

    // Set node value to total flow (node's own value + link flow)
    nodesCopy.forEach((node) => {
      node.value = nodeFlowMap.get(node.id) || 0;
    });

    return sankeyGenerator({
      nodes: nodesCopy,
      links: linksCopy,
    });
  }, [data, width, height]);

  return (
    <div ref={containerRef} className="w-full h-full flex justify-center">
      <div className="w-full h-full bg-white rounded-lg shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] outline outline-1 outline-offset-[-1px] outline-200 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 flex-shrink-0 flex justify-between items-center">
          <div className="text-600 text-lg font-bold font-['DIN_Alternate']">
            Failure Attribution
          </div>
          {selectedElementId && (
            <button
              onClick={() => onSelectionChange(null)}
              className="px-3 py-1 text-sm bg-200 font-medium hover:bg-300 text-600 rounded-md transition-colors duration-200 "
              title="Clear selection"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex-1 overflow-visible px-2 pb-2 min-h-0 flex flex-col">
          {graph.nodes.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center">
              <div
                className="text-400 text-sm text-center"
                style={{ fontFamily: "Times New Roman" }}
              >
                <div>Select two configurations to see the Sankey diagram</div>
                <div className="text-sm mt-1">
                  Click on the checkboxes in the Performance Overview
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Column titles - placed outside the SVG */}
              <div className="flex justify-between px-3 pb-1 flex-shrink-0">
                <div
                  className="text-md font-bold text-center"
                  style={{
                    fontFamily: "Times New Roman",
                    color: "var(--config1)",
                    width: "40%",
                  }}
                >
                  Config 1
                </div>
                <div
                  className="text-md font-bold text-center"
                  style={{
                    fontFamily: "Times New Roman",
                    color: "var(--500)",
                    width: "20%",
                  }}
                ></div>
                <div
                  className="text-md font-bold text-center"
                  style={{
                    fontFamily: "Times New Roman",
                    color: "var(--config2)",
                    width: "40%",
                  }}
                >
                  Config 2
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <svg
                  width={width}
                  height={height}
                  viewBox={`0 0 ${width} ${height + 10}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="w-full h-full"
                  onClick={() => onSelectionChange(null)}
                  style={{ overflow: "visible" }}
                >
                  {graph.links.map((link, i) => {
                    const elementId = `${link.source.id}-${link.target.id}`;
                    const isSelected = selectedElementId === elementId;
                    // Check if the link is connected to the selected node
                    const isConnectedToSelectedNode =
                      selectedElementId &&
                      (selectedElementId === link.source.id ||
                        selectedElementId === link.target.id);
                    const shouldHighlight =
                      isSelected || isConnectedToSelectedNode;
                    return (
                      <path
                        key={i}
                        d={sankeyLinkHorizontal()(link as SankeyLink)!}
                        stroke={`var(${
                          ERROR_TYPE_COLOR_VAR[link.source.type as ErrorType] ||
                          "--fp1"
                        })`}
                        strokeWidth={Math.max(link.width, 2)} // Set minimum width to 2px
                        fill="none"
                        strokeOpacity={shouldHighlight ? 0.8 : 0.4} // Increase opacity when not selected
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectionChange({
                            questionIds: link.questionIds,
                            elementId,
                          });
                        }}
                        onMouseEnter={(e) => {
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
                            <div><strong>From:</strong> ${link.source.type.replace(
                              /_/g,
                              " "
                            )}</div>
                            <div><strong>To:</strong> ${link.target.type.replace(
                              /_/g,
                              " "
                            )}</div>
                            <div><strong>Questions:</strong> ${
                              link.questionIds.length
                            }</div>
                          `);

                          tooltip
                            .style("left", e.pageX + 10 + "px")
                            .style("top", e.pageY - 10 + "px");
                        }}
                        onMouseLeave={() => {
                          d3.selectAll(".tooltip").remove();
                        }}
                        style={{
                          cursor: "pointer",
                          transition: "opacity 0.2s, stroke-opacity 0.2s",
                        }}
                      />
                    );
                  })}
                  {graph.nodes.map((node, i) => {
                    const isSelected = selectedElementId === node.id;
                    return (
                      <g
                        key={i}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectionChange({
                            questionIds: node.questionIds,
                            elementId: node.id,
                          });
                        }}
                        onMouseEnter={(e) => {
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
                            <div><strong>Category:</strong> ${node.type.replace(
                              /_/g,
                              " "
                            )}</div>
                            <div><strong>Questions:</strong> ${
                              node.questionIds.length
                            }</div>
                          `);

                          tooltip
                            .style("left", e.pageX + 10 + "px")
                            .style("top", e.pageY - 10 + "px");
                        }}
                        onMouseLeave={() => {
                          d3.selectAll(".tooltip").remove();
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <rect
                          x={node.x0}
                          y={node.y0}
                          width={node.x1 - node.x0}
                          height={Math.max(node.y1 - node.y0, 3)}
                          style={{
                            fill: `var(${
                              ERROR_TYPE_COLOR_VAR[node.type as ErrorType] ||
                              "--fp1"
                            })`,
                            stroke: isSelected ? "var(--selected)" : "none",
                            strokeWidth: isSelected ? 3 : 0,
                            transition: "stroke 0.2s, stroke-width 0.2s",
                          }}
                        />
                        {/* Display label inside the node */}
                        <text
                          x={(node.x0 + node.x1) / 2}
                          y={(node.y0 + node.y1) / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="16"
                          fill="var(--600)"
                          className="font-bold"
                          style={{
                            pointerEvents: "auto",
                            fontFamily: "Times New Roman",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectionChange({
                              questionIds: node.questionIds,
                              elementId: node.id,
                            });
                          }}
                        >
                          {ERROR_TYPE_LABEL[node.type as ErrorType] ||
                            node.type}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              {/* Legend */}
              <div className="p-2 flex-shrink-0 w-full flex justify-center">
                <div
                  className="flex items-center gap-5 flex-wrap"
                  style={{ fontFamily: "Times New Roman" }}
                >
                  {/* correct */}
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs"
                      style={{
                        color: "var(--600)",
                        height: 14,
                        lineHeight: "14px",
                        fontSize: 12,
                      }}
                    >
                      correct
                    </span>
                    <div
                      aria-label="correct"
                      style={{
                        width: 14,
                        height: 14,
                        background: "var(--theme)",
                        border: "1px solid var(--300)",
                        borderRadius: 3,
                      }}
                    />
                  </div>

                  {/* FP group */}
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs"
                      style={{
                        color: "var(--600)",
                        height: 14,
                        lineHeight: "14px",
                        fontSize: 12,
                      }}
                    >
                      FP
                    </span>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 7 }).map((_, idx) => {
                        const n = idx + 1;
                        const colorVar = `--fp${n}` as const;
                        return (
                          <div
                            key={n}
                            title={`fp${n}`}
                            style={{
                              width: 14,
                              height: 14,
                              background: `var(${colorVar})`,
                              border: "1px solid var(--300)",
                              borderRadius: 3,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--600)",
                              fontSize: 10,
                              lineHeight: 1,
                              fontWeight: 600,
                            }}
                          >
                            {n}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* unknown */}
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs"
                      style={{
                        color: "var(--600)",
                        height: 14,
                        lineHeight: "14px",
                        fontSize: 12,
                      }}
                    >
                      unknown
                    </span>
                    <div
                      aria-label="unknown"
                      style={{
                        width: 14,
                        height: 14,
                        background: "var(--fp8)",
                        border: "1px solid var(--300)",
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
