import React from "react";
import { Document, Page } from "react-pdf";
// Use the specific pdfjs-dist version that react-pdf depends on
// Import the main library entry; worker set separately in PdfWorkerSetup.tsx
import * as pdfjsLib from "pdfjs-dist";

// Import CSS for react-pdf default UI elements
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
// react-pdf-highlighter might be added later if needed for text highlighting functionality
// import "react-pdf-highlighter/dist/style.css";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetDescription, // Can be used for sub-header or remove if not needed
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface CitationPreviewData {
  fileName: string; // Original file name, still useful for title
  pdfUrl: string; // URL to the PDF file
  pageNumber: number; // 1-based page number for the citation
  textToHighlight: string; // The specific text content of the chunk (for potential future highlighting)
  documentId?: string;
  chunkId?: string;
}

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

  if (!isOpen || !previewData) {
    return null;
  }

  // Destructure for easier access
  const { fileName, pdfUrl, pageNumber } = previewData;

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
              <Button variant="ghost" size="icon" className="rounded-full">
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </Button>
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
                onLoadError={(error) =>
                  console.error("Error loading PDF:", error.message)
                }
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
                  onRenderError={(error) =>
                    console.error("Error rendering PDF page:", error.message)
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
