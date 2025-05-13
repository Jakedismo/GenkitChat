import { ragIndexerRef, ragRetrieverRef, aiInstance } from "@/genkit-server";
import { chunk } from "llm-chunk";
import { extractText } from "@papra/lecture"; // Import @papra/lecture
import { Document } from "genkit/retriever";
import {
  // GenerateResponse, // Removed unused
  // GenerateResponseChunk, // Removed unused
  Part,
  ToolRequestPart,
  ToolResponsePart,
} from "@genkit-ai/ai"; // Added Genkit AI types
import { v4 as uuidv4 } from "uuid";
import { z } from "zod"; // Added for Zod schema definitions

// Define the structure for events yielded by generateRagResponseStream
export type RagStreamEvent =
  | { type: "sources"; sources: Document[] }
  | { type: "text"; text: string }
  | {
      type: "tool_invocation";
      name: string;
      input: unknown;
      output: unknown;
      error?: string;
    } // Use unknown
  | { type: "error"; error: string };

// Zod schema for RagStreamEvent (matches the type above)
export const RagStreamEventSchemaZod = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sources"),
    // Using z.any() for sources as Document schema from 'genkit/retriever' is complex for direct Zod representation here
    // For stricter validation, a more detailed Zod schema matching Document structure would be needed.
    sources: z.array(z.any()),
  }),
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("tool_invocation"),
    name: z.string(),
    input: z.unknown(),
    output: z.unknown(),
    error: z.string().optional(),
  }),
  z.object({ type: z.literal("error"), error: z.string() }),
]);

// Zod schema for the input of the RAG flow
export const RagFlowInputSchema = z.object({
  query: z.string(),
  sessionId: z.string(),
  modelId: z.string(),
  tools: z.array(z.string()).optional(),
});
type RagFlowInput = z.infer<typeof RagFlowInputSchema>;

// Max file size for uploads in bytes (e.g., 10MB)
// Note: INITIAL_RETRIEVAL_COUNT, FINAL_DOCUMENT_COUNT, CHUNKING_CONFIG, etc. are used by the flow logic below.
// simpleSimilarityScore is not directly used in this RAG flow, but indexFileDocument and processFileWithOfficeParser are for ingestion.
/**
 * Maximum file size allowed for uploads (100MB in bytes)
 */
export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

/**
 * Represents a RAG endpoint.
 */
export interface RagEndpoint {
  /**
   * The ID of the endpoint.
   */
  endpointId: string;
  /**
   * The name of the endpoint.
   */
  endpointName: string;
}

/**
 * Configuration for chunking text documents
 */
export const CHUNKING_CONFIG = {
  minLength: 1000,
  maxLength: 2000,
  splitter: "sentence",
  overlap: 200,
} as const; // Use as const

/**
 * Asynchronously retrieves a list of RAG endpoints.
 *
 * @returns A promise that resolves to an array of RagEndpoint objects.
 */
export async function getRagEndpoints(): Promise<RagEndpoint[]> {
  // We can enhance this with more endpoints later
  return [
    {
      endpointId: "pdf-rag",
      endpointName: "PDF Document RAG with Two-Stage Retrieval",
    },
  ];
} // Add missing closing brace for getRagEndpoints

// Removed extractTextFromPdf function

/**
 * Indexes extracted text content to the vector store
 *
 * @param fileBuffer - Buffer containing the file data
 * @param fileName - Original name of the file
 * @param sessionId - Session ID for document association
 * @returns Whether the indexing was successful
 */
export async function indexFileDocument( // Renamed back (or to generic)
  fileBuffer: Buffer, // Accept buffer
  fileName: string,
  sessionId: string
): Promise<boolean> {
  const allDocuments: Document[] = [];
  const documentId = `${sessionId}::${fileName}`;
  let overallChunkIndex = 0;

  try {
    // Determine MIME type (basic implementation based on extension)
    // A more robust solution might use a library like 'mime-types' or pass from client
    let mimeType = "application/octet-stream"; // Default
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (extension === "pdf") {
      mimeType = "application/pdf";
    } else if (extension === "txt") {
      mimeType = "text/plain";
    } else if (extension === "md") {
      mimeType = "text/markdown";
    } else if (extension === "yaml" || extension === "yml") {
      mimeType = "application/x-yaml";
    } else if (extension === "csv") {
      mimeType = "text/csv";
    }
    // Add more types as needed, corresponding to @papra/lecture support

    console.log(
      `Processing file: ${fileName} with MIME type: ${mimeType} using @papra/lecture`
    );

    // Extract text using @papra/lecture
    // Create a new ArrayBuffer by copying the contents of fileBuffer.
    // This ensures it's a true ArrayBuffer and not SharedArrayBuffer,
    // and avoids issues with byte offsets if fileBuffer is a view into a larger buffer.
    const arrayBufferCopy = new ArrayBuffer(fileBuffer.length);
    new Uint8Array(arrayBufferCopy).set(new Uint8Array(fileBuffer));

    const extractionResult = await extractText({
      arrayBuffer: arrayBufferCopy,
      mimeType,
    });
    const extractedText = extractionResult.textContent;

    if (!extractedText || extractedText.trim().length === 0) {
      console.warn(`@papra/lecture did not extract text from ${fileName}`);
      // Consider returning true but with no documents indexed, or false if extraction failure is critical
    } else {
      console.log(
        `Text extracted from ${fileName} using @papra/lecture (Length: ${extractedText.length})`
      );

      // Chunk the extracted text
      const chunks = chunk(extractedText, CHUNKING_CONFIG);

      // Create Document objects
      chunks.forEach((text) => {
        const chunkId = uuidv4();
        allDocuments.push(
          Document.fromText(text, {
            documentId: documentId,
            chunkId: chunkId,
            originalFileName: fileName,
            pageNumber: 1, // Default to 1 as @papra/lecture doesn't provide page info
            // totalPages: undefined, // We don't get total pages from @papra/lecture easily
            textToHighlight: text, // Chunk content is the highlight target
            chunkIndex: overallChunkIndex++,
            sessionId: sessionId,
            timestamp: new Date().toISOString(),
          })
        );
      });
      console.log(`Extracted ${allDocuments.length} chunks from ${fileName}`);
    }

    // Index the documents if any were created
    if (allDocuments.length > 0) {
      // Check if indexer reference is available
      if (!ragIndexerRef) {
        console.error("RAG indexer reference is not available");
        return false; // Cannot proceed without indexer
      }

      await aiInstance.index({
        indexer: ragIndexerRef,
        documents: allDocuments,
      });
      console.log(
        `Indexed ${allDocuments.length} total chunks from ${fileName} for session ${sessionId}`
      );
    } else {
      console.log(`No indexable chunks extracted from ${fileName}.`);
    }

    return true; // Indicate processing completed (even if no text extracted)
  } catch (error) {
    console.error(
      `Error processing document ${fileName} with @papra/lecture:`,
      error
    );
    return false; // Indicate failure
  }
}

// Export the documentQaStreamFlow to be used by the genkit-server
// This creates the flow and registers it with the GenKit instance
export const documentQaStreamFlow = aiInstance.defineFlow(
  {
    name: "documentQaStreamFlow",
    inputSchema: RagFlowInputSchema,
    outputSchema: z.void(),
    streamSchema: RagStreamEventSchemaZod,
  },
  async (
    input: RagFlowInput,
    {
      sendChunk,
      context,
    }: { sendChunk: (chunk: RagStreamEvent) => void; context?: any }
  ) => {
    // Extract props from input including tools
    const { query, sessionId, modelId } = input;
    // Don't use tools at all for now to avoid name property access errors
    const tools: string[] = []; // Explicitly ignore any tools passed in
    const logger = context?.logger; // Get logger from context, handle if context is undefined

    // Using the global createModelKey function defined at the bottom of the file

    // Log if tools are being used
    if (tools.length > 0) {
      logger?.info(`Using ${tools.length} tools in RAG document chat`);
    }

    // Get the rag_assistant prompt using string parameter (correct Genkit API approach)
    const ragAssistantPrompt = await aiInstance.prompt("rag_assistant");
    try {
      logger?.info(`RAG query: \\\"${query}\\\" for session: ${sessionId}`);

      // Stage 1: Retrieve a larger initial set of documents
      const initialK = INITIAL_RETRIEVAL_COUNT;

      // Check if retriever reference is available
      if (!ragRetrieverRef) {
        logger?.error("RAG retriever reference is not available");
        sendChunk({
          type: "error",
          error: "Document retrieval service is not available",
        });
        return;
      }

      // Create a proper Document object from the query text for retrieval
      const queryDocument = Document.fromText(query || '');
      
      // Retrieve documents using the query document
      const docs = await aiInstance.retrieve({
        retriever: ragRetrieverRef,
        query: queryDocument,
        options: {
          k: initialK,
        },
      });

      // Filter by session ID
      const filteredDocs = docs.filter(
        (doc: Document) => doc.metadata && doc.metadata.sessionId === sessionId
      );
      
      // Log retrieved documents
      logger?.info(`Retrieved ${docs.length} documents, filtered to ${filteredDocs.length} for session: ${sessionId}`);

      if (!filteredDocs || filteredDocs.length === 0) {
        logger?.warn(`No documents found for session: ${sessionId}`);
        sendChunk({
          type: "error",
          error:
            "I couldn't find any relevant information in the documents you provided. Could you try rephrasing your question or uploading a document that might contain the answer?",
        });
        return;
      }

      logger?.info(
        // Corrected from logger.info to logger?.info
        `Retrieved ${filteredDocs.length} initial documents for query. Attempting reranking...`
      );

      // Stage 2: Rerank the filtered documents
      try {
        logger?.info("Starting reranking with Vertex AI Reranker...");
        // const rerankModelIdForLLMCompReranker = "openai/gpt-4.1-nano"; // No longer needed for Vertex AI reranker
        // Create a proper document from the query text for reranking
        const queryDocument = Document.fromText(query || '');
        
        // Rerank the filtered documents using the Vertex AI reranker that's registered in genkit-server.ts
        const rerankedDocsWithScores = await aiInstance.rerank({
          reranker: "vertexai/reranker", // Must match the reranker name registered in genkit-server.ts
          query: queryDocument,
          documents: filteredDocs,
        });

        logger?.info(
          `Finished reranking with LLM. Got ${rerankedDocsWithScores.length} results.`
        );

        const finalK = FINAL_DOCUMENT_COUNT;
        // Ensure reranked docs have scores in metadata
        const docsWithScores = rerankedDocsWithScores.map(doc => {
          // Deep clone to avoid mutation issues
          const newDoc = { ...doc };
          
          // Make sure metadata exists
          if (!newDoc.metadata) {
            newDoc.metadata = { score: 0 };
          } else if (typeof newDoc.metadata.score !== 'number') {
            // Ensure score exists as a number (usually set by reranker)
            newDoc.metadata.score = 0;
          }
          
          return newDoc;
        });
        
        // Get the top K documents based on reranking scores
        const topDocs = docsWithScores.slice(0, finalK);

        logger?.info(
          `Selected top ${topDocs.length} documents after LLM reranking`
        );
        if (tools && tools.length > 0) {
          logger?.info(
            `Passing ${tools.length} tools to LLM along with RAG docs.`
          );
        }

        // Log document scores for debugging with safe property access
        topDocs.forEach((doc, index) => {
          // Safely access score through optional chaining and nullish coalescing
          const score = doc?.metadata?.score ?? 'N/A';
          logger?.debug(`Document ${index + 1} score: ${score}`);
        });

        // Process documents to ensure they have the correct structure for client display
        // and conform to the Document type from genkit/retriever
        const sourcesToYield = topDocs.map(doc => {
          // Extract text from the document using a safe approach that handles different document structures
          let docText = '';
          
          // Try to extract text from different possible document structures
          // TypeScript safe approach using type guards
          const anyDoc = doc as any; // Use any for property access
          
          if (anyDoc.text && typeof anyDoc.text === 'string') {
            // Document has a direct text property
            docText = anyDoc.text;
          } else if (anyDoc.content && Array.isArray(anyDoc.content)) {
            // Document has a content array (likely from Genkit)
            docText = anyDoc.content
              .filter((part: any) => part && typeof part.text === 'string')
              .map((part: any) => part.text)
              .join('\n');
          }
          
          // Create metadata with required fields
          const metadata = {
            // Include all original metadata
            ...(doc.metadata || {}),
            // Set a fileName for display purposes using type-safe approach
            fileName: doc.metadata?.fileName || (doc as any).id || 'unknown',
            // Required score property 
            score: 1
          };
          
          // Create a proper Document instance
          return Document.fromText(docText, metadata);
        });
        
        // Log sources being sent to client
        logger?.info(`Sending ${sourcesToYield.length} source documents to client`);
        sendChunk({ type: "sources", sources: sourcesToYield });

        // Prepare documents for generation by extracting text and context
        logger?.info(`Preparing ${topDocs.length} documents for context augmentation`);
        
        // Create the initial prompt with the correctly formatted messages structure
        // that follows GenKit's expected format
        const formattedPrompt = await ragAssistantPrompt({
          query,
          modelId: createModelKey(modelId),
        });

        // Create a properly typed messages array to avoid TypeScript errors
        // Must use the exact string literal types that Genkit expects
        const messages = [
          {
            role: "system" as const, // Use const assertion for literal type
            content: [
              {
                text: `You are analyzing documents to answer a query: "${query}". Use the context from the documents to give a comprehensive answer.`,
              },
            ],
          },
          {
            role: "user" as const, // Use const assertion for literal type
            content: [
              {
                text: query,
              },
            ],
          },
        ];

        const promptResult = { messages };

        // Use tools if provided in the input and safely handle empty tools array
        const safeTools = Array.isArray(tools) && tools.length > 0 ? tools : [];
        logger?.debug(`Generating with ${safeTools.length} tools in the RAG flow`);

        // Ensure docs are in the correct format for the generate function
        // Convert topDocs to proper Document instances for use with GenKit
        const formattedDocs = topDocs.map(doc => {
          // Extract text content safely from various document structures
          let docText = '';
          let docMetadata = doc.metadata || {};
          
          // Handle different document structures with type-safe approach
          const anyDoc = doc as any; // Use any for flexible property access
          
          if (anyDoc.text && typeof anyDoc.text === 'string') {
            // Document already has text property
            docText = anyDoc.text;
          } else if (anyDoc.content && Array.isArray(anyDoc.content)) {
            // Extract text from content array
            docText = anyDoc.content
              .filter((part: any) => part && typeof part.text === 'string')
              .map((part: any) => part.text)
              .join('\n');
          }
          
          // Create a new Document with proper structure
          return Document.fromText(docText, docMetadata);
        });

        // First try: attempt to generate without tools to avoid tool registration issues
        const initialGenerateOptions = {
          model: createModelKey(modelId), // Use createModelKey helper
          messages, // Use our properly typed messages array
          docs: formattedDocs, // Use formatted docs
          // Don't include tools for initial attempt
          tools: [],
        };
        
        // If tools were provided, we'll try with tools in the catch block
        const shouldTryWithTools = safeTools.length > 0;
        
        // Secondary options with tools (if needed)
        const toolGenerateOptions = shouldTryWithTools ? {
          model: createModelKey(modelId),
          messages,
          docs: formattedDocs,
          tools: safeTools,
        } : null;

        const pendingToolRequests = new Map<
          string,
          { name: string; input: unknown }
        >();
        let llmStreamResult;
        
        try {
          // First, try to generate without tools to avoid potential tool registration issues
          llmStreamResult = await aiInstance.generateStream(initialGenerateOptions);
          logger?.info("Successfully generating stream without tools initially");
          
          // If we get here and we should have tried with tools, log that we didn't use them
          if (shouldTryWithTools) {
            logger?.info("Note: Tools were provided but we're using the no-tools flow for reliability");
          }
        } catch (initialError) {
          // If even the basic generation fails, try with tools if they were requested
          if (shouldTryWithTools && toolGenerateOptions) {
            logger?.info("Initial generation failed, trying with tools instead", initialError);
            try {
              llmStreamResult = await aiInstance.generateStream(toolGenerateOptions);
              logger?.info("Successfully generating stream with tools");
            } catch (toolError) {
              // If generation with tools also fails, use a minimal fallback
              logger?.error(
                "Error generating with tools, falling back to minimal options:",
                toolError
              );
              // Create ultra-minimal fallback options
              const fallbackOptions = {
                model: createModelKey(modelId),
                messages, // Reuse the same typed messages
                docs: formattedDocs,
                tools: [], // No tools
              };
              
              try {
                llmStreamResult = await aiInstance.generateStream(fallbackOptions);
                logger?.info("Successfully generating stream without tools");
              } catch (fallbackError) {
                // If even the fallback fails, send an error and abort
                logger?.error(
                  "Fatal streaming error, even fallback failed:",
                  fallbackError
                );
                sendChunk({
                  type: "error",
                  error: `Failed to generate response: ${
                    fallbackError instanceof Error
                      ? fallbackError.message
                      : String(fallbackError)
                  }`,
                });
                return; // Exit the function early
              }
            }
          }
        }

        // Check if llmStreamResult is defined before processing
        if (!llmStreamResult) {
          logger?.error("Stream result is undefined, cannot process");
          sendChunk({
            type: "error",
            error: "Failed to initialize response stream. Please try again."
          });
          return; // Exit the function early
        }
        
        // Continue with stream processing
        for await (const chunk of llmStreamResult.stream) {
          let currentTextOutput = "";
          if (Array.isArray(chunk.content)) {
            for (const part of chunk.content as Part[]) {
              if (part.text) {
                currentTextOutput += part.text;
              } else if (part.toolRequest) {
                if (currentTextOutput) {
                  sendChunk({ type: "text", text: currentTextOutput });
                  currentTextOutput = "";
                }
                if (part.toolRequest.ref && part.toolRequest.name) {
                  pendingToolRequests.set(part.toolRequest.ref, {
                    name: part.toolRequest.name,
                    input: part.toolRequest.input,
                  });
                }
              } else if (part.toolResponse) {
                if (currentTextOutput) {
                  sendChunk({ type: "text", text: currentTextOutput });
                  currentTextOutput = "";
                }
                if (
                  part.toolResponse.ref &&
                  pendingToolRequests.has(part.toolResponse.ref)
                ) {
                  const requestDetails = pendingToolRequests.get(
                    part.toolResponse.ref
                  );

                  // Add defensive coding to ensure properties exist
                  if (requestDetails) {
                    const toolName = requestDetails.name || "unknown-tool";
                    const toolInput = requestDetails.input || {};
                    const toolOutput = part.toolResponse.output || {};

                    sendChunk({
                      type: "tool_invocation",
                      name: toolName,
                      input: toolInput,
                      output: toolOutput,
                    });

                    pendingToolRequests.delete(part.toolResponse.ref);
                  } else {
                    console.error(
                      "[RAG] Missing tool request details in primary flow:",
                      part.toolResponse.ref
                    );
                  }
                } else if (
                  part.toolResponse &&
                  typeof part.toolResponse === "object"
                ) {
                  // Add defensive coding to ensure toolResponse exists and has a name property
                  const toolName = part.toolResponse.name || "unknown-tool";
                  const toolOutput = part.toolResponse.output || {};

                  // Only send the tool invocation if we have a valid name
                  if (toolName) {
                    sendChunk({
                      type: "tool_invocation",
                      name: toolName,
                      input: undefined, // No input in this case
                      output: toolOutput,
                    });
                  } else {
                    console.error(
                      "[RAG] Invalid tool response without name:",
                      part.toolResponse
                    );
                  }
                }
              }
            }
            if (currentTextOutput) {
              sendChunk({ type: "text", text: currentTextOutput });
            }
          } else if (typeof chunk.content === "string" && chunk.content) {
            sendChunk({ type: "text", text: chunk.content });
          }
        }

        // Safely handle final response
        if (!llmStreamResult) {
          logger?.error("Cannot get final response - stream result is undefined");
          return; // Exit early if llmStreamResult is undefined
        }
        
        const finalResponse = await llmStreamResult.response;
        if (finalResponse.messages && Array.isArray(finalResponse.messages)) {
          const finalToolRequests = new Map<string, ToolRequestPart>();
          for (const message of finalResponse.messages) {
            if (message.role === "model" && Array.isArray(message.content)) {
              for (const part of message.content as Part[]) {
                if (part.toolRequest?.ref) {
                  finalToolRequests.set(
                    part.toolRequest.ref,
                    part as ToolRequestPart
                  );
                }
              }
            } else if (
              message.role === "tool" &&
              Array.isArray(message.content)
            ) {
              for (const part of message.content as Part[]) {
                const toolResponsePart = part as ToolResponsePart;
                if (
                  toolResponsePart.toolResponse?.ref &&
                  finalToolRequests.has(toolResponsePart.toolResponse.ref)
                ) {
                  const requestPart = finalToolRequests.get(
                    toolResponsePart.toolResponse.ref
                  ); // Removed forced assertion

                  // Add defensive coding to prevent 'Cannot read properties of undefined (reading 'name')' error
                  if (requestPart && requestPart.toolRequest) {
                    // Ensure all required properties exist before sending
                    // Use safe property access with defaults for all fields
                    const toolName = requestPart.toolRequest.name || "unknown-tool";
                    const toolInput = requestPart.toolRequest.input || {};
                    
                    // Safe access to toolResponse output
                    const toolOutput = toolResponsePart.toolResponse && 
                      typeof toolResponsePart.toolResponse === 'object' ? 
                      (toolResponsePart.toolResponse.output || {}) : {};

                    // Send a properly formatted tool invocation event with complete data
                    sendChunk({
                      type: "tool_invocation",
                      name: toolName,
                      input: toolInput,
                      output: toolOutput,
                    });

                    // Only remove from map if successfully processed
                    finalToolRequests.delete(toolResponsePart.toolResponse.ref);
                  } else {
                    console.error(
                      "[RAG] Missing tool request data in primary flow:",
                      requestPart
                    );
                  }
                }
              }
            }
          }
        }
        return; // Successful path ends
      } catch (rerankingError: any) {
        logger?.error(
          "Error occurred during the reranking stage:",
          rerankingError
        );
        logger?.info("Falling back to standard retrieval without reranking.");

        const fallbackDocs = filteredDocs.slice(0, FINAL_DOCUMENT_COUNT);
        if (tools && tools.length > 0) {
          logger?.info(
            `Passing ${tools.length} tools to LLM along with FALLBACK RAG docs.`
          );
        }

        const sourcesToYield = fallbackDocs.map(
          ({ metadata, ...rest }: Document) => {
            const { score, ...metadataWithoutScore } = metadata || {};
            return { ...rest, metadata: metadataWithoutScore };
          }
        );
        sendChunk({ type: "sources", sources: sourcesToYield as Document[] });

        // Pass query and modelId as properties of a single object parameter
        // Use the helper function to create a stable string key for modelId
        // Create the same properly typed messages structure as in the main flow
        const fallbackMessages = [
          {
            role: "system" as const,
            content: [
              {
                text: `You are analyzing documents to answer a query: "${query}". Use the context from the documents to give a comprehensive answer.`,
              },
            ],
          },
          {
            role: "user" as const,
            content: [
              {
                text: query,
              },
            ],
          },
        ];

        // Use tools if provided in the input (fallback flow)
        logger?.debug(
          `Generating with ${tools.length} tools in the RAG fallback flow`
        );

        // Create properly typed generateOptions structure for the fallback flow
        const generateOptionsFallback = {
          model: createModelKey(modelId), // Use createModelKey helper
          messages: fallbackMessages, // Use the properly typed messages array
          docs: fallbackDocs,
          // Include tools from input
          tools: tools,
        };

        let llmStreamResultFallback;
        try {
          // Try to generate stream with tools
          llmStreamResultFallback = aiInstance.generateStream(
            generateOptionsFallback
          );
        } catch (streamError) {
          // If generation with tools fails, retry without tools
          logger?.error(
            "Error generating with tools in fallback flow, retrying without:",
            streamError
          );
          const fallbackWithoutToolsOptions = {
            model: createModelKey(modelId),
            messages: fallbackMessages, // Reuse the same properly typed messages
            docs: fallbackDocs,
            tools: [], // Remove tools completely
          };

          try {
            llmStreamResultFallback = aiInstance.generateStream(
              fallbackWithoutToolsOptions
            );
            logger?.info(
              "Successfully generating stream without tools in fallback flow"
            );
          } catch (fallbackError) {
            // If even the fallback fails, send an error and abort
            logger?.error(
              "Fatal streaming error in fallback flow, even fallback failed:",
              fallbackError
            );
            sendChunk({
              type: "error",
              error: `Failed to generate response: ${
                fallbackError instanceof Error
                  ? fallbackError.message
                  : String(fallbackError)
              }`,
            });
            return; // Exit the function early
          }
        }

        const pendingToolRequestsFallback = new Map<
          string,
          { name: string; input: unknown }
        >(); // Renamed

        for await (const chunk of llmStreamResultFallback.stream) {
          // Use renamed
          let currentTextOutput = "";
          if (Array.isArray(chunk.content)) {
            for (const part of chunk.content as Part[]) {
              if (part.text) {
                currentTextOutput += part.text;
              } else if (part.toolRequest) {
                if (currentTextOutput) {
                  sendChunk({ type: "text", text: currentTextOutput });
                  currentTextOutput = "";
                }
                if (part.toolRequest.ref && part.toolRequest.name) {
                  pendingToolRequestsFallback.set(part.toolRequest.ref, {
                    // Use renamed
                    name: part.toolRequest.name,
                    input: part.toolRequest.input,
                  });
                }
              } else if (part.toolResponse) {
                if (currentTextOutput) {
                  sendChunk({ type: "text", text: currentTextOutput });
                  currentTextOutput = "";
                }
                if (
                  part.toolResponse.ref &&
                  pendingToolRequestsFallback.has(part.toolResponse.ref)
                ) {
                  // Use renamed
                  const requestDetails = pendingToolRequestsFallback.get(
                    part.toolResponse.ref
                  ); // Removed forced assertion

                  // Add defensive coding to ensure properties exist
                  if (requestDetails) {
                    const toolName = requestDetails.name || "unknown-tool";
                    const toolInput = requestDetails.input || {};
                    const toolOutput = part.toolResponse.output || {};

                    sendChunk({
                      type: "tool_invocation",
                      name: toolName,
                      input: toolInput,
                      output: toolOutput,
                    });

                    pendingToolRequestsFallback.delete(part.toolResponse.ref);
                  } else {
                    console.error(
                      "[RAG] Missing tool request details in fallback flow:",
                      part.toolResponse.ref
                    );
                  }
                } else if (
                  part.toolResponse &&
                  typeof part.toolResponse === "object"
                ) {
                  // Add defensive coding to ensure toolResponse exists and has a name property
                  const toolName = part.toolResponse.name || "unknown-tool";
                  const toolOutput = part.toolResponse.output || {};

                  // Only send the tool invocation if we have a valid name
                  if (toolName) {
                    sendChunk({
                      type: "tool_invocation",
                      name: toolName,
                      input: undefined, // No input in this case
                      output: toolOutput,
                    });
                  } else {
                    console.error(
                      "[RAG] Invalid tool response without name in fallback flow:",
                      part.toolResponse
                    );
                  }
                }
              }
            }
            if (currentTextOutput) {
              sendChunk({ type: "text", text: currentTextOutput });
            }
          } else if (typeof chunk.content === "string" && chunk.content) {
            sendChunk({ type: "text", text: chunk.content });
          }
        }
        const finalResponseFallback = await llmStreamResultFallback.response; // Renamed
        if (
          finalResponseFallback.messages &&
          Array.isArray(finalResponseFallback.messages)
        ) {
          // Use renamed
          const finalToolRequestsFallback = new Map<string, ToolRequestPart>(); // Renamed
          for (const message of finalResponseFallback.messages) {
            // Use renamed
            if (message.role === "model" && Array.isArray(message.content)) {
              for (const part of message.content as Part[]) {
                if (part.toolRequest?.ref) {
                  finalToolRequestsFallback.set(
                    part.toolRequest.ref,
                    part as ToolRequestPart
                  ); // Use renamed
                }
              }
            } else if (
              message.role === "tool" &&
              Array.isArray(message.content)
            ) {
              for (const part of message.content as Part[]) {
                const toolResponsePart = part as ToolResponsePart;
                if (
                  toolResponsePart.toolResponse?.ref &&
                  finalToolRequestsFallback.has(
                    toolResponsePart.toolResponse.ref
                  )
                ) {
                  // Use renamed
                  const requestPart = finalToolRequestsFallback.get(
                    toolResponsePart.toolResponse.ref
                  ); // Use renamed without forced assertion

                  // Add defensive coding to prevent 'Cannot read properties of undefined (reading 'name')' error
                  if (requestPart && requestPart.toolRequest) {
                    // Ensure all required properties exist before sending
                    // Use safe property access with defaults for all fields
                    const toolName = requestPart.toolRequest.name || "unknown-tool";
                    const toolInput = requestPart.toolRequest.input || {};
                    
                    // Safe access to toolResponse output
                    const toolOutput = toolResponsePart.toolResponse && 
                      typeof toolResponsePart.toolResponse === 'object' ? 
                      (toolResponsePart.toolResponse.output || {}) : {};

                    // Send a properly formatted tool invocation event with complete data
                    sendChunk({
                      type: "tool_invocation",
                      name: toolName,
                      input: toolInput,
                      output: toolOutput,
                    });

                    // Only remove from map if successfully processed
                    finalToolRequestsFallback.delete(
                      toolResponsePart.toolResponse.ref
                    ); // Use renamed
                  } else {
                    console.error(
                      "[RAG] Missing tool request data:",
                      requestPart
                    );
                  }
                }
              }
            }
          }
        }
        return; // Fallback path completed
      }
    } catch (error: any) {
      logger?.error("Error in documentQaStreamFlow outer try:", error);
      sendChunk({
        type: "error",
        error: `I\'m sorry, there was an error generating a response: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return;
    }
  }
);

/**
 * Process a file for RAG functionality
 *
 * Processes and indexes a file using officeparser
 *
 * @param file - The file object to process
 * @param sessionId - Session ID for document association
 * @returns Object containing success status and any error message
 */
export async function processFileWithOfficeParser( // New name for clarity
  file: File,
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check file size (can keep this check)
    if (file.size > MAX_UPLOAD_SIZE) {
      return {
        success: false,
        error: `File size exceeds the maximum allowed size of 100MB`,
      };
    }

    // Note: officeparser supports various types, so we might relax the .pdf check
    // or add more supported extensions if needed. For now, keep PDF focus.
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return {
        success: false,
        error:
          "Currently configured for PDF files only (though officeparser supports more)",
      };
    }

    // Read the file as Buffer (required by officeparser)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer); // Convert ArrayBuffer to Buffer

    // Index the document using the buffer
    const indexed = await indexFileDocument(buffer, file.name, sessionId);

    if (!indexed) {
      return {
        success: false,
        error: "Failed to index the document",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error processing file:", error);
    return {
      success: false,
      error: `Error processing file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

// Number of documents to retrieve in the first stage
const INITIAL_RETRIEVAL_COUNT = 10;

// Number of documents to use after reranking
const FINAL_DOCUMENT_COUNT = 10;

/**
 * Generate a new session ID for RAG
 *
 * @returns A new session ID
 */
export function generateRagSessionId(): string {
  return `rag-${uuidv4()}`;
}

/**
 * Helper function to create stable string keys from model IDs
 * This helps avoid warnings about object keys being stringified
 * @param id - The model ID to convert to a stable string key
 * @returns The model ID as a string (no prefix needed anymore)
 */
export function createModelKey(id: string): string {
  // Return the ID as is - no prefix needed
  // This prevents issues with model lookup in Genkit
  return id;
}
