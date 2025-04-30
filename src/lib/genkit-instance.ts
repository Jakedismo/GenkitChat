import { genkit } from "genkit/beta";
import { logger } from "genkit/logging";
import {
  googleAI,
  gemini20FlashExp,
  gemini25ProExp0325,
} from "@genkit-ai/googleai";
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
import { z } from "zod"; // Import Zod here
import {
  MessageData,
  ToolRequestPart,
  ToolResponsePart,
  Part,
  GenerateResponse,
  GenerateResponseChunk,
} from "@genkit-ai/ai"; // Import necessary types
import { Session, SessionData, SessionStore } from "genkit/beta"; // Import Session types from beta

// Optional: API key check - Ensure env vars are available server-side
if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
  console.warn(
    "GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set. Google AI features may not work."
  );
}
if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "OPENAI_API_KEY environment variable not set. OpenAI features will not work."
  );
}

// Configure the Context7 MCP client
// Ensure the npx command can run in the Next.js server environment
const context7Client = mcpClient({
  // Define context7Client here
  name: "context7",
  serverProcess: {
    command: "npx",
    args: ["-y", "@upstash/context7-mcp@latest"],
  },
});

// Create and export the Genkit instance
export const aiInstance = genkit({
  plugins: [
    googleAI(), 
    context7Client, 
    openAI(),
    vertexAI(), // Add VertexAI for embeddings
    devLocalVectorstore([
      {
        indexName: "ragIndex", // Name for our vector store
        embedder: textEmbedding005, // Use the textEmbedding005 model
      },
    ])
  ],
});

// Export the indexer and retriever references
export const ragIndexerRef = devLocalIndexerRef("ragIndex");
export const ragRetrieverRef = devLocalRetrieverRef("ragIndex");

// Set log level
logger.setLogLevel("debug");

// Do not export model references directly if not needed externally
// The googleAI plugin should register these automatically.
// export { gemini20FlashExp, gemini25ProExp0325 };

console.log("Genkit instance initialized within Next.js server environment.");

// === Basic Chat Logic ===

// Define Temperature Preset type (if not already defined)
type TemperaturePreset = "precise" | "normal" | "creative";

// Update Input Schema to include new fields
const BasicChatInputSchema = z.object({
  userMessage: z.string(),
  modelId: z.string(),
  temperaturePreset: z.enum(["precise", "normal", "creative"]),
  maxTokens: z.number().int().positive(),
  sessionId: z
    .string()
    .optional()
    .describe("ID for the chat session to maintain history"),
});
type BasicChatInput = z.infer<typeof BasicChatInputSchema>;

const ToolInvocationSchema = z.object({
  name: z.string(),
  input: z.any().optional().describe("Input payload sent to the tool"),
  output: z.any().optional().describe("Output payload received from the tool"),
});
export type ToolInvocation = z.infer<typeof ToolInvocationSchema>;

// Update Output Schema to include sessionId
const BasicChatOutputSchema = z.object({
  response: z.string(),
  toolInvocations: z.array(ToolInvocationSchema).optional(),
  sessionId: z.string().describe("ID of the chat session used/created"), // Add sessionId
});
export type BasicChatOutput = z.infer<typeof BasicChatOutputSchema>; // Type now includes sessionId

// Map presets to temperature values
const presetTemperatures: Record<TemperaturePreset, number> = {
  precise: 0.2,
  normal: 0.7,
  creative: 1.0,
};

// Refined system prompts focusing on tone/persona
const systemPrompts: Record<TemperaturePreset, string> = {
  precise: `You are a precise and factual assistant. Provide concise, accurate answers. Avoid speculation or unnecessary creativity. Stick strictly to the user's query and information retrieved.`,
  normal: `You are a helpful and friendly assistant. Answer the user's query clearly and informatively. Maintain a balanced and neutral tone.`,
  creative: `You are a helpful, friendly, and creative assistant. Answer the user's query in an engaging and imaginative way. Feel free to be more conversational and explore possibilities.`,
};

// Define structure for streaming function return value
interface StreamAndResponse {
  stream: AsyncIterable<GenerateResponseChunk<any>>;
  responsePromise: Promise<GenerateResponse<any>>;
  sessionId: string; // Add sessionId here too
}

// === Simple In-Memory Session Store ===
class InMemorySessionStore implements SessionStore {
  private store = new Map<string, SessionData<any>>();

  async get(sessionId: string): Promise<SessionData<any> | undefined> {
    console.log(`[InMemoryStore] Getting session: ${sessionId}`);
    return this.store.get(sessionId);
  }

  async save(sessionId: string, sessionData: SessionData<any>): Promise<void> {
    console.log(`[InMemoryStore] Saving session: ${sessionId}`);
    this.store.set(sessionId, sessionData);
  }
}
// Create a single instance of the store for the server process
const memoryStore = new InMemorySessionStore();

// Wrapper function using aiInstance chat session logic
export async function runBasicChatFlowStream(
  input: BasicChatInput
): Promise<StreamAndResponse> {
  const { userMessage, modelId, temperaturePreset, maxTokens, sessionId } =
    input;

  const temperature = presetTemperatures[temperaturePreset];
  const systemPrompt = systemPrompts[temperaturePreset];

  let session: Session;
  let effectiveSessionId: string;

  if (sessionId) {
    console.log(`Loading existing session: ${sessionId}`);
    session = await aiInstance.loadSession(sessionId, { store: memoryStore });
    effectiveSessionId = sessionId;
  } else {
    console.log("Creating new session...");
    session = await aiInstance.createSession({ store: memoryStore });
    effectiveSessionId = session.id;
    console.log(`New session created with ID: ${effectiveSessionId}`);
  }

  // Determine model configuration based on provider and specific model constraints
  let modelConfig: any = {}; // Start with an empty config

  // Set token limit based on provider
  if (modelId.startsWith("openai/")) {
    modelConfig.max_completion_tokens = maxTokens;
    console.log(`Using OpenAI specific config: max_completion_tokens=${maxTokens}`);
  } else {
    modelConfig.maxOutputTokens = maxTokens;
    console.log(`Using standard Genkit config: maxOutputTokens=${maxTokens}`);
  }

  // Set temperature, but ONLY if the model is NOT openai/o4-mini
  // Assuming 'openai/o4-mini' is the correct ID causing the issue.
  if (modelId !== "openai/o4-mini") {
    modelConfig.temperature = temperature;
    console.log(`Setting temperature: ${temperature}`);
  } else {
    console.log(`Model ${modelId} does not support custom temperature. Using default.`);
    // Do not set temperature for o4-mini, let the API use its default (1.0)
  }

  // Get chat instance for this session
  const chat = session.chat({
    model: modelId,
    system: systemPrompt,
    tools: ["context7/resolve-library-id", "context7/get-library-docs"],
    config: modelConfig, // Use the dynamically determined config
  });

  // Send the user message using the session-specific chat
  const { stream, response } = await chat.sendStream(userMessage);

  return {
    stream: stream,
    responsePromise: response,
    sessionId: effectiveSessionId, // Return the session ID used
  };
}

// Export the flow variable itself
export const basicChatFlow = aiInstance.defineFlow(
  {
    name: "basicChatFlow",
    inputSchema: BasicChatInputSchema,
    outputSchema: BasicChatOutputSchema,
  },
  async (input: BasicChatInput): Promise<BasicChatOutput> => {
    const { userMessage, modelId } = input;
    const llmResponse = await aiInstance.generate({
      /* ... */
    });
    const responseText = llmResponse.text;
    const messages = (llmResponse as any)?.messages;
    const toolInvocations: ToolInvocation[] = [];
    if (messages && Array.isArray(messages)) {
      /* ... tool parsing ... */
    }
    // Add return statement
    return {
      response: responseText,
      toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
      sessionId: input.sessionId || "", // Use sessionId from input or generate a new one
    };
  }
);

console.log("runBasicChatFlowStream function defined (using ai.chat).");

// === Define RAG Augmented Chat Flow ===

// Schemas and Types (Importing RagEndpoint type if needed)
import { RagEndpoint } from "@/services/rag"; // Assuming this path is valid from /lib

const RagAugmentedChatInputSchema = z.object({
  ragEndpointId: z.string().describe("The ID of the RAG endpoint to use."),
  llmModelId: z.string().describe("The ID of the LLM model to use."),
  query: z.string().describe("The user query."),
});
export type RagAugmentedChatInput = z.infer<typeof RagAugmentedChatInputSchema>;

// Update RAG Output Schema
const RagAugmentedChatOutputSchema = z.object({
  response: z.string().describe("The LLM response augmented with RAG context."),
  toolInvocations: z.array(ToolInvocationSchema).optional(),
  // sessionId: z.string().describe("ID of the chat session used/created").optional() // Commented out for now
});
export type RagAugmentedChatOutput = z.infer<
  typeof RagAugmentedChatOutputSchema
>;

// RAG Tool Definition
const ragTool = aiInstance.defineTool(
  {
    name: "ragTool",
    description: "Retrieves relevant context from the specified RAG service.",
    inputSchema: z.object({
      ragEndpointId: z.string().describe("The ID of the RAG endpoint to use."),
      query: z.string().describe("The user query."),
    }),
    outputSchema: z
      .string()
      .describe("The context retrieved from the RAG service."),
  },
  async (input) => {
    // TODO: Implement the RAG retrieval logic here.
    console.log(
      `Calling RAG endpoint ${input.ragEndpointId} with query: ${input.query}`
    );
    return `[CONTEXT FROM RAG ENDPOINT ${input.ragEndpointId}]: Placeholder context for query: ${input.query}`;
  }
);

// RAG Prompt Definition
const ragPrompt = aiInstance.definePrompt({
  name: "ragAugmentedChatPrompt",
  tools: [ragTool, "context7/resolve-library-id", "context7/get-library-docs"],
  input: {
    schema: RagAugmentedChatInputSchema,
  },
  output: {
    schema: RagAugmentedChatOutputSchema,
  },
  prompt: `You are a helpful AI assistant. Use the provided context from the ragTool to answer the user's query. The available RAG endpoints are listed if relevant, focus on the one specified by ragEndpointId.

Query: {{{query}}}

Use the ragTool with the specified ragEndpointId to retrieve relevant context, then use ONLY that context to answer the query.
`,
});

// Export the flow variable itself
export const ragAugmentedChatFlow = aiInstance.defineFlow<
  typeof RagAugmentedChatInputSchema,
  typeof RagAugmentedChatOutputSchema
>(
  {
    name: "ragAugmentedChatFlow",
    inputSchema: RagAugmentedChatInputSchema,
    outputSchema: RagAugmentedChatOutputSchema,
  },
  async (input: RagAugmentedChatInput): Promise<RagAugmentedChatOutput> => {
    const { output } = await ragPrompt(input);
    if (!output) {
      throw new Error("Failed to generate response from ragPrompt");
    }
    // Add return statement
    return output;
  }
);

// Wrapper Function Export
export async function ragAugmentedChat(
  input: RagAugmentedChatInput
): Promise<RagAugmentedChatOutput> {
  console.warn("RAG chat currently does not support session history.");
  // Call the flow and return its output directly
  const result = await ragAugmentedChatFlow(input);
  return result;
}

console.log("ragAugmentedChatFlow defined.");

// === Define Endpoint Prompt Generator Flow Here ===

// Schemas and Types
const GenerateEndpointPromptInputSchema = z.object({
  llm: z
    .object({
      modelId: z.string(),
      modelName: z.string(),
    })
    .describe("The selected LLM, containing modelId and modelName."),
  ragEndpoint: z
    .object({
      endpointId: z.string(),
      endpointName: z.string(),
    })
    .describe(
      "The selected RAG endpoint, containing endpointId and endpointName."
    ),
});
export type GenerateEndpointPromptInput = z.infer<
  typeof GenerateEndpointPromptInputSchema
>;

const GenerateEndpointPromptOutputSchema = z.object({
  prompt: z
    .string()
    .describe("A starting prompt based on the selected LLM and RAG endpoint."),
});
export type GenerateEndpointPromptOutput = z.infer<
  typeof GenerateEndpointPromptOutputSchema
>;

// Prompt Definition
const endpointPrompt = aiInstance.definePrompt({
  name: "endpointPromptGeneratorPrompt",
  input: {
    schema: z.object({
      llmModelName: z.string().describe("The name of the selected LLM."),
      ragEndpointName: z
        .string()
        .describe("The name of the selected RAG endpoint."),
    }),
  },
  output: {
    schema: GenerateEndpointPromptOutputSchema, // Use existing schema
  },
  prompt: `You are an AI prompt engineer. Generate a starting prompt for a chat application using a RAG endpoint.

The LLM being used is: {{{llmModelName}}}
The RAG endpoint being used is: {{{ragEndpointName}}}

Provide a starting prompt that instructs the LLM to use the RAG endpoint to answer questions.
The prompt should be no more than 2 sentences long.
`,
});

// Export the flow variable itself
export const generateEndpointPromptFlow = aiInstance.defineFlow<
  typeof GenerateEndpointPromptInputSchema,
  typeof GenerateEndpointPromptOutputSchema
>(
  {
    name: "generateEndpointPromptFlow",
    inputSchema: GenerateEndpointPromptInputSchema,
    outputSchema: GenerateEndpointPromptOutputSchema,
  },
  async (
    input: GenerateEndpointPromptInput
  ): Promise<GenerateEndpointPromptOutput> => {
    const { output } = await endpointPrompt({
      llmModelName: input.llm.modelName,
      ragEndpointName: input.ragEndpoint.endpointName,
    });
    if (!output) {
      throw new Error("Failed to generate prompt from endpointPrompt");
    }
    // Add return statement
    return output;
  }
);

// Wrapper Function Export (keep this one)
export async function generateEndpointPrompt(
  input: GenerateEndpointPromptInput
): Promise<GenerateEndpointPromptOutput> {
  return generateEndpointPromptFlow(input);
}

console.log("generateEndpointPromptFlow defined.");

// Removed setInterval
