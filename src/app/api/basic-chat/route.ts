import { initiateChatStream, ToolInvocation, ChatInput } from "@/lib/chat-utils"; // Use streaming version, import types
import { withGenkitServer } from "@/lib/server"; // Import server initialization wrapper
import { NextResponse } from "next/server";
import { z } from "zod";
// Import necessary types from @genkit-ai/ai
import {
  GenerateResponse, // Add GenerateResponse
  Part,
  ToolRequestPart,
  ToolResponsePart,
} from "@genkit-ai/ai";

const InputSchema = z.object({
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

// Define type for the final_response event payload
interface FinalResponseData {
  response: string;
  toolInvocations: ToolInvocation[]; // Always include this array, even if empty
  sessionId: string;
}

// Helper to format Server-Sent Events (SSE)
function formatSSE(event: string, data: string): string {
  // Verify data is a valid string to prevent serialization issues
  const safeData = typeof data === 'string' ? data : JSON.stringify({error: "Invalid data format"});
  
  try {
    // Validate JSON by parsing and re-stringifying to catch any serialization issues
    JSON.parse(safeData);
  } catch (e) {
    console.error(`Invalid JSON in formatSSE for event '${event}':`, e);
    // If JSON is invalid, return a valid fallback
    return `event: ${event}\ndata: ${JSON.stringify({error: `Invalid JSON data for ${event} event`})}\n\n`;
  }
  
  // Ensure SSE format is correct with actual newlines, not escaped ones
  return `event: ${event}\ndata: ${safeData}\n\n`;
}

// Restore manual POST handler
export async function POST(request: Request) {
  return withGenkitServer(async () => {
  try {
    const json = await request.json();
    console.log("SERVER_RECEIVED_PAYLOAD:", JSON.stringify(json, null, 2)); // Add this line
    const validatedInput = InputSchema.safeParse(json);

    if (!validatedInput.success) {
      console.error("SERVER_ZOD_VALIDATION_ERROR:", validatedInput.error.errors); // Log Zod's specific errors
      return NextResponse.json(
        { error: "Invalid input", details: validatedInput.error.errors },
        { status: 400 }
      );
    }
    console.log("SERVER_VALIDATED_INPUT:", JSON.stringify(validatedInput.data, null, 2)); // Add this

    // Pass the full validated data (including sessionId) to the stream function
    try {
      const {
        stream,
        responsePromise,
        sessionId: usedSessionId,
      } = await initiateChatStream(validatedInput.data as ChatInput);

      const readableStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
        // Use const and specific types
        const toolInvocations: ToolInvocation[] = [];
        // Initialize with full structure, will be completed before sending final_response
        const finalResponseData: FinalResponseData = {
          response: "",
          toolInvocations: [], // Ensure this key is always present
          sessionId: "", // Will be updated with the actual sessionId later
        };

        try {
          // Stream text chunks from Genkit stream
          for await (const chunk of stream) {
            const textChunk = chunk.text;
            if (textChunk) {
              // Check if the text chunk contains an error message (from chat-utils.ts)
              if (textChunk.startsWith("Error:") || textChunk.startsWith("Error in stream processing:")) {
                controller.enqueue(
                  encoder.encode(
                    formatSSE("error", JSON.stringify({ error: textChunk }))
                  )
                );
                continue;
              }
              
              // Double-escape special characters in JSON to prevent parsing issues
              const safeTextChunk = textChunk.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
              controller.enqueue(
                encoder.encode(
                  formatSSE("chunk", JSON.stringify({ text: safeTextChunk }))
                )
              );
            }
          }

          // Wait for the final response
          let finalResponse;
          try {
            finalResponse = await responsePromise;
            console.log(
              "Raw Final Response Object:",
              JSON.stringify(finalResponse, null, 2)
            );
          } catch (responseError) {
            console.error("Error getting final response:", responseError);
            // We already handled streaming errors, so just return early
            return;
          }
          // Cast to GenerateResponse to access properties safely
          finalResponseData.response = (finalResponse as GenerateResponse)?.text ?? ""; // Store final text

          // Attempt to parse tool calls
          const messages = (finalResponse as GenerateResponse)?.messages;
          if (messages && Array.isArray(messages)) {
            console.log(
              `Found ${messages.length} messages in history for tool parsing.`
            );
            const toolRequests = new Map<string, ToolRequestPart>();
            // Iterate through the HISTORY messages to find tool request/response pairs
            for (const message of messages) {
              if (message.role === "tool" && Array.isArray(message.content)) {
                message.content.forEach((part: Part) => {
                  const toolResponsePart = part as ToolResponsePart;
                  const reqRef = toolResponsePart.toolResponse?.ref;
                  if (reqRef && toolRequests.has(reqRef)) {
                    const requestPart = toolRequests.get(reqRef)!;
                    toolInvocations.push({
                      name: requestPart.toolRequest.name,
                      input: requestPart.toolRequest.input as Record<string, unknown> | undefined,
                      output: toolResponsePart.toolResponse?.output as Record<string, unknown> | undefined,
                    });
                    toolRequests.delete(reqRef);
                  }
                });
              } else if (
                message.role === "model" &&
                Array.isArray(message.content)
              ) {
                message.content.forEach((part: Part) => {
                  if (part.toolRequest?.ref) {
                    toolRequests.set(
                      part.toolRequest.ref,
                      part as ToolRequestPart
                    );
                  }
                });
              }
            }

            if (toolInvocations.length > 0) {
              console.log(
                `Extracted ${toolInvocations.length} tool invocations.`
              );
              finalResponseData.toolInvocations = toolInvocations; // Store tool calls
            } else {
              console.log("No tool invocations extracted from history.");
            }
          } else {
            console.warn(
              "Could not find 'messages' array on finalResponse object for tool parsing."
            );
          }

          // Add tool usage indicator to responseText if tools were used
          if (finalResponseData.toolInvocations && finalResponseData.toolInvocations.length > 0) {
            // Create a unique list of tool names
            const uniqueToolNames = Array.from(
              // Type of 'inv' is inferred from 'toolInvocations: ToolInvocation[]'
              new Set(finalResponseData.toolInvocations.map((inv) => inv.name)) 
            );
            // Ensure response is a string before appending
            finalResponseData.response = String(finalResponseData.response || "") + `\\n\\n[Tools Used: ${uniqueToolNames.join(', ')}]`;
          }

          // Send final metadata (including session ID used/created)
          finalResponseData.sessionId = usedSessionId;
          
          // Process the response text to ensure it can be safely included in JSON
          // First convert to string if it's not already
          let safeResponse = String(finalResponseData.response || "");
          
          // Handle trailing backslashes which often cause JSON parsing errors
          if (safeResponse.endsWith('\\')) {
            console.warn("Response ends with backslash, adding extra escaping");
            // Count the number of trailing backslashes
            let trailingCount = 0;
            for (let i = safeResponse.length - 1; i >= 0; i--) {
              if (safeResponse[i] === '\\') {
                trailingCount++;
              } else {
                break;
              }
            }
            // For odd number of trailing backslashes, add one more to properly escape
            if (trailingCount % 2 !== 0) {
              safeResponse += '\\';
            }
          }
          
          // Apply comprehensive character escaping
          safeResponse = safeResponse
            .replace(/\\/g, '\\\\') // Must come first to avoid double-escaping
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            .replace(/"/g, '\\"');
          
          // Create a safe copy of the data with the properly escaped response
          const safeResponseData = {
            ...finalResponseData,
            response: safeResponse
          };
          
          try {
            // Use a more controlled approach to JSON serialization
            // First stringify each field separately for better error isolation
            const responseField = JSON.stringify(safeResponse);
            const toolInvocationsField = JSON.stringify(safeResponseData.toolInvocations || []);
            const sessionIdField = JSON.stringify(safeResponseData.sessionId || "");
            
            // Build the JSON manually to ensure proper formatting
            const jsonString = `{"response":${responseField},"toolInvocations":${toolInvocationsField},"sessionId":${sessionIdField}}`;
            
            // Verify the constructed JSON is valid
            JSON.parse(jsonString);
            
            controller.enqueue(
              encoder.encode(
                formatSSE("final_response", jsonString)
              )
            );
            console.log("Successfully sent final_response event");
          } catch (jsonError) {
            console.error("Error serializing final_response to JSON:", jsonError);
            console.error("JSON serialization error details:", jsonError);
            
            // Try to identify specific issues in the response for debugging
            if (safeResponse.includes('\\')) {
              console.warn("Response contains backslashes which may cause serialization issues:", 
                Array.from(safeResponse).map(c => c === '\\' ? '\\\\' : c).join(''));
            }
            
            // Send a simplified fallback response if JSON serialization fails
            const fallbackResponse = {
              response: "The server encountered an error formatting the response. This may be due to special characters in the text.",
              toolInvocations: [],
              sessionId: usedSessionId
            };
            controller.enqueue(
              encoder.encode(
                formatSSE("final_response", JSON.stringify(fallbackResponse))
              )
            );
          }
        } catch (streamError) {
          console.error("Error during stream processing:", streamError);
            
          // Check for tool-related errors
          const errorStr = String(streamError);
          let errorMessage = streamError instanceof Error ? streamError.message : "An error occurred during streaming.";
            
          if (errorStr.includes("Unable to determine type of of tool:") || 
              errorStr.includes("tavilySearch") ||
              errorStr.includes("tavily")) {
            errorMessage = "The Tavily Search tool is not properly configured. Please make sure TAVILY_API_KEY is set in your environment variables.";
          } else if (errorStr.includes("perplexitySearch") || 
              errorStr.includes("perplexityDeepResearch") ||
              errorStr.includes("Perplexity")) {
            errorMessage = "The Perplexity tool is not properly configured. Please make sure PERPLEXITY_API_KEY is set in your environment variables.";
          }
            
          // Process error message for safe JSON encoding with comprehensive character escaping
          const safeErrorMessage = errorMessage
            .replace(/\\/g, '\\\\') // Must come first to avoid double-escaping
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            .replace(/"/g, '\\"');
          controller.enqueue(
            encoder.encode(
              formatSSE(
                "error",
                JSON.stringify({
                  error: safeErrorMessage
                })
              )
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
    } catch (genkitError) {
      console.error("SERVER_ERROR_CALLING_GENKIT_FLOW:", genkitError);
      const errorMessage = genkitError instanceof Error ? genkitError.message : "Genkit flow failed";
      
      // Check for specific tool-related errors
      const errorStr = String(genkitError);
      if (errorStr.includes("Unable to determine type of of tool:") || 
          errorStr.includes("tavilySearch") ||
          errorStr.includes("tavily")) {
        const toolError = "The Tavily Search tool is not properly configured. Please make sure TAVILY_API_KEY is set in your environment variables.";
        console.error("TOOL_CONFIGURATION_ERROR:", toolError);
        const safeToolError = toolError
          .replace(/\\/g, '\\\\') // Must come first to avoid double-escaping
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
          .replace(/"/g, '\\"');
        const errorPayload = JSON.stringify({ error: safeToolError });
        const sseError = formatSSE("error", errorPayload);
        return new NextResponse(sseError, {
          status: 500,
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
        });
      } else if (errorStr.includes("perplexitySearch") || 
          errorStr.includes("perplexityDeepResearch") ||
          errorStr.includes("Perplexity")) {
        const toolError = "The Perplexity tool is not properly configured. Please make sure PERPLEXITY_API_KEY is set in your environment variables.";
        console.error("TOOL_CONFIGURATION_ERROR:", toolError);
        const safeToolError = toolError
          .replace(/\\/g, '\\\\') // Must come first to avoid double-escaping
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
          .replace(/"/g, '\\"');
        const errorPayload = JSON.stringify({ error: safeToolError });
        const sseError = formatSSE("error", errorPayload);
        return new NextResponse(sseError, {
          status: 500,
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
        });
      }
      
      // Send an SSE-formatted error back to the client.
      // Note: This assumes the error happens *before* the readableStream is returned.
      // If it happens after, the error handling within the stream itself should catch it.
      const safeErrorMessage = errorMessage
        .replace(/\\/g, '\\\\') // Must come first to avoid double-escaping
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
        .replace(/"/g, '\\"');
      const errorPayload = JSON.stringify({ error: `Genkit Flow Error: ${safeErrorMessage}` });
      // Use the formatSSE helper for consistency
      const sseError = formatSSE("error", errorPayload);
       return new NextResponse(sseError, {
         status: 500, // Or an appropriate error status
         headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
       });
    }
  } catch (error) {
    // This top-level catch handles errors outside the Genkit flow call,
    // e.g., issues with request.json() or initial Zod parsing if not caught more specifically.
    console.error("Error in basic-chat API route (initial setup or other unexpected error):", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: "Failed to process chat request", details: errorMessage },
      { status: 500 }
    );
  }
  });
}
