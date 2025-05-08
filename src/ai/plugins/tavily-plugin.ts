import { z } from "genkit/beta";
import { tavily } from "@tavily/core";
// import { Plugin } from "@genkit-ai/core"; // Plugin type not used in this structure
import { Genkit } from "genkit";

// Define interfaces for Tavily options and responses to avoid 'any'
interface TavilySearchOptions {
  search_depth?: "basic" | "advanced";
  max_results?: number;
}

interface TavilyExtractOptions {
  extract_depth?: "basic" | "advanced";
}

interface TavilyExtractResultItem {
  url?: string;
  content?: string;
}

interface TavilyExtractFailedResultItem {
  url?: string;
  error?: string;
}

interface TavilyExtractResponse {
  results?: TavilyExtractResultItem[];
  failedResults?: TavilyExtractFailedResultItem[];
}

// Define the Tavily Plugin
export const tavilyPlugin = (ai: Genkit): void => {
  // 'ai' is the genkit instance

  const tvly = tavily({
        apiKey: process.env.TAVILY_API_KEY ?? "",
      });

      if (!process.env.TAVILY_API_KEY) {
        console.warn(
          "[tavily-plugin] TAVILY_API_KEY environment variable not set.",
        );
      }

      // Define Tavily Search Tool
      ai.defineTool(
        {
          name: "tavilySearch",
          description:
            "Searches the web using Tavily. Returns relevant snippets.",
          inputSchema: z.object({
            query: z.string().describe("Search query."),
            search_depth: z
              .enum(["basic", "advanced"])
              .optional()
              .describe("Search depth."),
            max_results: z
              .number()
              .min(5)
              .max(20)
              .optional()
              .describe("Max results."),
          }),
          outputSchema: z.array(
            z.object({
              title: z.string(),
              url: z.string().url(),
              content: z.string(),
              score: z.number(),
            }),
          ),
        },
        async (input: {
          query: string;
          search_depth?: "basic" | "advanced";
          max_results?: number;
        }) => {
          if (!process.env.TAVILY_API_KEY)
            throw new Error("Tavily API key missing (TAVILY_API_KEY)."); // Corrected error message
          const { query, ...options } = input;
          // Cast options to the defined interface
          const response = await tvly.search(query, options as TavilySearchOptions);
          // Assuming response.results matches the expected output schema
          return response.results || [];
        },
      );

      // Define Tavily Extract Tool
      ai.defineTool(
        {
          name: "tavilyExtract",
          description: "Extracts content from URLs using Tavily.",
          inputSchema: z.object({
            urls: z.array(z.string().url()).min(1).describe("List of URLs."),
            extract_depth: z
              .enum(["basic", "advanced"])
              .optional()
              .describe("Extraction depth."),
          }),
          outputSchema: z.object({
            results: z.array(
              z.object({ url: z.string().url(), content: z.string() }),
            ),
            failed_results: z.array(
              z.object({ url: z.string().url(), error: z.string() }),
            ),
          }),
        },
        async (input: {
          urls: string[];
          extract_depth?: "basic" | "advanced";
        }) => {
          if (!process.env.TAVILY_API_KEY)
            throw new Error("Tavily API key missing (TAVILY_API_KEY)."); // Corrected error message
          const { urls, ...options } = input;
          // Cast options and response to defined interfaces
          const response = await tvly.extract(urls, options as TavilyExtractOptions) as TavilyExtractResponse;
          return {
            results: Array.isArray(response.results)
              ? response.results.map((r: TavilyExtractResultItem) => ({ // Type the map parameter
                  url: r.url || "",
                  content: r.content || "",
                }))
              : [],
            failed_results: Array.isArray(response.failedResults)
              ? response.failedResults.map((f: TavilyExtractFailedResultItem) => ({ // Type the map parameter
                  url: f.url || "",
                  error: f.error || "Unknown error",
                }))
              : [],
          };
        },
      );

      console.log("[tavily-plugin] Tavily tools configured.");
};
