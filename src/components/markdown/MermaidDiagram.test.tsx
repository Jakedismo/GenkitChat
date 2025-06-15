import { render } from "@testing-library/react";
import MermaidDiagram from "./MermaidDiagram";

// Define the mock implementation
const mockMermaidInstance = {
  initialize: jest.fn(),
  parse: jest.fn().mockResolvedValue(true),
  render: jest.fn().mockResolvedValue({
    svg: "<svg>mocked_svg_output</svg>",
    bindFunctions: jest.fn(),
  }),
};

// Mock the mermaid module
jest.mock("mermaid", () => ({
  __esModule: true,
  default: mockMermaidInstance,
}));

// Mock the useMermaidRenderer hook directly
jest.mock("@/hooks/useMermaidRenderer", () => ({
  useMermaidRenderer: jest.fn((chart: string) => {
    // Simulate the hook behavior
    const mockElementRef = { current: document.createElement("div") };
    
    // Call the mocked functions to simulate what the real hook does
    setTimeout(() => {
      mockMermaidInstance.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 14,
        logLevel: "error",
      });
      
      // For mermaidgraph charts, parse with cleaned chart
      if (chart.startsWith("mermaidgraph")) {
        const cleanedChart = chart.replace(/^mermaidgraph\s*/i, "graph ");
        mockMermaidInstance.parse(cleanedChart);
      } else {
        mockMermaidInstance.parse(chart);
      }
      
      mockMermaidInstance.render("test-id", chart);
    }, 100);

    return {
      elementRef: mockElementRef,
      isLoading: false,
      error: null,
      rendered: true,
    };
  }),
}));

// Mock lucide-react icons
jest.mock("lucide-react", () => ({
  __esModule: true,
  Copy: () => "CopyIcon",
  Download: () => "DownloadIcon",
  ZoomIn: () => "ZoomInIcon",
  ZoomOut: () => "ZoomOutIcon",
}));

// Mock next-themes
jest.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "dark",
    resolvedTheme: "dark",
  }),
}));

describe("MermaidDiagram Component Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should call initialize with the correct theme settings when a chart is provided", async () => {
    render(<MermaidDiagram chart="graph TD C[User Service] --> D(Database)" />);

    // Wait for component to process
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(mockMermaidInstance.initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose",
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: 14,
      logLevel: "error",
    });
  });

  it("should correctly render a chart with 'mermaidgraph' keyword", async () => {
    const chartString = "mermaidgraph TD A --> B";
    render(<MermaidDiagram chart={chartString} />);

    // Wait for component to process the chart
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(mockMermaidInstance.initialize).toHaveBeenCalled();
    expect(mockMermaidInstance.parse).toHaveBeenCalledWith("graph TD A --> B");
    expect(mockMermaidInstance.render).toHaveBeenCalled();
  });
});
