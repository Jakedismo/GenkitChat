import { extractText } from "@papra/lecture"; // Import @papra/lecture
import { Document } from "genkit/retriever";
import { chunk } from "llm-chunk";
import { aiInstance, ragIndexerRef } from "../genkit-server";
// import { Context as FlowContext } from "@genkit-ai/flow"; // REMOVED: This was causing issues
import * as fs from "fs/promises"; // Add fs/promises
import * as path from "path"; // Add path
import { v4 as uuidv4 } from "uuid";
import { HighlightCoordinates } from "../types/chat";
import { serverPdfProcessor } from "../utils/serverPdfProcessor";

const UPLOADS_DIR = path.join(process.cwd(), "uploads"); // Define base uploads dir

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
 * Enhanced document metadata including coordinate information
 */
export interface EnhancedDocumentMetadata {
  // Existing metadata
  documentId: string;
  chunkId: string;
  originalFileName: string;
  pageNumber: number;
  textToHighlight: string;
  chunkIndex: number;
  sessionId: string;
  timestamp: string;
  
  // New coordinate-related metadata
  totalPages?: number;
  hasCoordinateData?: boolean;
  textExtractionMethod?: 'server' | 'client' | 'none';
  position?: { // General bounding box for the chunk
    startPageNumber: number;
    endPageNumber: number;
    startPosition: { x: number; y: number };
    endPosition: { x: number; y: number };
  };
  processingStats?: {
    textExtractionTime?: number;
    coordinatesComputeTime?: number;
    chunksWithCoordinates?: number;
    totalChunks?: number;
    pageTextLength?: number;
    pageNumber?: number;
  };
  highlightCoordinates?: HighlightCoordinates[]; // Precise coordinates for specific text matches
  
  // Mapping between chunk indices and page numbers for multi-page navigation
  chunkPageMap?: [number, number][]; // Array of [chunkIndex, pageNumber] pairs
  
  // Additional RAG-specific metadata
  contentOverlap?: {
    prevChunk?: string; // ID of previous chunk that overlaps with this one
    nextChunk?: string; // ID of next chunk that overlaps with this one
    overlapText?: string; // The actual overlapping text
  };
}

/**
 * Indexes extracted text content to the vector store with enhanced PDF processing
 *
 * @param fileBuffer - Buffer containing the file data
 * @param fileName - Original name of the file
 * @param sessionId - Session ID for document association
 * @returns Whether the indexing was successful
 */
export async function indexFileDocument(
  fileBuffer: Buffer,
  fileName: string,
  sessionId: string
): Promise<boolean> {
  const allDocuments: Document[] = [];
  const documentId = `${sessionId}::${fileName}`;
  let overallChunkIndex = 0;
  const startTime = performance.now();

  try {
    // Determine MIME type (basic implementation based on extension)
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
    
    console.log(
      `Processing file: ${fileName} with MIME type: ${mimeType}`
    );

    // Enhanced processing for PDFs using server-side processor
    if (extension === "pdf") {
      return await processPdfWithCoordinates(fileBuffer, fileName, sessionId, documentId);
    }

    // For non-PDF files, use the original @papra/lecture extraction
    const arrayBufferCopy = new ArrayBuffer(fileBuffer.length);
    new Uint8Array(arrayBufferCopy).set(new Uint8Array(fileBuffer));

    const extractionResult = await extractText({
      arrayBuffer: arrayBufferCopy,
      mimeType,
    });
    const extractedText = extractionResult.textContent;

    if (!extractedText || extractedText.trim().length === 0) {
      console.warn(`Text extraction failed for ${fileName}`);
    } else {
      console.log(
        `Text extracted from ${fileName} (Length: ${extractedText.length})`
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
            pageNumber: 1, // Default to 1 for non-PDF files
            textToHighlight: text,
            chunkIndex: overallChunkIndex++,
            sessionId: sessionId,
            timestamp: new Date().toISOString(),
            hasCoordinateData: false,
            textExtractionMethod: 'client',
          } as EnhancedDocumentMetadata)
        );
      });
      console.log(`Extracted ${allDocuments.length} chunks from ${fileName}`);
    }

    // Index the documents if any were created
    if (allDocuments.length > 0) {
      if (!ragIndexerRef) {
        console.error("RAG indexer reference is not available");
        return false;
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

    return true;
  } catch (error) {
    console.error(
      `Error processing document ${fileName}:`,
      error
    );
    return false;
  }
}

/**
 * Process PDF files with enhanced coordinate data extraction
 *
 * @param fileBuffer - PDF file buffer
 * @param fileName - Original filename
 * @param sessionId - Current session ID
 * @param documentId - Document identifier
 * @returns Whether processing was successful
 */
async function processPdfWithCoordinates(
  fileBuffer: Buffer,
  fileName: string,
  sessionId: string,
  documentId: string
): Promise<boolean> {
  try {
    // Save the PDF to the uploads directory for server-side processing
    const sessionDir = path.join(UPLOADS_DIR, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    const filePath = path.join(sessionDir, fileName);
    await fs.writeFile(filePath, fileBuffer);
    
    console.log(`PDF file ${fileName} saved to ${filePath} for processing`);
    
    // Use server-side PDF processor to extract text and compute coordinates
    const enhancedResponse = await serverPdfProcessor.processPdf(
      filePath,
      {
        includeTextContent: true,
        includeCoordinates: false, // Coordinates will be computed per chunk later
      }
    );
    
    if (!enhancedResponse.textContent || enhancedResponse.textContent.length === 0) {
      console.warn(`Server-side text extraction failed for ${fileName}`);
      return false;
    }
    
    // Extract full text from all pages
    let fullText = '';
    const pageTextMap: Map<number, string> = new Map();
    
    enhancedResponse.textContent.forEach((pageContent: any) => {
      const pageText = pageContent.textItems
        .map((item: { str: string }) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      pageTextMap.set(pageContent.pageNumber, pageText);
      fullText += pageText + '\n\n';
    });
    
    // Instead of chunking the entire text, we'll chunk on a per-page basis
    // to preserve page boundaries and improve coordinate accuracy
    const allDocuments: Document[] = [];
    let overallChunkIndex = 0;
    let chunksWithCoordinates = 0;
    
    // Create a mapping from chunk index to page number for better navigation
    const chunkPageMap: Map<number, number> = new Map();
    
    // Process each page separately to maintain page-level chunking
    for (const [pageNum, pageText] of pageTextMap.entries()) {
      // Skip empty pages
      if (!pageText || pageText.trim().length === 0) continue;
      
      // Apply chunking to each page separately to preserve page boundaries
      const pageChunks = chunk(pageText, {
        ...CHUNKING_CONFIG,
        // For smaller pages, allow smaller chunks to preserve page boundaries
        minLength: Math.min(CHUNKING_CONFIG.minLength, Math.max(300, pageText.length / 2))
      });
      
      console.log(`Page ${pageNum}: Created ${pageChunks.length} chunks`);
      
      // Process each chunk within this page
      for (let i = 0; i < pageChunks.length; i++) {
        try {
          const chunkText = pageChunks[i];
          // Store mapping from chunk index to page number
          chunkPageMap.set(overallChunkIndex, pageNum);
          
          // Extract coordinates for this chunk with better coverage
          // Instead of just the first 200 chars, we'll try to get coordinates
          // for key sections of the chunk for better highlighting
          let highlightCoordinates: HighlightCoordinates[] | undefined;
          let chunkPosition: EnhancedDocumentMetadata['position'] | undefined;
          let lastSearchResult: any = null;
          
          // For longer chunks, extract coordinates from multiple parts
          const coordinateSections: HighlightCoordinates[] = [];
          
          // Calculate how many sections to sample based on chunk length
          const chunkLength = chunkText.length;
          const numSections = Math.min(3, Math.ceil(chunkLength / 500));
          
          // Try to get coordinates for beginning, middle, and end sections if long enough
          for (let secIdx = 0; secIdx < numSections; secIdx++) {
            const startPos = Math.floor((chunkLength * secIdx) / numSections);
            const sectionLength = Math.min(200, chunkLength - startPos);
            if (sectionLength <= 0) continue;
            
            const sectionText = chunkText.substring(startPos, startPos + sectionLength);
            
            // Skip very short or whitespace-only sections
            if (sectionText.trim().length < 10) continue;
            
            const searchResult = await serverPdfProcessor.processPdf(
              filePath,
              {
                includeTextContent: false,
                includeCoordinates: true,
                textToHighlight: sectionText,
                pageNumber: pageNum // Specify page number for more accurate results
              }
            );
            
            lastSearchResult = searchResult;
            
            if (searchResult.highlightCoordinates && searchResult.highlightCoordinates.length > 0) {
              coordinateSections.push(...searchResult.highlightCoordinates);
            }
          }
          
          // If we found coordinates in any section
          if (coordinateSections.length > 0) {
            highlightCoordinates = coordinateSections;
            chunksWithCoordinates++;
            
            // Create an aggregate bounding box for the entire chunk
            // by calculating the union of all section coordinates
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;
            
            coordinateSections.forEach(coord => {
              coord.rects.forEach(rect => {
                minX = Math.min(minX, rect.x);
                minY = Math.min(minY, rect.y);
                maxX = Math.max(maxX, rect.x + rect.width);
                maxY = Math.max(maxY, rect.y + rect.height);
              });
            });
            
            // Only create position if we have valid bounds
            if (minX < Infinity && minY < Infinity && maxX > -Infinity && maxY > -Infinity) {
              chunkPosition = {
                startPageNumber: pageNum,
                endPageNumber: pageNum, // Same page since we're chunking per page
                startPosition: { x: minX, y: maxY }, // Top-left
                endPosition: { x: maxX, y: minY },   // Bottom-right
              };
            }
          }
          
          // Store last search results for metadata
          const lastSearchResultsProcessingTime =
            coordinateSections.length > 0 ?
            lastSearchResult?.metadata?.processing?.processingTime :
            undefined;
            
          // Create document with enhanced metadata
          const chunkId = uuidv4();
          allDocuments.push(
            Document.fromText(chunkText, {
              documentId: documentId,
              chunkId: chunkId,
              originalFileName: fileName,
              pageNumber: pageNum, // We know exactly which page this chunk is from
              totalPages: enhancedResponse.metadata.pageCount,
              textToHighlight: chunkText,
              chunkIndex: overallChunkIndex++,
              sessionId: sessionId,
              timestamp: new Date().toISOString(),
              hasCoordinateData: !!chunkPosition,
              textExtractionMethod: 'server',
              highlightCoordinates: highlightCoordinates,
              position: chunkPosition,
              // Additional metadata for better RAG integration
              chunkPageMap: Array.from(chunkPageMap.entries()),
              processingStats: {
                textExtractionTime: enhancedResponse.metadata.processing.processingTime,
                coordinatesComputeTime: lastSearchResultsProcessingTime,
                totalChunks: pageChunks.length,
                chunksWithCoordinates: chunksWithCoordinates,
                pageTextLength: pageText.length,
                pageNumber: pageNum
              }
            } as EnhancedDocumentMetadata)
          );
        } catch (chunkError) {
          console.error(`Error processing chunk ${overallChunkIndex} of ${fileName}:`, chunkError);
          // Continue with other chunks
          overallChunkIndex++;
        }
      }
    }
    
    console.log(`Extracted ${allDocuments.length} chunks from PDF ${fileName}`);
    console.log(`${chunksWithCoordinates} chunks have coordinate data`);
    
    // Index the documents
    if (allDocuments.length > 0) {
      if (!ragIndexerRef) {
        console.error("RAG indexer reference is not available");
        return false;
      }

      await aiInstance.index({
        indexer: ragIndexerRef,
        documents: allDocuments,
      });
      
      console.log(
        `Indexed ${allDocuments.length} chunks from PDF ${fileName} for session ${sessionId}`
      );
    } else {
      console.log(`No indexable chunks extracted from ${fileName}.`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error in enhanced PDF processing for ${fileName}:`, error);
    return false;
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

    // Ensure the session-specific directory exists and save the file
    try {
      const sessionDir = path.join(UPLOADS_DIR, sessionId);
      await fs.mkdir(sessionDir, { recursive: true });
      const filePath = path.join(sessionDir, fileName);
      await fs.writeFile(filePath, fileBuffer);
      console.log(`File ${fileName} saved to ${filePath} for session ${sessionId}`);
    } catch (saveError: any) {
      console.error(`Error saving file ${fileName} for session ${sessionId}:`, saveError);
      // Decide if this error should prevent indexing or be logged and ignored
      // For now, we'll let indexing proceed but log the error.
      // return { success: false, error: `Failed to save file before indexing: ${saveError.message}` };
    }

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
