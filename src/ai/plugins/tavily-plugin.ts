// studio-master/src/ai/plugins/tavily-plugin.ts
import { z } from "genkit"; // Use stable import for z
import { Genkit } from "genkit";
import { TavilyClient } from "tavily";

/**
 * Creates and registers Tavily tools with a Genkit instance
 * - tavilySearch: Standard web search
 * - tavilyExtract: Extract structured data
 */
export const tavilyPlugin = (ai: Genkit): void => {
  if (!process.env.TAVILY_API_KEY) {
    console.warn(
      "[tavily-plugin] TAVILY_API_KEY environment variable not set. Tavily tools will not function."
    );
  }

  // Define Tavily Search Tool
  ai.defineTool(
    {
      name: "tavilySearch",
      description:
        "Searches the web for relevant information. Use this tool to get current information on topics or recent events.",
      inputSchema: z.object({
        query: z.string().describe("The search query."),
        search_depth: z
          .enum(["basic", "advanced"])
          .optional()
          .describe("The depth of the search, either 'basic' or 'advanced'."),
        include_domains: z
          .array(z.string())
          .optional()
          .describe("Array of domains to include in the search."),
        exclude_domains: z
          .array(z.string())
          .optional()
          .describe("Array of domains to exclude from the search."),
        include_answer: z
          .boolean()
          .optional()
          .describe("Whether to include an answer in the response."),
      }),
      outputSchema: z.object({
        result: z.string().describe("The search result."),
        urls: z.array(z.string()).describe("The URLs of the search results."),
      }),
    },
    async (input) => {
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey)
        throw new Error("Tavily API key missing (TAVILY_API_KEY).");

      try {
        const client = new TavilyClient({ apiKey });
        const response = await client.search({
          query: input.query,
          search_depth: input.search_depth,
          include_domains: input.include_domains,
          exclude_domains: input.exclude_domains,
          include_answer: input.include_answer,
        });

        if (response && response.results) {
          // Format the result into more readable text
          let formattedResults = "";
          
          // Include the answer if available
          if (response.answer) {
            formattedResults += `Answer: ${response.answer}\n\n`;
          }
          
          // Format individual search results
          formattedResults += response.results
            .map((result, index) => {
              return `[Source ${index + 1}]: ${result.title}\n${result.content}\n${result.url}`;
            })
            .join("\n\n");

          return {
            result: formattedResults,
            urls: response.results.map(result => result.url),
          };
        } else {
          throw new Error("Tavily API returned an invalid response structure.");
        }
      } catch (error: unknown) {
        console.error("Error calling Tavily API (Search):", error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to execute Tavily Search: ${message}`);
      }
    }
  );

  // Define Tavily Extract Tool
  ai.defineTool(
    {
      name: "tavilyExtract",
      description:
        "Extracts content from a website URL. Use this tool to get detailed information from a specific webpage.",
      inputSchema: z.object({
        url: z.string().describe("The URL of the web page to extract content from."),
        query: z.string().optional().describe("Optional question to ask about the webpage content."),
      }),
      outputSchema: z.object({
        content: z.string().describe("The extracted content from the URL."),
        metadata: z.object({
          url: z.string().describe("The URL that was processed."),
          title: z.string().optional().describe("The title of the webpage if available."),
        }),
      }),
    },
    async (input) => {
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey)
        throw new Error("Tavily API key missing (TAVILY_API_KEY).");

      try {
        const client = new TavilyClient({ apiKey });
        
        // Use search API with include_domains to focus on the specific URL
        const response = await client.search({
          query: input.query || `Extract and summarize the main content from ${input.url}`,
          include_domains: [input.url],
          search_depth: "advanced",
          include_answer: true,
          max_results: 3
        });

        if (response && response.results && response.results.length > 0) {
          // Combine the relevant content from the results
          const extractedContent = response.answer || 
            response.results.map(result => result.content).join("\n\n");
          
          return {
            content: extractedContent,
            metadata: {
              url: input.url,
              title: response.results[0]?.title || "Unknown title"
            }
          };
        } else {
          throw new Error("Could not extract content from the provided URL.");
        }
      } catch (error: unknown) {
        console.error("Error calling Tavily API (Extract):", error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to execute Tavily Extract: ${message}`);
      }
    }
  );

  console.log("[tavily-plugin] Tavily tools configured.");
};