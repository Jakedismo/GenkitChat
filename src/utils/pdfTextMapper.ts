import { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfRect } from '../types/chat';

/**
 * Result of a text search operation within a PDF document
 */
export interface TextSearchResult {
  /** Page number where the text was found (1-based) */
  pageNumber: number;
  /** Array of rectangular regions containing the text */
  coordinates: PdfRect[];
  /** Confidence score for the match (0-1 scale) */
  confidence: number;
  /** The actual text that was matched */
  matchedText: string;
}

/**
 * Configuration options for the PdfTextMapper
 */
interface PdfTextMapperConfig {
  /** Threshold for fuzzy matching (0-1 scale, higher = stricter) */
  fuzzyThreshold?: number;
  /** Maximum number of results to return per page */
  maxResultsPerPage?: number;
  /** Whether to enable detailed performance logging */
  enablePerformanceLogging?: boolean;
  /** Minimum confidence threshold for returning results */
  minConfidenceThreshold?: number;
  /** Whether to normalize text before matching (remove extra whitespace, case insensitive) */
  normalizeText?: boolean;
}

/**
 * Performance metrics for a search operation
 */
interface PerformanceMetric {
  /** Total execution time in milliseconds */
  totalTime: number;
  /** Time spent extracting text in milliseconds */
  textExtractionTime: number;
  /** Time spent matching text in milliseconds */
  textMatchingTime: number;
  /** Number of pages processed */
  pagesProcessed: number;
  /** Search text length */
  searchTextLength: number;
  /** Whether the search was successful */
  successful: boolean;
  /** Error message if any */
  error?: string;
}

/**
 * A utility class for finding text coordinates within PDF documents
 * Implements multiple search strategies (exact, partial, fuzzy) with fallbacks
 */
export class PdfTextMapper {
  private config: Required<PdfTextMapperConfig>;
  private performanceMetrics: Map<string, PerformanceMetric> = new Map();

  /**
   * Creates a new PdfTextMapper instance
   * @param config Configuration options
   */
  constructor(config: PdfTextMapperConfig = {}) {
    // Default configuration values
    this.config = {
      fuzzyThreshold: config.fuzzyThreshold ?? 0.8,
      maxResultsPerPage: config.maxResultsPerPage ?? 10,
      enablePerformanceLogging: config.enablePerformanceLogging ?? false,
      minConfidenceThreshold: config.minConfidenceThreshold ?? 0.6,
      normalizeText: config.normalizeText ?? true
    };
  }

  /**
   * Finds text coordinates within a PDF document
   * @param pdfDocument The PDF document to search
   * @param searchText The text to search for
   * @param pageNumber Optional specific page to search (1-based)
   * @returns Array of search results with coordinates
   */
  async findTextCoordinates(
    pdfDocument: PDFDocumentProxy,
    searchText: string,
    pageNumber?: number
  ): Promise<TextSearchResult[]> {
    // Start performance tracking
    const startTime = performance.now();
    const operationId = `search-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const metric: PerformanceMetric = {
      totalTime: 0,
      textExtractionTime: 0,
      textMatchingTime: 0,
      pagesProcessed: 0,
      searchTextLength: searchText.length,
      successful: false
    };

    try {
      // Handle empty search text
      if (!searchText || searchText.trim() === '') {
        return [];
      }

      const results: TextSearchResult[] = [];

      // If pageNumber is specified, only search that page
      if (pageNumber) {
        const pageResults = await this.searchInSinglePage(pdfDocument, pageNumber, searchText, metric);
        results.push(...pageResults);
      } else {
        // Otherwise, search all pages
        const numPages = pdfDocument.numPages;
        for (let i = 1; i <= numPages; i++) {
          const pageResults = await this.searchInSinglePage(pdfDocument, i, searchText, metric);
          results.push(...pageResults);
          
          // Optional: Break early if we found enough results
          if (results.length >= this.config.maxResultsPerPage) {
            break;
          }
        }
      }
      
      // If no results found with the primary strategies, attempt a fallback:
      // Try to find the longest possible contiguous sub-segment of the searchText.
      if (results.length === 0 && searchText.length > 0) {
        const words = searchText.split(/\s+/).filter(w => w.length > 0);
        let bestFallbackResults: TextSearchResult[] = [];

        // Iterate from the longest possible sub-segment down to a single word (if sensible)
        for (let len = words.length; len >= 1; len--) {
          for (let i = 0; i <= words.length - len; i++) {
            const subSegment = words.slice(i, i + len).join(' ');
            // Avoid searching for very short sub-segments if the original text is long
            if (searchText.length > 10 && subSegment.length < 5 && len < 2) continue;
            if (subSegment.length === 0) continue;

            const currentFallbackResults: TextSearchResult[] = [];
            if (pageNumber) {
              // Pass "fallback_longest_segment" to identify the matching path
              const pageResults = await this.searchInSinglePage(pdfDocument, pageNumber, subSegment, metric, "fallback_longest_segment");
              currentFallbackResults.push(...pageResults);
            } else {
              const numPages = pdfDocument.numPages;
              for (let k = 1; k <= numPages; k++) {
                // Pass "fallback_longest_segment" to identify the matching path
                const pageResults = await this.searchInSinglePage(pdfDocument, k, subSegment, metric, "fallback_longest_segment");
                currentFallbackResults.push(...pageResults);
                if (currentFallbackResults.length >= this.config.maxResultsPerPage) {
                  break;
                }
              }
            }

            if (currentFallbackResults.length > 0) {
              // Adjust confidence based on the proportion of the original searchText matched
              const proportionMatched = subSegment.length / searchText.length;
              currentFallbackResults.forEach(result => {
                // Base confidence on match quality, then scale by proportion.
                // Make it more conservative than primary matches.
                result.confidence = result.confidence * proportionMatched * 0.7;
                result.matchedText = subSegment; // Ensure matchedText reflects the sub-segment
              });

              // If this sub-segment yields results, we prefer it over shorter ones
              // And also ensure we are picking the one with highest confidence if multiple segments of same length match
              if (bestFallbackResults.length === 0 ||
                  (currentFallbackResults.length > 0 && currentFallbackResults[0].confidence > (bestFallbackResults[0]?.confidence ?? 0) )) {
                bestFallbackResults = [...currentFallbackResults];
              }
            }
          }
          // If we found good results with a longer sub-segment, no need to try shorter ones,
          // unless the current best result has very low confidence.
          if (bestFallbackResults.length > 0 && bestFallbackResults[0].confidence > 0.5) {
            break;
          }
        }
        results.push(...bestFallbackResults);
      }

      // Filter results by confidence threshold
      const filteredResults = results.filter(
        result => result.confidence >= this.config.minConfidenceThreshold
      );

      // Record metrics
      metric.successful = true;
      metric.totalTime = performance.now() - startTime;
      
      if (this.config.enablePerformanceLogging) {
        this.performanceMetrics.set(operationId, metric);
        console.log(`[PdfTextMapper] Search completed in ${metric.totalTime.toFixed(2)}ms, found ${filteredResults.length} results`);
      }

      return filteredResults;
    } catch (error) {
      // Handle any errors during search
      console.error('[PdfTextMapper] Error searching for text:', error);
      
      // Record error metrics
      metric.successful = false;
      metric.error = error instanceof Error ? error.message : String(error);
      metric.totalTime = performance.now() - startTime;
      
      if (this.config.enablePerformanceLogging) {
        this.performanceMetrics.set(operationId, metric);
      }
      
      return [];
    }
  }

  /**
   * Searches for text in a single PDF page
   * @param pdfDocument PDF document
   * @param pageNumber Page number to search (1-based)
   * @param searchText Text to search for
   * @param metric Performance metric object to update
   * @returns Array of search results
   */
  private async searchInSinglePage(
    pdfDocument: PDFDocumentProxy,
    pageNumber: number,
    searchText: string,
    metric: PerformanceMetric,
    matchTypeForLogging: string = "unknown" // Added for logging
  ): Promise<TextSearchResult[]> {
    try {
      // Get the PDF page
      const extractionStart = performance.now();
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });
      
      metric.textExtractionTime += performance.now() - extractionStart;
      metric.pagesProcessed++;

      // Start text matching
      const matchingStart = performance.now();
      const results: TextSearchResult[] = [];

      // Normalize the search text if configured
      const normalizedSearchText = this.config.normalizeText 
        ? this.normalizeText(searchText) 
        : searchText;

      let foundMatches: TextSearchResult[] = [];
      // Keep track of the original search text for logging, if normalization is applied.
      const originalSearchTextForLog = this.config.normalizeText && normalizedSearchText !== searchText ? searchText : normalizedSearchText;

      // If this call is part of a fallback strategy, we might only want exact matches for the sub-segment.
      if (matchTypeForLogging === "fallback_longest_segment") {
        foundMatches = this.findExactMatches(textContent.items, normalizedSearchText, pageNumber);
        if (foundMatches.length > 0) {
           console.log(`[PdfTextMapper] Matched via fallback_longest_segment: '${normalizedSearchText}' (original: '${originalSearchTextForLog}') on page ${pageNumber} with confidence ${foundMatches[0].confidence}`);
        }
      } else {
        // Standard search strategy
        let currentMatchType = "unknown";
        foundMatches = this.findExactMatches(textContent.items, normalizedSearchText, pageNumber);
        if (foundMatches.length > 0) {
          currentMatchType = "exact";
          console.log(`[PdfTextMapper] Matched via ${currentMatchType}: '${normalizedSearchText}' (original: '${originalSearchTextForLog}') on page ${pageNumber} with confidence ${foundMatches[0].confidence}`);
        }

        // If no exact matches, try partial matching
        if (foundMatches.length === 0) {
          const partialMatches = this.findPartialMatches(textContent.items, normalizedSearchText, pageNumber);
          if (partialMatches.length > 0) {
            foundMatches.push(...partialMatches);
            currentMatchType = "partial";
            console.log(`[PdfTextMapper] Matched via ${currentMatchType}: '${normalizedSearchText}' (original: '${originalSearchTextForLog}', matched: '${partialMatches[0].matchedText}') on page ${pageNumber} with confidence ${partialMatches[0].confidence}`);
          }

          // If still no results, try using the original searchText for partial matching
          // This helps with cases where normalization might affect matching
          if (foundMatches.length === 0 && this.config.normalizeText && normalizedSearchText !== searchText) {
            const originalTextMatches = this.findPartialMatches(textContent.items, searchText, pageNumber);
            if (originalTextMatches.length > 0) {
              foundMatches.push(...originalTextMatches);
              currentMatchType = "partial_original_text";
              console.log(`[PdfTextMapper] Matched via ${currentMatchType}: '${searchText}' (matched: '${originalTextMatches[0].matchedText}') on page ${pageNumber} with confidence ${originalTextMatches[0].confidence}`);
            }
          }
        }

        // If still no matches, try finding the best word sequence match as a last resort
        if (foundMatches.length === 0) {
          const sequenceMatches = this.findBestWordSequenceMatch(textContent.items, normalizedSearchText, pageNumber);
          if (sequenceMatches.length > 0) {
            foundMatches.push(...sequenceMatches);
            currentMatchType = "best_word_sequence";
            console.log(`[PdfTextMapper] Matched via ${currentMatchType}: '${normalizedSearchText}' (original: '${originalSearchTextForLog}', matched: '${sequenceMatches[0].matchedText}') on page ${pageNumber} with confidence ${sequenceMatches[0].confidence}`);
          }
        }
        // Update the matchTypeForLogging if a match was found by primary strategies
        if (foundMatches.length > 0) {
            matchTypeForLogging = currentMatchType;
        }
      }

      results.push(...foundMatches);

      // Update matching time metric
      metric.textMatchingTime += performance.now() - matchingStart;

      return results;
    } catch (error) {
      console.error(`[PdfTextMapper] Error processing page ${pageNumber}:`, error);
      return [];
    }
  }

  /**
   * Finds exact matches of the search text in the page content
   * @param textItems Text items from the PDF page
   * @param searchText Normalized search text
   * @param pageNumber Page number (1-based)
   * @returns Array of search results
   */
  private findExactMatches(
    textItems: any[],
    searchText: string,
    pageNumber: number
  ): TextSearchResult[] {
    const results: TextSearchResult[] = [];
    
    // Regular processing for other cases
    // Combine all text items into a single string with position mapping
    const { text, positions } = this.combineTextItems(textItems);
    
    // Normalize combined text if configured
    const normalizedText = this.config.normalizeText ? this.normalizeText(text) : text;
    
    // Find all occurrences of the search text
    let startIndex = 0;
    let index: number;
    
    while ((index = normalizedText.indexOf(searchText, startIndex)) !== -1) {
      // Get the matching text from the original text
      const endIndex = index + searchText.length;
      const matchedText = text.substring(index, endIndex);
      
      // Find all text items that are part of this match
      const matchPositions = positions.filter(pos =>
        (pos.startIndex <= index && pos.endIndex > index) || // Item contains the start
        (pos.startIndex >= index && pos.startIndex < endIndex) // Item starts within the match
      );
      
      if (matchPositions.length > 0) {
        // Calculate the bounding rectangle for all matched items
        const coordinates: PdfRect[] = matchPositions.map(pos => ({
          x: pos.x,
          y: pos.y,
          width: pos.width,
          height: pos.height
        }));
        
        results.push({
          pageNumber,
          coordinates,
          confidence: 1.0, // Exact match has 100% confidence
          matchedText
        });
      }
      
      startIndex = index + 1; // Move past this match
    }
    
    return results;
  }

  /**
   * Finds partial matches of the search text in the page content
   * @param textItems Text items from the PDF page
   * @param searchText Normalized search text
   * @param pageNumber Page number (1-based)
   * @returns Array of search results
   */
  private findPartialMatches(
    textItems: any[],
    searchText: string,
    pageNumber: number
  ): TextSearchResult[] {
    const results: TextSearchResult[] = [];

    // Try to find the longest partial match initially, but collect all potential matches.
    const words = searchText.split(/\s+/).filter(word => word.length > 0);
    if (words.length <= 1 && searchText.length < 3) return results; // Avoid very short single "word" searches if original is also short

    const potentialMatches: TextSearchResult[] = [];

    // Iterate through all possible sub-phrase lengths, from longest down to 1 word.
    // Consider phrases of at least 2 words, or 1 word if it's reasonably long.
    for (let wordCount = words.length; wordCount >= 1; wordCount--) {
      if (wordCount === 1 && words[0].length < 3 && words.length > 1) continue; // Skip very short single words if there were multiple words

      // Generate all possible contiguous sub-phrases with 'wordCount' words
      for (let i = 0; i <= words.length - wordCount; i++) {
        const partialPhrase = words.slice(i, i + wordCount).join(' ');
        
        // Skip very short phrases, unless it's the entire search text (e.g. "to be")
        if (partialPhrase.length < 3 && partialPhrase.length < searchText.length) continue;
        if (partialPhrase === searchText) continue; // Already handled by exact match

        const foundExactSubMatches = this.findExactMatches(textItems, partialPhrase, pageNumber);
        
        if (foundExactSubMatches.length > 0) {
          // Calculate confidence: proportion of text matched, scaled down for being partial.
          // Max confidence for a partial match should be less than an exact match.
          const proportion = partialPhrase.length / searchText.length;
          const baseConfidence = 0.85; // Max base confidence for a good partial match
          const confidence = baseConfidence * proportion;
          
          foundExactSubMatches.forEach(match => {
            // Ensure this partial match's confidence is reasonable and doesn't exceed exact match confidence
            if (confidence > this.config.minConfidenceThreshold * 0.7) { // Ensure it's a meaningful partial match
              potentialMatches.push({
                ...match,
                confidence: Math.min(confidence, 0.89), // Cap confidence to be below exact matches
                matchedText: match.matchedText || partialPhrase
              });
            }
          });
        }
      }
    }
    
    // If no multi-word phrases matched from the loop above, try individual important words (if not already covered)
    // This part is more of a fallback if the sub-phrase logic doesn't yield good results.
    if (potentialMatches.length === 0 && words.length > 1) {
      // Find the longest words (more likely to be significant)
      const significantWords = words
        .filter(word => word.length > 3)
        .sort((a, b) => b.length - a.length)
        .slice(0, 3); // Take up to 3 most significant words
      
      for (const word of significantWords) {
        const wordMatches = this.findExactMatches(textItems, word, pageNumber);
        
        if (wordMatches.length > 0) {
          // Calculate a lower confidence for single-word matches
          const confidence = Math.min(0.7, word.length / searchText.length);
          
          wordMatches.forEach(match => {
            results.push({
              ...match,
              confidence: confidence * 0.9, // Further reduce confidence for single-word matches
              matchedText: match.matchedText || word
            });
          });
          
          // Just take the first significant word that matches
          // This logic might be redundant if the main loop handles single words appropriately.
          // However, it targets "significant" words, which might be a useful heuristic.
          break;
        }
      }
    }

    if (potentialMatches.length > 0) {
      // Sort all found partial matches by confidence (descending), then by length (descending)
      potentialMatches.sort((a, b) => {
        if (b.confidence !== a.confidence) {
          return b.confidence - a.confidence;
        }
        return (b.matchedText?.length || 0) - (a.matchedText?.length || 0);
      });
      // Return the best partial match (or top N if maxResultsPerPage was applied here)
      return [potentialMatches[0]];
    }
    
    // If, after all that, results (from significant single words) were populated, return those.
    // This path is less likely if potentialMatches were found and returned.
    return results;
  }

  /**
   * Finds fuzzy matches of the search text in the page content
   * @param textItems Text items from the PDF page
   * @param searchText Normalized search text
   * @param pageNumber Page number (1-based)
   * @returns Array of search results
   */
  private findBestWordSequenceMatch(
    textItems: any[],
    searchText: string,
    pageNumber: number
  ): TextSearchResult[] {
    const results: TextSearchResult[] = [];
    
    // Look for text items that contain parts of the search text
    const searchWords = searchText.split(/\s+/).filter(word => word.length >= 3); // Consider words with 3+ chars
    
    if (searchWords.length === 0) {
      return results;
    }
    
    // Find matches for individual significant words
    for (const word of searchWords) {
      const wordMatches = this.findExactMatches(textItems, word, pageNumber);
      
      if (wordMatches.length > 0) {
        // Calculate a confidence score based on word length relative to search text length.
        // This is a basic heuristic. A more advanced scoring would consider word significance (e.g., TF-IDF).
        const confidence = (word.length / searchText.length) * 0.5; // Scaled down significantly as it's a weak match
        
        wordMatches.forEach(match => {
          // Only add if the confidence is above a minimal threshold,
          // and less than the main fuzzyThreshold to avoid conflict with stronger partial matches.
          if (confidence > (this.config.minConfidenceThreshold * 0.4) && confidence < this.config.fuzzyThreshold) {
            results.push({
              ...match,
              confidence,
              matchedText: word // Ensure matchedText is the word itself for clarity
            });
          }
        });
      }
    }
    
    // Sort by confidence to prioritize better word matches
    results.sort((a, b) => b.confidence - a.confidence);

    // TODO: Implement a more sophisticated word sequence matching logic.
    // Current implementation just finds individual words.
    // Future improvements could involve:
    // 1. Finding the longest common subsequence of words from searchText in the page.
    // 2. Using dynamic programming to find an optimal alignment of searchText words on the page,
    //    allowing for some gaps or out-of-order words, and scoring based on contiguity and coverage.
    // 3. Combining coordinates of matched words if they form a coherent sequence.

    // For now, return only the best single word match found, if any.
    // This is a simplification; ideally, we'd return a sequence.
    return results.length > 0 ? [results[0]] : [];
  }

  /**
   * Combines PDF text items into a single string with position mapping
   * @param textItems Text items from the PDF page
   * @returns Combined text and position mapping
   */
  private combineTextItems(textItems: any[]): { 
    text: string, 
    positions: { startIndex: number, endIndex: number, x: number, y: number, width: number, height: number }[] 
  } {
    let text = '';
    const positions: { startIndex: number, endIndex: number, x: number, y: number, width: number, height: number }[] = [];
    
    textItems.forEach(item => {
      if (!item.str) return;
      
      const startIndex = text.length;
      text += item.str + ' '; // Add space between items
      const endIndex = text.length;
      
      // Convert PDF.js transform to rectangle coordinates
      // PDF.js transform is typically [scaleX, skewX, skewY, scaleY, x, y]
      const x = item.transform ? item.transform[4] : 0;
      const y = item.transform ? item.transform[5] : 0;
      const width = item.width || 0;
      const height = item.height || 0;
      
      positions.push({
        startIndex,
        endIndex,
        x,
        y,
        width,
        height
      });
    });
    
    return { text, positions };
  }

  /**
   * Normalizes text for better matching
   * @param text Text to normalize
   * @returns Normalized text
   */
  private normalizeText(text: string): string {
    if (!text) return '';
    
    // Convert to lowercase
    let normalized = text.toLowerCase();
    
    // Replace multiple whitespace with single space
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Trim whitespace
    normalized = normalized.trim();
    
    return normalized;
  }

  /**
   * Gets the current performance metrics
   * @returns Map of performance metrics
   */
  getPerformanceMetrics(): Map<string, PerformanceMetric> {
    return this.performanceMetrics;
  }

  /**
   * Clears the performance metrics
   */
  clearPerformanceMetrics(): void {
    this.performanceMetrics.clear();
  }
}

/**
 * Default configured instance of PdfTextMapper for easy importing
 */
export const defaultPdfTextMapper = new PdfTextMapper({
  fuzzyThreshold: 0.7,
  maxResultsPerPage: 20,
  enablePerformanceLogging: true,
  minConfidenceThreshold: 0.5,
  normalizeText: true
});

export default defaultPdfTextMapper;
