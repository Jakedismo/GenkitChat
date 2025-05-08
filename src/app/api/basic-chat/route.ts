import { runBasicChatFlowStream, ToolInvocation } from "@/lib/genkit-instance"; // Use streaming version, import ToolInvocation
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
  toolInvocations?: ToolInvocation[];
  sessionId: string;
}

// Helper to format Server-Sent Events (SSE)
function formatSSE(event: string, data: string): string {
  return `event: ${event}\\ndata: ${data}\\n\\n`;
}

// Restore manual POST handler
export async function POST(request: Request) {
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
      } = await runBasicChatFlowStream(validatedInput.data);

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
              controller.enqueue(
                encoder.encode(
                  formatSSE("chunk", JSON.stringify({ text: textChunk }))
                )
              );
            }
          }

          // Wait for the final response
          const finalResponse = await responsePromise;
          console.log(
            "Raw Final Response Object:",
            JSON.stringify(finalResponse, null, 2)
          );
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
          controller.enqueue(
            encoder.encode(
              formatSSE("final_response", JSON.stringify(finalResponseData))
            )
          );
        } catch (streamError) {
          console.error("Error during stream processing:", streamError);
          controller.enqueue(
            encoder.encode(
              formatSSE(
                "error",
                JSON.stringify({
                  error:
                    streamError instanceof Error
                      ? streamError.message
                      : "An error occurred during streaming.",
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
      // Send an SSE-formatted error back to the client.
      // Note: This assumes the error happens *before* the readableStream is returned.
      // If it happens after, the error handling within the stream itself should catch it.
      const errorPayload = JSON.stringify({ error: `Genkit Flow Error: ${errorMessage}` });
      // Manually construct an SSE response string for the error.
      const sseError = `event: error\ndata: ${errorPayload}\n\n`;
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
}
