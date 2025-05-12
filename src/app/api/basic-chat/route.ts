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
import { analyzeResponse, repairTruncatedResponse, logResponseDebugInfo } from "@/utils/responseDebug";

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

    // For final_response events, try to recover the JSON by re-escaping
    if (event === 'final_response' && typeof data === 'string') {
      try {
        // Try to sanitize the JSON data
        const sanitizedData = data
          .replace(/\\"/g, '"')  // Replace escaped quotes
          .replace(/\\n/g, '\n') // Replace escaped newlines
          .replace(/\\r/g, '\r') // Replace escaped carriage returns
          .replace(/\\t/g, '\t') // Replace escaped tabs
          .replace(/\\\\/g, '\\'); // Replace double backslashes
        
        try {
          // Try to parse the sanitized data
          const parsedData = JSON.parse(sanitizedData);
          return `event: ${event}\ndata: ${JSON.stringify(parsedData)}\n\n`;
        } catch (sanitizeError) {
          // If sanitized parsing fails, use fallback
          console.error("Sanitized JSON parsing failed:", sanitizeError);
        }
        
        // Create a simpler valid JSON with just the essential data
        const fallbackData = JSON.stringify({
          response: "Response could not be properly formatted. Please try again.",
          toolInvocations: [],
          sessionId: ""
        });
        console.log(`Using fallback data for invalid JSON in ${event} event`);
        return `event: ${event}\ndata: ${fallbackData}\n\n`;
      } catch (fallbackError) {
        console.error("Even fallback JSON creation failed:", fallbackError);
      }
    }

    // If all else fails, return a generic error message
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
              // Process text chunk for streaming
              const safeTextChunk = textChunk
                .replace(/\\/g, '\\\\')
                .replace(/\n/g, '\\\\n')
                .replace(/\r/g, '\\\\r');
              
              // Store full chunks for debugging
              if (!finalResponseData.chunks) {
                finalResponseData.chunks = [];
              }
              finalResponseData.chunks.push(safeTextChunk);
              
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
            
            // Debug the response to detect potential issues
            logResponseDebugInfo("finalResponse", finalResponse);
          } catch (responseError) {
            console.error("Error getting final response:", responseError);
            // We already handled streaming errors, so just return early
            return;
          }
          // Store the raw response for debugging
          console.log("Response type:", typeof finalResponse);
          
          // Process candidates array if available to ensure we get all content
          if ((finalResponse as any)?.custom?.candidates?.length > 0) {
            const candidate = (finalResponse as any).custom.candidates[0];
            if (candidate.content?.parts) {
              // For structured content with parts, preserve the structure
              finalResponseData.structuredResponse = candidate.content;
              
              // If we have Parts array with text, join them for the response
              const textParts = candidate.content.parts
                .map((part: any) => part.text || '')
                .filter(Boolean);
                
              console.log(`Extracted ${textParts.length} text parts from candidate`);
              finalResponseData.response = textParts.join('');
              
              // Check if candidate parts might indicate truncation
              const analysis = analyzeResponse(candidate.content.parts);
              if (analysis.isTruncated) {
                console.warn("Candidate parts appear to be truncated:", analysis.truncationDetails);
                
                // Try to repair truncated content
                finalResponseData.response = repairTruncatedResponse(candidate.content.parts);
                console.log("Attempted repair on truncated response");
              }
            } else {
              finalResponseData.response = candidate.content?.text || '';
            }
          } else {
            // Fallback to standard text property
            finalResponseData.response = (finalResponse as GenerateResponse)?.text ?? ""; // Store final text
          }
          
          // Analyze the final processed response
          const finalAnalysis = analyzeResponse(finalResponseData.response);
          if (finalAnalysis.isTruncated) {
            console.warn("Final response appears to be truncated:", finalAnalysis.truncationDetails);
            finalResponseData.response = repairTruncatedResponse(finalResponseData.response);
            console.log("Applied repairs to truncated final response");
          }
          
          // If we collected chunks during streaming, use them as a backup
          if (finalResponseData.chunks && 
              finalResponseData.chunks.length > 0 && 
              (!finalResponseData.response || finalResponseData.response.length === 0)) {
            console.log(`No response text found, using ${finalResponseData.chunks.length} collected chunks`);
            finalResponseData.response = finalResponseData.chunks.join('');
          }

          // Attempt to parse tool calls
          const messages = (finalResponse as GenerateResponse)?.messages;
          let tavilyUrls: string[] = []; // Array to store Tavily URLs
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
                    const toolName = requestPart.toolRequest.name;
                    const toolOutput = toolResponsePart.toolResponse?.output as Record<string, unknown> | undefined;

                    toolInvocations.push({
                      name: toolName,
                      input: requestPart.toolRequest.input as Record<string, unknown> | undefined,
                      output: toolOutput,
                    });

                    // Specifically extract Tavily URLs
                    if (toolName === 'tavilySearch' && toolOutput && Array.isArray(toolOutput.urls)) {
                      tavilyUrls = toolOutput.urls as string[];
                      console.log(`Extracted ${tavilyUrls.length} Tavily URLs.`);
                    }
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

          // Append formatted Tavily URLs if they exist
          if (tavilyUrls.length > 0) {
            let sourcesText = "\\n\\n**Sources:**\\n";
            tavilyUrls.forEach((url, index) => {
              // Basic formatting: Numbered list with clickable links
              sourcesText += `${index + 1}. [${url}](${url})\\n`;
            });
            finalResponseData.response += sourcesText; // Append to the LLM's response
            console.log("Appended formatted Tavily sources to response.");
          }

          // Send final metadata (including session ID used/created)
          finalResponseData.sessionId = usedSessionId;
          
          // Log the final response size
          console.log(`Sending final response: ${
            typeof finalResponseData.response === 'string' 
              ? finalResponseData.response.length + ' characters' 
              : 'non-string type'
          }`);
          
          // Clean up any temporary properties that shouldn't be sent to the client
          delete finalResponseData.chunks;

          // Carefully construct the final response object to avoid JSON serialization issues
          const cleanResponseData = {
            response: String(finalResponseData.response || ""), // Ensure response is string
            toolInvocations: finalResponseData.toolInvocations || [],
            sessionId: finalResponseData.sessionId || ""
          };

          // Use built-in JSON.stringify with a replacer function to handle any remaining special cases
          const jsonString = JSON.stringify(cleanResponseData, (key, value) => {
            // For string values, ensure any remaining special characters are handled
            if (typeof value === 'string') {
              // Apply comprehensive character escaping
              return value
                .replace(/\\/g, '\\\\')    // Must come first to avoid double-escaping
                .replace(/\n/g, '\\n')     // Newlines
                .replace(/\r/g, '\\r')     // Carriage returns
                .replace(/\t/g, '\\t')     // Tabs
                .replace(/"/g, '\\"')      // Quotes
                .replace(/[\u0000-\u001F]/g, match => `\\u${match.charCodeAt(0).toString(16).padStart(4, '0')}`); // Control chars
            }
            return value;
          });

          // Verify the constructed JSON is valid by parsing it
          try {
            JSON.parse(jsonString);
            // Log a portion of the JSON for debugging
             console.log(`Final response JSON (first 100 chars): ${jsonString.substring(0, 100)}...`);
          } catch (parseError) {
             console.error("Constructed final_response JSON is invalid:", parseError);
             // Handle the error - maybe send a fallback response
             const fallbackResponse = {
              response: "Error: Could not serialize final response.",
              toolInvocations: [],
              sessionId: usedSessionId
             };
             controller.enqueue(
              encoder.encode(
                formatSSE("final_response", JSON.stringify(fallbackResponse))
              )
             );
             // Close the stream early due to serialization error
             controller.close();
             return; // Exit the start function
          }

          controller.enqueue(
            encoder.encode(
              formatSSE("final_response", jsonString)
            )
          );
          console.log("Successfully sent final_response event");
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