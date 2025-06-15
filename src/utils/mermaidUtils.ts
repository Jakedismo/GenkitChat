export const MERMAID_KEYWORDS = ["mermaid", "mermaidgraph"];
export const MERMAID_CHART_TYPES = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "journey",
  "gantt",
  "pie",
  "gitgraph",
  "erDiagram",
  "timeline",
  "mindmap",
  "sankey",
  "quadrantChart",
  "requirementDiagram",
  "c4context",
  "block-beta",
];

export function isMermaidChart(chart: string): boolean {
  if (!chart) return false;
  const trimmed = chart.trim().toLowerCase();
  const firstWord = trimmed.split(/\s+/)[0];
  return [...MERMAID_KEYWORDS, ...MERMAID_CHART_TYPES].some((keyword) =>
    firstWord === keyword.toLowerCase(),
  );
}

export function getCleanedMermaidChart(chart: string): string {
  if (!chart) return "";

  let processedChart = chart.replace(/\u0008/g, "").trim();
  processedChart = processedChart
    .replace(/\\(.)/g, "$1")
    .trim()
    .replace(/\n$/, "");

  const lowercasedChart = processedChart.toLowerCase();
  let stripped = false;

  // Use reversed keywords to match "mermaidgraph" before "mermaid"
  const reversedKeywords = [...MERMAID_KEYWORDS].reverse();

  for (const keyword of reversedKeywords) {
    if (lowercasedChart.startsWith(keyword)) {
      processedChart = processedChart.substring(keyword.length).trim();
      stripped = true;
      break;
    }
  }

  if (stripped) {
    const remainingLower = processedChart.toLowerCase();
    const hasChartType = MERMAID_CHART_TYPES.some((ct) =>
      remainingLower.startsWith(ct),
    );
    if (!hasChartType) {
      processedChart = "graph " + processedChart;
    }
  }

  const legendIndex = processedChart.search(/Legend:-/i);
  if (legendIndex !== -1) {
    const preText = processedChart.substring(0, legendIndex);
    const openBrackets = (preText.match(/\[/g) || []).length;
    const closeBrackets = (preText.match(/\]/g) || []).length;

    if (openBrackets <= closeBrackets) {
      processedChart = preText.trim();
    }
  }

  return processedChart;
}

export function validateChartCompleteness(
  chart: string,
): { isValid: boolean; error?: string } {
  if (!chart || chart.trim().length === 0) {
    return { isValid: false, error: "Empty chart content" };
  }

  const trimmed = chart.trim();
  const hasValidStart = MERMAID_CHART_TYPES.some((keyword) =>
    trimmed.toLowerCase().startsWith(keyword.toLowerCase()),
  );

  if (!hasValidStart) {
    return {
      isValid: false,
      error: `Chart must start with a valid Mermaid diagram type. Found: "${trimmed
        .split("\n")[0]
        .substring(0, 50)}..."`,
    };
  }

  const suspiciousEndings = [
    /--$/,
    /\|\s*$/,
    /\(\s*$/,
    /\[\s*$/,
    /\{\s*$/,
    /->\s*$/,
    /:\s*$/,
  ];

  const endsIncomplete = suspiciousEndings.some((pattern) =>
    pattern.test(trimmed),
  );
  if (endsIncomplete) {
    return {
      isValid: false,
      error: "Chart appears incomplete (streaming in progress)",
    };
  }

  if (trimmed.length < 10) {
    return {
      isValid: false,
      error: "Chart content too short to be a valid diagram",
    };
  }

  return { isValid: true };
}

export async function copyAsImage(
  svgElement: SVGElement,
  resolvedTheme: string | undefined,
  toast: (options: {
    title: string;
    description: string;
    variant?: "default" | "destructive";
  }) => void,
) {
  try {
    if (!svgElement) {
      throw new Error("No diagram found to copy");
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create canvas context");
    }

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = async () => {
      try {
        canvas.width = img.naturalWidth * 2;
        canvas.height = img.naturalHeight * 2;
        ctx.scale(2, 2);
        ctx.fillStyle = resolvedTheme === "dark" ? "#0f172a" : "#ffffff";
        ctx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([
                  new ClipboardItem({ "image/png": blob }),
                ]);
                toast({
                  title: "Copied!",
                  description: "Diagram copied to clipboard as image",
                });
              } else {
                downloadImage(blob, toast);
              }
            } catch (clipboardError) {
              downloadImage(blob, toast);
            }
          }
        }, "image/png");
      } catch (canvasError) {
        throw new Error("Failed to process image");
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      throw new Error("Failed to load SVG as image");
    };

    img.src = url;
  } catch (err) {
    toast({
      title: "Copy Failed",
      description:
        err instanceof Error ? err.message : "Failed to copy diagram",
      variant: "destructive",
    });
  }
}

function downloadImage(
  blob: Blob,
  toast: (options: { title: string; description: string }) => void,
) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mermaid-diagram-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast({
    title: "Downloaded",
    description: "Diagram downloaded as image file",
  });
}

export async function copyAsText(
  chart: string,
  toast: (options: {
    title: string;
    description: string;
    variant?: "default" | "destructive";
  }) => void,
) {
  try {
    await navigator.clipboard.writeText(chart);
    toast({
      title: "Copied!",
      description: "Diagram source code copied to clipboard",
    });
  } catch (err) {
    toast({
      title: "Copy Failed",
      description: "Failed to copy diagram source",
      variant: "destructive",
    });
  }
}
