import { runBasicChatFlowStream } from "@/lib/genkit-instance"; // Use streaming version
import { NextResponse } from "next/server";
import { z } from "zod";
// Import necessary types from @genkit-ai/ai
import {
  GenerateResponseChunk,
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

// Helper to format Server-Sent Events (SSE)
function formatSSE(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

// Restore manual POST handler
export async function POST(request: Request) {
  try {
    const json = await request.json();
    const validatedInput = InputSchema.safeParse(json);

    if (!validatedInput.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validatedInput.error.errors },
        { status: 400 }
      );
    }

    // Pass the full validated data (including sessionId) to the stream function
    const {
      stream,
      responsePromise,
      sessionId: usedSessionId,
    } = await runBasicChatFlowStream(validatedInput.data);

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let toolInvocations: any[] = [];
        let finalResponseData: any = {}; // To store final text/metadata

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
          finalResponseData.response = (finalResponse as any)?.text ?? ""; // Store final text

          // Attempt to parse tool calls
          const messages = (finalResponse as any)?.messages;
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
                      input: requestPart.toolRequest.input,
                      output: toolResponsePart.toolResponse?.output,
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
  } catch (error) {
    console.error("Error in basic-chat API route (initial setup):", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: "Failed to process chat request", details: errorMessage },
      { status: 500 }
    );
  }
}
