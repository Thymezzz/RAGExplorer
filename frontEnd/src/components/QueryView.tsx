import { CompareData } from "./Dashboard";
import { useState, useMemo, useRef, useEffect } from "react";
import { Question } from "@/server/server";
import * as d3 from "d3";

interface QueryViewProps {
  queryList: CompareData;
  selectedQueryId: string | null;
  onQuerySelect: (queryId: string | null) => void;
}

// Helper function to truncate text with ellipsis
const truncateText = (text: string, maxLength: number = 50) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

interface EvidenceVisualizationProps {
  retrievedEvidence: number;
  totalEvidence: number;
  size?: number;
}

function EvidenceVisualization({
  retrievedEvidence,
  totalEvidence,
  size = 35,
}: EvidenceVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || totalEvidence === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = size;
    const height = size;
    const radius = Math.min(width, height) / 2 - 2;
    const innerRadius = radius * 0.6; // 环形图

    const percentage = retrievedEvidence / totalEvidence;
    const angle = percentage * 2 * Math.PI;

    const g = svg
      .append("g")
      .attr("transform", `translate(${width / 2}, ${height / 2})`);

    // Background ring
    g.append("circle")
      .attr("r", radius)
      .attr("fill", "none")
      .attr("stroke", "#e5e7eb")
      .attr("stroke-width", 4);

    // Progress ring
    if (percentage > 0) {
      const startX = radius * Math.cos(0);
      const startY = radius * Math.sin(0);
      const endX = radius * Math.cos(angle);
      const endY = radius * Math.sin(angle);

      const largeArcFlag = angle > Math.PI ? 1 : 0;

      const pathData = [
        `M ${startX} ${startY}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
        `L ${innerRadius * Math.cos(angle)} ${innerRadius * Math.sin(angle)}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${
          innerRadius * Math.cos(0)
        } ${innerRadius * Math.sin(0)}`,
        "Z",
      ].join(" ");

      g.append("path")
        .attr("d", pathData)
        .attr("fill", "var(--evidence, #f59e0b)");
    }

    // Center display in score format
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", "8px")
      .attr("font-weight", "bold")
      .attr("fill", "#374151")
      .text(`${retrievedEvidence}/${totalEvidence}`);
  }, [retrievedEvidence, totalEvidence, size]);

  return (
    <div className="flex items-center justify-center">
      <svg ref={svgRef} width={size} height={size} />
    </div>
  );
}

export default function QueryView({
  queryList,
  selectedQueryId,
  onQuerySelect,
}: QueryViewProps) {
  const [filter, setFilter] = useState<{
    config1: boolean | null;
    config2: boolean | null;
  }>({ config1: null, config2: null });

  const filteredQueryList = useMemo(() => {
    const questionsMap = new Map<
      string,
      Question & {
        config2_rag_correct?: boolean;
        config2_evidence_retrieval_analysis?: Question["evidence_retrieval_analysis"];
      }
    >();

    queryList.config1.questions.forEach((q) => {
      questionsMap.set(q.id, { ...q });
    });

    queryList.config2.questions.forEach((q) => {
      if (questionsMap.has(q.id)) {
        const existing = questionsMap.get(q.id)!;
        existing.config2_rag_correct = q.rag_correct;
        existing.config2_evidence_retrieval_analysis =
          q.evidence_retrieval_analysis;
      } else {
        questionsMap.set(q.id, {
          ...q,
          config2_rag_correct: q.rag_correct,
          config2_evidence_retrieval_analysis: q.evidence_retrieval_analysis,
        });
      }
    });

    return Array.from(questionsMap.values());
  }, [queryList]);

  const filteredList = filteredQueryList.filter((q) => {
    let pass = true;
    if (filter.config1 !== null)
      pass = pass && q.rag_correct === filter.config1;
    if (filter.config2 !== null)
      pass = pass && q.config2_rag_correct === filter.config2;
    return pass;
  });

  const handleQueryClick = async (query: Question) => {
    if (selectedQueryId === query.id) {
      onQuerySelect(null);
    } else {
      onQuerySelect(query.id);
    }
  };

  return (
    <div className="w-full h-full flex justify-center">
      <div className="w-full h-full flex flex-col">
        {/* Custom question input */}
        {/* <div className="px-3 pb-2 flex items-center gap-2">
          <input
            className="flex-1 border border-200 rounded px-2 py-1 text-sm outline-none focus:border-theme"
            placeholder="Enter your own question"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
          />
          <button
            className="bg-300 text-white px-3 py-1 rounded-md text-sm "
            disabled
          >
            search
          </button>
        </div> */}

        {/* 筛选单选框 */}
        <div className="mx-2 h-8 px-2 bg-gradient-to-r from-200 to-white rounded-md flex justify-between items-center">
          <div className="text-500 text-lg font-normal font-['Zen_Old_Mincho']">
            Questions List
          </div>
          {(filter.config1 !== null || filter.config2 !== null) && (
            <button
              onClick={() => setFilter({ config1: null, config2: null })}
              className="text-xs text-600 bg-200 hover:bg-300 px-2 py-1 rounded"
            >
              clear
            </button>
          )}
        </div>
        <div className="flex gap-4 px-2 py-4 mx-2">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs text-500">Config1</span>
            <div className="flex gap-2">
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="config1"
                  checked={filter.config1 === true}
                  onChange={() =>
                    setFilter((f) => ({
                      ...f,
                      config1: f.config1 === true ? null : true,
                    }))
                  }
                  className="w-3 h-3 text-theme border-gray-300 focus:ring-theme"
                />
                <span className="text-500">True</span>
              </label>
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="config1"
                  checked={filter.config1 === false}
                  onChange={() =>
                    setFilter((f) => ({
                      ...f,
                      config1: f.config1 === false ? null : false,
                    }))
                  }
                  className="w-3 h-3 text-wrong border-gray-300 focus:ring-wrong"
                />
                <span className="text-500">False</span>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-500">Config2</span>
            <div className="flex gap-2">
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="config2"
                  checked={filter.config2 === true}
                  onChange={() =>
                    setFilter((f) => ({
                      ...f,
                      config2: f.config2 === true ? null : true,
                    }))
                  }
                  className="w-3 h-3 text-theme border-gray-300 focus:ring-theme"
                />
                <span className="text-500">True</span>
              </label>
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="config2"
                  checked={filter.config2 === false}
                  onChange={() =>
                    setFilter((f) => ({
                      ...f,
                      config2: f.config2 === false ? null : false,
                    }))
                  }
                  className="w-3 h-3 text-wrong border-gray-300 focus:ring-wrong"
                />
                <span className="text-500">False</span>
              </label>
            </div>
          </div>
        </div>

        {/* Table header - fixed at the top */}
        <div className="mx-2 pb-2 border-b border-200 bg-white">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-600 items-center">
            <div className="col-span-2 flex items-center justify-center">
              ID
            </div>
            <div className="col-span-4 flex items-center justify-center">
              Question
            </div>
            <div className="col-span-3 text-center flex items-center justify-center text-config1">
              Config 1
            </div>
            <div className="col-span-3 text-center flex items-center justify-center text-config2">
              Config 2
            </div>
          </div>
        </div>

        {/* Question list - concise comparison table */}
        <div className="mx-2 flex-1 overflow-y-auto min-h-0">
          {filteredList.length === 0 ? (
            <div
              className="flex items-center justify-center h-full text-400 text-sm"
              style={{ fontFamily: "Times New Roman" }}
            >
              <p>Select a configuration to view the questions</p>
            </div>
          ) : (
            <div className="space-y-1 py-2">
              {/* Question rows */}
              {filteredList.map((query) => (
                <div
                  key={query.id}
                  className={`grid grid-cols-12 gap-2 p-1 rounded cursor-pointer transition-colors text-sm ${
                    selectedQueryId === query.id
                      ? "bg-highlight/10 border border-highlight/30"
                      : "bg-white border border-200 hover:bg-100"
                  }`}
                  onClick={() => handleQueryClick(query)}
                >
                  {/* ID */}
                  <div className="col-span-2 pl-5 text-xs text-600 font-mono flex items-center">
                    {query.id}
                  </div>

                  {/* Question text */}
                  <div className="col-span-4 text-500 flex items-center min-w-0">
                    <span className="truncate">
                      {truncateText(query.query)}
                    </span>
                  </div>

                  {/* Config 1 status and hit counts */}
                  <div className="col-span-3 flex items-center justify-center gap-2">
                    <span
                      className={
                        query.rag_correct ? "text-theme" : "text-wrong"
                      }
                    >
                      {query.rag_correct ? "✓" : "✗"}
                    </span>
                    <EvidenceVisualization
                      retrievedEvidence={
                        query.evidence_retrieval_analysis?.hit_counts
                          ?.context_hits || 0
                      }
                      totalEvidence={
                        query.evidence_retrieval_analysis?.hit_counts
                          ?.total_evidence || 0
                      }
                    />
                  </div>

                  {/* Config 2 status and hit counts */}
                  <div className="col-span-3 flex items-center justify-center gap-2">
                    <span
                      className={
                        query.config2_rag_correct ? "text-theme" : "text-wrong"
                      }
                    >
                      {query.config2_rag_correct ? "✓" : "✗"}
                    </span>
                    <EvidenceVisualization
                      retrievedEvidence={
                        query.config2_evidence_retrieval_analysis?.hit_counts
                          ?.context_hits || 0
                      }
                      totalEvidence={
                        query.config2_evidence_retrieval_analysis?.hit_counts
                          ?.total_evidence || 0
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
