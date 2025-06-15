import {
  getCleanedMermaidChart,
  isMermaidChart,
  MERMAID_CHART_TYPES,
} from "./mermaidUtils";

describe("isMermaidChart", () => {
  it("should return true for valid mermaid keywords", () => {
    expect(isMermaidChart("mermaid graph TD A --> B")).toBe(true);
    expect(isMermaidChart("mermaidgraph graph TD A --> B")).toBe(true);
  });

  it("should return true for valid chart types", () => {
    for (const chartType of MERMAID_CHART_TYPES) {
      expect(isMermaidChart(`${chartType} TD A --> B`)).toBe(true);
    }
  });

  it("should return false for invalid keywords", () => {
    expect(isMermaidChart("not a mermaid chart")).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(isMermaidChart("Mermaid graph TD A --> B")).toBe(true);
    expect(isMermaidChart("GRAPH TD A --> B")).toBe(true);
  });
});

describe("getCleanedMermaidChart", () => {
  it("should return an empty string for empty input", () => {
    expect(getCleanedMermaidChart("")).toBe("");
  });

  it("should prepend 'graph' if a keyword is stripped and no chart type is present", () => {
    expect(getCleanedMermaidChart("mermaid TD A --> B")).toBe("graph TD A --> B");
    expect(getCleanedMermaidChart("mermaidgraph TD A --> B")).toBe(
      "graph TD A --> B",
    );
  });

  it("should not prepend 'graph' if a chart type is already present", () => {
    expect(getCleanedMermaidChart("mermaid flowchart TD A --> B")).toBe(
      "flowchart TD A --> B",
    );
    expect(getCleanedMermaidChart("mermaidgraph flowchart TD A --> B")).toBe(
      "flowchart TD A --> B",
    );
  });

  it("should remove backspace characters", () => {
    expect(getCleanedMermaidChart("graph TD\b A --> B")).toBe(
      "graph TD A --> B",
    );
  });

  it("should unescape backslashes", () => {
    expect(getCleanedMermaidChart("graph TD A \\(Node\\) --> B")).toBe(
      "graph TD A (Node) --> B",
    );
  });

  it("should remove trailing newlines", () => {
    expect(getCleanedMermaidChart("graph TD A --> B\n")).toBe(
      "graph TD A --> B",
    );
  });

  it('should remove "mermaid" and "mermaidgraph" prefixes, ignoring case', () => {
    expect(getCleanedMermaidChart("mermaid graph TD A --> B")).toBe(
      "graph TD A --> B",
    );
    expect(getCleanedMermaidChart("mermaidgraph TD A --> B")).toBe(
      "graph TD A --> B",
    );
  });

  it("should remove 'Legend:-' section", () => {
    expect(
      getCleanedMermaidChart("graph TD A --> B\nLegend:- Some legend"),
    ).toBe("graph TD A --> B");
  });

  it("should handle combinations of cleaning operations", () => {
    const dirtyChart =
      "mermaidgraph  TD\b A \\--> B\\nLegend:- This is a legend\nMore text.  ";
    const expectedChart = "graph TD A --> Bn";
    expect(getCleanedMermaidChart(dirtyChart)).toBe(expectedChart);
  });

  it("should handle a complex real-world example", () => {
    const chart =
      'mermaidgraph \n  graph TD\n    A[Start] --> B{Is it?};';
    const expected = 'graph TD\n    A[Start] --> B{Is it?};';
    expect(getCleanedMermaidChart(chart)).toBe(expected);
  });
});
