import { ragIndexerRef, ragRetrieverRef, aiInstance } from "@/genkit-server";
import { chunk } from "llm-chunk";
import { extractText } from "@papra/lecture"; // Import @papra/lecture
import { Document } from "genkit/retriever";
// import { Context as FlowContext } from "@genkit-ai/flow"; // REMOVED: This was causing issues
import { v4 as uuidv4 } from "uuid";

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

// Removed documentQaStreamFlow

export const generateRagSessionId = (): string => {
  return uuidv4();
};

export async function processFileWithOfficeParser(
  file: File,
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const fileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const indexingSuccess = await indexFileDocument(fileBuffer, fileName, sessionId);

    if (indexingSuccess) {
      return { success: true };
    } else {
      return { success: false, error: "Failed to index file document after parsing." };
    }
  } catch (error: any) {
    console.error(
      `Error in processFileWithOfficeParser for file '${file.name}' and session '${sessionId}':`,
      error
    );
    return { success: false, error: error.message || "An unknown error occurred during file processing." };
  }
}
