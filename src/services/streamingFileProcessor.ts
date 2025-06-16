import { Document } from "genkit/retriever";
import { chunk } from "llm-chunk";
import { v4 as uuidv4 } from "uuid";
import { CHUNKING_CONFIG } from "./rag";

interface StreamingProcessorOptions {
  chunkSize?: number;
  onProgress?: (progress: { processed: number; total: number }) => void;
  onChunkProcessed?: (chunk: Document) => void;
}

/**
 * Processes large files in streaming fashion to prevent memory exhaustion
 */
export class StreamingFileProcessor {
  private readonly options: StreamingProcessorOptions;
  private readonly defaultChunkSize = 1024 * 1024; // 1MB chunks

  constructor(options: StreamingProcessorOptions = {}) {
    this.options = {
      chunkSize: options.chunkSize || this.defaultChunkSize,
      ...options,
    };
  }

  /**
   * Process a file buffer in chunks to avoid memory issues
   */
  async processFileBuffer(
    fileBuffer: Buffer,
    fileName: string,
    sessionId: string,
    mimeType: string
  ): Promise<Document[]> {
    const documents: Document[] = [];
    const totalSize = fileBuffer.length;
    let processedSize = 0;
    let overallChunkIndex = 0;

    // For very large files, process in smaller chunks
    if (totalSize > this.options.chunkSize!) {
      console.log(`Processing large file ${fileName} (${totalSize} bytes) in streaming mode`);
      
      for (let offset = 0; offset < totalSize; offset += this.options.chunkSize!) {
        const chunkEnd = Math.min(offset + this.options.chunkSize!, totalSize);
        const chunk = fileBuffer.subarray(offset, chunkEnd);
        
        try {
          // Process this chunk
          const chunkDocuments = await this.processChunk(
            chunk,
            fileName,
            sessionId,
            mimeType,
            overallChunkIndex,
            offset
          );
          
          documents.push(...chunkDocuments);
          overallChunkIndex += chunkDocuments.length;
          processedSize = chunkEnd;
          
          // Report progress
          if (this.options.onProgress) {
            this.options.onProgress({
              processed: processedSize,
              total: totalSize,
            });
          }
          
          // Yield control to prevent blocking
          await new Promise(resolve => setImmediate(resolve));
          
        } catch (error) {
          console.error(`Error processing chunk at offset ${offset}:`, error);
          // Continue with next chunk rather than failing entirely
        }
      }
    } else {
      // For smaller files, process normally
      const chunkDocuments = await this.processChunk(
        fileBuffer,
        fileName,
        sessionId,
        mimeType,
        overallChunkIndex,
        0
      );
      documents.push(...chunkDocuments);
    }

    return documents;
  }

  /**
   * Process a single chunk of file data
   */
  private async processChunk(
    chunkBuffer: Buffer,
    fileName: string,
    sessionId: string,
    mimeType: string,
    startingChunkIndex: number,
    offset: number
  ): Promise<Document[]> {
    const documents: Document[] = [];
    
    try {
      // Dynamic import to avoid loading heavy dependencies during build
      const { extractText } = await import("@papra/lecture");
      
      // Create ArrayBuffer from chunk
      const arrayBufferCopy = new ArrayBuffer(chunkBuffer.length);
      new Uint8Array(arrayBufferCopy).set(new Uint8Array(chunkBuffer));

      const extractionResult = await extractText({
        arrayBuffer: arrayBufferCopy,
        mimeType,
      });

      const extractedText = extractionResult.textContent;

      if (extractedText && extractedText.trim().length > 0) {
        // Chunk the extracted text
        const textChunks = chunk(extractedText, CHUNKING_CONFIG);

        // Create Document objects
        textChunks.forEach((text, index) => {
          const chunkId = uuidv4();
          const document = Document.fromText(text, {
            documentId: `${sessionId}::${fileName}`,
            chunkId: chunkId,
            originalFileName: fileName,
            pageNumber: Math.floor(offset / this.options.chunkSize!) + 1,
            textToHighlight: text,
            chunkIndex: startingChunkIndex + index,
            sessionId: sessionId,
            timestamp: new Date().toISOString(),
            fileOffset: offset,
          });
          
          documents.push(document);
          
          // Notify about processed chunk
          if (this.options.onChunkProcessed) {
            this.options.onChunkProcessed(document);
          }
        });
      }
    } catch (error) {
      console.error(`Error extracting text from chunk:`, error);
      throw error;
    }

    return documents;
  }

  /**
   * Estimate memory usage for a file
   */
  static estimateMemoryUsage(fileSize: number): {
    estimated: number;
    recommendation: 'stream' | 'normal';
  } {
    // Rough estimate: file size * 3 (original + extracted text + processed chunks)
    const estimated = fileSize * 3;
    const maxSafeMemory = 50 * 1024 * 1024; // 50MB threshold
    
    return {
      estimated,
      recommendation: estimated > maxSafeMemory ? 'stream' : 'normal',
    };
  }
}

/**
 * Factory function to create a streaming processor with progress reporting
 */
export function createStreamingProcessor(
  onProgress?: (progress: { processed: number; total: number; percentage: number }) => void
): StreamingFileProcessor {
  return new StreamingFileProcessor({
    onProgress: onProgress ? (progress) => {
      const percentage = Math.round((progress.processed / progress.total) * 100);
      onProgress({ ...progress, percentage });
    } : undefined,
  });
}
