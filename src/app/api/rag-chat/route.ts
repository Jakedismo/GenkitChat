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
              
              // Call the flow with custom streaming implementation
              // This approach intercepts streaming events from the RAG flow and forwards them
              // as SSE chunks to provide real-time token-by-token streaming to the frontend
              try {
                let streamingActive = true;
                let fullResult = '';
                
                // Custom streaming handler that intercepts the flow's internal streaming
                const customStreamHandler = (event: any) => {
                  if (streamClosed || !streamingActive) return;

                  if (event.type === "text" && event.text) {
                    const chunkEvent = formatSSE("chunk", JSON.stringify({ text: event.text }));
                    controller.enqueue(encoder.encode(chunkEvent));
                    fullResult += event.text;
                  }
                };

                // Call the flow with the custom stream handler
                const result = await (documentQaStreamFlow as any)(flowInput, customStreamHandler);
                streamingActive = false;
                
                // If no streaming occurred, fall back to word-by-word streaming of the final result
                if (!fullResult && result) {
                  const words = result.split(' ');
                  for (let i = 0; i < words.length; i++) {
                    if (streamClosed) break;
                    const word = words[i];
                    if (word) {
                      const textToSend = i === 0 ? word : ' ' + word;
                      const chunkEvent = formatSSE("chunk", JSON.stringify({ text: textToSend }));
                      controller.enqueue(encoder.encode(chunkEvent));
                      // Small delay for streaming effect
                      await new Promise(resolve => setTimeout(resolve, 30));
                    }
                  }
                  fullResult = result;
                }
                
                // Send final_response event with the complete result
                if (!streamClosed && result) {
                  try {
                    // Clean the result string to avoid JSON serialization issues
                    const cleanedResult = typeof result === 'string'
                      ? result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
                      : String(result);
                    
                    const finalResponseData = {
                      response: cleanedResult,
                      sessionId: sessionId,
                      toolInvocations: []
                    };
                    
                    const finalResponseEvent = formatSSE("final_response", JSON.stringify(finalResponseData));
                    controller.enqueue(encoder.encode(finalResponseEvent));
                    
                  } catch (jsonError) {
                    console.error('RAG JSON serialization error:', jsonError);
                    // Send a fallback response if JSON serialization fails
                    const fallbackData = {
                      response: "Error: Response contains characters that cannot be serialized to JSON. Please try again.",
                      sessionId: sessionId,
                      toolInvocations: []
                    };
                    const fallbackEvent = formatSSE("final_response", JSON.stringify(fallbackData));
                    controller.enqueue(encoder.encode(fallbackEvent));
                  }
                }
              } catch (error) {
                console.error('Error during documentQaStreamFlow:', error);
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
