import React, { useState, useEffect } from 'react';
import {
  Document,
  Page,
  pdfjs as ReactPdfPdfJs, // Alias to avoid conflict if pdfjs is used elsewhere
} from 'react-pdf';
import {
  PdfHighlighter,
  // Tip, // Uncomment if needed for custom tooltips
  // Highlight, // This is a component to render a highlight, not the type for highlights prop
  // Popup, // Uncomment if needed for custom popups
  // AreaHighlight, // Uncomment if you want to draw area highlights
} from 'react-pdf-highlighter';

// Import CSS for react-pdf and react-pdf-highlighter
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf-highlighter/dist/style.css';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetDescription, // Can be used for sub-header or remove if not needed
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface CitationPreviewData {
  fileName: string; // Original file name, still useful for title
  pdfUrl: string; // URL to the PDF file
  pageNumber: number; // 1-based page number for the citation
  textToHighlight: string; // The specific text content of the chunk to highlight
  documentId?: string;
  chunkId?: string;
  // content: string; // Effectively replaced by textToHighlight for PDF view, original chunk content
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
  if (!isOpen || !previewData) {
    return null;
  }

  // Destructure for easier access and to ensure correct prop names are used
  const { originalFileName, pdfUrl, pageNumber } = previewData;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* Increased width for better PDF viewing, adjust as needed */}
      <SheetContent side="right" className="w-full md:w-3/4 lg:w-1/2 xl:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex justify-between items-center">
            <SheetTitle className="truncate text-lg" title={originalFileName}>
              Source: {originalFileName}
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
            {/* Future: Display chunk text: {previewData.textToHighlight.substring(0,100)}... */}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 bg-gray-100 dark:bg-gray-800">
          <div className="p-1" style={{ height: 'calc(100vh - 130px)' }}> {/* Adjust height based on actual header/footer height */}
            <Document
              file={pdfUrl}
              onLoadError={(error) => console.error('Error loading PDF:', error.message)}
              loading={
                <div className="flex justify-center items-center h-full">
                  <p>Loading PDF...</p>
                </div>
              }
              error={
                <div className="flex justify-center items-center h-full text-red-500">
                  <p>Failed to load PDF. Please check the URL or file.</p>
                </div>
              }
              className="flex justify-center items-start h-full overflow-auto" // Ensure Document itself can scroll if content overflows
            >
              {/* 
                The Page component will be rendered by Document once the PDF is loaded.
                No need to conditionally render Page based on a pdfDocument state here, 
                as Document handles its own loading state.
              */}
              <Page 
                pageNumber={pageNumber} 
                scale={1.0} // Initial scale, can be made dynamic
                renderAnnotationLayer={true} // Default true, explicit for clarity
                renderTextLayer={true} // Default true, explicit for clarity
                onRenderError={(error) => console.error('Error rendering PDF page:', error.message)}
                loading={
                  <div className="flex justify-center items-center h-full">
                    <p>Loading page {pageNumber}...</p>
                  </div>
                }
              />
            </Document>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default CitationPreviewSidebar;