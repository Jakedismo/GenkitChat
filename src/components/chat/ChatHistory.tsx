import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ChatMessage, CitationPreviewData } from "@/types/chat";
import React, { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import {
  botMarkdownComponents,
  userMarkdownComponents,
} from "../markdown/MarkdownComponents";
import ChatMessageContent from "./ChatMessageContent";

interface ChatHistoryProps {
  messages: ChatMessage[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  scrollAreaRef: React.RefObject<HTMLDivElement>;
  setCitationPreview: React.Dispatch<
    React.SetStateAction<CitationPreviewData | null>
  >;
  setIsCitationSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  fixTruncatedMessage: (messageId?: string) => boolean;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({
  messages,
  isLoading,
  messagesEndRef,
  scrollAreaRef,
  setCitationPreview,
  setIsCitationSidebarOpen,
  fixTruncatedMessage,
}) => {
  const animatedMessageIds = useRef(new Set<string>());
  const { toast } = useToast();

  useEffect(() => {
    if (messages.length === 0) {
      animatedMessageIds.current.clear();
    }
  }, [messages]);

  const handleCitationClick = (
    messageId: string,
    chunkIndexesInSources: number[],
  ) => {
    if (!chunkIndexesInSources || chunkIndexesInSources.length === 0) {
      toast({
        title: "Citation Error",
        description: "No valid citation source found for this reference.",
        variant: "destructive",
      });
      return;
    }

    const message = messages.find((m) => m.id === messageId);
    if (!message || !message.sources) {
      toast({
        title: "Citation Error",
        description: "Could not find the message or its sources.",
        variant: "destructive",
      });
      return;
    }

    const allReferencedChunks = chunkIndexesInSources
      .map((index) => message.sources![index])
      .filter(Boolean);

    if (allReferencedChunks.length === 0) {
      toast({
        title: "Citation Error",
        description: "Could not load any valid citation sources.",
        variant: "destructive",
      });
      return;
    }

    // For now, we'll use the first valid chunk for the preview.
    // The UI can be updated later to handle multiple chunks.
    const primaryChunk = allReferencedChunks[0];
    
    let docId = primaryChunk.documentId;
    if (docId && docId.includes("::")) {
      const originalProblematicDocId = docId;
      const idParts = docId.split("::");
      docId = idParts[0];
      console.warn(
        `[handleCitationClick] Cleaned docId from "${originalProblematicDocId}" to "${docId}"`,
      );
    }

    let rawDocFileName = primaryChunk.fileName || primaryChunk.originalFileName;
    if (rawDocFileName && rawDocFileName.includes("::")) {
      rawDocFileName = rawDocFileName.split("::").pop() || rawDocFileName;
    }
    const docFileName = rawDocFileName;

    let pdfUrl = "";
    if (primaryChunk.documentId) {
      const rawIdentifier = primaryChunk.documentId;
      const encodedIdentifier = encodeURIComponent(rawIdentifier);
      pdfUrl = `/api/files/${encodedIdentifier}`;
    }

    const combinedTextToHighlight = allReferencedChunks
      .map((chunk) => chunk.textToHighlight || chunk.content)
      .filter(Boolean)
      .join("\n\n...\n\n");

    const missingFields = [];
    if (!docFileName) missingFields.push("fileName");
    if (!primaryChunk.documentId) missingFields.push("documentId");
    if (typeof primaryChunk.pageNumber !== "number") missingFields.push("pageNumber");
    if (!combinedTextToHighlight) missingFields.push("textToHighlight");

    if (missingFields.length === 0 && pdfUrl) {
      setCitationPreview({
        fileName: docFileName!,
        pdfUrl: pdfUrl,
        pageNumber: primaryChunk.pageNumber!,
        textToHighlight: combinedTextToHighlight,
        documentId: primaryChunk.documentId!,
        chunkId: primaryChunk.chunkId,
      });
      setIsCitationSidebarOpen(true);
    } else {
      const fallbackData = {
        fileName: docFileName || "Unknown File",
        content: combinedTextToHighlight || "No content available for preview.",
        pdfUrl: pdfUrl,
        pageNumber: primaryChunk.pageNumber || 1,
        textToHighlight: combinedTextToHighlight,
        documentId: primaryChunk.documentId || "unknown",
        chunkId: primaryChunk.chunkId || 0,
      };
      setCitationPreview(fallbackData);
      setIsCitationSidebarOpen(true);
      if (!pdfUrl) {
        toast({
          title: "PDF URL Missing",
          description: `Missing fields: ${missingFields.join(", ")}. Cannot construct PDF URL.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Citation Data Incomplete",
          description: `Missing: ${missingFields.join(", ")}. PDF preview may work but some features unavailable.`,
          variant: "default",
        });
      }
    }
  };

  return (
    <ScrollArea
      className="h-full w-full pb-0"
      ref={scrollAreaRef as React.RefObject<HTMLDivElement>}
    >
      <div
        className="flex flex-col gap-4 p-4 pb-48"
        data-messages-container="true"
      >
        {messages.map((message) => {
          let M_SHOULD_ANIMATE = false;
          if (!animatedMessageIds.current.has(message.id)) {
            M_SHOULD_ANIMATE = true;
            animatedMessageIds.current.add(message.id);
          }
          return (
            <div
              key={message.id}
              className={cn(
                "flex w-full flex-col",
                message.sender === "user" ? "items-end" : "items-start",
                M_SHOULD_ANIMATE && "animate-fade-in-slide-up",
              )}
              data-message-id={message.id}
              data-message-type={message.sender}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-4 py-3",
                  "prose dark:prose-invert prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-li:my-0",
                  message.sender === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                <div className="relative">
                  {message.sender === "user" ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={userMarkdownComponents}
                    >
                      {typeof message.text === "string"
                        ? message.text
                        : String(message.text || "")}
                    </ReactMarkdown>
                  ) : message.text ? (
                    <ChatMessageContent
                      text={message.text}
                      onCitationClick={
                        message.sources && message.sources.length > 0
                          ? (chunkIndexes) =>
                              handleCitationClick(message.id, chunkIndexes)
                          : () => {}
                      }
                      components={botMarkdownComponents}
                    />
                  ) : null}

                  {message.sender === "bot" && (
                    <button
                      onClick={() => fixTruncatedMessage(message.id)}
                      className="absolute top-0 right-0 p-1 text-xs text-muted-foreground opacity-0 hover:opacity-100 focus:opacity-100 bg-muted/50 rounded transition-opacity"
                      title="Fix message formatting"
                    >
                      <span className="sr-only">Fix message</span>
                      <span className="h-4 w-4 inline-block">⟳</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
        {isLoading && (
          <div
            className="flex w-full flex-col items-start"
            data-testid="loading-indicator"
          >
            <div className="max-w-[85%] rounded-lg px-4 py-3 bg-secondary text-secondary-foreground">
              <div className="bouncing-loader">
                <div></div>
                <div></div>
                <div></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default ChatHistory;