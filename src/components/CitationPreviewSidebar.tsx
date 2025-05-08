import React from 'react';
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
  fileName: string;
  content: string;
  documentId?: string; // Optional, for future use or richer display
  chunkId?: string;    // Optional
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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-[540px] p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex justify-between items-center">
            <SheetTitle className="truncate text-lg">
              Source: {previewData.fileName}
            </SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </Button>
            </SheetClose>
          </div>
          {/* Optional: Could display documentId or chunkId here if needed */}
          {/* <SheetDescription>
            Chunk ID: {previewData.chunkId || 'N/A'}
          </SheetDescription> */}
        </SheetHeader>
        <ScrollArea className="flex-1 p-0">
          {/* Use prose for better text formatting if desired */}
          <div className="p-6 whitespace-pre-wrap break-words text-sm prose dark:prose-invert max-w-none">
            {previewData.content}
          </div>
        </ScrollArea>
        {/* Optional Footer */}
        {/* <div className="p-4 border-t">
          <Button variant="outline" onClick={onClose} className="w-full">
            Close Preview
          </Button>
        </div> */}
      </SheetContent>
    </Sheet>
  );
};

export default CitationPreviewSidebar;