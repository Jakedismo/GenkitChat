"use client";

import { useToast } from "@/hooks/use-toast";
import { useMermaidRenderer } from "@/hooks/useMermaidRenderer";
import {
  copyAsImage,
  copyAsText
} from "@/utils/mermaidUtils";
import React from "react";
import MermaidToolbar from "./MermaidToolbar";

interface MermaidDiagramProps {
  chart: string;
  id?: string;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart, id }) => {
  const { toast } = useToast();
  const {
    elementRef,
    isLoading,
    error,
    zoom,
    setZoom,
    rendered,
    mounted,
    cleanChart,
    diagramId,
    resolvedTheme,
  } = useMermaidRenderer(chart, id);

  const handleCopyImage = () => {
    const svgElement = elementRef.current?.querySelector("svg");
    if (svgElement) {
      copyAsImage(svgElement, resolvedTheme, toast);
    }
  };

  const handleCopyText = () => {
    copyAsText(cleanChart, toast);
  };

  if (!mounted) {
    return (
      <div className="not-prose my-4 flex items-center justify-center p-8 border border rounded-lg bg-card">
        <div className="flex flex-col items-center space-y-2">
          <span className="text-sm text-muted-foreground">
            Loading diagram...
          </span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="not-prose my-4 flex items-center justify-center p-8 border border rounded-lg bg-card">
        <div className="flex flex-col items-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="text-sm text-muted-foreground">
            Rendering Mermaid diagram...
          </span>
          {cleanChart.length > 0 && (
            <span className="text-xs text-muted-foreground max-w-xs truncate">
              {cleanChart.split("\n")[0].substring(0, 50)}
              {cleanChart.split("\n")[0].length > 50 ? "..." : ""}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="not-prose my-4 border border-destructive/50 rounded-lg bg-destructive/10">
        <div className="p-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="w-5 h-5 text-destructive">⚠️</div>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-destructive">
                Mermaid Diagram Error
              </h3>
              <p className="mt-1 text-sm text-destructive/80 whitespace-pre-wrap">
                {error}
              </p>
              <div className="mt-3 p-3 bg-muted/50 rounded border">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  Fallback: Plain Text Representation
                </h4>
                <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">
                  {cleanChart}
                </pre>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-destructive/70 hover:text-destructive">
                  Show debugging information
                </summary>
                <div className="mt-2 space-y-2">
                  <div className="text-xs">
                    <span className="font-medium">Chart length:</span>{" "}
                    {cleanChart.length} characters
                  </div>
                  <div className="text-xs">
                    <span className="font-medium">Diagram ID:</span> {diagramId}
                  </div>
                  <div className="text-xs">
                    <span className="font-medium">Theme:</span> {resolvedTheme}
                  </div>
                  <pre className="text-xs bg-muted/30 p-2 rounded border overflow-auto max-h-32">
                    {cleanChart}
                  </pre>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="not-prose my-4 relative group border border rounded-lg overflow-hidden bg-card">
      <MermaidToolbar
        zoom={zoom}
        onZoomIn={() => setZoom((prev) => Math.min(prev + 0.2, 3))}
        onZoomOut={() => setZoom((prev) => Math.max(prev - 0.2, 0.5))}
        onResetZoom={() => setZoom(1)}
        onCopyText={handleCopyText}
        onCopyImage={handleCopyImage}
      />
      <div
        className="p-4 overflow-auto max-h-[600px]"
        style={{
          transformOrigin: "top left",
        }}
      >
        <div
          ref={elementRef}
          data-testid="mermaid-diagram-container"
          className="mermaid-container"
          style={{
            minHeight: rendered ? "auto" : "200px",
            display: "flex",
            alignItems: rendered ? "flex-start" : "center",
            justifyContent: rendered ? "flex-start" : "center",
          }}
        >
          {!rendered && !error && !isLoading && (
            <div className="text-muted-foreground text-sm">
              Preparing diagram...
            </div>
          )}
        </div>
      </div>
      <div className="border-t border">
        <details>
          <summary className="cursor-pointer px-4 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors">
            View source code
          </summary>
          <div className="px-4 pb-4">
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-32 border">
              <code>{cleanChart}</code>
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
};

export default MermaidDiagram;