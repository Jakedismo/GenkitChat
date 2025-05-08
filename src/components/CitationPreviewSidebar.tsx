import React from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface CitationPreviewData {
  fileName: string;
  pdfUrl: string; // Kept for structure, but not used in simplified view
  pageNumber: number;
  // textToHighlight: string; // Removed for simplification
  // documentId?: string; // Removed for simplification
  // chunkId?: string; // Removed for simplification
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

  const { fileName, pageNumber } = previewData;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
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
            Page: {pageNumber}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 bg-gray-100 dark:bg-gray-800">
          <div className="p-4">
            <p>PDF Preview Area (Simplified)</p>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default CitationPreviewSidebar;