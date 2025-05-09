import {
  ragIndexerRef,
  ragRetrieverRef,
  aiInstance,
} from "@/genkit-server";
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
  sessionId: string,
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
      `Processing file: ${fileName} with MIME type: ${mimeType} using @papra/lecture`,
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
        `Text extracted from ${fileName} using @papra/lecture (Length: ${extractedText.length})`,
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
          }),
        );
      });
      console.log(`Extracted ${allDocuments.length} chunks from ${fileName}`);
    }

    // Index the documents if any were created
    if (allDocuments.length > 0) {
      await aiInstance.index({
        indexer: ragIndexerRef,
        documents: allDocuments,
      });
      console.log(
        `Indexed ${allDocuments.length} total chunks from ${fileName} for session ${sessionId}`,
      );
    } else {
      console.log(`No indexable chunks extracted from ${fileName}.`);
    }

    return true; // Indicate processing completed (even if no text extracted)
  } catch (error) {
    console.error(
      `Error processing document ${fileName} with @papra/lecture:`,
      error,
    );
    return false; // Indicate failure
  }
}

export const documentQaStreamFlow = aiInstance.defineFlow(
  {
    name: "documentQaStreamFlow",
    inputSchema: RagFlowInputSchema,
    outputSchema: z.void(),
    streamSchema: RagStreamEventSchemaZod,
  },
  async (input: RagFlowInput, { sendChunk, context }) => {
    const { query, sessionId, modelId, tools } = input;
    const logger = context?.logger; // Get logger from context, handle if context is undefined

    const ragAssistantPrompt = await aiInstance.prompt("rag_assistant");
    try {
      logger?.info(`RAG query: \\\"${query}\\\" for session: ${sessionId}`);

      // Stage 1: Retrieve a larger initial set of documents
      const initialK = INITIAL_RETRIEVAL_COUNT;
      const docs = await aiInstance.retrieve({
        retriever: ragRetrieverRef,
        query: query,
        options: {
          k: initialK,
        },
      });

      // Filter by session ID
      const filteredDocs = docs.filter(
        (doc: Document) => doc.metadata && doc.metadata.sessionId === sessionId,
      );

      if (!filteredDocs || filteredDocs.length === 0) {
        logger?.warn(`No documents found for session: ${sessionId}`);
        sendChunk({
          type: "error",
          error:
            "I couldn't find any relevant information in the documents you provided. Could you try rephrasing your question or uploading a document that might contain the answer?",
        });
        return;
      }

      logger?.info( // Corrected from logger.info to logger?.info
        `Retrieved ${filteredDocs.length} initial documents for query. Attempting reranking...`,
      );

      // Stage 2: Rerank the filtered documents
      try {
        logger?.info("Starting reranking with Vertex AI Reranker...");
        // const rerankModelIdForLLMCompReranker = "openai/gpt-4.1-nano"; // No longer needed for Vertex AI reranker
        const rerankedDocsWithScores = await aiInstance.rerank({
          reranker: "vertexai/reranker", // Using standard Vertex AI reranker
          query: Document.fromText(query), // Query should be a Document
          documents: filteredDocs,
          // Options like rerankModelId are not typically needed for standard Vertex AI rerankers
        });

        logger?.info(
          `Finished reranking with LLM. Got ${rerankedDocsWithScores.length} results.`,
        );

        const finalK = FINAL_DOCUMENT_COUNT;
        const topDocs = rerankedDocsWithScores.slice(0, finalK);

        logger?.info(
          `Selected top ${topDocs.length} documents after LLM reranking`,
        );
        if (tools && tools.length > 0) {
          logger?.info(
            `Passing ${tools.length} tools to LLM along with RAG docs.`,
          );
        }

        topDocs.forEach((doc: Document, index: number) => {
          logger?.debug(
            `Document ${index + 1} score: ${doc.metadata?.score || "N/A"}`,
          );
        });

        // Yield sources first
        const sourcesToYield = topDocs.map(({ metadata, ...rest }: Document) => {
          const { score, ...metadataWithoutScore } = metadata || {};
          return { ...rest, metadata: metadataWithoutScore };
        });
        sendChunk({ type: "sources", sources: sourcesToYield as Document[] });

        const promptResult = await ragAssistantPrompt({
          query: query,
          resolvedModelId: modelId,
        });

        const generateOptions = {
          model: modelId,
          messages: promptResult.messages,
          docs: topDocs,
          tools: tools,
        };

        const pendingToolRequests = new Map<string, { name: string; input: unknown }>();
        const llmStreamResult = await aiInstance.generateStream(generateOptions);

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
                if (part.toolResponse.ref && pendingToolRequests.has(part.toolResponse.ref)) {
                  const requestDetails = pendingToolRequests.get(part.toolResponse.ref)!;
                  sendChunk({
                    type: "tool_invocation",
                    name: requestDetails.name,
                    input: requestDetails.input,
                    output: part.toolResponse.output,
                  });
                  pendingToolRequests.delete(part.toolResponse.ref);
                } else if (part.toolResponse.name) {
                   sendChunk({
                    type: "tool_invocation",
                    name: part.toolResponse.name,
                    input: undefined,
                    output: part.toolResponse.output,
                  });
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

        const finalResponse = await llmStreamResult.response;
        if (finalResponse.messages && Array.isArray(finalResponse.messages)) {
          const finalToolRequests = new Map<string, ToolRequestPart>();
          for (const message of finalResponse.messages) {
            if (message.role === "model" && Array.isArray(message.content)) {
              for (const part of message.content as Part[]) {
                if (part.toolRequest?.ref) {
                  finalToolRequests.set(part.toolRequest.ref, part as ToolRequestPart);
                }
              }
            } else if (message.role === "tool" && Array.isArray(message.content)) {
              for (const part of message.content as Part[]) {
                const toolResponsePart = part as ToolResponsePart;
                if (toolResponsePart.toolResponse?.ref && finalToolRequests.has(toolResponsePart.toolResponse.ref)) {
                  const requestPart = finalToolRequests.get(toolResponsePart.toolResponse.ref)!;
                  sendChunk({
                    type: "tool_invocation",
                    name: requestPart.toolRequest.name,
                    input: requestPart.toolRequest.input,
                    output: toolResponsePart.toolResponse.output,
                  });
                  finalToolRequests.delete(toolResponsePart.toolResponse.ref);
                }
              }
            }
          }
        }
        return; // Successful path ends
      } catch (rerankingError: any) {
        logger?.error("Error occurred during the reranking stage:", rerankingError);
        logger?.info("Falling back to standard retrieval without reranking.");

        const fallbackDocs = filteredDocs.slice(0, FINAL_DOCUMENT_COUNT);
        if (tools && tools.length > 0) {
          logger?.info(`Passing ${tools.length} tools to LLM along with FALLBACK RAG docs.`);
        }
        
        const sourcesToYield = fallbackDocs.map(({ metadata, ...rest }: Document) => {
          const { score, ...metadataWithoutScore } = metadata || {};
          return { ...rest, metadata: metadataWithoutScore };
        });
        sendChunk({ type: "sources", sources: sourcesToYield as Document[] });

        const promptResultFallback = await ragAssistantPrompt({
          query: query,
          resolvedModelId: modelId,
        });

        const generateOptionsFallback = { // Renamed to avoid conflict
          model: modelId,
          messages: promptResultFallback.messages,
          docs: fallbackDocs,
          tools: tools,
        };

        const llmStreamResultFallback = await aiInstance.generateStream(generateOptionsFallback); // Renamed
        const pendingToolRequestsFallback = new Map<string, { name: string; input: unknown }>(); // Renamed

        for await (const chunk of llmStreamResultFallback.stream) { // Use renamed
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
                  pendingToolRequestsFallback.set(part.toolRequest.ref, { // Use renamed
                    name: part.toolRequest.name,
                    input: part.toolRequest.input,
                  });
                }
              } else if (part.toolResponse) {
                if (currentTextOutput) {
                  sendChunk({ type: "text", text: currentTextOutput });
                  currentTextOutput = "";
                }
                if (part.toolResponse.ref && pendingToolRequestsFallback.has(part.toolResponse.ref)) { // Use renamed
                  const requestDetails = pendingToolRequestsFallback.get(part.toolResponse.ref)!; // Use renamed
                  sendChunk({
                    type: "tool_invocation",
                    name: requestDetails.name,
                    input: requestDetails.input,
                    output: part.toolResponse.output,
                  });
                  pendingToolRequestsFallback.delete(part.toolResponse.ref); // Use renamed
                } else if (part.toolResponse.name) {
                  sendChunk({
                    type: "tool_invocation",
                    name: part.toolResponse.name,
                    input: undefined,
                    output: part.toolResponse.output,
                  });
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
        if (finalResponseFallback.messages && Array.isArray(finalResponseFallback.messages)) { // Use renamed
          const finalToolRequestsFallback = new Map<string, ToolRequestPart>(); // Renamed
          for (const message of finalResponseFallback.messages) { // Use renamed
            if (message.role === "model" && Array.isArray(message.content)) {
              for (const part of message.content as Part[]) {
                if (part.toolRequest?.ref) {
                  finalToolRequestsFallback.set(part.toolRequest.ref, part as ToolRequestPart); // Use renamed
                }
              }
            } else if (message.role === "tool" && Array.isArray(message.content)) {
              for (const part of message.content as Part[]) {
                const toolResponsePart = part as ToolResponsePart;
                if (toolResponsePart.toolResponse?.ref && finalToolRequestsFallback.has(toolResponsePart.toolResponse.ref)) { // Use renamed
                  const requestPart = finalToolRequestsFallback.get(toolResponsePart.toolResponse.ref)!; // Use renamed
                  sendChunk({
                    type: "tool_invocation",
                    name: requestPart.toolRequest.name,
                    input: requestPart.toolRequest.input,
                    output: toolResponsePart.toolResponse.output,
                  });
                  finalToolRequestsFallback.delete(toolResponsePart.toolResponse.ref); // Use renamed
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
        error: `I\'m sorry, there was an error generating a response: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
  },
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
  sessionId: string,
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
      error: `Error processing file: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Number of documents to retrieve in the first stage
const INITIAL_RETRIEVAL_COUNT = 10;

// Number of documents to use after reranking
const FINAL_DOCUMENT_COUNT = 10;

/**
 * Simple similarity score calculation between a query and document text
 * This simulates a reranking score when the Vertex AI reranker isn't available
 *
 * @param query - The search query
 * @param text - The document text to compare against
 * @returns A similarity score between 0-1
 */
function simpleSimilarityScore(query: string, text: string): number {
  // Convert both to lowercase for case-insensitive matching
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Split query into words
  const queryWords = queryLower.split(/\s+/).filter((word) => word.length > 3);

  if (queryWords.length === 0) return 0;

  // Count how many query words appear in the text
  let matchCount = 0;
  for (const word of queryWords) {
    if (textLower.includes(word)) {
      matchCount++;
    }
  }

  // Calculate score as percentage of query words found
  return matchCount / queryWords.length;
}

/**
 * Generate a new session ID for RAG
 *
 * @returns A new session ID
 */
export function generateRagSessionId(): string {
  return `rag-${uuidv4()}`;
}
