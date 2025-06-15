import React, { useCallback } from "react";
import { Document, Page } from "react-pdf"; // Added pdfjs
// Use the specific pdfjs-dist version that react-pdf depends on
// Import the main library entry; worker set separately in PdfWorkerSetup.tsx

// Import CSS for react-pdf default UI elements
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
// react-pdf-highlighter might be added later if needed for text highlighting functionality
// import "react-pdf-highlighter/dist/style.css";

import { buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CitationPreviewData } from "@/types/chat";
import { X } from "lucide-react";

interface CitationPreviewSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  previewData: CitationPreviewData | null;
}

const CitationPreviewSidebar: React.FC<CitationPreviewSidebarProps> = ({
  isOpen,
  onClose,
  previewData,
}) => {
  // PDF worker setup is handled globally by PdfWorkerSetup.tsx

  const customTextRenderer = useCallback(
    (textItem: { str: string; itemIndex: number }) => {
      const { str } = textItem;
      if (!previewData?.textToHighlight || !str) {
        return str;
      }

      const { textToHighlight } = previewData;
      const escapedHighlightText = textToHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedHighlightText})`, 'gi');

      return str.replace(regex, (match) => `<mark>${match}</mark>`);
    },
    [previewData]
  );

  // 📄 ENHANCED PDF COMPONENT DEBUG LOGGING
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log('📄 ===== PDF LOAD SUCCESS =====');
    console.log('📄 PDF loaded successfully');
    console.log('📄 Number of pages:', numPages);
    console.log('📄 PDF URL that worked:', previewData?.pdfUrl);
    console.log('📄 ===== PDF LOAD SUCCESS END =====');
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('💥 ===== PDF LOAD ERROR =====');
    console.error('💥 PDF load error:', error);
    console.error('💥 Error message:', error.message);
    console.error('💥 Error stack:', error.stack);
    console.error('💥 PDF URL that failed:', previewData?.pdfUrl);
    console.error('💥 Preview data:', previewData);
    console.error('💥 ===== PDF LOAD ERROR END =====');
  };

  // Debug logging when component renders
  console.log('📄 ===== PDF COMPONENT RENDER =====');
  console.log('📄 Component isOpen:', isOpen);
  console.log('📄 Component previewData:', previewData);
  
  if (!isOpen || !previewData) {
    console.log('📄 Component not rendering (isOpen:', isOpen, 'previewData:', !!previewData, ')');
    console.log('📄 ===== PDF COMPONENT RENDER END =====');
    return null;
  }

  // Destructure for easier access
  const { fileName, pdfUrl, pageNumber } = previewData;
  
  console.log('📄 Component will render with:');
  console.log('📄 - fileName:', fileName);
  console.log('📄 - pdfUrl:', pdfUrl);
  console.log('📄 - pageNumber:', pageNumber);
  console.log('📄 - pdfUrl type:', typeof pdfUrl);
  console.log('📄 - pdfUrl length:', pdfUrl?.length || 0);
  console.log('📄 ===== PDF COMPONENT RENDER END =====');

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* Increased width for better PDF viewing */}
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
              <button className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "rounded-full")}>
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </button>
            </SheetClose>
          </div>
          <SheetDescription>
            Page: {pageNumber}
            {/* Potential future feature: Display chunk text excerpt */}
            {/* {previewData.textToHighlight && <p className="text-xs mt-1 italic truncate">Chunk: {previewData.textToHighlight}</p>} */}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 bg-gray-100 dark:bg-gray-800">
          {/* Container for centering and potentially controlling PDF size */}
          <div className="p-1 flex justify-center items-start min-h-full">
            {pdfUrl ? (
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="flex justify-center items-center h-full p-4">
                    <p>Loading PDF...</p>
                  </div>
                }
                error={
                  <div className="flex justify-center items-center h-full p-4 text-red-500">
                    <p>Failed to load PDF. Please check the URL or file.</p>
                  </div>
                }
                // Removed fixed height/overflow from Document, let ScrollArea handle scrolling
                className="flex justify-center"
              >
                <Page
                  pageNumber={pageNumber} // Go directly to the relevant page
                  scale={1.0} // Adjust scale as needed, could be dynamic
                  renderAnnotationLayer={true}
                  renderTextLayer={true} // Important for text selection/highlighting
                  customTextRenderer={customTextRenderer} // Add this prop
                  onRenderAnnotationLayerSuccess={() => console.log('📄 Annotation layer rendered successfully for page', pageNumber)}
                  onRenderAnnotationLayerError={(error: unknown) => {
                    const message = error instanceof Error ? error.message : String(error);
                    console.error('💥 Error rendering annotation layer for page', pageNumber, ':', message);
                  }}
                  onRenderError={(error) =>
                    console.error("💥 Error rendering PDF page:", pageNumber, ':', error.message)
                  }
                  loading={
                    <div className="flex justify-center items-center p-4">
                      <p>Loading page {pageNumber}...</p>
                    </div>
                  }
                />
              </Document>
            ) : (
              <div className="flex justify-center items-center h-full p-4 text-red-500">
                <p>PDF URL is missing.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default CitationPreviewSidebar;
