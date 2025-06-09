import { aiInstance } from "@/genkit-server";
import { createModelKey } from "@/ai/flows/ragFlow"; // Corrected import path
import type {
  GenerateResponseData,
  MessageData,
  GenerateResponseChunk, // Represents a chunk from ai.generateStream().stream
} from "genkit"; // Use stable import for types
import { v4 as uuidv4 } from "uuid";

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
  // Context7 tools
  context7ResolveLibraryIdEnabled?: boolean;
  context7GetLibraryDocsEnabled?: boolean;
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
    case "precise":
      return 0.2;
    case "normal":
      return 0.7;
    case "creative":
      return 1.0;
    default:
      return 0.7; // Default to normal
  }
}

// Adapts Genkit's GenerateResponseChunk to simple { text: string } chunks
async function* adaptGenkitStream(
  genkitStream: AsyncIterable<GenerateResponseChunk<unknown>>
): AsyncIterable<{ text: string }> {
  try {
    for await (const chunk of genkitStream) {
      // Handle multiple message content parts (Gemini-specific format)
      // Use type assertion since the Genkit types don't fully reflect the actual structure
      const anyChunk = chunk as any;
      
      if (anyChunk.message?.content) {
        const content = anyChunk.message.content;
        if (Array.isArray(content)) {
          // Content is an array of parts, each potentially with text
          for (const part of content) {
            if (part.text) {
              yield { text: part.text };
              console.log(`Yielding text from message.content part: ${part.text.substring(0, 50)}...`);
            }
          }
        }
      }
      
      // Standard text field (common in most models)
      else if (chunk.text) {
        yield { text: chunk.text };
        console.log(`Yielding text from chunk.text: ${chunk.text.substring(0, 50)}...`);
      }

      // Handle tool-related chunks if present
      if (anyChunk.toolRequests) {
        console.log(`Tool requests: ${JSON.stringify(anyChunk.toolRequests)}`);
      }
    }
  } catch (error) {
    console.error("Error processing stream chunks:", error);
    yield {
      text: `Error in stream processing: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

// Main function to initiate a chat stream
export async function initiateChatStream(
  input: ChatInput
): Promise<ChatStreamOutput> {
  const currentSessionId = input.sessionId || uuidv4();
  const temperature = mapTemperature(input.temperaturePreset);

  // Collect names of enabled tools first so we can pass them to the prompt templates
  const enabledToolNames: string[] = [];
  if (input.tavilySearchEnabled) enabledToolNames.push("tavilySearch");
  if (input.tavilyExtractEnabled) enabledToolNames.push("tavilyExtract");
  if (input.perplexitySearchEnabled) enabledToolNames.push("perplexitySearch");
  if (input.perplexityDeepResearchEnabled)
    enabledToolNames.push("perplexityDeepResearch");
  // Add context7 tools
  if (input.context7ResolveLibraryIdEnabled)
    enabledToolNames.push("context7/resolve-library-id");
  if (input.context7GetLibraryDocsEnabled)
    enabledToolNames.push("context7/get-library-docs");

  console.log(`Enabled tools: ${enabledToolNames.join(", ")}`);
  
  // Initialize messages array
  const messages: MessageData[] = [];
  
  // Initialize an empty system message
  let systemMessage: MessageData | null = null;
  
  try {
    // Load the appropriate prompt template based on the temperature preset
    let promptTemplate;
    switch (input.temperaturePreset) {
      case "precise":
        promptTemplate = await aiInstance.prompt("basic_chat_precise");
        break;
      case "creative":
        promptTemplate = await aiInstance.prompt("basic_chat_creative");
        break;
      case "normal":
      default:
        promptTemplate = await aiInstance.prompt("basic_chat_normal");
        break;
    }
    
    // Apply the prompt template with the tools
    const promptResult = await promptTemplate({
      modelId: createModelKey(input.modelId),
      tools: enabledToolNames,
    });
    
    // Use the first message from the prompt result as our system prompt
    if (promptResult.messages && promptResult.messages.length > 0) {
      // Store the system message from the prompt template
      systemMessage = promptResult.messages[0];
      console.log("System prompt from template loaded successfully");
    }
  } catch (promptError) {
    console.error("Error loading prompt template:", promptError);
    console.log("Falling back to basic system message");
    // Create a fallback system message
    systemMessage = { 
      role: "system", 
      content: [{ 
        text: `You are a helpful assistant. You have access to the following tools: ${enabledToolNames.join(", ")}` 
      }] 
    };
  }
  
  // Add the system message to the messages array
  if (systemMessage) {
    messages.push(systemMessage);
  }

  // Prepend history if provided
  if (input.history && input.history.length > 0) {
    messages.push(...input.history);
  }
  // Add current user message
  messages.push({ role: "user", content: [{ text: input.userMessage }] });

  // Tools already collected and configured above

  // Verify if API keys are set when tools are enabled and log warnings appropriately
  if (
    (input.tavilySearchEnabled || input.tavilyExtractEnabled) &&
    !process.env.TAVILY_API_KEY
  ) {
    console.warn(
      "Tavily tools enabled but TAVILY_API_KEY environment variable is not set"
    );
  }

  if (
    (input.perplexitySearchEnabled || input.perplexityDeepResearchEnabled) &&
    !process.env.PERPLEXITY_API_KEY
  ) {
    console.warn(
      "Perplexity tools enabled but PERPLEXITY_API_KEY environment variable is not set"
    );
  }

  if (
    input.context7ResolveLibraryIdEnabled ||
    input.context7GetLibraryDocsEnabled
  ) {
    console.log("Context7 tools enabled");
  }

  // Log which tools are being enabled
  if (enabledToolNames.length > 0) {
    console.log(
      `Using tools: ${enabledToolNames.join(", ")} with maxTokens: ${
        input.maxTokens
      }`
    );
  }

  try {
    // Log the maxTokens parameter for debugging
    console.log(`Preparing to generate with maxTokens: ${input.maxTokens}`);

    // Check for missing API keys for enabled tools before making the API call
    if (input.tavilySearchEnabled && !process.env.TAVILY_API_KEY) {
      throw new Error(
        "Tavily Search tool requires a TAVILY_API_KEY environment variable"
      );
    }

    if (input.tavilyExtractEnabled && !process.env.TAVILY_API_KEY) {
      throw new Error(
        "Tavily Extract tool requires a TAVILY_API_KEY environment variable"
      );
    }

    if (input.perplexitySearchEnabled && !process.env.PERPLEXITY_API_KEY) {
      throw new Error(
        "Perplexity Search tool requires a PERPLEXITY_API_KEY environment variable"
      );
    }

    if (
      input.perplexityDeepResearchEnabled &&
      !process.env.PERPLEXITY_API_KEY
    ) {
      throw new Error(
        "Perplexity Deep Research tool requires a PERPLEXITY_API_KEY environment variable"
      );
    }

    // Context7 tools don't need specific API keys as they're handled by the MCP client

    // Ensure maxTokens is a number and has a reasonable value
    const maxOutputTokens = Math.max(100, Number(input.maxTokens) || 4096);
    console.log(
      `Using model: ${input.modelId} with maxOutputTokens: ${maxOutputTokens}`
    );

    // Call Genkit's generateStream function
    // This function returns an object immediately, which contains the stream and a response promise.
    const generationAPI = aiInstance.generateStream({
      model: createModelKey(input.modelId), // Use createModelKey helper to avoid stringification warnings
      messages: messages,
      config: {
        temperature,
        maxOutputTokens: maxOutputTokens, // Use validated maxTokens
      },
      tools: enabledToolNames.length > 0 ? enabledToolNames : undefined,
    });

    // Get the stream of `GenerateResponseChunk` objects
    // Add type assertion to fix TypeScript error with potential never[] type
    const rawStream: AsyncIterable<GenerateResponseChunk<unknown>> =
      generationAPI.stream as AsyncIterable<GenerateResponseChunk<unknown>>;

    // Adapt the raw Genkit stream to the { text: string } format expected by the route
    const adaptedStream = adaptGenkitStream(rawStream);

    // Get the promise for the full GenerateResponseData
    const responsePromise: Promise<GenerateResponseData> =
      generationAPI.response;

    return {
      stream: adaptedStream,
      responsePromise: responsePromise,
      sessionId: currentSessionId,
    };
  } catch (error) {
    console.error("Error initializing chat stream:", error);

    // Format error message based on error type
    let errorMessage = `Error: ${
      error instanceof Error ? error.message : String(error)
    }`;

    // Check for specific tool-related errors
    const errorString = String(error);
    if (
      errorString.includes("Tavily Search tool") ||
      errorString.includes("Tavily Extract tool") ||
      errorString.includes("TAVILY_API_KEY")
    ) {
      errorMessage =
        "Error: The Tavily tool requires an API key. Please add your TAVILY_API_KEY to the environment variables.";
    } else if (
      errorString.includes("Perplexity Search tool") ||
      errorString.includes("Perplexity Deep Research tool") ||
      errorString.includes("PERPLEXITY_API_KEY")
    ) {
      errorMessage =
        "Error: The Perplexity tool requires an API key. Please add your PERPLEXITY_API_KEY to the environment variables.";
    } else if (errorString.includes("Unable to determine type of of tool:")) {
      if (
        errorString.includes("tavilySearch") ||
        errorString.includes("tavilyExtract")
      ) {
        errorMessage =
          "Error: The Tavily tool is not properly configured. Please make sure TAVILY_API_KEY is set in your environment variables.";
      } else if (
        errorString.includes("perplexitySearch") ||
        errorString.includes("perplexityDeepResearch")
      ) {
        errorMessage =
          "Error: The Perplexity tool is not properly configured. Please make sure PERPLEXITY_API_KEY is set in your environment variables.";
      }
    }

    // Create a custom error stream that will return the error to the client
    const errorStream = (async function* () {
      // Clean up the error message for client display
      const clientErrorMessage = errorMessage.replace(/^Error: /, "");
      yield { text: clientErrorMessage };
    })();

    // Create a rejected promise that includes error details
    const errorPromise = Promise.reject(
      new Error(
        `Failed to initialize chat: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );

    // Return a valid ChatStreamOutput structure with proper types
    // The TypeScript error occurs because the return type needs explicit typing
    return {
      stream: errorStream as AsyncIterable<{ text: string }>,  // Add proper type assertion
      responsePromise: errorPromise as Promise<GenerateResponseData>,  // Add proper type assertion
      sessionId: currentSessionId,
    };
  }
}
