import {
  ragIndexerRef,
  ragRetrieverRef,
  aiInstance,
} from "@/lib/genkit-instance";
import { chunk } from "llm-chunk";
import { parseOfficeAsync } from "officeparser"; // Import officeparser
import { Document } from "genkit/retriever";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

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
} as any;

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
  try {
    // Extract text using officeparser
    console.log(`Extracting text from ${fileName} using officeparser...`);
    const extractedText = await parseOfficeAsync(fileBuffer);
    if (!extractedText) {
      console.error(`officeparser failed to extract text from ${fileName}`);
      return false;
    }
    console.log(
      `Text extracted from ${fileName} (Length: ${extractedText.length})`,
    );

    // Split the extracted text into chunks
    const chunks = await chunk(extractedText, CHUNKING_CONFIG);

    // Convert chunks into documents for indexing
    // Define a unique ID for the document being processed
    const documentId = `${sessionId}::${fileName}`;

    const documents = chunks.map((text, index) => {
      const chunkId = uuidv4(); // Generate a unique ID for each chunk
      return Document.fromText(text, {
        documentId: documentId, // Unique ID for the parent document
        chunkId: chunkId, // Unique ID for this specific chunk
        originalFileName: fileName, // Original name of the uploaded file
        chunkIndex: index, // Index of the chunk within the original document
        sessionId: sessionId, // Session ID for filtering
        timestamp: new Date().toISOString(),
      });
    });

    // Index the documents
    await aiInstance.index({
      indexer: ragIndexerRef,
      documents,
    });

    console.log(
      `Indexed ${documents.length} chunks from ${fileName} for session ${sessionId}`,
    );
    return true;
  } catch (error) {
    console.error("Error indexing PDF document:", error);
    return false;
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
  tools?: any[], // Changed GenkitTool[] to any[]
): Promise<
  AsyncIterable<{ sources?: Document[]; text?: string; error?: string }>
> {
  // Return AsyncIterable, now with sources
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
      // Return an AsyncIterable that yields the error message object
      return (async function* () {
        yield {
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
      return (async function* (): AsyncIterable<{ sources?: Document[]; text?: string; error?: string }> {
        // Yield sources first (cleaning metadata)
        const sourcesToYield = topDocs.map(({ metadata, ...rest }) => {
          const { score, ...metadataWithoutScore } = metadata || {};
          return { ...rest, metadata: metadataWithoutScore };
        });
        yield { sources: sourcesToYield as Document[] };

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
          tools: tools
        };

        // Call generateStream and iterate
        const llmStream = await aiInstance.generateStream(generateOptions);
        for await (const chunk of llmStream.stream) {
           // Handle potential content structures (text, tool calls etc.)
           // This part might need refinement based on how Genkit yields tool call info
           if (chunk.content) {
             const textOutput = Array.isArray(chunk.content)
               ? chunk.content.map(part => part.text || '').join('')
               : (typeof chunk.content === 'string' ? chunk.content : ''); // Handle plain string content too
             if (textOutput) {
                yield { text: textOutput };
             }
             // TODO: Add handling for chunk.isToolRequest() or similar if needed
           }
        }
      })(); // End of async generator function call

    } catch (rerankingError) { // Start of catch block for reranking
      console.error(
        "Error occurred during the reranking stage:",
        rerankingError,
      );
      console.log(
        "Falling back to standard retrieval using the initially filtered documents without reranking (streaming).",
      );

      const fallbackDocs = filteredDocs.slice(0, FINAL_DOCUMENT_COUNT);
      if (tools && tools.length > 0) {
        console.log(
          `Passing ${tools.length} tools to LLM along with FALLBACK RAG docs.`,
        );
      }

      // Return the async generator for fallback
      return (async function* (): AsyncIterable<{ sources?: Document[]; text?: string; error?: string }> {
         // Yield fallback sources first (cleaning metadata)
         const sourcesToYield = fallbackDocs.map(({ metadata, ...rest }) => {
           const { score, ...metadataWithoutScore } = metadata || {}; // Score might not exist here, but safer to handle
           return { ...rest, metadata: metadataWithoutScore };
         });
         yield { sources: sourcesToYield as Document[] };

         // Define options for generateStream
         const generateOptions = {
           model: modelId,
           prompt: `You are a helpful assistant. Answer the query based *primarily* on the provided documents.
However, you may use the available tools if the documents do not contain the necessary information or if the query explicitly asks for external data (like current events).
Always prioritize document information if available.
Query: ${query}
When citing a document, use its original file name and its 0-based index from the provided list. Format citations as [Source: <original_file_name>, Chunk: <index_in_list>]. Example: [Source: report.pdf, Chunk: 0].
Do not make up information not found in documents or tools.`,
           docs: fallbackDocs, // Use fallbackDocs
           tools: tools
         };

         // Call generateStream and iterate
         const llmStream = await aiInstance.generateStream(generateOptions);
         for await (const chunk of llmStream.stream) {
            if (chunk.content) {
              const textOutput = Array.isArray(chunk.content)
                ? chunk.content.map(part => part.text || '').join('')
                : (typeof chunk.content === 'string' ? chunk.content : '');
              if (textOutput) {
                 yield { text: textOutput };
              }
              // TODO: Add handling for chunk.isToolRequest() or similar if needed
            }
         }
      })(); // End of async generator function call
    } // End of catch block for reranking
  } catch (error) { // Catch block for the outer try (initial retrieval, etc.)
    console.error("Error preparing RAG response stream:", error);
    // Return an AsyncIterable that yields the error message object
    return (async function* () {
      yield {
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
