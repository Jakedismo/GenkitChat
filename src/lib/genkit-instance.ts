import { genkit } from "genkit/beta";
import { logger } from "genkit/logging";
import { googleAI } from "@genkit-ai/googleai";
import { mcpClient } from "genkitx-mcp";
import { openAI } from "genkitx-openai";
import {
  devLocalVectorstore,
  devLocalIndexerRef,
  devLocalRetrieverRef
} from "@genkit-ai/dev-local-vectorstore";
import {
  vertexAI,
  textEmbedding005
} from "@genkit-ai/vertexai";
import { z } from "zod";
import { tavily } from '@tavily/core'; // Import Tavily SDK
import {
  GenerateResponse,
  GenerateResponseChunk,
  Part,
  ToolRequestPart,
  ToolResponsePart,
} from "@genkit-ai/ai";
import { Session, SessionData, SessionStore } from "genkit/beta";
import { RagEndpoint } from "@/services/rag"; // Keep RAG import

// Optional: API key check
if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) console.warn("GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set.");
if (!process.env.OPENAI_API_KEY) console.warn("OPENAI_API_KEY environment variable not set.");
if (!process.env.TAVILY_API_KEY) console.warn("[genkit-instance] TAVILY_API_KEY environment variable not set.");

// Configure the Context7 MCP client
const context7Client = mcpClient({
  name: "context7",
  serverProcess: { command: "npx", args: ["-y", "@upstash/context7-mcp@latest"] },
});

// Create and export the Genkit instance
export const aiInstance = genkit({
  plugins: [
    googleAI(),
    context7Client,
    openAI(),
    vertexAI(),
    devLocalVectorstore([{ indexName: "ragIndex", embedder: textEmbedding005 }]),
  ],
});

// === START: Define Tavily Tools Directly on aiInstance ===
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY ?? "" });

// Define Tavily Search Tool
const tavilySearchTool = aiInstance.defineTool(
  {
    name: "tavilySearch",
    description: "Searches the web using Tavily for a given query. Returns relevant documents with titles, URLs, content snippets, and relevance scores.",
    inputSchema: z.object({
      query: z.string().describe("Search query text."),
      search_depth: z.enum(["basic", "advanced"]).optional().describe("The depth of the search."),
      max_results: z.number().min(5).max(20).optional().describe("Maximum number of results to return."),
    }),
    outputSchema: z.array(z.object({ title: z.string(), url: z.string().url(), content: z.string(), score: z.number() })),
  },
  async (input: { query: string; search_depth?: "basic" | "advanced"; max_results?: number }) => {
    if (!process.env.TAVILY_API_KEY) throw new Error("Tavily API key missing (TAVILY_API_KEY).");
    const { query, ...options } = input;
    const response = await tvly.search(query, options as any);
    return response.results || [];
  }
);

// Define Tavily Extract Tool
const tavilyExtractTool = aiInstance.defineTool(
  {
    name: "tavilyExtract",
    description: "Extracts raw content from a list of URLs using Tavily Extract API.",
    inputSchema: z.object({
      urls: z.array(z.string().url()).min(1).describe("List of URLs to extract content from."),
      extract_depth: z.enum(["basic", "advanced"]).optional().describe("Depth of extraction."),
    }),
    outputSchema: z.object({
      results: z.array(z.object({ url: z.string().url(), content: z.string() })),
      failed_results: z.array(z.object({ url: z.string().url(), error: z.string() })),
    }),
  },
  async (input: { urls: string[]; extract_depth?: "basic" | "advanced" }) => {
    if (!process.env.TAVILY_API_KEY) throw new Error("Tavily API key missing (TAVILY_API_KEY).");
    const { urls, ...options } = input;
    const response = await tvly.extract(urls, options as any) as any;
    return {
      results: Array.isArray(response.results) ? response.results.map((r: any) => ({ url: r.url || '', content: r.content || '' })) : [],
      failed_results: Array.isArray(response.failedResults) ? response.failedResults.map((f: any) => ({ url: f.url || '', error: f.error || 'Unknown error' })) : [],
    };
  }
);
console.log("[genkit-instance] Tavily tools defined directly.");
// === END: Define Tavily Tools Directly on aiInstance ===


// === START: Define Perplexity Tools Directly on aiInstance ===
if (!process.env.PERPLEXITY_API_KEY) console.warn("[genkit-instance] PERPLEXITY_API_KEY environment variable not set.");

const PERPLEXITY_API_ENDPOINT = "https://api.perplexity.ai/chat/completions";

// Define Perplexity Search Tool (Online Model)
const perplexitySearchTool = aiInstance.defineTool(
  {
    name: "perplexitySearch",
    description: "Performs a search using Perplexity AI's online model (sonar) for up-to-date answers.",
    inputSchema: z.object({
      query: z.string().describe("The search query."),
    }),
    outputSchema: z.object({
      response: z.string().describe("The answer from Perplexity AI."),
    }),
  },
  async (input: { query: string }) => {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) throw new Error("Perplexity API key missing (PERPLEXITY_API_KEY).");

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
          // Optional: add other parameters like max_tokens if needed
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Perplexity API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const data = await response.json();
      // Extract content safely, assuming standard chat completion format
      const content = data.choices?.[0]?.message?.content || "No response content found.";
      return { response: content };
    } catch (error: any) {
      console.error("Error calling Perplexity API (Search):", error);
      throw new Error(`Failed to execute Perplexity Search: ${error.message}`);
    }
  }
);

// Define Perplexity Deep Research Tool (Research Model)
const perplexityDeepResearchTool = aiInstance.defineTool(
  {
    name: "perplexityDeepResearch",
    description: "Performs deep research using Perplexity AI's research model (sonar-deep-research).",
    inputSchema: z.object({
      query: z.string().describe("The research query."),
    }),
    outputSchema: z.object({
      response: z.string().describe("The research answer from Perplexity AI."),
    }),
  },
  async (input: { query: string }) => {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) throw new Error("Perplexity API key missing (PERPLEXITY_API_KEY).");

     try {
      const response = await fetch(PERPLEXITY_API_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: "sonar-deep-research", // Use the deep research model
          messages: [{ role: "user", content: input.query }],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Perplexity API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "No response content found.";
      return { response: content };
    } catch (error: any) {
      console.error("Error calling Perplexity API (Deep Research):", error);
      throw new Error(`Failed to execute Perplexity Deep Research: ${error.message}`);
    }
  }
);
console.log("[genkit-instance] Perplexity tools defined directly.");
// === END: Define Perplexity Tools Directly on aiInstance ===


// Export RAG refs
export const ragIndexerRef = devLocalIndexerRef("ragIndex");
export const ragRetrieverRef = devLocalRetrieverRef("ragIndex");

// Set log level
logger.setLogLevel("debug");
console.log("Genkit instance initialized with tools.");

// === Basic Chat Logic ===
type TemperaturePreset = "precise" | "normal" | "creative";

const BasicChatInputSchema = z.object({
  userMessage: z.string(),
  modelId: z.string(),
  temperaturePreset: z.enum(["precise", "normal", "creative"]),
  maxTokens: z.number().int().positive(),
  sessionId: z.string().optional(),
  tavilySearchEnabled: z.boolean().optional().default(false),
  tavilyExtractEnabled: z.boolean().optional().default(false),
  perplexitySearchEnabled: z.boolean().optional().default(false),     // Added
  perplexityDeepResearchEnabled: z.boolean().optional().default(false), // Added
});
type BasicChatInput = z.infer<typeof BasicChatInputSchema>;

const ToolInvocationSchema = z.object({ name: z.string(), input: z.any().optional(), output: z.any().optional() });
export type ToolInvocation = z.infer<typeof ToolInvocationSchema>;

const BasicChatOutputSchema = z.object({ response: z.string(), toolInvocations: z.array(ToolInvocationSchema).optional(), sessionId: z.string() });
export type BasicChatOutput = z.infer<typeof BasicChatOutputSchema>;

const presetTemperatures: Record<TemperaturePreset, number> = { precise: 0.2, normal: 0.7, creative: 1.0 };
const systemPrompts: Record<TemperaturePreset, string> = {
  precise: `You are a precise and factual assistant...`, normal: `You are a helpful and friendly assistant...`, creative: `You are a helpful, friendly, and creative assistant...`,
};

interface StreamAndResponse { stream: AsyncIterable<GenerateResponseChunk<any>>; responsePromise: Promise<GenerateResponse<any>>; sessionId: string; }

class InMemorySessionStore implements SessionStore {
  private store = new Map<string, SessionData<any>>();
  async get(sessionId: string): Promise<SessionData<any> | undefined> { return this.store.get(sessionId); }
  async save(sessionId: string, sessionData: SessionData<any>): Promise<void> { this.store.set(sessionId, sessionData); }
}
const memoryStore = new InMemorySessionStore();

export async function runBasicChatFlowStream(input: BasicChatInput): Promise<StreamAndResponse> {
  const {
    userMessage,
    modelId,
    temperaturePreset,
    maxTokens,
    sessionId,
    tavilySearchEnabled,
    tavilyExtractEnabled,
    perplexitySearchEnabled,     // Added
    perplexityDeepResearchEnabled // Added
  } = input;
  const temperature = presetTemperatures[temperaturePreset]; const systemPrompt = systemPrompts[temperaturePreset];
  let session: Session; let effectiveSessionId: string;

  if (sessionId) { session = await aiInstance.loadSession(sessionId, { store: memoryStore }); effectiveSessionId = sessionId; }
  else { session = await aiInstance.createSession({ store: memoryStore }); effectiveSessionId = session.id; }

  let modelConfig: any = {};
  if (modelId.startsWith("openai/")) { modelConfig.max_completion_tokens = maxTokens; } else { modelConfig.maxOutputTokens = maxTokens; }
  if (modelId !== "openai/o4-mini") { modelConfig.temperature = temperature; } else { console.log(`Model ${modelId} uses default temperature.`); }

  const tools: string[] = ["context7/resolve-library-id", "context7/get-library-docs"];
  if (tavilySearchEnabled) tools.push("tavilySearch"); // Use string name
  if (tavilyExtractEnabled) tools.push("tavilyExtract"); // Use string name
  if (perplexitySearchEnabled) tools.push("perplexitySearch");         // Added
  if (perplexityDeepResearchEnabled) tools.push("perplexityDeepResearch"); // Added
  console.log("Tools passed to session.chat():", tools);

  const chat = session.chat({ model: modelId, system: systemPrompt, tools: tools, config: modelConfig });
  const { stream, response } = await chat.sendStream(userMessage);
  return { stream, responsePromise: response, sessionId: effectiveSessionId };
}

export const basicChatFlow = aiInstance.defineFlow(
  { name: "basicChatFlow", inputSchema: BasicChatInputSchema, outputSchema: BasicChatOutputSchema },
  async (input: BasicChatInput): Promise<BasicChatOutput> => {
    const { stream, responsePromise, sessionId } = await runBasicChatFlowStream(input);
    for await (const chunk of stream) {} // Consume stream
    const finalResponse = await responsePromise; const responseText = finalResponse.text ?? ""; const messages = finalResponse.messages; const toolInvocations: ToolInvocation[] = [];
    if (messages && Array.isArray(messages)) {
      const toolRequests = new Map<string, ToolRequestPart>();
      for (const message of messages) {
        if (message.role === "tool" && Array.isArray(message.content)) {
          message.content.forEach((part: Part) => {
            const toolResponsePart = part as ToolResponsePart; const reqRef = toolResponsePart.toolResponse?.ref;
            if (reqRef && toolRequests.has(reqRef)) {
              const requestPart = toolRequests.get(reqRef)!;
              toolInvocations.push({ name: requestPart.toolRequest.name, input: requestPart.toolRequest.input, output: toolResponsePart.toolResponse?.output });
              toolRequests.delete(reqRef);
            }
          });
        } else if (message.role === "model" && Array.isArray(message.content)) {
          message.content.forEach((part: Part) => { if (part.toolRequest?.ref) toolRequests.set(part.toolRequest.ref, part as ToolRequestPart); });
        }
      }
    }
    return { response: responseText, toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined, sessionId: sessionId };
  }
);
console.log("basicChatFlow defined.");

// === RAG Augmented Chat Flow === (Keep existing RAG logic)
const RagAugmentedChatInputSchema = z.object({ ragEndpointId: z.string(), llmModelId: z.string(), query: z.string() });
export type RagAugmentedChatInput = z.infer<typeof RagAugmentedChatInputSchema>;
const RagAugmentedChatOutputSchema = z.object({ response: z.string(), toolInvocations: z.array(ToolInvocationSchema).optional() });
export type RagAugmentedChatOutput = z.infer<typeof RagAugmentedChatOutputSchema>;
const ragTool = aiInstance.defineTool(
  { name: "ragTool", description: "Retrieves RAG context.", inputSchema: z.object({ ragEndpointId: z.string(), query: z.string() }), outputSchema: z.string() },
  async (input: { ragEndpointId: string; query: string; }) => `[CONTEXT FROM ${input.ragEndpointId}]: Placeholder for ${input.query}`
);
const ragPrompt = aiInstance.definePrompt({
  name: "ragAugmentedChatPrompt", tools: [ragTool, "context7/resolve-library-id", "context7/get-library-docs"], input: { schema: RagAugmentedChatInputSchema }, output: { schema: RagAugmentedChatOutputSchema },
  prompt: `Use ragTool context for query: {{{query}}}.`,
});
export const ragAugmentedChatFlow = aiInstance.defineFlow<typeof RagAugmentedChatInputSchema, typeof RagAugmentedChatOutputSchema>(
  { name: "ragAugmentedChatFlow", inputSchema: RagAugmentedChatInputSchema, outputSchema: RagAugmentedChatOutputSchema },
  async (input) => { const { output } = await ragPrompt(input); if (!output) throw new Error("Failed"); return output; }
);
export async function ragAugmentedChat(input: RagAugmentedChatInput): Promise<RagAugmentedChatOutput> { console.warn("RAG chat no session."); return ragAugmentedChatFlow(input); }
console.log("ragAugmentedChatFlow defined.");

// === Endpoint Prompt Generator Flow === (Keep existing logic)
const GenerateEndpointPromptInputSchema = z.object({ llm: z.object({ modelId: z.string(), modelName: z.string() }), ragEndpoint: z.object({ endpointId: z.string(), endpointName: z.string() }) });
export type GenerateEndpointPromptInput = z.infer<typeof GenerateEndpointPromptInputSchema>;
const GenerateEndpointPromptOutputSchema = z.object({ prompt: z.string() });
export type GenerateEndpointPromptOutput = z.infer<typeof GenerateEndpointPromptOutputSchema>;
const endpointPrompt = aiInstance.definePrompt({
  name: "endpointPromptGeneratorPrompt", input: { schema: z.object({ llmModelName: z.string(), ragEndpointName: z.string() }) }, output: { schema: GenerateEndpointPromptOutputSchema },
  prompt: `Generate prompt for {{{llmModelName}}} and {{{ragEndpointName}}}.`,
});
export const generateEndpointPromptFlow = aiInstance.defineFlow<typeof GenerateEndpointPromptInputSchema, typeof GenerateEndpointPromptOutputSchema>(
  { name: "generateEndpointPromptFlow", inputSchema: GenerateEndpointPromptInputSchema, outputSchema: GenerateEndpointPromptOutputSchema },
  async (input) => { const { output } = await endpointPrompt({ llmModelName: input.llm.modelName, ragEndpointName: input.ragEndpoint.endpointName }); if (!output) throw new Error("Failed"); return output; }
);
export async function generateEndpointPrompt(input: GenerateEndpointPromptInput): Promise<GenerateEndpointPromptOutput> { return generateEndpointPromptFlow(input); }
console.log("generateEndpointPromptFlow defined.");
