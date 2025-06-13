import { documentQaStreamFlow, RagFlowInput } from "@/ai/flows/ragFlow";
import { withGenkitServer } from "@/lib/server";
import {
  generateRagSessionId,
  MAX_UPLOAD_SIZE,
  processFileWithOfficeParser,
} from "@/services/rag";
import fs from "fs/promises"; // Add fs/promises
import path from "path"; // Add path

const UPLOADS_DIR = path.join(process.cwd(), "uploads"); // Define base uploads dir

// Define type for the final_response event payload
interface FinalResponseData {
  response: string;
  toolInvocations: any[]; // Always include this array, even if empty
  sessionId: string;
}

// Helper to format Server-Sent Events (SSE) - same as basic-chat
function formatSSE(event: string, data: string): string {
  // Verify data is a valid string to prevent serialization issues
  const safeData =
    typeof data === "string"
      ? data
      : JSON.stringify({ error: "Invalid data format" });
  return `event: ${event}\ndata: ${safeData}\n\n`;
}

// Ensure uploads directory exists
async function ensureUploadsDir() {
  try {
    await fs.access(UPLOADS_DIR);
  } catch (error) {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
}

// Handler for processing file uploads and returning session ID
export async function POST(req: Request) {
  return withGenkitServer(async () => {
    // Create the uploads directory if it doesn't exist
    await ensureUploadsDir();

    // Check if this is a multipart/form-data request for file upload
    const contentType = req.headers.get("content-type") || "";

    // Handle file uploads (multipart/form-data)
    if (contentType.includes("multipart/form-data")) {
      try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
          return new Response(JSON.stringify({ error: "No file provided" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (file.size > MAX_UPLOAD_SIZE) {
          return new Response(
            JSON.stringify({
              error: `File size exceeds the maximum allowed size of ${
                MAX_UPLOAD_SIZE / (1024 * 1024)
              }MB`,
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const sessionId = generateRagSessionId();

        // Process file using the officeparser module via our wrapper
        const result = await processFileWithOfficeParser(file, sessionId);

        if (!result.success) {
          return new Response(
            JSON.stringify({ error: result.error || "Unknown error" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({
            sessionId,
            message: "File uploaded and indexed successfully",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        console.error("Error handling file upload:", error);
        return new Response(
          JSON.stringify({
            error:
              "Error processing file upload: " +
              (error instanceof Error ? error.message : String(error)),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // Handle RAG chat queries (application/json)
    if (contentType.includes("application/json")) {
      try {
        const { query, sessionId, modelId, history } = await req.json();

        // Check if session ID is provided (required for RAG)
        if (!sessionId) {
          return new Response(
            JSON.stringify({ error: "No session ID provided" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        // Check if a query was provided
        if (!query) {
          return new Response(JSON.stringify({ error: "No query provided" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Check if model ID is provided
        if (!modelId) {
          return new Response(
            JSON.stringify({ error: "No model ID provided" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        // Determine which tools to potentially pass based on flags
        const toolNamesToUse: string[] = [];
        const tavilySearchEnabled = process.env.ENABLE_TAVILY_SEARCH === "true";
        const tavilyExtractEnabled =
          process.env.ENABLE_TAVILY_EXTRACT === "true";
        const perplexitySearchEnabled =
          process.env.ENABLE_PERPLEXITY_SEARCH === "true";
        const perplexityDeepResearchEnabled =
          process.env.ENABLE_PERPLEXITY_DEEP_RESEARCH === "true";
        const context7ResolveLibraryIdEnabled =
          process.env.ENABLE_CONTEXT7_RESOLVE_LIBRARY_ID === "true";
        const context7GetLibraryDocsEnabled =
          process.env.ENABLE_CONTEXT7_GET_LIBRARY_DOCS === "true";

        // Initialize tools as null (don't set an empty array) if no tools are needed
        // This avoids issues with GenKit expecting specific schema types
        let toolsParam: string[] | null = null;

        // Only create a tools array if at least one tool is enabled
        if (
          tavilySearchEnabled ||
          tavilyExtractEnabled ||
          perplexitySearchEnabled ||
          perplexityDeepResearchEnabled ||
          context7ResolveLibraryIdEnabled ||
          context7GetLibraryDocsEnabled
        ) {
          if (tavilySearchEnabled) {
            toolNamesToUse.push("tavilySearch");
          }
          if (tavilyExtractEnabled) {
            toolNamesToUse.push("tavilyExtract");
          }
          if (perplexitySearchEnabled) {
            toolNamesToUse.push("perplexitySearch");
          }
          if (perplexityDeepResearchEnabled) {
            toolNamesToUse.push("perplexityDeepResearch");
          }
          if (context7ResolveLibraryIdEnabled) {
            toolNamesToUse.push("context7ResolveLibraryId");
          }
          if (context7GetLibraryDocsEnabled) {
            toolNamesToUse.push("context7GetLibraryDocs");
          }

          // Only set toolsParam if we actually have tools to use
          if (toolNamesToUse.length > 0) {
            toolsParam = toolNamesToUse;
          }
        }
        // Add other tools based on their flags here...

        // Create a ReadableStream for Server-Sent Events response
        const responseStream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let streamClosed = false;

            try {
              // Execute the RAG flow to generate the response
              // Create the input object with required parameters
              const flowInput: RagFlowInput = {
                query,
                sessionId,
                modelId,
                history,
              };
              
              if (toolsParam) {
                flowInput.tools = toolsParam;
              }
              
              // This handler will be passed to the Genkit flow.
              // It converts each event from the flow into an SSE-formatted chunk.
              const streamHandler = (event: any) => {
                if (streamClosed) return;

                // Map the flow's event types to the SSE event types the client expects.
                const eventMap: { [key: string]: string } = {
                  text: "chunk",
                  sources: "sources",
                  tool_invocation: "tool_invocation",
                  tool_invocations: "tool_invocations",
                  error: "error",
                };

                const eventType = eventMap[event.type];
                if (eventType) {
                  // The data payload is the rest of the event object.
                  const dataPayload = { ...event };
                  delete dataPayload.type; // Remove the type property as it's now the event name.
                  
                  const sseEvent = formatSSE(
                    eventType,
                    JSON.stringify(dataPayload)
                  );
                  controller.enqueue(encoder.encode(sseEvent));
                }
              };

              // Execute the flow and get the stream and output promise.
              const flowResult = documentQaStreamFlow.stream(flowInput);

              // Process the stream of events.
              for await (const chunk of flowResult.stream) {
                streamHandler(chunk);
              }

              // After the stream is finished, get the final output.
              const finalOutput = await flowResult.output;

              if (!streamClosed) {
                const finalResponseData: FinalResponseData = {
                  response: finalOutput || "Stream completed.",
                  toolInvocations: [], // Placeholder for now.
                  sessionId: sessionId,
                };
                const finalEvent = formatSSE(
                  "final_response",
                  JSON.stringify(finalResponseData)
                );
                controller.enqueue(encoder.encode(finalEvent));
              }

              // Close the stream when the flow is complete (if not already closed by an error)
              if (!streamClosed) {
                controller.close();
              }
            } catch (error) {
              console.error("Error during RAG stream processing:", error);

              if (!streamClosed) {
                // Try to send a final error event to the client
                try {
                  const errorEvent = formatSSE("error", JSON.stringify({
                    error:
                      error instanceof Error ? error.message : String(error),
                  }));
                  controller.enqueue(encoder.encode(errorEvent));
                } catch (e) {
                  console.error("Failed to send error message to client:", e);
                } finally {
                  controller.close();
                  streamClosed = true;
                }
              }
            }
          },
        });

        // Return the stream as an SSE response
        return new Response(responseStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      } catch (error) {
        console.error("Error handling RAG chat request:", error);
        return new Response(
          JSON.stringify({
            error:
              "Error processing RAG chat request: " +
              (error instanceof Error ? error.message : String(error)),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // If content type is neither multipart/form-data nor application/json
    return new Response(
      JSON.stringify({
        error:
          "Unsupported content type. Use multipart/form-data for file uploads or application/json for chat queries.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  });
}
