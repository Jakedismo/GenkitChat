import { HighlightCoordinates } from "@/types/chat";
import React from "react";

interface HighlightTooltipProps {
  coord: HighlightCoordinates;
}

const HighlightTooltip: React.FC<HighlightTooltipProps> = ({ coord }) => {
  if (!coord) return null;
  return (
    <div className="shadow-lg rounded bg-white dark:bg-gray-900 p-2 text-xs max-w-xs">
      {coord.textContent && (
        <p className="font-medium text-gray-800 dark:text-gray-100 break-words">
          {coord.textContent}
        </p>
      )}
      <div className="mt-1 text-gray-500 dark:text-gray-400">
        <span>Page {coord.pageNumber}</span>
        {typeof coord.confidence === "number" && (
          <span className="ml-2">
            Confidence: {(coord.confidence * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
};

export default HighlightTooltip;