export function getCleanedMermaidChart(chart: string): string {
  if (!chart) return '';

  // Remove backspace characters (ASCII U+0008)
  let processedChart = chart.replace(/\u0008/g, "").trim();

  // Unescape backslashes that LLMs sometimes add, then trim
  // The original regex /\(.)/g was causing a syntax error because \( is not a valid escape in string literals.
  // It should be /\\(.)/g to match a literal backslash followed by a character.
  processedChart = processedChart.replace(/\\(.)/g, "$1").trim().replace(/\n$/, '');

  // Handle cases where the LLM incorrectly includes "mermaid" as a prefix
  // e.g., "mermaid graph TD", "mermaidgraph TD", etc.
  if (processedChart.toLowerCase().startsWith('mermaid')) {
      processedChart = processedChart.substring('mermaid'.length).trim();
  }

  // Remove "Legend:-" sections and other trailing text that are not part of mermaid syntax
  // This is a common failure mode for LLM-generated diagrams
  const legendIndex = processedChart.search(/Legend:-/i);
  if (legendIndex !== -1) {
      // Check if "Legend" is inside a node definition (e.g., A["Legend"])
      const preText = processedChart.substring(0, legendIndex);
      const openBrackets = (preText.match(/\[/g) || []).length;
      const closeBrackets = (preText.match(/\]/g) || []).length;

      // If not inside a node, strip it out
      if (openBrackets <= closeBrackets) {
          processedChart = preText.trim();
      }
  }

  return processedChart;
}
