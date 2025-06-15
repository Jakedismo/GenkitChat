"use client";

import {
  getCleanedMermaidChart,
  validateChartCompleteness,
} from "@/utils/mermaidUtils";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useMermaidRenderer(chart: string, id?: string) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rendered, setRendered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const renderTimeoutRef = useRef<NodeJS.Timeout>();
  const { theme, resolvedTheme } = useTheme();

  const diagramId = useMemo(
    () =>
      id || `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    [id],
  );

  const cleanChart = useMemo(() => {
    return getCleanedMermaidChart(chart);
  }, [chart]);

  const debouncedRender = useCallback(async () => {
    if (!cleanChart || cleanChart.length === 0) {
      setError("No chart content provided");
      setIsLoading(false);
      return;
    }

    const validation = validateChartCompleteness(cleanChart);
    if (!validation.isValid) {
      setError(validation.error || "Invalid chart content");
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setRendered(false);

      const renderTimeout = setTimeout(() => {
        setError("Diagram rendering timed out after 10 seconds");
        setIsLoading(false);
      }, 10000);

      let mermaid;
      try {
        mermaid = (await import("mermaid")).default;
        if (!mermaid) {
          throw new Error("Mermaid library failed to load");
        }
      } catch (importError) {
        clearTimeout(renderTimeout);
        throw new Error(
          `Failed to import Mermaid: ${
            importError instanceof Error
              ? importError.message
              : "Unknown import error"
          }`,
        );
      }

      const mermaidTheme =
        resolvedTheme === "dark" || theme === "dark"
          ? "dark"
          : resolvedTheme === "light" || theme === "light"
            ? "default"
            : "default";

      mermaid.initialize({
        startOnLoad: false,
        theme: mermaidTheme,
        securityLevel: "loose",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 14,
        logLevel: "error",
      });

      if (elementRef.current) {
        elementRef.current.innerHTML = "";

        try {
          const parseResult = await mermaid.parse(cleanChart);
          if (!parseResult) {
            throw new Error("Mermaid parse returned false - invalid syntax");
          }
        } catch (parseError) {
          clearTimeout(renderTimeout);
          const errorMsg =
            parseError instanceof Error
              ? parseError.message
              : "Invalid diagram syntax";
          throw new Error(
            `Syntax validation failed: ${errorMsg}\n\nChart content:\n${cleanChart.substring(
              0,
              200,
            )}${cleanChart.length > 200 ? "..." : ""}`,
          );
        }

        try {
          const renderResult = await mermaid.render(diagramId, cleanChart);

          if (!renderResult || !renderResult.svg) {
            throw new Error("Mermaid render returned no SVG content");
          }

          const { svg } = renderResult;

          if (!svg || svg.trim().length === 0) {
            throw new Error("Generated SVG is empty");
          }

          if (elementRef.current) {
            try {
              elementRef.current.innerHTML = svg;
              const svgElement = elementRef.current.querySelector("svg");
              if (!svgElement) {
                throw new Error("SVG element not found after insertion");
              }
              svgElement.style.maxWidth = "100%";
              svgElement.style.height = "auto";
              svgElement.style.transform = `scale(${zoom})`;
              svgElement.style.transformOrigin = "top left";
              clearTimeout(renderTimeout);
              setRendered(true);
            } catch (domError) {
              clearTimeout(renderTimeout);
              throw new Error(
                `DOM manipulation failed: ${
                  domError instanceof Error
                    ? domError.message
                    : "Unknown DOM error"
                }`,
              );
            }
          } else {
            clearTimeout(renderTimeout);
            throw new Error("Component element ref is no longer available");
          }
        } catch (renderError) {
          clearTimeout(renderTimeout);
          const errorMsg =
            renderError instanceof Error
              ? renderError.message
              : "Failed to render diagram";
          throw new Error(`Diagram rendering failed: ${errorMsg}`);
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown rendering error";
      setError(`Mermaid rendering failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [cleanChart, diagramId, zoom, resolvedTheme, theme]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }

    renderTimeoutRef.current = setTimeout(() => {
      debouncedRender();
    }, 500);

    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [debouncedRender, mounted]);

  return {
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
  };
}