import fs from "fs/promises"; // Add fs/promises
import path from "path"; // Add path
import { documentQaStreamFlow, RagFlowInput } from "@/ai/flows/ragFlow";
import {
  generateRagSessionId,
  processFileWithOfficeParser,
  MAX_UPLOAD_SIZE,
} from "@/services/rag";
import { withGenkitServer } from "@/lib/server";

const UPLOADS_DIR = path.join(process.cwd(), "uploads"); // Define base uploads dir

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
        const { query, sessionId, modelId } = await req.json();

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
            console.log("Enabling Tavily Search tool for RAG request");
          }
          if (tavilyExtractEnabled) {
            toolNamesToUse.push("tavilyExtract");
            console.log("Enabling Tavily Extract tool for RAG request");
          }
          if (perplexitySearchEnabled) {
            toolNamesToUse.push("perplexitySearch");
            console.log("Enabling Perplexity Search tool for RAG request");
          }
          if (perplexityDeepResearchEnabled) {
            toolNamesToUse.push("perplexityDeepResearch");
            console.log("Enabling Perplexity Deep Research tool for RAG request");
          }
          if (context7ResolveLibraryIdEnabled) {
            toolNamesToUse.push("context7ResolveLibraryId");
            console.log("Enabling Context7 Resolve Library ID tool for RAG request");
          }
          if (context7GetLibraryDocsEnabled) {
            toolNamesToUse.push("context7GetLibraryDocs");
            console.log("Enabling Context7 Get Library Docs tool for RAG request");
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
              // Create a handler function for RAG events that formats them as SSE
              const handleEvent = (event: any) => {
                if (streamClosed) return;

                console.log(`[RAG-DEBUG] Processing event type: ${event.type}`);
                let sseEventString = "";

                switch (event.type) {
                  case "sources":
                    sseEventString = `event: sources\ndata: ${JSON.stringify({
                      sources: event.sources,
                    })}\n\n`;
                    break;
                  case "text":
                    console.log(`[RAG-DEBUG] Sending text event: "${event.text}"`);
                    sseEventString = `event: text\ndata: ${JSON.stringify({
                      text: event.text,
                    })}\n\n`;
                    break;
                  case "tool_invocation": {
                    // Defensive: ensure event and toolData are properly defined
                    if (!event) {
                      console.warn("[RAG-DEBUG] Received undefined tool_invocation event");
                      return;
                    }
                    
                    const toolData = {
                      name: event.name || 'unknown_tool',
                      input: event.input,
                      output: event.output,
                      error: event.error, // Include error if present
                    };
                    // No truncation: always send the full output as a single JSON event
                    sseEventString = `event: tool_invocation\ndata: ${JSON.stringify(
                      toolData
                    )}\n\n`;
                    // Debug: log outgoing event (truncated for log safety)
                    console.debug(
                      "[SSE] tool_invocation event:",
                      sseEventString.slice(0, 500) +
                        (sseEventString.length > 500
                          ? "...[log truncated]"
                          : "")
                    );
                    break;
                  }
                  case "tool_invocations": {
                    // Handle the batched tool invocations case
                    console.log(
                      `[RAG-DEBUG] Processing batched tool invocations (${event.invocations.length} tools)`
                    );

                    // Convert each tool invocation in the batch to an individual SSE event
                    for (const toolData of event.invocations || []) {
                      // Add defensive check for each tool invocation
                      if (!toolData) {
                        console.warn("[RAG-DEBUG] Received undefined tool invocation in batch");
                        continue;
                      }
                      
                      const toolEvent = `event: tool_invocation\ndata: ${JSON.stringify(
                        {
                          name: toolData.name || 'unknown_tool',
                          input: toolData.input,
                          output: toolData.output,
                          error: toolData.error,
                        }
                      )}\n\n`;

                      controller.enqueue(encoder.encode(toolEvent));
                    }
                    // Return without setting sseEventString since we've already sent events
                    return;
                  }
                  case "error":
                    sseEventString = `event: error\ndata: ${JSON.stringify({
                      error: event.error,
                    })}\n\n`;
                    // Send the error event, but DO NOT close the stream.
                    // The 'sseEventString' will be enqueued by the common logic after the switch.
                    break;
                  case "final_response":
                    sseEventString = `event: final_response\ndata: ${JSON.stringify({
                      response: event.response,
                      sessionId: event.sessionId,
                      toolInvocations: event.toolInvocations || [],
                    })}\n\n`;
                    // Send the final response and close the stream
                    controller.enqueue(encoder.encode(sseEventString));
                    controller.close();
                    streamClosed = true;
                    return;
                  default:
                    // Log unknown event types but don't break the stream
                    console.warn("Unknown RAG stream event type:", event);
                    return;
                }

                // Send the formatted SSE event to the client
                if (sseEventString) {
                  controller.enqueue(encoder.encode(sseEventString));
                }
              };

              // Execute the RAG flow to generate the response
              // Create the input object with required parameters
              const flowInput: RagFlowInput = {
                query,
                sessionId,
                modelId,
              };
              
              if (toolsParam) {
                flowInput.tools = toolsParam;
              }
              
              console.log('[RAG-DEBUG] Calling documentQaStreamFlow with input:', flowInput);
              // Call the flow directly with sideChannel parameter as defined in ragFlow.ts
              try {
                const result = await (documentQaStreamFlow as any)(flowInput, handleEvent);
                console.log('[RAG-DEBUG] Flow completed with result length:', typeof result === 'string' ? result.length : 'not a string');
                console.log('[RAG-DEBUG] Result preview:', typeof result === 'string' ? result.substring(0, 200) + '...' : result);
                
                // The final_response is now sent from ragFlow.ts via sideChannel/handleEvent.
                // The logic below is no longer needed.
                // if (!streamClosed && result) { ... }

              } catch (error) {
                console.error('[RAG-DEBUG] Error during documentQaStreamFlow:', error);
                throw error; // Re-throw the error to be caught by the outer try-catch
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
                  const errorEvent = `event: error\ndata: ${JSON.stringify({
                    error:
                      error instanceof Error ? error.message : String(error),
                  })}\n\n`;
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
