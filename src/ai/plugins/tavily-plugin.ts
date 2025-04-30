import { z } from 'genkit/beta';
import { tavily } from '@tavily/core';
import { Plugin } from '@genkit-ai/core'; // Import Plugin type from core
import { Genkit } from 'genkit';

// Define the Tavily Plugin
export const tavilyPlugin = (): Plugin => {
  return {
    name: 'tavily',
    configure: (ai:Genkit) => { // 'ai' is the genkit instance

      const tvly = tavily({
        apiKey: process.env.TAVILY_API_KEY ?? "",
      });

      if (!process.env.TAVILY_API_KEY) {
        console.warn("[tavily-plugin] TAVILY_API_KEY environment variable not set.");
      }

      // Define Tavily Search Tool
      ai.defineTool(
        {
          name: "tavilySearch",
          description: "Searches the web using Tavily. Returns relevant snippets.",
          inputSchema: z.object({
            query: z.string().describe("Search query."),
            search_depth: z.enum(["basic", "advanced"]).optional().describe("Search depth."),
            max_results: z.number().min(5).max(20).optional().describe("Max results."),
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
        async (input: { query: string; search_depth?: "basic" | "advanced"; max_results?: number }) => {
          if (!process.env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY missing.");
          const { query, ...options } = input;
          const response = await tvly.search(query, options as any);
          return response.results || [];
        }
      );

      // Define Tavily Extract Tool
      ai.defineTool(
        {
          name: "tavilyExtract",
          description: "Extracts content from URLs using Tavily.",
          inputSchema: z.object({
            urls: z.array(z.string().url()).min(1).describe("List of URLs."),
            extract_depth: z.enum(["basic", "advanced"]).optional().describe("Extraction depth."),
          }),
          outputSchema: z.object({
            results: z.array(z.object({ url: z.string().url(), content: z.string() })),
            failed_results: z.array(z.object({ url: z.string().url(), error: z.string() })),
          }),
        },
        async (input: { urls: string[]; extract_depth?: "basic" | "advanced" }) => {
          if (!process.env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY missing.");
          const { urls, ...options } = input;
          const response = await tvly.extract(urls, options as any) as any;
          return {
            results: Array.isArray(response.results) ? response.results.map((r: any) => ({ url: r.url || '', content: r.content || '' })) : [],
            failed_results: Array.isArray(response.failedResults) ? response.failedResults.map((f: any) => ({ url: f.url || '', error: f.error || 'Unknown error' })) : [],
          };
        }
      );

      console.log("[tavily-plugin] Tavily tools configured.");
    },
  };
};
