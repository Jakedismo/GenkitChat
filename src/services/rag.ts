import {
  ragIndexerRef,
  ragRetrieverRef,
  aiInstance,
} from "@/lib/genkit-instance";
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
    let mimeType = 'application/octet-stream'; // Default
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (extension === 'pdf') {
      mimeType = 'application/pdf';
    } else if (extension === 'txt') {
      mimeType = 'text/plain';
    } else if (extension === 'md') {
      mimeType = 'text/markdown';
    } else if (extension === 'yaml' || extension === 'yml') {
      mimeType = 'application/x-yaml';
    } else if (extension === 'csv') {
      mimeType = 'text/csv';
    }
    // Add more types as needed, corresponding to @papra/lecture support

    console.log(`Processing file: ${fileName} with MIME type: ${mimeType} using @papra/lecture`);

    // Extract text using @papra/lecture
    // Create a new ArrayBuffer by copying the contents of fileBuffer.
    // This ensures it's a true ArrayBuffer and not SharedArrayBuffer,
    // and avoids issues with byte offsets if fileBuffer is a view into a larger buffer.
    const arrayBufferCopy = new ArrayBuffer(fileBuffer.length);
    new Uint8Array(arrayBufferCopy).set(new Uint8Array(fileBuffer));

    const extractionResult = await extractText({ arrayBuffer: arrayBufferCopy, mimeType });
    const extractedText = extractionResult.textContent;

    if (!extractedText || extractedText.trim().length === 0) {
      console.warn(`@papra/lecture did not extract text from ${fileName}`);
      // Consider returning true but with no documents indexed, or false if extraction failure is critical
    } else {
       console.log(
        `Text extracted from ${fileName} using @papra/lecture (Length: ${extractedText.length})`,
      );

      // Chunk the extracted text
      const chunks = await chunk(extractedText, CHUNKING_CONFIG);

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
    console.error(`Error processing document ${fileName} with @papra/lecture:`, error);
    return false; // Indicate failure
  }
}

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
 * Generate a response using RAG with two-stage retrieval and reranking
 *
 * @param query - User query
 * @param sessionId - Session ID to filter documents
 * @param modelId - ID of the model to use for generation
 * @returns An AsyncIterable containing the response chunks
 */
export async function generateRagResponseStream(
  query: string,
  sessionId: string,
  modelId: string,
  tools?: string[], // Expecting tool names as strings now
): Promise<AsyncIterable<RagStreamEvent>> {
  try {
    console.log(`RAG query: \"${query}\" for session: ${sessionId}`);

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
      (doc) => doc.metadata && doc.metadata.sessionId === sessionId,
    );

    if (!filteredDocs || filteredDocs.length === 0) {
      console.log("No documents found for session:", sessionId);
      return (async function* (): AsyncIterable<RagStreamEvent> {
        yield {
          type: "error",
          error:
            "I couldn't find any relevant information in the documents you provided. Could you try rephrasing your question or uploading a document that might contain the answer?",
        };
      })();
    }

    console.log(
      `Retrieved ${filteredDocs.length} initial documents for query. Attempting reranking...`,
    );

    // Stage 2: Rerank the filtered documents based on similarity to query
    try {
      console.log("Starting similarity score calculation for reranking...");
      // Calculate a similarity score for each document
      const scoredDocs = filteredDocs.map((doc, index) => {
        console.log(`Processing document ${index + 1} for scoring...`);
        // Extract document text content
        let text = "";
        if (typeof doc.content === "string") {
          text = doc.content;
        } else if (Array.isArray(doc.content) && doc.content.length > 0) {
          // Handle the case where content is an array of content items
          const textItems = doc.content
            .filter((item) => item && typeof item.text === "string")
            .map((item) => item.text);
          text = textItems.join(" ");
        }

        // Calculate similarity score
        const score = simpleSimilarityScore(query, text);

        // Add score to metadata
        return {
          ...doc,
          metadata: {
            ...doc.metadata,
            score,
          },
        };
      });

      // Sort by score (highest first)
      const rerankedDocs = scoredDocs.sort((a, b) => {
        return (b.metadata?.score || 0) - (a.metadata?.score || 0);
      });
      console.log("Finished sorting documents by score.");

      // Select the top K documents after reranking
      const finalK = FINAL_DOCUMENT_COUNT;
      const topDocs = rerankedDocs.slice(0, finalK);

      console.log(`Reranked and returning top ${topDocs.length} documents`);
      if (tools && tools.length > 0) {
        console.log(
          `Passing ${tools.length} tools to LLM along with RAG docs.`,
        );
      }

      // Log reranking scores for debugging
      topDocs.forEach((doc, index) => {
        console.log(
          `Document ${index + 1} score: ${doc.metadata?.score || "N/A"}`,
        );
      });

      // Return the async generator
      return (async function* (): AsyncIterable<RagStreamEvent> {
        // Yield sources first (cleaning metadata)
        const sourcesToYield = topDocs.map(({ metadata, ...rest }) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { score, ...metadataWithoutScore } = metadata || {};
          return { ...rest, metadata: metadataWithoutScore };
        });
        yield { type: "sources", sources: sourcesToYield as Document[] };

        // Define options for generateStream
        const generateOptions = {
          model: modelId,
          prompt: `You are a helpful assistant. Answer the query based *primarily* on the provided documents.
However, you may use the available tools if the documents do not contain the necessary information or if the query explicitly asks for external data (like current events).
Always prioritize document information if available.
Query: ${query}
When citing a document, use its original file name and its 0-based index from the provided list. Format citations as [Source: <original_file_name>, Chunk: <index_in_list>]. Example: [Source: report.pdf, Chunk: 0].
Do not make up information not found in documents or tools.`,
          docs: topDocs, // Use the original topDocs (with score metadata) for the LLM call
          tools: tools, // tools here are string names
        };

        const pendingToolRequests = new Map<
          string,
          { name: string; input: unknown }
        >(); // Use unknown

        // Call generateStream and iterate
        const llmStreamResult =
          await aiInstance.generateStream(generateOptions);
        for await (const chunk of llmStreamResult.stream) {
          let currentTextOutput = "";
          if (Array.isArray(chunk.content)) {
            for (const part of chunk.content as Part[]) {
              if (part.text) {
                currentTextOutput += part.text;
              } else if (part.toolRequest) {
                if (currentTextOutput) {
                  yield { type: "text", text: currentTextOutput };
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
                  yield { type: "text", text: currentTextOutput };
                  currentTextOutput = "";
                }
                if (
                  part.toolResponse.ref &&
                  pendingToolRequests.has(part.toolResponse.ref)
                ) {
                  const requestDetails = pendingToolRequests.get(
                    part.toolResponse.ref,
                  )!;
                  yield {
                    type: "tool_invocation",
                    name: requestDetails.name,
                    input: requestDetails.input,
                    output: part.toolResponse.output,
                    // If error information is needed, it should be part of the tool's 'output' field
                  };
                  pendingToolRequests.delete(part.toolResponse.ref);
                } else if (part.toolResponse.name) {
                  yield {
                    type: "tool_invocation",
                    name: part.toolResponse.name,
                    input: undefined,
                    output: part.toolResponse.output,
                    // If error information is needed, it should be part of the tool's 'output' field
                  };
                }
              }
            }
            if (currentTextOutput) {
              yield { type: "text", text: currentTextOutput };
            }
          } else if (typeof chunk.content === "string" && chunk.content) {
            yield { type: "text", text: chunk.content };
          }
        }
        const finalResponse = await llmStreamResult.response; // Corrected: .response (getter)
        if (finalResponse.messages && Array.isArray(finalResponse.messages)) {
          const finalToolRequests = new Map<string, ToolRequestPart>();
          for (const message of finalResponse.messages) {
            if (message.role === "model" && Array.isArray(message.content)) {
              for (const part of message.content as Part[]) {
                if (part.toolRequest?.ref) {
                  finalToolRequests.set(
                    part.toolRequest.ref,
                    part as ToolRequestPart,
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
                    toolResponsePart.toolResponse.ref,
                  )!;
                  yield {
                    type: "tool_invocation",
                    name: requestPart.toolRequest.name,
                    input: requestPart.toolRequest.input,
                    output: toolResponsePart.toolResponse.output,
                    // If error information is needed, it should be part of the tool's 'output' field
                  };
                  finalToolRequests.delete(toolResponsePart.toolResponse.ref);
                }
              }
            }
          }
        }
      })(); // End of async generator function call for successful reranking path
    } catch (rerankingError) {
      // Start of catch block for reranking
      console.error(
        "Error occurred during the reranking stage:",
        rerankingError,
      );
      console.log(
        "Falling back to standard retrieval using the initially filtered documents without reranking (streaming).",
      );

      const fallbackDocs = filteredDocs.slice(0, FINAL_DOCUMENT_COUNT); // fallbackDocs defined here
      if (tools && tools.length > 0) {
        console.log(
          `Passing ${tools.length} tools to LLM along with FALLBACK RAG docs.`,
        );
      }
      // Return the async generator for fallback
      return (async function* (): AsyncIterable<RagStreamEvent> {
        // This generator is now inside catch
        // Yield fallback sources first (cleaning metadata)
        const sourcesToYield = fallbackDocs.map(({ metadata, ...rest }) => {
          // fallbackDocs is in scope
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { score, ...metadataWithoutScore } = metadata || {};
          return { ...rest, metadata: metadataWithoutScore };
        });
        yield { type: "sources", sources: sourcesToYield as Document[] };

        const generateOptions = {
          model: modelId,
          prompt: `You are a helpful assistant. Answer the query based *primarily* on the provided documents.
However, you may use the available tools if the documents do not contain the necessary information or if the query explicitly asks for external data (like current events).
Always prioritize document information if available.
Query: ${query}
When citing a document, use its original file name and its 0-based index from the provided list. Format citations as [Source: <original_file_name>, Chunk: <index_in_list>]. Example: [Source: report.pdf, Chunk: 0].
Do not make up information not found in documents or tools.`,
          docs: fallbackDocs, // Use fallbackDocs
          tools: tools,
        };

        const llmStreamResult =
          await aiInstance.generateStream(generateOptions);
        const pendingToolRequests = new Map<
          string,
          { name: string; input: unknown }
        >(); // Use unknown

        for await (const chunk of llmStreamResult.stream) {
          let currentTextOutput = "";
          if (Array.isArray(chunk.content)) {
            for (const part of chunk.content as Part[]) {
              if (part.text) {
                currentTextOutput += part.text;
              } else if (part.toolRequest) {
                if (currentTextOutput) {
                  yield { type: "text", text: currentTextOutput };
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
                  yield { type: "text", text: currentTextOutput };
                  currentTextOutput = "";
                }
                if (
                  part.toolResponse.ref &&
                  pendingToolRequests.has(part.toolResponse.ref)
                ) {
                  const requestDetails = pendingToolRequests.get(
                    part.toolResponse.ref,
                  )!;
                  yield {
                    type: "tool_invocation",
                    name: requestDetails.name,
                    input: requestDetails.input,
                    output: part.toolResponse.output,
                    // If error information is needed, it should be part of the tool's 'output' field
                  };
                  pendingToolRequests.delete(part.toolResponse.ref);
                } else if (part.toolResponse.name) {
                  yield {
                    type: "tool_invocation",
                    name: part.toolResponse.name,
                    input: undefined,
                    output: part.toolResponse.output,
                    // If error information is needed, it should be part of the tool's 'output' field
                  };
                }
              }
            }
            if (currentTextOutput) {
              yield { type: "text", text: currentTextOutput };
            }
          } else if (typeof chunk.content === "string" && chunk.content) {
            yield { type: "text", text: chunk.content };
          }
        }
        // Final check for tool invocations from the complete response (similar to non-fallback)
        const finalResponse = await llmStreamResult.response;
        if (finalResponse.messages && Array.isArray(finalResponse.messages)) {
          const finalToolRequests = new Map<string, ToolRequestPart>();
          for (const message of finalResponse.messages) {
            if (message.role === "model" && Array.isArray(message.content)) {
              for (const part of message.content as Part[]) {
                if (part.toolRequest?.ref) {
                  finalToolRequests.set(
                    part.toolRequest.ref,
                    part as ToolRequestPart,
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
                    toolResponsePart.toolResponse.ref,
                  )!;
                  yield {
                    type: "tool_invocation",
                    name: requestPart.toolRequest.name,
                    input: requestPart.toolRequest.input,
                    output: toolResponsePart.toolResponse.output,
                    // If error information is needed, it should be part of the tool's 'output' field
                  };
                  finalToolRequests.delete(toolResponsePart.toolResponse.ref);
                }
              }
            }
          }
        }
      })(); // End of async generator function call
    } // End of catch block for reranking
  } catch (error) {
    // Catch block for the outer try (initial retrieval, etc.)
    console.error("Error preparing RAG response stream:", error);
    return (async function* (): AsyncIterable<RagStreamEvent> {
      yield {
        type: "error",
        error: `I'm sorry, there was an error generating a response: ${error instanceof Error ? error.message : String(error)}`,
      };
    })();
  }
}

/**
 * Generate a new session ID for RAG
 *
 * @returns A new session ID
 */
export function generateRagSessionId(): string {
  return `rag-${uuidv4()}`;
}
