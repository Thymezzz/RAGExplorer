"use client";

import { Switch } from "@/components/ui/switch";
import { useState } from "react";

interface Parameter {
  id: string;
  label: string;
}

interface ParameterSelectorProps {
  title: string;
  parameters: Parameter[];
  selectedValues: string[];
  selectionMode: "single" | "multiple";
  onSelectionModeChange: () => void;
  onValueChange: (value: string, mode: "single" | "multiple") => void;
  showSwitch?: boolean;
  customHeader?: React.ReactNode;
  onAddCustomContent?: (content: string) => void;
  showCustomAdd?: boolean;
}

export default function ParameterSelector({
  title,
  parameters,
  selectedValues,
  selectionMode,
  onSelectionModeChange,
  onValueChange,
  showSwitch = true,
  customHeader,
  onAddCustomContent,
  showCustomAdd = false,
}: ParameterSelectorProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInputValue, setCustomInputValue] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleAddCustom = () => {
    const trimmedValue = customInputValue.trim();
    if (trimmedValue && onAddCustomContent) {
      onAddCustomContent(trimmedValue);
      setCustomInputValue("");
      setShowCustomInput(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddCustom();
    } else if (e.key === "Escape") {
      setShowCustomInput(false);
      setCustomInputValue("");
    }
  };

  // Calculate the number of items to display (including custom add option)
  const totalItems = parameters.length + (showCustomAdd ? 1 : 0);
  const maxItems = 5;
  const actualItems = Math.min(totalItems, maxItems);

  // Each item is approximately 24px in height (including padding), calculate container height
  const itemHeight = 24;
  const containerHeight = actualItems * itemHeight;

  return (
    <div className="flex flex-col gap-1 h-full">
      <div
        className="h-6 px-2 bg-gradient-to-r from-200 to-white rounded-md flex justify-between items-center cursor-pointer hover:bg-300 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <div className="text-500 text-md font-normal font-['Zen_Old_Mincho']">
            {title}
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`transition-transform duration-200 ${
              isCollapsed ? "rotate-90" : "rotate-0"
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
        <div className="flex items-center gap-2">
          {customHeader ||
            (showSwitch && (
              <div onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={selectionMode === "multiple"}
                  onCheckedChange={onSelectionModeChange}
                />
              </div>
            ))}
        </div>
      </div>

      {!isCollapsed && (
        <div
          className={`px-2 overflow-y-auto ${
            totalItems > maxItems ? "h-[120px]" : ""
          }`}
          style={
            totalItems <= maxItems ? { height: `${containerHeight}px` } : {}
          }
        >
          {parameters.map((param) => (
            <div
              key={param.id}
              className="flex items-center gap-2 py-0.5 min-w-0"
            >
              <input
                type={selectionMode === "single" ? "radio" : "checkbox"}
                id={`${title.toLowerCase().replace(/\s+/g, "-")}-${param.id}`}
                name={
                  selectionMode === "single"
                    ? title.toLowerCase().replace(/\s+/g, "-")
                    : undefined
                }
                checked={selectedValues.includes(param.id)}
                onChange={() => {
                  // Ensure using the latest selectionMode
                  onValueChange(param.id, selectionMode);
                }}
                className="w-3.5 h-3.5 text-500 bg-white border-500 focus:ring-500"
              />
              <label
                htmlFor={`${title.toLowerCase().replace(/\s+/g, "-")}-${
                  param.id
                }`}
                className="text-500 text-sm font-normal cursor-pointer truncate flex-1"
                title={param.label}
              >
                {param.label}
              </label>
            </div>
          ))}

          {/* Add More option */}
          {showCustomAdd && (
            <>
              {!showCustomInput ? (
                <div
                  className="flex items-center gap-2 py-0.5 min-w-0 cursor-pointer hover:bg-100 rounded transition-colors"
                  onClick={() => setShowCustomInput(true)}
                >
                  <div className="w-3.5 h-3.5 flex items-center justify-center">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M6 2.5V9.5M2.5 6H9.5"
                        stroke="#777777"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <span className="text-500 text-sm font-normal truncate flex-1 italic">
                    Add More...
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 py-0.5 min-w-0">
                  <div className="w-3.5 h-3.5 flex items-center justify-center">
                    <div className="w-3.5 h-3.5 border border-300 rounded"></div>
                  </div>
                  <div className="flex-1 flex gap-1 items-center">
                    <input
                      type="text"
                      value={customInputValue}
                      onChange={(e) => setCustomInputValue(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Please input a custom label"
                      className="flex-1 px-1 py-0.5 text-xs border border-300 rounded focus:outline-none focus:border-500"
                      autoFocus
                    />
                    <button
                      onClick={handleAddCustom}
                      className="px-1 py-0.5 text-xs bg-200 text-500 rounded hover:bg-300 transition-colors"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => {
                        setShowCustomInput(false);
                        setCustomInputValue("");
                      }}
                      className="px-1 py-0.5 text-xs bg-200 text-500 rounded hover:bg-300 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
