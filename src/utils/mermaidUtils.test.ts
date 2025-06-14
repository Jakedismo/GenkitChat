import { getCleanedMermaidChart } from './mermaidUtils';

describe('getCleanedMermaidChart', () => {
  it('should return an empty string for empty input', () => {
    expect(getCleanedMermaidChart('')).toBe('');
  });

  it('should remove backspace characters', () => {
    expect(getCleanedMermaidChart('graph TD\b A --> B')).toBe('graph TD A --> B');
    expect(getCleanedMermaidChart('graph TD\b\b A --> B\b')).toBe('graph TD A --> B');
  });

  it('should trim whitespace after removing backspace characters', () => {
    expect(getCleanedMermaidChart('graph TD\b A --> B  \b')).toBe('graph TD A --> B');
  });

  it('should unescape backslashes for escaped characters like \\)', () => {
    // The regex is /\\(.)/g, so it looks for a literal backslash followed by any character.
    // Example: \\) becomes ), \\n becomes n (if not at end of string for the specific \n$/ replacement)
    expect(getCleanedMermaidChart('graph TD A \\--> B')).toBe('graph TD A --> B');
    expect(getCleanedMermaidChart('graph TD A \\(Node\\) --> B')).toBe('graph TD A (Node) --> B');
    expect(getCleanedMermaidChart('graph TD A \\[Text\\]')).toBe('graph TD A [Text]');
  });

  it('should remove trailing newline characters that were part of escaped sequences (like \\n converted to n then removed if at end)', () => {
    // Original logic: processedChart.replace(/\\(.)/g, "$1").trim().replace(/\n$/, '');
    // If chart is "A\\n", it becomes "An".trim() -> "An".replace(/\n$/, '') -> "An"
    // If chart is "A\\n\n", it becomes "An\n".trim() -> "An\n".replace(/\n$/, '') -> "An" (correct)
    // If chart is "A\n", it's not touched by replace(/\\(.)/g, "$1"). Then trim().replace(/\n$/, '') -> "A"
    expect(getCleanedMermaidChart('graph TD A --> B\n')).toBe('graph TD A --> B'); // Direct trailing newline
    expect(getCleanedMermaidChart('graph TD A --> B\\n')).toBe('graph TD A --> Bn'); // Escaped \n becomes 'n'
    expect(getCleanedMermaidChart('graph TD A --> B\\n\n')).toBe('graph TD A --> Bn'); // Escaped \n then real \n
  });

  it('should trim whitespace after unescaping characters', () => {
    expect(getCleanedMermaidChart('graph TD A \\--> B  ')).toBe('graph TD A --> B');
  });

  it('should remove "mermaid" prefix, ignoring case', () => {
    expect(getCleanedMermaidChart('mermaid graph TD A --> B')).toBe('graph TD A --> B');
    expect(getCleanedMermaidChart('Mermaid graph TD A --> B')).toBe('graph TD A --> B');
    expect(getCleanedMermaidChart('mermaidgraph TD A --> B')).toBe('graph TD A --> B'); // Assuming no space after mermaid
  });

  it('should trim whitespace after removing "mermaid" prefix', () => {
    expect(getCleanedMermaidChart('mermaid   graph TD A --> B')).toBe('graph TD A --> B');
  });

  it('should remove "Legend:-" section and subsequent text', () => {
    expect(getCleanedMermaidChart('graph TD A --> B\nLegend:- Some legend text\nMore stuff')).toBe('graph TD A --> B');
    expect(getCleanedMermaidChart('graph TD A --> B\n  Legend:- Another one')).toBe('graph TD A --> B');
    expect(getCleanedMermaidChart('graph TD A --> B Legend:-Trailing')).toBe('graph TD A --> B');
  });

  it('should handle "Legend:-" with different casing', () => {
    expect(getCleanedMermaidChart('graph TD A --> B\nlegend:- Some legend')).toBe('graph TD A --> B');
  });

  it('should not remove "Legend:-" if it is within node brackets', () => {
    const chartWithLegendInNode = 'graph TD A["Node with Legend:- inside"] --> B';
    expect(getCleanedMermaidChart(chartWithLegendInNode)).toBe(chartWithLegendInNode);
    const chartWithLegendInNode2 = 'graph TD A["[Legend:- brackets]"] --> B';
    expect(getCleanedMermaidChart(chartWithLegendInNode2)).toBe(chartWithLegendInNode2);
  });

  it('should not remove "Legend:-" if brackets are unbalanced before it in a way that suggests it is inside a node', () => {
    const chart = 'graph TD A["Node [with Legend:- still inside"] --> B';
    expect(getCleanedMermaidChart(chart)).toBe(chart);
    const chart2 = 'graph TD A[Oops --> B["Legend:- inside this one"]'; // Legend is part of B's label
    expect(getCleanedMermaidChart(chart2)).toBe(chart2);
  });

  it('should remove "Legend:-" if brackets before it are balanced', () => {
    const chart = 'graph TD A["Closed Node"] --> B\nLegend:- This should be removed';
    expect(getCleanedMermaidChart(chart)).toBe('graph TD A["Closed Node"] --> B');
  });

  it('should trim whitespace after removing "Legend:-" section', () => {
    expect(getCleanedMermaidChart('graph TD A --> B  \nLegend:- Some legend')).toBe('graph TD A --> B');
  });

  it('should handle combinations of cleaning operations', () => {
    const dirtyChart = 'mermaid  graph TD\b A \\--> B\\nLegend:- This is a legend\nMore text.  ';
    const expectedChart = 'graph TD A --> Bn'; // \n becomes n, Legend and subsequent text removed, mermaid prefix removed, backspace removed.
    expect(getCleanedMermaidChart(dirtyChart)).toBe(expectedChart);
  });

  it('should return already clean input as is (or trimmed equivalent)', () => {
    const cleanChart = 'graph TD A --> B';
    expect(getCleanedMermaidChart(cleanChart)).toBe(cleanChart);
    const cleanChartWithSpaces = '  graph TD A --> B  ';
    expect(getCleanedMermaidChart(cleanChartWithSpaces)).toBe(cleanChart); // Will be trimmed
  });

  it('should handle leading/trailing whitespace correctly at various stages', () => {
    expect(getCleanedMermaidChart('  graph TD A --> B  ')).toBe('graph TD A --> B');
    expect(getCleanedMermaidChart('  mermaid graph TD A --> B  ')).toBe('graph TD A --> B');
    expect(getCleanedMermaidChart('  graph TD A --> B \nLegend:- L  ')).toBe('graph TD A --> B');
  });

  it('should correctly apply trim at each relevant step of processing', () => {
    // 1. After backspace removal: chart.replace(/\b/g, "").trim();
    expect(getCleanedMermaidChart(" chart\bwith\bspaces \b ")).toBe("chartwithspaces");

    // 2. After unescaping: processedChart.replace(/\\(.)/g, "$1").trim()
    expect(getCleanedMermaidChart(" \\(escaped\\) \n")).toBe("(escaped)"); // also tests trailing \n removal by .replace(/\n$/, '')

    // 3. After mermaid prefix removal: processedChart.substring('mermaid'.length).trim()
    expect(getCleanedMermaidChart("mermaid   subsequent text")).toBe("subsequent text");

    // 4. After Legend:- removal: preText.trim()
    expect(getCleanedMermaidChart("text before legend  \nLegend:- legend here")).toBe("text before legend");
  });

  it('should specifically test the trailing newline removal: .replace(/\\n$/, "")', () => {
    // This regex in the code is actually .replace(/\n$/, '') not /\\n$/
    // It acts on a string that has already been processed by .replace(/\\(.)/g, "$1") and .trim()

    // Case 1: Actual trailing newline
    expect(getCleanedMermaidChart("chart\n")).toBe("chart");
    expect(getCleanedMermaidChart("chart \n ")).toBe("chart"); // trim first, then \n removal

    // Case 2: Escaped trailing newline \\n
    // "chart\\n" -> replace(/\\(.)/) -> "chartn" -> trim -> "chartn" -> replace(/\n$/) -> "chartn"
    expect(getCleanedMermaidChart("chart\\n")).toBe("chartn");

    // Case 3: Escaped trailing newline then actual newline: "chart\\n\n"
    // "chart\\n\n" -> replace(/\\(.)/) -> "chartn\n" -> trim -> "chartn\n" -> replace(/\n$/) -> "chartn"
    expect(getCleanedMermaidChart("chart\\n\n")).toBe("chartn");

     // Case 4: Multiple actual trailing newlines
     // trim() removes all trailing newlines/spaces first, so "chart\n\n" becomes "chart"
     // and then .replace(/\n$/, '') has no effect.
     expect(getCleanedMermaidChart("chart\n\n")).toBe("chart");
     expect(getCleanedMermaidChart("chart\n \n")).toBe("chart");
  });

});
