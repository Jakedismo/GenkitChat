// studio-master/src/ai/plugins/perplexity-plugin.ts
import { z } from "genkit/beta";
import { Genkit } from "genkit";

const PERPLEXITY_API_ENDPOINT = "https://api.perplexity.ai/chat/completions";

export const perplexityPlugin = (ai: Genkit): void => {
  if (!process.env.PERPLEXITY_API_KEY) {
    console.warn(
      "[perplexity-plugin] PERPLEXITY_API_KEY environment variable not set. Perplexity tools may not function."
    );
  }

  // Define Perplexity Search Tool
  ai.defineTool(
  {
    name: "perplexitySearch",
    description:
      "Performs a search using Perplexity AI's online model (sonar) for up-to-date answers.",
    inputSchema: z.object({
      query: z.string().describe("The search query."),
    }),
    outputSchema: z.object({
      response: z.string().describe("The answer from Perplexity AI."),
      sources: z.array(z.object({
        title: z.string().optional(),
        url: z.string().optional(),
        snippet: z.string().optional(),
      })).optional(),
    }),
  },
  async (input: { query: string }) => {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey)
      throw new Error("Perplexity API key missing (PERPLEXITY_API_KEY).");

    try {
      const response = await fetch(PERPLEXITY_API_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: "sonar-small-online",
          messages: [{ role: "user", content: input.query }],
          options: {
            search_focus: true,
            include_citations: true
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Perplexity API error: ${response.status} ${response.statusText} - ${errorBody}`,
        );
      }

      const data = await response.json();
      const content =
        data.choices?.[0]?.message?.content || "No response content found.";
      
      // Extract source information if available
      const sources = [];
      if (data.choices?.[0]?.message?.context?.citations) {
        for (const citation of data.choices[0].message.context.citations) {
          sources.push({
            title: citation.title || "",
            url: citation.url || "",
            snippet: citation.snippet || "",
          });
        }
      }
      
      return { 
        response: content,
        sources: sources.length > 0 ? sources : undefined
      };
    } catch (error: unknown) {
      console.error("Error calling Perplexity API (Search):", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to execute Perplexity Search: ${message}`);
    }
  },
);

  // Define Perplexity Deep Research Tool
  ai.defineTool(
  {
    name: "perplexityDeepResearch",
    description:
      "Performs deep research using Perplexity AI's research model (sonar-medium-online).",
    inputSchema: z.object({
      query: z.string().describe("The research query."),
    }),
    outputSchema: z.object({
      response: z.string().describe("The research answer from Perplexity AI."),
      sources: z.array(z.object({
        title: z.string().optional(),
        url: z.string().optional(),
        snippet: z.string().optional(),
      })).optional(),
    }),
  },
  async (input: { query: string }) => {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey)
      throw new Error("Perplexity API key missing (PERPLEXITY_API_KEY).");

    try {
      const response = await fetch(PERPLEXITY_API_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: "sonar-medium-online",
          messages: [{ role: "user", content: input.query }],
          options: {
            quality: "high",
            search_focus: true,
            include_citations: true
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Perplexity API error: ${response.status} ${response.statusText} - ${errorBody}`,
        );
      }

      const data = await response.json();
      const content =
        data.choices?.[0]?.message?.content || "No response content found.";
      
      // Extract source information if available
      const sources = [];
      if (data.choices?.[0]?.message?.context?.citations) {
        for (const citation of data.choices[0].message.context.citations) {
          sources.push({
            title: citation.title || "",
            url: citation.url || "",
            snippet: citation.snippet || "",
          });
        }
      }
      
      return { 
        response: content,
        sources: sources.length > 0 ? sources : undefined
      };
    } catch (error: unknown) {
      console.error("Error calling Perplexity API (Deep Research):", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to execute Perplexity Deep Research: ${message}`,
      );
    }
  },
);

  console.log("[perplexity-plugin] Perplexity tools configured.");
};
