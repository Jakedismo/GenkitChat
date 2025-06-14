import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getHighlightCacheInstance, HighlightCache, HighlightCoordinates } from '../utils/highlightCache';

export interface PerformanceMetrics {
  computationTime?: number; // in milliseconds
  cacheHit?: boolean;
  cacheMemoryUsage?: { usage: number; max: number; count: number };
  pagesProcessed?: number;
}

export interface HighlightOptimizationOptions {
  documentId: string;
  textToHighlight?: string; // General text for the whole document, or specific if pageNumber is also set
  pageNumber?: number; // Specific page to highlight, takes precedence for 'textToHighlight'
  preloadAdjacentPages?: boolean;
  isPageVisible: (pageNumber: number) => boolean; // Callback to check if a page is currently visible
  visiblePages: number[]; // Array of currently visible page numbers
  maxCacheMemoryMB?: number; // Max cache memory in MB
  // Function to be provided by the component to actually find coordinates on a page
  // This decouples the hook from the specific text extraction/coordinate finding logic
  findCoordinatesOnPage: (
    docId: string,
    pageNum: number,
    text: string,
    pdfDoc: PDFDocumentProxy
  ) => Promise<HighlightCoordinates[]>;
}

export interface UseHighlightOptimizationReturn {
  highlightCoordinates: HighlightCoordinates[];
  isCalculatingCoordinates: boolean;
  calculationError: Error | null;
  performanceMetrics: PerformanceMetrics | null;
  resetCacheForDocument: () => void;
  retryFailedPage: (pageNumber: number) => void;
}

const DEBOUNCE_DELAY = 300; // milliseconds for processing visible pages

export function useHighlightOptimization(
  pdfDocument: PDFDocumentProxy | null,
  options: HighlightOptimizationOptions
): UseHighlightOptimizationReturn {
  const {
    documentId,
    textToHighlight,
    pageNumber: specificPageNumber, // A single page to focus on if provided
    preloadAdjacentPages = true,
    isPageVisible,
    visiblePages,
    maxCacheMemoryMB,
    findCoordinatesOnPage,
  } = options;

  const [highlightCoordinates, setHighlightCoordinates] = useState<HighlightCoordinates[]>([]);
  const [isCalculatingCoordinates, setIsCalculatingCoordinates] = useState<boolean>(false);
  const [calculationError, setCalculationError] = useState<Error | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);

  const cacheRef = useRef<HighlightCache>(getHighlightCacheInstance(maxCacheMemoryMB ? maxCacheMemoryMB * 1024 * 1024 : undefined));
  const activePromisesRef = useRef<Map<string, Promise<HighlightCoordinates[]>>>(new Map());
  const failedPagesRef = useRef<Set<number>>(new Set());
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getCacheKey = useCallback((docId: string, pageNum: number, text: string) => {
    return `${docId}::page-${pageNum}::text-${text}`;
  }, []);

  const processPage = useCallback(async (pageNum: number, text: string, isHighPriority: boolean): Promise<HighlightCoordinates[] | null> => {
    if (!pdfDocument || !text) return null;

    const currentCacheKey = getCacheKey(documentId, pageNum, text);
    if (activePromisesRef.current.has(currentCacheKey)) {
      // console.log(`Computation for ${currentCacheKey} already in progress.`);
      return activePromisesRef.current.get(currentCacheKey) || null;
    }

    const startTime = performance.now();
    let cacheHit = false;

    try {
      const promise = cacheRef.current.getOrCompute(
        documentId,
        pageNum,
        text,
        async () => {
          cacheHit = false;
          // console.log(`Computing coordinates for page ${pageNum}, text "${text}"`);
          return findCoordinatesOnPage(documentId, pageNum, text, pdfDocument);
        }
      );
      activePromisesRef.current.set(currentCacheKey, promise);
      
      const coords = await promise;
      // Check if it was set by getOrCompute by verifying presence in the actual cache instance
      if (!cacheHit && cacheRef.current.has(currentCacheKey)) cacheHit = true;

      const endTime = performance.now();
      failedPagesRef.current.delete(pageNum); // Clear from failed if successful

      setPerformanceMetrics(prev => ({
        ...prev,
        computationTime: endTime - startTime,
        cacheHit,
        cacheMemoryUsage: cacheRef.current.getMemoryUsage(),
        pagesProcessed: (prev?.pagesProcessed || 0) + 1,
      }));
      return coords;
    } catch (error) {
      console.error(`Error computing highlights for page ${pageNum}:`, error);
      failedPagesRef.current.add(pageNum);
      setCalculationError(error instanceof Error ? error : new Error('Failed to compute highlights'));
      return null; // Return null on error for this page
    } finally {
       activePromisesRef.current.delete(currentCacheKey);
    }
  }, [pdfDocument, documentId, findCoordinatesOnPage, getCacheKey]);


  const updateHighlights = useCallback(async () => {
    if (!pdfDocument || !textToHighlight) {
      setHighlightCoordinates([]);
      return;
    }

    setIsCalculatingCoordinates(true);
    setCalculationError(null);
    const newPerformanceMetrics: PerformanceMetrics = { cacheMemoryUsage: cacheRef.current.getMemoryUsage(), pagesProcessed: 0 };
    
    const pagesToProcess = new Set<number>();

    if (specificPageNumber) {
      pagesToProcess.add(specificPageNumber);
    } else {
      visiblePages.forEach(vp => pagesToProcess.add(vp));
    }

    if (preloadAdjacentPages) {
      const pagesForPreload = specificPageNumber ? [specificPageNumber] : visiblePages;
      pagesForPreload.forEach(vp => {
        if (vp > 1) pagesToProcess.add(vp - 1);
        if (vp < pdfDocument.numPages) pagesToProcess.add(vp + 1);
      });
    }
    
    const allProcessedCoordinates: HighlightCoordinates[] = [];
    let totalComputationTime = 0;
    let cacheHits = 0;

    const processingPromises: Promise<void>[] = [];

    for (const pageNum of Array.from(pagesToProcess)) {
      // Only process if visible or for preloading (implicitly handled by pagesToProcess logic)
      // and not a previously failed page unless explicitly retried.
      if (!failedPagesRef.current.has(pageNum) || specificPageNumber === pageNum) { // Allow retry for specific page
         processingPromises.push(
           (async () => {
            const coords = await processPage(pageNum, textToHighlight, visiblePages.includes(pageNum) || pageNum === specificPageNumber);
            if (coords) {
              allProcessedCoordinates.push(...coords);
              // Note: individual page performance is set within processPage
              // Here we might want to aggregate or just rely on the last one for overall metrics
              const pagePerf = performanceMetrics; // This might be slightly out of sync, consider a different approach for aggregation
              if(pagePerf?.cacheHit) cacheHits++;
              if(pagePerf?.computationTime) totalComputationTime += pagePerf.computationTime;
            }
          })()
        );
      }
    }

    await Promise.all(processingPromises);

    newPerformanceMetrics.computationTime = totalComputationTime;
    newPerformanceMetrics.cacheHit = cacheHits > 0; // Simplified: true if any hit occurred
    newPerformanceMetrics.pagesProcessed = pagesToProcess.size;

    setHighlightCoordinates(allProcessedCoordinates.sort((a,b) => {
      if (a.pageNumber !== b.pageNumber) {
        return a.pageNumber - b.pageNumber;
      }
      // Sort by the y-coordinate of the first rectangle, if available
      const yA = a.rects && a.rects.length > 0 ? a.rects[0].y : 0;
      const yB = b.rects && b.rects.length > 0 ? b.rects[0].y : 0;
      return yA - yB;
    }));
    setPerformanceMetrics(newPerformanceMetrics);
    setIsCalculatingCoordinates(false);

    // Sliding window memory management:
    // Remove pages that are no longer visible or adjacent from cache if memory is an issue
    // This is a simplified version; a more robust one would check memory pressure.
    const pagesToKeep = new Set<number>(pagesToProcess);
    const currentCacheStatus = cacheRef.current.getMemoryUsage();
    if (currentCacheStatus.usage > cacheRef.current.getMaxMemoryUsage() * 0.8) { // If cache is >80% full
        for (const [_key, value] of cacheRef.current.getCacheEntries()) { // Use public getter
            if (value.documentId === documentId && !pagesToKeep.has(value.pageNumber)) {
                cacheRef.current.remove(documentId, value.pageNumber, value.textToHighlight);
            }
        }
        setPerformanceMetrics(prev => ({ ...prev, cacheMemoryUsage: cacheRef.current.getMemoryUsage() }));
    }

  }, [
    pdfDocument,
    documentId,
    textToHighlight,
    specificPageNumber,
    preloadAdjacentPages,
    isPageVisible, // isPageVisible is not directly used here, but visiblePages depends on it
    visiblePages,
    processPage,
    performanceMetrics // Added to dep array
  ]);
  
  useEffect(() => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    processingTimeoutRef.current = setTimeout(() => {
      updateHighlights();
    }, DEBOUNCE_DELAY);

    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, [visiblePages, specificPageNumber, textToHighlight, documentId, pdfDocument, updateHighlights]);


  const resetCacheForDocument = useCallback(() => {
    cacheRef.current.removeDocument(documentId);
    setHighlightCoordinates([]);
    setPerformanceMetrics(prev => ({ ...prev, cacheMemoryUsage: cacheRef.current.getMemoryUsage() }));
    failedPagesRef.current.clear();
    // console.log(`Cache reset for document: ${documentId}`);
  }, [documentId]);

  const retryFailedPage = useCallback((pageNum: number) => {
    failedPagesRef.current.delete(pageNum);
    // Trigger an update. If specificPageNumber is this page, it will be reprocessed.
    // Otherwise, if it becomes visible, it will be picked up.
    // For an immediate retry, we might need to call updateHighlights more directly or adjust its logic.
    updateHighlights(); 
  }, [updateHighlights]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Optional: Decide if document cache should be cleared on unmount or persist globally
      // resetCacheForDocument(); 
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
      activePromisesRef.current.clear(); // Clear any ongoing promises if component unmounts
    };
  }, [resetCacheForDocument]);

  return {
    highlightCoordinates,
    isCalculatingCoordinates,
    calculationError,
    performanceMetrics,
    resetCacheForDocument,
    retryFailedPage,
  };
}