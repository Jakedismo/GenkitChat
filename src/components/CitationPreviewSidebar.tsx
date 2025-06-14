import "@/components/HighlightStyles.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "react-pdf-highlighter/dist/style.css";

import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  AreaHighlight,
  Highlight,
  PdfHighlighter,
  PdfLoader,
  Popup,
} from "react-pdf-highlighter";
import type { IHighlight } from "react-pdf-highlighter/dist/types";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHighlightOptimization } from "@/hooks/useHighlightOptimization";
import { CitationPreviewData, HighlightCoordinates, PdfRect } from "@/types/chat";
import {
  detectBrowserCapabilities,
  getSafeRenderingStrategy
} from "@/utils/browserDetection";
import { HighlightManager, type BoundingBox } from "@/utils/highlightManager";
import type { TextSearchResult } from "@/utils/pdfTextMapper";
import { defaultPdfTextMapper } from "@/utils/pdfTextMapper";
import { AlertCircle, Loader2, X } from "lucide-react";
import HighlightControlPanel from "./HighlightControlPanel";
import HighlightTooltip from "./HighlightTooltip";

// Helper function to convert hex color to RGB for use in rgba()
const hexToRgb = (hex: string): string => {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Parse as RGB
  let bigint = parseInt(hex, 16);
  let r = (bigint >> 16) & 255;
  let g = (bigint >> 8) & 255;
  let b = bigint & 255;
  
  // Handle 3-digit hex
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  }
  
  return `${r}, ${g}, ${b}`;
};

const convertToPdfRectToScaled = (rect: PdfRect, pageNumber: number) => {
  return {
    x1: rect.x,
    y1: rect.y,
    x2: rect.x + rect.width,
    y2: rect.y + rect.height,
    width: rect.width,
    height: rect.height,
    pageNumber,
  };
};

const convertScaledToLTWHP = (scaledRect: { x1: number; y1: number; x2: number; y2: number; width: number; height: number; pageNumber?: number }) => {
  return {
    left: scaledRect.x1,
    top: scaledRect.y1,
    width: scaledRect.width,
    height: scaledRect.height,
    pageNumber: scaledRect.pageNumber,
  };
};

const convertToHighlightFormat = (
  highlightCoordinates: HighlightCoordinates[],
  pageNumberToFocus?: number
): Array<IHighlight & { originalCoord: HighlightCoordinates }> => {
  return highlightCoordinates
    .filter(coord => !pageNumberToFocus || coord.pageNumber === pageNumberToFocus)
    .map((coord, index) => {
      const commonPageNumber = coord.pageNumber;
      const newHighlight: IHighlight & { originalCoord: HighlightCoordinates } = {
        id: `highlight-${commonPageNumber}-${index}`,
        content: { text: coord.textContent },
        position: {
          boundingRect: convertToPdfRectToScaled(coord.rects[0], commonPageNumber),
          rects: coord.rects.map(r => convertToPdfRectToScaled(r, commonPageNumber)),
          pageNumber: commonPageNumber,
        },
        comment: { text: coord.textContent, emoji: "💬" },
        originalCoord: coord,
      };
      return newHighlight;
    });
};

interface CitationPreviewSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  previewData: CitationPreviewData | null;
  onHighlightClick?: (highlight: HighlightCoordinates) => void;
}

const CitationPreviewSidebar: React.FC<CitationPreviewSidebarProps> = ({
  isOpen,
  onClose,
  previewData,
  onHighlightClick,
}) => {
  const highlightManagerRef = useRef(new HighlightManager());

  const [pdfDocProxy, setPdfDocProxy] = useState<PDFDocumentProxy | null>(null);
  const [visiblePages, setVisiblePages] = useState<number[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // Use a simple array for page refs if PdfHighlighter doesn't provide direct page elements
  const pageContainerRefs = useRef<Array<HTMLDivElement | null>>([]);

  const browserCapabilities = useMemo(() => detectBrowserCapabilities(), []);
  const renderingStrategy = useMemo(
    () => getSafeRenderingStrategy(browserCapabilities),
    [browserCapabilities]
  );

  // State for tracking text mapping operations
  const [textMappingState, setTextMappingState] = useState<{
    isLoading: boolean;
    error: string | null;
    lastAttemptedPage: number | null;
  }>({
    isLoading: false,
    error: null,
    lastAttemptedPage: null,
  });

  const findCoordinatesOnPageCallback = useCallback(
    async (
      _docId: string,
      pageNum: number,
      text: string,
      pdfDoc: PDFDocumentProxy
    ): Promise<HighlightCoordinates[]> => {
      if (!text.trim()) return [];
      
      try {
        // Set loading state for this specific page
        setTextMappingState(prev => ({
          ...prev,
          isLoading: true,
          lastAttemptedPage: pageNum,
          error: null,
        }));
        
        console.log(`[PdfHighlighter] Finding coordinates on page ${pageNum} for text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        
        // Attempt to find text coordinates using PdfTextMapper
        const searchResults = await defaultPdfTextMapper.findTextCoordinates(
          pdfDoc,
          text,
          pageNum
        );
        
        // If no results found, try with a shorter version of the text (first 100 chars)
        if (searchResults.length === 0 && text.length > 100) {
          console.log(`[PdfHighlighter] No results found with full text, trying with truncated text`);
          const shorterText = text.substring(0, 100);
          const fallbackResults = await defaultPdfTextMapper.findTextCoordinates(
            pdfDoc,
            shorterText,
            pageNum
          );
          
          if (fallbackResults.length > 0) {
            console.log(`[PdfHighlighter] Found ${fallbackResults.length} results with truncated text`);
            // Adjust confidence for fallback results
            fallbackResults.forEach(result => {
              result.confidence = Math.min(0.75, result.confidence);
            });
            
            return fallbackResults.map((result: TextSearchResult) => ({
              pageNumber: result.pageNumber,
              rects: result.coordinates,
              textContent: result.matchedText,
              confidence: result.confidence,
              styleId: 'orange', // Use a distinct style for fallback highlights
            }));
          }
        }
        
        // Process successful results
        if (searchResults.length > 0) {
          console.log(`[PdfHighlighter] Found ${searchResults.length} results on page ${pageNum}`);
          // Clear error state on success
          setTextMappingState(prev => ({
            ...prev,
            isLoading: false,
            error: null,
          }));
          
          return searchResults.map((result: TextSearchResult) => ({
            pageNumber: result.pageNumber,
            rects: result.coordinates,
            textContent: result.matchedText,
            confidence: result.confidence,
            // Use different styles based on confidence
            styleId: result.confidence > 0.9 ? 'green' :
                    result.confidence > 0.7 ? 'blue' :
                    result.confidence > 0.5 ? 'orange' : 'red',
          }));
        } else {
          // No results found even with fallback
          console.warn(`[PdfHighlighter] No text matches found on page ${pageNum}`);
          setTextMappingState(prev => ({
            ...prev,
            isLoading: false,
            error: `No matches found for text on page ${pageNum}`,
          }));
          return [];
        }
      } catch (error) {
        // Handle errors during text mapping
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[PdfHighlighter] Error finding coordinates on page ${pageNum}:`, errorMessage);
        
        setTextMappingState(prev => ({
          ...prev,
          isLoading: false,
          error: `Failed to process text on page ${pageNum}: ${errorMessage}`,
        }));
        
        // Return empty array on error
        return [];
      }
    },
    []
  );

  const isPageVisibleCallback = useCallback((pageNumber: number) => {
    return visiblePages.includes(pageNumber);
  }, [visiblePages]);

  const {
    highlightCoordinates: optimizedCoordinates,
    isCalculatingCoordinates,
    calculationError,
    performanceMetrics,
    resetCacheForDocument,
  } = useHighlightOptimization(
    pdfDocProxy,
    {
      documentId: previewData?.pdfUrl || "unknown-doc",
      textToHighlight: previewData?.textToHighlight,
      preloadAdjacentPages: true,
      isPageVisible: isPageVisibleCallback,
      visiblePages,
      findCoordinatesOnPage: findCoordinatesOnPageCallback,
    }
  );
  
  useEffect(() => {
    if (previewData?.pdfUrl) {
      resetCacheForDocument();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewData?.pdfUrl]);

  const highlights = useMemo(() => {
    if (!optimizedCoordinates || optimizedCoordinates.length === 0) return [];
    return convertToHighlightFormat(optimizedCoordinates, previewData?.pageNumber);
  }, [optimizedCoordinates, previewData?.pageNumber]);

  const onDocumentLoadSuccess = (loadedPdfDocument: PDFDocumentProxy) => {
    console.log('📄 PDF loaded successfully. Pages:', loadedPdfDocument.numPages);
    setPdfDocProxy(loadedPdfDocument);
    // Initialize page refs array based on number of pages
    pageContainerRefs.current = Array(loadedPdfDocument.numPages).fill(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('💥 PDF load error:', error.message);
  };

  useEffect(() => {
    if (!pdfDocProxy || !scrollAreaRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const currentlyVisiblePages = new Set<number>();
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const pageNumStr = (entry.target as HTMLElement).dataset.pageNumber;
            if (pageNumStr) {
              currentlyVisiblePages.add(parseInt(pageNumStr, 10));
            }
          }
        });

        setVisiblePages(prevVisiblePages => {
          const newVisibleArray = Array.from(currentlyVisiblePages).sort((a, b) => a - b);
          if (
            newVisibleArray.length === prevVisiblePages.length &&
            newVisibleArray.every((val, index) => val === prevVisiblePages[index])
          ) {
            return prevVisiblePages;
          }
          console.log("Visible pages changed:", newVisibleArray);
          return newVisibleArray;
        });
      },
      { root: scrollAreaRef.current, threshold: 0.1 } 
    );

    const pageContainers = scrollAreaRef.current?.querySelectorAll('.react-pdf__Page');
    const observedElements: Element[] = [];

    if (pageContainers) {
      pageContainers.forEach((container) => {
        const pageNumberStr = container.getAttribute('data-page-number');
        if (pageNumberStr) {
          observer.observe(container);
          observedElements.push(container);
        }
      });
    }
    
    return () => {
      observedElements.forEach(el => observer.unobserve(el));
    };
  }, [pdfDocProxy, scrollAreaRef]);


  if (!isOpen || !previewData) {
    return null;
  }
  
  const { fileName, pdfUrl, pageNumber, textToHighlight } = previewData;

  // Placeholder components for different rendering strategies
  const FullFeaturedHighlighterComponent = ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  );
  const BasicHighlighterComponent = ({ children }: { children: React.ReactNode }) => (
    <div>
      <p className="p-2 text-sm bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300">
        Rendering in basic mode due to browser limitations. Some features might be unavailable.
      </p>
      {children}
    </div>
  );

  // Utility to convert PdfRect (from optimizedCoordinates) to BoundingBox (used by HighlightManager)
  const pdfRectToBoundingBox = useCallback(
    (rect: PdfRect): BoundingBox => ({
      x1: rect.x,
      y1: rect.y,
      x2: rect.x + rect.width,
      y2: rect.y + rect.height,
    }),
    []
  );

  // Keep HighlightManager in sync with optimizedCoordinates
  useEffect(() => {
    const manager = highlightManagerRef.current;
    // Reset current highlights
    manager.highlights = [];
    optimizedCoordinates.forEach(coord => {
      const convertedRects = coord.rects.map(pdfRectToBoundingBox);
      manager.addHighlight({
        pageNumber: coord.pageNumber,
        rects: convertedRects,
        text: coord.textContent,
        metadata: { confidence: coord.confidence },
      });
    });
    if (manager.highlights.length > 0 && !manager.activeHighlightId) {
      manager.setActiveHighlight(manager.highlights[0].id);
    }
  }, [optimizedCoordinates, pdfRectToBoundingBox]);
  // Fallback component for page-only display when highlighting fails
  const PageOnlyPdfViewerComponent = () => {
    // Create a simplified fallback view when no highlights are found
    return (
      <div className="relative">
        {optimizedCoordinates.length === 0 && textToHighlight && !isCalculatingCoordinates && (
          <div className="absolute top-0 left-0 right-0 bg-amber-100 dark:bg-amber-900 p-2 z-10 text-center">
            <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center justify-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              Couldn&apos;t find exact text to highlight. Showing page {pageNumber} without highlights.
            </p>
          </div>
        )}
      
        {/* Simplified PDF viewer - mimicking PdfHighlighter with minimal props */}
        <div className="pdf-simple-view">
          {pdfDocProxy && (
            <PdfLoader
              url={pdfUrl}
              beforeLoad={
                <div className="flex justify-center items-center h-full p-4">
                  <Loader2 className="h-8 w-8 mr-2 animate-spin" />
                  <span>Loading PDF...</span>
                </div>
              }
              onError={(error) => console.error("PDF load error:", error)}
            >
              {() => (
                <PdfHighlighter
                  pdfDocument={pdfDocProxy}
                  enableAreaSelection={(event) => false}
                  highlights={[]}
                  onScrollChange={() => {}}
                  highlightTransform={(highlight, index, setTip, hideTip, viewportToScaled, screenshot, isScrolledTo) => {
                    return <></>
                  }}
                  scrollRef={(scrollTo) => {
                    try {
                      // Just focus on showing the right page, no complex scrolling logic
                      console.log(`Simple view showing page ${pageNumber}`);
                    } catch (err) {
                      console.error("Error scrolling in page-only view:", err);
                    }
                  }}
                  onSelectionFinished={() => <></>}
                />
              )}
            </PdfLoader>
          )}
        </div>
      </div>
    );
  };

  // Minimal PDF Viewer for browsers with limited PDF support
  const MinimalPdfViewerComponent = () => (
    <div className="p-4 text-center">
      <AlertCircle className="mx-auto h-12 w-12 text-orange-500" />
      <h3 className="mt-2 text-lg font-medium">Minimal PDF Viewer</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Your browser has limited PDF support. Displaying a simplified view.
        Full highlighting features are not available.
      </p>
      {pdfUrl && (
        <Button variant="link" asChild className="mt-2">
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
            Open PDF directly
          </a>
        </Button>
      )}
    </div>
  );

  // TODO: Add browser-specific CSS classes or style adjustments based on browserCapabilities.isMobile or browserCapabilities.browser.name

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className="w-full md:w-3/4 lg:w-1/2 xl:max-w-2xl p-0 flex flex-col"
      >
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex justify-between items-center">
            <SheetTitle className="truncate text-lg" title={fileName}>
              Source: {fileName}
            </SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </Button>
            </SheetClose>
          </div>
          <SheetDescription>
            Page: {pageNumber}{' '}
            {performanceMetrics?.cacheMemoryUsage && performanceMetrics.cacheMemoryUsage.usage !== undefined &&
              `(Cache: ${(performanceMetrics.cacheMemoryUsage.usage / (1024*1024)).toFixed(2)}MB / ${performanceMetrics.cacheMemoryUsage.count || 0} items)`}
            
            {/* Text highlighting status */}
            {(textToHighlight || calculationError || textMappingState.error) && (
              <p className="text-xs mt-1 italic">
                {isCalculatingCoordinates || textMappingState.isLoading ? (
                  <span className="flex items-center text-amber-500">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    {textMappingState.isLoading && textMappingState.lastAttemptedPage
                      ? `Processing text on page ${textMappingState.lastAttemptedPage}...`
                      : `Optimizing highlights... (Visible: ${visiblePages.join(', ') || 'None'}, Pages: ${performanceMetrics?.pagesProcessed || 0})`}
                  </span>
                ) : calculationError || textMappingState.error ? (
                  <span className="flex items-center text-red-500">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Error: {textMappingState.error || (calculationError ? calculationError.message : "Unknown error")}
                    {/* Provide retry option */}
                    {textMappingState.lastAttemptedPage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 h-5 text-xs"
                        onClick={() => {
                          if (textMappingState.lastAttemptedPage) {
                            setTextMappingState(prev => ({ ...prev, error: null }));
                            if (pdfDocProxy && textToHighlight) {
                              // Retry with just the first 50 chars as a fallback
                              findCoordinatesOnPageCallback(
                                previewData?.documentId || "unknown",
                                textMappingState.lastAttemptedPage,
                                textToHighlight.substring(0, 50),
                                pdfDocProxy
                              );
                            }
                          }
                        }}
                      >
                        Retry
                      </Button>
                    )}
                  </span>
                ) : (
                  <>
                   {performanceMetrics && performanceMetrics.computationTime !== undefined &&
                      <span className="text-green-500">
                        Highlights ready ({(performanceMetrics.computationTime/1000).toFixed(2)}s {performanceMetrics.cacheHit ? "[CACHE]" : ""})
                      </span>
                   }
                   {optimizedCoordinates.length === 0 && textToHighlight && (
                      <span className="flex items-center text-orange-500 mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        No text matches found. Showing page-only view.
                      </span>
                   )}
                  </>
                )}
              </p>
            )}
          </SheetDescription>
        </SheetHeader>
        <HighlightControlPanel
          highlightManager={highlightManagerRef.current}
          onNavigate={(highlightId) => {
            const h = highlightManagerRef.current.getHighlightById(highlightId);
            if (h && onHighlightClick) {
              const converted = {
                pageNumber: h.pageNumber,
                rects: h.rects.map(b => ({
                  x: b.x1,
                  y: b.y1,
                  width: b.x2 - b.x1,
                  height: b.y2 - b.y1,
                })),
                textContent: h.text ?? "",
                confidence: typeof h.metadata?.confidence === "number" ? h.metadata.confidence : 1,
              } as HighlightCoordinates;
              onHighlightClick(converted);
            }
          }}
          className="p-2 border-b bg-white dark:bg-gray-900"
        />
        <ScrollArea ref={scrollAreaRef} className="flex-1 bg-gray-100 dark:bg-gray-800" id="pdf-scroll-area">
          <div className="p-1 flex justify-center items-start min-h-full">
            {pdfUrl ? (
              <PdfLoader
                url={pdfUrl}
                beforeLoad={
                  <div className="flex justify-center items-center h-full p-4">
                    <Loader2 className="h-8 w-8 mr-2 animate-spin" /> <span>Loading PDF...</span>
                  </div>
                }
                onError={onDocumentLoadError}
              >
                {(loadedPdfDocument) => {
                  if (loadedPdfDocument && (!pdfDocProxy || pdfDocProxy.fingerprints[0] !== loadedPdfDocument.fingerprints[0])) {
                     onDocumentLoadSuccess(loadedPdfDocument);
                  }
                  if (!pdfDocProxy) return <div className="flex justify-center items-center h-full p-4"><Loader2 className="h-8 w-8 mr-2 animate-spin" /> Initializing PDF...</div>;
                  
                  return (
                    <>
                      {/* Use the appropriate rendering strategy based on browser capabilities */}
                      {renderingStrategy === 'full' && (
                        <FullFeaturedHighlighterComponent>
                          <PdfHighlighter
                            pdfDocument={pdfDocProxy}
                            enableAreaSelection={(event) => event.altKey}
                            highlights={highlights}
                            onScrollChange={() => { /* IntersectionObserver handles this */ }}
                            onSelectionFinished={() => <></>} // Placeholder for tip content if needed
                            scrollRef={(scrollTo) => {
                              if (pageNumber && highlights.length > 0) {
                                const firstHighlightOnPage = highlights.find(h => h.position.pageNumber === pageNumber);
                                if (firstHighlightOnPage) {
                                  setTimeout(() => {
                                    try { scrollTo(firstHighlightOnPage); } catch (e) { console.error("Error scrolling:", e); }
                                  }, 100);
                                }
                              }
                            }}
                            highlightTransform={(
                              highlight,
                              index,
                              setTip,
                              hideTip,
                              viewportToScaled,
                              screenshot,
                              isScrolledTo
                            ) => {
                              const renderPosition = {
                                boundingRect: convertScaledToLTWHP(highlight.position.boundingRect),
                                rects: highlight.position.rects.map(convertScaledToLTWHP),
                                pageNumber: highlight.position.pageNumber,
                              };

                              const isTextHighlight = !Boolean(
                                highlight.content && highlight.content.image
                              );

                              let actualComponent;
                              if (isTextHighlight) {
                                // Get the highlight style from the manager
                                const orig = (highlight as any).originalCoord as HighlightCoordinates | undefined;
                                const manager = highlightManagerRef.current;
                                let styleId = 'default'; // Default style
                                
                                if (orig && manager) {
                                  const targetRects = orig.rects.map(pdfRectToBoundingBox);
                                  const matched = manager.highlights.find(h =>
                                    h.pageNumber === orig.pageNumber &&
                                    h.rects.length === targetRects.length &&
                                    h.rects.every((r, idx) =>
                                      r.x1 === targetRects[idx].x1 &&
                                      r.y1 === targetRects[idx].y1 &&
                                      r.x2 === targetRects[idx].x2 &&
                                      r.y2 === targetRects[idx].y2
                                    )
                                  );
                                  
                                  if (matched && matched.styleId) {
                                    styleId = matched.styleId;
                                  }
                                }
                                
                                const highlightClass = `highlight-style-${styleId}`;
                                
                                actualComponent = (
                                  <Highlight
                                    isScrolledTo={isScrolledTo}
                                    position={renderPosition}
                                    comment={highlight.comment}
                                    onClick={() => {
                                      const orig = (highlight as any).originalCoord as HighlightCoordinates | undefined;
                                      if (!orig) return;

                                      // Inform parent component about the click
                                      if (onHighlightClick) {
                                        onHighlightClick(orig);
                                      }

                                      // Activate the corresponding highlight in HighlightManager
                                      const manager = highlightManagerRef.current;
                                      if (manager) {
                                        const targetRects = orig.rects.map(pdfRectToBoundingBox);
                                        const matched = manager.highlights.find(h =>
                                          h.pageNumber === orig.pageNumber &&
                                          h.rects.length === targetRects.length &&
                                          h.rects.every((r, idx) =>
                                            r.x1 === targetRects[idx].x1 &&
                                            r.y1 === targetRects[idx].y1 &&
                                            r.x2 === targetRects[idx].x2 &&
                                            r.y2 === targetRects[idx].y2
                                          )
                                        );
                                        if (matched) {
                                          manager.setActiveHighlight(matched.id);
                                        }
                                      }
                                    }}
                                    // TODO: Add touch-specific event handlers for mobile (e.g., onTouchEnd)
                                  />
                                );
                              } else {
                                actualComponent = (
                                  <AreaHighlight
                                    isScrolledTo={isScrolledTo}
                                    highlight={{ ...highlight, position: renderPosition }}
                                    onChange={(boundingRect) => {
                                      // This is for updating area selection
                                    }}
                                     // TODO: Add touch-specific event handlers for mobile
                                  />
                                );
                              }

                              return (
                                <Popup
                                  popupContent={
                                    <HighlightTooltip
                                      coord={(highlight as any).originalCoord as HighlightCoordinates}
                                    />
                                  }
                                  onMouseOver={(popupContent) => {
                                    setTip(highlight, () => popupContent);
                                  }}
                                  onMouseOut={hideTip}
                                  key={index}
                                >
                                  <div className={'highlight-style-' +
                                    (highlight.originalCoord && highlight.originalCoord.styleId ?
                                      highlight.originalCoord.styleId : 'default')
                                  }>
                                    {actualComponent}
                                  </div>
                                </Popup>
                              );
                            }}
                          />
                        </FullFeaturedHighlighterComponent>
                      )}
                      {renderingStrategy === 'basic' && (
                        <BasicHighlighterComponent>
                          {/* Simplified rendering for basic support. Could be a less interactive PdfHighlighter or a static PDF view */}
                          {/* For now, reusing PdfHighlighter but one might disable some features or use a different component */}
                          <PdfHighlighter
                            pdfDocument={pdfDocProxy}
                            highlights={highlights.filter(h => h.position.pageNumber === pageNumber)} // Only show current page highlights for basic
                            highlightTransform={() => <></>} // Basic: No complex transform
                            onScrollChange={() => {}} // Basic: No scroll change handling needed here
                            scrollRef={(scrollTo) => {
                              if (pageNumber && highlights.length > 0) {
                                const firstHighlightOnPage = highlights.find(h => h.position.pageNumber === pageNumber);
                                if (firstHighlightOnPage) setTimeout(() => scrollTo(firstHighlightOnPage), 100);
                              }
                            }}
                            onSelectionFinished={() => <></>} // Basic: No new selection handling
                            enableAreaSelection={() => false} // Basic: Disable area selection
                          // Fewer interactive features for basic mode
                          />
                        </BasicHighlighterComponent>
                      )}
                      {renderingStrategy === 'minimal' && <MinimalPdfViewerComponent />}
                      
                      {/* Use page-only view when we have PDF but no highlights found */}
                      {optimizedCoordinates.length === 0 && !isCalculatingCoordinates &&
                       textToHighlight && renderingStrategy !== 'minimal' && <PageOnlyPdfViewerComponent />}
                    </>
                );}}
              </PdfLoader>
            ) : (
              <div className="flex justify-center items-center h-full p-4 text-red-500">
                <p>PDF URL is missing.</p>
              </div>
            )}
            
            {/* Custom highlight styles based on HighlightManager styles */}
            <style jsx global>{`
              .default-highlight {
                background-color: rgba(255, 255, 0, 0.3);
              }
              .highlight-style-red {
                background-color: rgba(255, 205, 210, 0.4) !important;
              }
              .highlight-style-green {
                background-color: rgba(200, 230, 201, 0.4) !important;
              }
              .highlight-style-blue {
                background-color: rgba(187, 222, 251, 0.4) !important;
              }
              .highlight-style-purple {
                background-color: rgba(225, 190, 231, 0.4) !important;
              }
              .highlight-style-orange {
                background-color: rgba(255, 224, 178, 0.4) !important;
              }
            `}</style>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default CitationPreviewSidebar;
