import { CitationPreviewData } from "@/types/chat";
import { useState } from "react";

export function useCitationPreview() {
  const [citationPreview, setCitationPreview] =
    useState<CitationPreviewData | null>(null);
  const [isCitationSidebarOpen, setIsCitationSidebarOpen] = useState(false);

  return {
    citationPreview,
    setCitationPreview,
    isCitationSidebarOpen,
    setIsCitationSidebarOpen,
  };
}