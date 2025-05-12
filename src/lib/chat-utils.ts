// Import types separately to avoid circular dependencies
import type {
  GenerateResponseData,
  MessageData,
  GenerateResponseChunk, // Represents a chunk from ai.generateStream().stream
} from "genkit/beta";
import { v4 as uuidv4 } from 'uuid';

// Dynamically import the aiInstance to break potential circular dependencies
let aiInstanceModule: any = null;

// This interface is used by the calling API route (basic-chat/route.ts)
// to structure tool invocation data extracted from the final response.
export interface ToolInvocation {
  name: string;
  input?: Record<string, unknown> | undefined;
  output?: Record<string, unknown> | undefined;
}

// Input structure for the chat stream initialization
export interface ChatInput {
  userMessage: string;
  modelId: string; // Expected to be a Genkit-compatible model name string, e.g., "googleAI/gemini-pro"
  temperaturePreset: "precise" | "normal" | "creative";
  maxTokens: number;
  sessionId?: string; // Optional session ID for continuing conversations
  history?: MessageData[]; // Optional message history
  // Tool flags - these correspond to Genkit tool names registered with aiInstance
  tavilySearchEnabled?: boolean;
  tavilyExtractEnabled?: boolean;
  perplexitySearchEnabled?: boolean;
  perplexityDeepResearchEnabled?: boolean;
}

// Output structure, matching what basic-chat/route.ts expects
export interface ChatStreamOutput {
  stream: AsyncIterable<{ text: string }>; // Stream of text chunks
  responsePromise: Promise<GenerateResponseData>; // Promise for the full Genkit response object
  sessionId: string; // Session ID used or generated
}

// Maps descriptive temperature presets to numerical values
function mapTemperature(preset: "precise" | "normal" | "creative"): number {
  switch (preset) {
    case "precise": return 0.2;
    case "normal": return 0.7;
    case "creative": return 1.0;
    default: return 0.7; // Default to normal
  }
}

// Adapts Genkit's GenerateResponseChunk to simple { text: string } chunks
async function* adaptGenkitStream(genkitStream: AsyncIterable<GenerateResponseChunk<unknown>>): AsyncIterable<{ text: string }> {
  try {
    for await (const chunk of genkitStream) {
      // GenerateResponseChunk typically has a 'text' field for the textual content of the chunk.
      // It can also contain other information like tool calls, which are handled by the
      // full responsePromise in the API route.
      // We use chunk.text, following common Genkit stream examples.
      if (chunk.text) {
        yield { text: chunk.text };
      }
      
      // Handle tool-related chunks if present
      if (chunk.toolInvocation) {
        console.log(`Tool invocation: ${JSON.stringify(chunk.toolInvocation)}`);
      }
    }
  } catch (error) {
    console.error("Error processing stream chunks:", error);
    yield { text: `Error in stream processing: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Main function to initiate a chat stream
export async function initiateChatStream(input: ChatInput): Promise<ChatStreamOutput> {
  const currentSessionId = input.sessionId || uuidv4();
  const temperature = mapTemperature(input.temperaturePreset);

  const messages: MessageData[] = [];

  // Prepend history if provided
  if (input.history && input.history.length > 0) {
    messages.push(...input.history);
  }
  // Add current user message
  messages.push({ role: "user", content: [{ text: input.userMessage }] });

  // Collect names of enabled tools
  const enabledToolNames: string[] = [];
  if (input.tavilySearchEnabled) enabledToolNames.push("tavilySearch");
  if (input.tavilyExtractEnabled) enabledToolNames.push("tavilyExtract");
  if (input.perplexitySearchEnabled) enabledToolNames.push("perplexitySearch");
  if (input.perplexityDeepResearchEnabled) enabledToolNames.push("perplexityDeepResearch");
  
  // Verify if Tavily API key is set when Tavily tools are enabled
  if ((input.tavilySearchEnabled || input.tavilyExtractEnabled) && !process.env.TAVILY_API_KEY) {
    console.warn("Tavily tools enabled but TAVILY_API_KEY environment variable is not set");
  }
  
  // Log which tools are being enabled
  if (enabledToolNames.length > 0) {
    console.log(`Using tools: ${enabledToolNames.join(', ')}`);
  }

  try {
    // Call Genkit's generateStream function
    // This function returns an object immediately, which contains the stream and a response promise.
    const generationAPI = aiInstance.generateStream({
      model: input.modelId, // Pass the model name string directly
      messages: messages,
      config: {
        temperature,
        maxOutputTokens: input.maxTokens,
      },
      tools: enabledToolNames.length > 0 ? enabledToolNames : undefined,
    });

    // Get the stream of `GenerateResponseChunk` objects
    const rawStream: AsyncIterable<GenerateResponseChunk<unknown>> = generationAPI.stream;

    // Adapt the raw Genkit stream to the { text: string } format expected by the route
    const adaptedStream = adaptGenkitStream(rawStream);

    // Get the promise for the full GenerateResponseData
    const responsePromise: Promise<GenerateResponseData> = generationAPI.response;

    return {
      stream: adaptedStream,
      responsePromise: responsePromise,
      sessionId: currentSessionId,
    };
  } catch (error) {
    console.error("Error initializing chat stream:", error);
    
    // Create a custom error stream that will return the error to the client
    const errorStream = (async function* () {
      yield { text: `Error: ${error instanceof Error ? error.message : String(error)}` };
    })();
    
    // Create a rejected promise that includes error details
    const errorPromise = Promise.reject(
      new Error(`Failed to initialize chat: ${error instanceof Error ? error.message : String(error)}`)
    );
    
    // Still return a valid ChatStreamOutput structure so the UI can display the error
    return {
      stream: errorStream,
      responsePromise: errorPromise,
      sessionId: currentSessionId,
    };
  }
}