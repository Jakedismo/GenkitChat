import { z } from "zod";
import { aiInstance } from "@/lib/genkit-instance";
import { tavily } from "@tavily/core";

/**
 * Initialize Tavily client with API key
 * (Ensure you have TAVILY_API_KEY in your environment)
 */
const tvly = tavily({
  apiKey: process.env.TAVILY_API_KEY ?? "",
});

if (!process.env.TAVILY_API_KEY) {
  console.warn("TAVILY_API_KEY environment variable not set. Tavily tools will not work.");
}

/* ------------------------------------------------------------------ */
/*                           Tavily Search Tool                       */
/* ------------------------------------------------------------------ */

export const tavilySearchTool = aiInstance.defineTool(
  {
    name: "tavilySearch",
    description:
      "Searches the web using Tavily for a given query. Returns relevant documents with titles, URLs, content snippets, and relevance scores.",
    inputSchema: z.object({
      query: z.string().describe("Search query text."),
      search_depth: z.enum(["basic", "advanced"]).optional()
        .describe("The depth of the search."),
      max_results: z.number().min(5).max(20).optional()
        .describe("Maximum number of results to return."),
    }),
    outputSchema: z.array(
      z.object({
        title: z.string(),
        url: z.string().url(),
        content: z.string(),
        score: z.number(),
      })
    ),
  },
  async (input) => {
    if (!process.env.TAVILY_API_KEY) {
      throw new Error("Tavily API key missing (TAVILY_API_KEY).");
    }
    const { query, ...options } = input;
    const response = await tvly.search(query, options as any);
    return response.results;
  }
);

/* ------------------------------------------------------------------ */
/*                           Tavily Extract Tool                      */
/* ------------------------------------------------------------------ */

// Define interface for Tavily's extract response for better TypeScript compatibility
interface TavilyExtractSuccessResult {
  url: string;
  content: string;
  [key: string]: any; // Allow for other properties
}

interface TavilyExtractFailedResult {
  url: string;
  error: string;
  [key: string]: any; // Allow for other properties
}

interface TavilyExtractResponseType {
  results: TavilyExtractSuccessResult[];
  failedResults?: { url: string; error: string }[];
  [key: string]: any; // Allow for other properties
}

export const tavilyExtractTool = aiInstance.defineTool(
  {
    name: "tavilyExtract",
    description:
      "Extracts raw content from a list of URLs using Tavily Extract API.",
    inputSchema: z.object({
      urls: z
        // Relaxed URL validation to allow scheme-less URLs initially.
        // Normalization and validation will happen inside the function.
        .array(z.string().min(1)) // Changed from .url()
        .min(1)
        .describe("List of URLs to extract content from."),
      extract_depth: z.enum(["basic", "advanced"]).optional()
        .describe("Depth of extraction."),
    }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          url: z.string().url(),
          content: z.string(),
        })
      ),
      failed_results: z.array(
        z.object({
          url: z.string().url(),
          error: z.string(),
        })
      ),
    }),
  },
  // Destructure known options explicitly
  async ({ urls, extract_depth }) => {
    if (!process.env.TAVILY_API_KEY) {
      throw new Error("Tavily API key missing (TAVILY_API_KEY).");
    }

    // Normalize URLs: Add https:// if scheme is missing
    const normalizedUrls = urls.map(url => {
      // Correctly check if scheme (http:// or https://) is missing using regex
      if (!/^https?:\/\//i.test(url)) {
        console.log(`[tavilyExtractTool] Normalizing URL: ${url} -> https://${url}`);
        return `https://${url}`;
      }
      return url;
    });

    // Construct options object for Tavily API call
    const tavilyOptions: { extract_depth?: 'basic' | 'advanced' } = {};
    if (extract_depth) {
      // Ensure the key matches what the Tavily API expects (usually snake_case)
      tavilyOptions.extract_depth = extract_depth;
    }

    // Use normalized URLs and explicit options
    // Cast the response to 'any' for now to handle potential variations in Tavily's output structure
    const response = await tvly.extract(normalizedUrls, tavilyOptions) as any; 

    // Safely extract and transform the results to match our defined outputSchema
    // Provide default empty arrays if response parts are missing/not arrays
    const results = Array.isArray(response?.results)
      ? response.results.map((r: any) => ({
          url: r?.url || '', // Use optional chaining and provide default
          content: r?.content || '',
        }))
      : [];

    const failed_results = Array.isArray(response?.failedResults)
      ? response.failedResults.map((f: any) => ({
          url: f?.url || '',
          error: f?.error || 'Unknown error',
        }))
      : [];

    return {
      results,
      failed_results,
    };
  }
);

/* ------------------------------------------------------------------ */
/*                        Ensure Dev Server Picks Up Tools            */
/* ------------------------------------------------------------------ */

/**
 * Import this module from src/ai/dev.ts to ensure tools
 * get registered when the development server starts.
 */
console.log("[tavily-tools] Tavily tools initialized.");
