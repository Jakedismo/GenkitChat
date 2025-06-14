import { HighlightCoordinates } from '@/types/chat';
import fs from 'fs/promises';
import { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfTextMapper } from './pdfTextMapper';

// We'll set the worker path when the module is loaded dynamically

/**
 * Text item extracted from PDF page with positional information
 */
interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  dir?: string;
  fontName?: string;
}

/**
 * Contains text content information for a single PDF page
 */
export interface PageTextContent {
  pageNumber: number;
  textItems: TextItem[];
  width: number;
  height: number;
}

/**
 * Response object containing both the PDF data and extracted information
 */
export interface EnhancedPdfResponse {
  pdfBuffer: Buffer;
  textContent?: PageTextContent[];
  highlightCoordinates?: HighlightCoordinates[];
  metadata: {
    pageCount: number;
    fileSize: number;
    processing: {
      textExtracted: boolean;
      coordinatesPrecomputed: boolean;
      processingTime?: number;
      cacheHit?: boolean;
    };
  };
}

/**
 * Simple in-memory cache to store extracted text and computed coordinates
 * In a production environment, this should be replaced with a proper caching solution
 */
export class PdfProcessingCache {
  private static instance: PdfProcessingCache;
  private cache: Map<string, {
    textContent?: PageTextContent[];
    highlights?: Map<string, Map<number | undefined, HighlightCoordinates[]>>;
    timestamp: number;
    hitCount: number;
    missCount: number;
  }> = new Map();
  
  // 30 minutes cache expiration (in milliseconds)
  private CACHE_EXPIRATION = 30 * 60 * 1000;
  
  private constructor() {}
  
  public static getInstance(): PdfProcessingCache {
    if (!PdfProcessingCache.instance) {
      PdfProcessingCache.instance = new PdfProcessingCache();
    }
    return PdfProcessingCache.instance;
  }

  /**
   * Get cached text content for a PDF document
   */
  public getTextContent(documentKey: string): { data: PageTextContent[] | undefined, cacheHit: boolean } {
    const entry = this.cache.get(documentKey);
    if (!entry) return { data: undefined, cacheHit: false };
    
    // Check if cache has expired
    if (Date.now() - entry.timestamp > this.CACHE_EXPIRATION) {
      this.cache.delete(documentKey);
      return { data: undefined, cacheHit: false };
    }
    
    if (entry.textContent) {
      // Update hit count
      entry.hitCount++;
      this.cache.set(documentKey, entry);
      return { data: entry.textContent, cacheHit: true };
    }
    
    return { data: undefined, cacheHit: false };
  }
  
  /**
   * Get cached highlight coordinates for a PDF document, text, and optional page number
   */
  public getHighlightCoordinates(
    documentKey: string,
    textToHighlight: string,
    pageNumber?: number
  ): { data: HighlightCoordinates[] | undefined, cacheHit: boolean } {
    const entry = this.cache.get(documentKey);
    if (!entry || !entry.highlights) return { data: undefined, cacheHit: false };
    
    // Check if cache has expired
    if (Date.now() - entry.timestamp > this.CACHE_EXPIRATION) {
      this.cache.delete(documentKey);
      return { data: undefined, cacheHit: false };
    }
    
    const textEntry = entry.highlights.get(textToHighlight);
    if (!textEntry) return { data: undefined, cacheHit: false };
    
    // Try to get page-specific highlights first, if pageNumber is specified
    if (pageNumber !== undefined && textEntry.has(pageNumber)) {
      const pageHighlights = textEntry.get(pageNumber);
      // Update hit count
      entry.hitCount++;
      this.cache.set(documentKey, entry);
      return { data: pageHighlights, cacheHit: true };
    }
    
    // Otherwise, try to get all highlights for this text (marked with undefined key)
    if (textEntry.has(undefined)) {
      const allHighlights = textEntry.get(undefined);
      if (pageNumber !== undefined && allHighlights) {
        // Filter highlights for the requested page
        const pageHighlights = allHighlights.filter(h => h.pageNumber === pageNumber);
        if (pageHighlights.length > 0) {
          // Cache this filtered result for future requests
          this.setHighlightCoordinates(documentKey, textToHighlight, pageHighlights, pageNumber);
          // Update hit count
          entry.hitCount++;
          this.cache.set(documentKey, entry);
          return { data: pageHighlights, cacheHit: true };
        }
      } else {
        // Return all highlights (no page filtering)
        // Update hit count
        entry.hitCount++;
        this.cache.set(documentKey, entry);
        return { data: allHighlights, cacheHit: true };
      }
    }
    
    // Update miss count
    entry.missCount++;
    this.cache.set(documentKey, entry);
    return { data: undefined, cacheHit: false };
  }
  
  /**
   * Store text content in cache
   */
  public setTextContent(documentKey: string, textContent: PageTextContent[]): void {
    const existingEntry = this.cache.get(documentKey) || {
      highlights: new Map(),
      timestamp: Date.now(),
      hitCount: 0,
      missCount: 0
    };
    
    this.cache.set(documentKey, {
      ...existingEntry,
      textContent,
      timestamp: Date.now()
    });
  }
  
  /**
   * Store highlight coordinates in cache
   * @param documentKey Document identifier
   * @param textToHighlight Text to highlight
   * @param coordinates Highlight coordinates
   * @param pageNumber Optional specific page number for these coordinates
   */
  public setHighlightCoordinates(
    documentKey: string,
    textToHighlight: string,
    coordinates: HighlightCoordinates[],
    pageNumber?: number
  ): void {
    const existingEntry = this.cache.get(documentKey) || {
      highlights: new Map(),
      timestamp: Date.now(),
      hitCount: 0,
      missCount: 0
    };
    
    if (!existingEntry.highlights) {
      existingEntry.highlights = new Map();
    }
    
    let textEntry = existingEntry.highlights.get(textToHighlight);
    if (!textEntry) {
      textEntry = new Map();
      existingEntry.highlights.set(textToHighlight, textEntry);
    }
    
    // Store with the specific page number as key, or undefined for all pages
    textEntry.set(pageNumber, coordinates);
    
    this.cache.set(documentKey, {
      ...existingEntry,
      timestamp: Date.now()
    });
  }
  
  /**
   * Get cache performance statistics
   */
  public getCacheStats(): {
    size: number;
    hitCount: number;
    missCount: number;
    hitRatio: number;
    documents: string[];
  } {
    let totalHits = 0;
    let totalMisses = 0;
    const documents: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      totalHits += entry.hitCount;
      totalMisses += entry.missCount;
      documents.push(key);
    }
    
    const totalRequests = totalHits + totalMisses;
    const hitRatio = totalRequests > 0 ? totalHits / totalRequests : 0;
    
    return {
      size: this.cache.size,
      hitCount: totalHits,
      missCount: totalMisses,
      hitRatio,
      documents
    };
  }
  
  /**
   * Clear all cached data
   */
  public clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Remove entries for a specific document
   */
  public removeDocument(documentKey: string): boolean {
    return this.cache.delete(documentKey);
  }
}

/**
 * Server-side PDF processor that handles text extraction and coordinate computation
 */
export class ServerPdfProcessor {
  private pdfTextMapper: PdfTextMapper;
  private cache: PdfProcessingCache;
  
  constructor() {
    this.pdfTextMapper = new PdfTextMapper({
      enablePerformanceLogging: true,
      fuzzyThreshold: 0.8,
      maxResultsPerPage: 10,
      minConfidenceThreshold: 0.6
    });
    this.cache = PdfProcessingCache.getInstance();
  }
  
  /**
   * Process a PDF file and extract text content and/or highlight coordinates
   * @param filePath Path to the PDF file
   * @param options Processing options
   * @returns Enhanced PDF response with requested data
   */
  public async processPdf(
    filePath: string,
    options: {
      includeTextContent?: boolean;
      textToHighlight?: string;
      includeCoordinates?: boolean;
      pageNumber?: number;
    }
  ): Promise<EnhancedPdfResponse> {
    const startTime = performance.now();
    
    // Generate a cache key based on the file path
    const cacheKey = filePath;
    
    // Read the PDF file
    const pdfBuffer = await fs.readFile(filePath);
    const fileStats = await fs.stat(filePath);
    
    try {
      // Load the PDF document
      const pdfData = new Uint8Array(pdfBuffer);
      
      let pdfjsLib: any;
      let DOMMatrixPolyfill: any; // Keep a reference if we define it

      if (typeof window === 'undefined') {
        // Server-side (Node.js)
        // 1. Polyfill DOMMatrix if not present (minimal stub)
        if (typeof DOMMatrix === 'undefined') {
          // @ts-ignore
          DOMMatrixPolyfill = class DOMMatrix {
            a: number; b: number; c: number; d: number; e: number; f: number;
            constructor(init?: string | number[]) { /* Basic stub */
              this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
            }
            translateSelf() { return this; }
            scaleSelf() { return this; }
            rotateSelf() { return this; }
            multiplySelf() { return this; }
            static fromMatrix(init?: any) { const m = new DOMMatrixPolyfill(init); return m; }
          };
          // @ts-ignore
          global.DOMMatrix = DOMMatrixPolyfill;
          console.log('Polyfilled DOMMatrix with a minimal stub for Node.js environment.');
        }
        
        // Import the legacy build as recommended by the warning
        // @ts-ignore
        pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        
        // Set the worker for the legacy build in Node.js
        // The legacy worker is typically a .js file, not .mjs
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          try {
            const workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
            pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
            console.log(`PDF.js: Set legacy worker for Node.js to ${workerSrc}`);
          } catch (e) {
            console.error('PDF.js: Failed to resolve legacy worker for Node.js. Processing might fail.', e);
            // As a last resort, try an empty string if type allows, or handle error.
            // Given previous type errors, an empty string might be safer if it must be a string.
            pdfjsLib.GlobalWorkerOptions.workerSrc = '';
          }
        }
      } else {
        // Client-side: Standard import, worker configured by PdfWorkerSetup.tsx
        pdfjsLib = await import('pdfjs-dist');
      }

      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      const pdfDocument = await loadingTask.promise;
      
      // Initialize response
      const response: EnhancedPdfResponse = {
        pdfBuffer,
        metadata: {
          pageCount: pdfDocument.numPages,
          fileSize: fileStats.size,
          processing: {
            textExtracted: false,
            coordinatesPrecomputed: false,
            cacheHit: false
          }
        }
      };
      
      // Extract text content if requested
      let textContent: PageTextContent[] | undefined;
      if (options.includeTextContent || options.includeCoordinates) {
        // Try to get from cache first
        const textContentResult = this.cache.getTextContent(cacheKey);
        textContent = textContentResult.data;
        
        if (!textContent) {
          // Extract text content from all pages
          textContent = await this.extractTextContent(pdfDocument);
          
          // Store in cache for future use
          this.cache.setTextContent(cacheKey, textContent);
        } else {
          // Set cache hit in metadata
          response.metadata.processing.cacheHit = textContentResult.cacheHit;
        }
        
        // Filter text content by page number if requested
        if (options.pageNumber && textContent) {
          const pageContent = textContent.filter(page => page.pageNumber === options.pageNumber);
          response.textContent = pageContent;
        } else {
          response.textContent = textContent;
        }
        
        response.metadata.processing.textExtracted = true;
      }
      
      // Compute highlight coordinates if requested
      if (options.includeCoordinates && options.textToHighlight) {
        // Try to get from cache first
        const coordinatesResult = this.cache.getHighlightCoordinates(
          cacheKey,
          options.textToHighlight,
          options.pageNumber
        );
        
        if (coordinatesResult.data) {
          response.highlightCoordinates = coordinatesResult.data;
          response.metadata.processing.cacheHit = coordinatesResult.cacheHit;
        } else if (textContent) {
          // Compute coordinates using the PdfTextMapper utility
          const coordinates = await this.computeHighlightCoordinates(
            pdfDocument,
            options.textToHighlight,
            options.pageNumber
          );
          
          // Store in cache for future use
          this.cache.setHighlightCoordinates(
            cacheKey,
            options.textToHighlight,
            coordinates,
            options.pageNumber
          );
          
          response.highlightCoordinates = coordinates;
        }
        
        response.metadata.processing.coordinatesPrecomputed = !!response.highlightCoordinates;
      }
      
      // Add processing time to metadata
      response.metadata.processing.processingTime = performance.now() - startTime;
      
      // Log cache statistics occasionally (every 10th request)
      if (Math.random() < 0.1) {
        const stats = this.cache.getCacheStats();
        console.log('📊 PDF Processing Cache Stats:', {
          cacheSize: stats.size,
          hitRatio: `${(stats.hitRatio * 100).toFixed(1)}%`,
          hits: stats.hitCount,
          misses: stats.missCount,
          documentCount: stats.documents.length
        });
      }
      
      return response;
      
    } catch (error) {
      console.error('Error processing PDF:', error);
      
      // Return basic response with just the PDF buffer in case of error
      return {
        pdfBuffer,
        metadata: {
          pageCount: 0, // Unknown if we couldn't process
          fileSize: fileStats.size,
          processing: {
            textExtracted: false,
            coordinatesPrecomputed: false,
            processingTime: performance.now() - startTime
          }
        }
      };
    }
  }
  
  /**
   * Extract text content from all pages of a PDF document
   * @param pdfDocument PDF document proxy
   * @returns Array of page text content objects
   */
  private async extractTextContent(pdfDocument: PDFDocumentProxy): Promise<PageTextContent[]> {
    const textContent: PageTextContent[] = [];
    
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });
      
      textContent.push({
        pageNumber: pageNum,
        textItems: content.items as TextItem[],
        width: viewport.width,
        height: viewport.height
      });
    }
    
    return textContent;
  }
  
  /**
   * Compute highlight coordinates for text within a PDF document
   * @param pdfDocument PDF document proxy
   * @param textToHighlight Text to find and highlight
   * @param pageNumber Optional specific page to search
   * @returns Array of highlight coordinates
   */
  private async computeHighlightCoordinates(
    pdfDocument: PDFDocumentProxy,
    textToHighlight: string,
    pageNumber?: number
  ): Promise<HighlightCoordinates[]> {
    // Get TextSearchResult array from PdfTextMapper
    const searchResults = await this.pdfTextMapper.findTextCoordinates(
      pdfDocument,
      textToHighlight,
      pageNumber
    );
    
    // Convert TextSearchResult[] to HighlightCoordinates[]
    return searchResults.map(result => ({
      pageNumber: result.pageNumber,
      rects: result.coordinates,
      textContent: result.matchedText,
      confidence: result.confidence,
      // Assign style based on confidence level
      styleId: result.confidence > 0.9 ? 'green' :
               result.confidence > 0.7 ? 'blue' :
               result.confidence > 0.5 ? 'orange' : 'red',
    }));
  }
}

// Create and export a singleton instance for reuse
export const serverPdfProcessor = new ServerPdfProcessor();