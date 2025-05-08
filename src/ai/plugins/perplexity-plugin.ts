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
          model: "sonar",
          messages: [{ role: "user", content: input.query }],
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
      return { response: content };
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
      "Performs deep research using Perplexity AI's research model (sonar-deep-research).",
    inputSchema: z.object({
      query: z.string().describe("The research query."),
    }),
    outputSchema: z.object({
      response: z.string().describe("The research answer from Perplexity AI."),
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
          model: "sonar-deep-research",
          messages: [{ role: "user", content: input.query }],
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
      return { response: content };
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
