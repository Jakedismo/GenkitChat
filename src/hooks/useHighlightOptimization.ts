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

interface ProcessPageResult {
  coordinates: HighlightCoordinates[] | null;
  computationTime: number;
  cacheHit: boolean;
  error?: Error;
  pageNumber: number;
}

  const processPage = useCallback(async (pageNum: number, text: string, isHighPriority: boolean): Promise<ProcessPageResult> => {
    const startTime = performance.now();
    let wasCacheHit = true; // Assume cache hit initially
    let coords: HighlightCoordinates[] | null = null;
    let errorResult: Error | undefined = undefined;

    if (!pdfDocument || !text) {
      return {
        coordinates: null,
        computationTime: performance.now() - startTime,
        cacheHit: false,
        pageNumber: pageNum
      };
    }

    const currentCacheKey = getCacheKey(documentId, pageNum, text);
    if (activePromisesRef.current.has(currentCacheKey)) {
      // console.log(`Computation for ${currentCacheKey} already in progress, awaiting existing.`);
      // This might be tricky if the existing promise doesn't return ProcessPageResult.
      // For simplicity, we'll let it proceed for now, but ideally, activePromises should store Promise<ProcessPageResult>.
      // However, since this hook manages calls, direct concurrent calls for the exact same page/text are less likely
      // than sequential calls managed by updateHighlights.
    }

    try {
      const promise = cacheRef.current.getOrCompute(
        documentId,
        pageNum,
        text,
        async () => {
          wasCacheHit = false; // Set to false if computeFn is called (cache miss)
          // console.log(`Computing coordinates for page ${pageNum}, text "${text}"`);
          return findCoordinatesOnPage(documentId, pageNum, text, pdfDocument);
        }
      );
      activePromisesRef.current.set(currentCacheKey, promise); // Store the promise for HighlightCoordinates[]
      
      coords = await promise;
      failedPagesRef.current.delete(pageNum); // Clear from failed if successful

      // Update performance metrics for this specific page (immediate feedback)
      const computationTime = performance.now() - startTime;
      setPerformanceMetrics(prev => ({
        ...prev,
        computationTime: (prev?.computationTime || 0) + computationTime, // Accumulate time if you want total time spent so far
        cacheHit: prev?.cacheHit || wasCacheHit, // If any page was a cache hit
        cacheMemoryUsage: cacheRef.current.getMemoryUsage(),
        pagesProcessed: (prev?.pagesProcessed || 0) + 1,
      }));

    } catch (error) {
      console.error(`Error computing highlights for page ${pageNum}:`, error);
      failedPagesRef.current.add(pageNum);
      errorResult = error instanceof Error ? error : new Error('Failed to compute highlights');
      setCalculationError(errorResult); // Set overall calculation error
      coords = null;
    } finally {
       activePromisesRef.current.delete(currentCacheKey);
    }

    const computationTime = performance.now() - startTime;
    return {
      coordinates: coords,
      computationTime,
      cacheHit: wasCacheHit,
      error: errorResult,
      pageNumber: pageNum,
    };
  }, [pdfDocument, documentId, findCoordinatesOnPage, getCacheKey]);


  const updateHighlights = useCallback(async () => {
    if (!pdfDocument || !textToHighlight) {
      setHighlightCoordinates([]);
      return;
    }

    console.log('[HighlightOptimizer] Running updateHighlights for doc:', documentId, 'text:', textToHighlight ? textToHighlight.substring(0, 50) + "..." : "N/A");

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
    console.log('[HighlightOptimizer] Pages to process:', Array.from(pagesToProcess));
    
    const allProcessedCoordinates: HighlightCoordinates[] = [];
    let aggregatedComputationTime = 0;
    let actualCacheHits = 0;
    let pagesSuccessfullyProcessedCount = 0;

    // Explicitly type the array of promises
    const processingPromises: Promise<ProcessPageResult>[] = [];

    for (const pageNum of Array.from(pagesToProcess)) {
      // Only process if visible or for preloading (implicitly handled by pagesToProcess logic)
      // and not a previously failed page unless explicitly retried.
      if (!failedPagesRef.current.has(pageNum) || specificPageNumber === pageNum) { // Allow retry for specific page
         processingPromises.push(
            processPage(pageNum, textToHighlight, visiblePages.includes(pageNum) || pageNum === specificPageNumber)
         );
      }
    }

    const results = await Promise.all(processingPromises);

    for (const result of results) {
      if (result && result.coordinates) {
        allProcessedCoordinates.push(...result.coordinates);
        pagesSuccessfullyProcessedCount++; // Count pages that returned coordinates
      }
      if (result) { // Process performance even if coordinates are null (e.g. error on page)
        aggregatedComputationTime += result.computationTime;
        if (result.cacheHit) {
          actualCacheHits++;
        }
        if (result.error) {
          // Error already set in processPage via setCalculationError
          // but we could aggregate multiple errors if needed.
        }
      }
    }

    newPerformanceMetrics.computationTime = aggregatedComputationTime;
    newPerformanceMetrics.cacheHit = actualCacheHits > 0;
    // newPerformanceMetrics.pagesProcessed = pagesToProcess.size; // Total pages attempted
    newPerformanceMetrics.pagesProcessed = pagesSuccessfullyProcessedCount; // Or, total pages successfully processed


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
        console.log(`[HighlightOptimizer] Cache usage ${currentCacheStatus.usage}/${currentCacheStatus.max} > 80%. Considering evictions.`);
        for (const [_key, value] of cacheRef.current.getCacheEntries()) { // Use public getter
            if (value.documentId === documentId && !pagesToKeep.has(value.pageNumber)) {
                console.log(`[HighlightOptimizer] Cache eviction: Attempting to remove page ${value.pageNumber} for text "${value.textToHighlight.substring(0,30)}..." from doc ${value.documentId}`);
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
    processPage
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