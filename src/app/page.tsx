"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Code } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import ChatMessageContent from "@/components/chat/ChatMessageContent";
import ChatConfigSidebar from "@/components/chat/ChatConfigSidebar";
import ServerStatusDisplay from "@/components/chat/ServerStatusDisplay";
import ChatInputControls from "@/components/chat/ChatInputControls";
import FileUploadManager from "@/components/chat/FileUploadManager";
import PdfWorkerSetup from "@/components/PdfWorkerSetup";
import { useChatSettings } from "@/hooks/useChatSettings";
import { useFileUploads } from "@/hooks/useFileUploads";
import { useChatManager } from "@/hooks/useChatManager";
import {
  ChatMode,
  ConnectedServer,
  CitationPreviewData,
  DocumentData,
  DisplayTool,
} from "@/types/chat";
import "highlight.js/styles/github-dark.css";
import mermaid from "mermaid";

// Dynamically import components that might have browser-only dependencies
const CitationPreviewSidebar = dynamic(
  () => import("@/components/CitationPreviewSidebar"),
  { ssr: false },
);

const GenkitChat: React.FC = () => {
  // Use the custom hook for chat settings state
  const {
    chatMode,
    setChatMode,
    selectedGeminiModelId,
    setSelectedGeminiModelId,
    availableGeminiModels,
    selectedOpenAIModelId,
    setSelectedOpenAIModelId,
    availableOpenAIModels,
    temperaturePreset,
    setTemperaturePreset,
    maxTokens,
    setMaxTokens,
    tavilySearchEnabled,
    setTavilySearchEnabled,
    tavilyExtractEnabled,
    setTavilyExtractEnabled,
    perplexitySearchEnabled,
    setPerplexitySearchEnabled,
    perplexityDeepResearchEnabled,
    setPerplexityDeepResearchEnabled,
    // Context7 tools
    context7ResolveLibraryIdEnabled,
    setContext7ResolveLibraryIdEnabled,
    context7GetLibraryDocsEnabled,
    setContext7GetLibraryDocsEnabled,
  } = useChatSettings();

  // Need currentSessionId for useFileUploads
  const [currentSessionIdForUpload, setCurrentSessionIdForUpload] = useState<
    string | undefined
  >(undefined);

  // State for UI refresh when needed
  const [renderKey, setRenderKey] = useState<number>(Date.now());

  // File Upload state and logic managed by custom hook
  const {
    uploadedFiles,
    isUploading,
    fileInputRef,
    handleFileChange,
    removeFile,
    triggerFileUpload,
    resetUploadedFiles,
  } = useFileUploads(() => currentSessionIdForUpload);

  // Core chat state and logic managed by custom hook
  const {
    messages,
    userInput,
    setUserInput,
    isLoading,
    currentSessionId,
    handleSendMessage,
    clearChat,
    fixTruncatedMessage,
    messagesEndRef,
    scrollAreaRef,
  } = useChatManager({
    chatMode,
    selectedGeminiModelId,
    selectedOpenAIModelId,
    temperaturePreset,
    maxTokens,
    uploadedFiles,
    resetUploadedFiles,
    tavilySearchEnabled,
    tavilyExtractEnabled,
    perplexitySearchEnabled,
    perplexityDeepResearchEnabled,
    context7ResolveLibraryIdEnabled,
    context7GetLibraryDocsEnabled,
  });

  // Need to sync session ID used for uploads with the one from chat manager
  useEffect(() => {
    setCurrentSessionIdForUpload(currentSessionId);
  }, [currentSessionId]);

  const [connectedServers, setConnectedServers] = useState<ConnectedServer[]>(
    [],
  );
  const { toast } = useToast();

  // State for citation preview sidebar
  const [citationPreview, setCitationPreview] =
    useState<CitationPreviewData | null>(null);
  const [isCitationSidebarOpen, setIsCitationSidebarOpen] = useState(false);

  // Effect for fetching tool info
  useEffect(() => {
    // Fetch tools and update server status
    const fetchToolInfo = async () => {
      const initialServers: ConnectedServer[] = [
        { name: "context7", status: "Pending", tools: [] },
      ];
      setConnectedServers(initialServers);

      try {
        const response = await fetch("/api/tools");
        if (!response.ok) {
          throw new Error("Failed to fetch tools");
        }
        const fetchedTools: DisplayTool[] = await response.json();
        setConnectedServers((prev) =>
          prev.map((s) =>
            s.name === "context7"
              ? { ...s, status: "Connected", tools: fetchedTools }
              : s,
          ),
        );
        
        // Automatically enable Context7 tools when server is connected
        if (fetchedTools.length > 0) {
          setContext7ResolveLibraryIdEnabled(true);
          setContext7GetLibraryDocsEnabled(true);
        }
      } catch (error) {
        console.error("Failed to fetch tool info:", error);
        toast({
          title: "Error",
          description:
            "Could not fetch tool information from connected servers.",
          variant: "destructive",
        });
        setConnectedServers((prev) =>
          prev.map((s) =>
            s.name === "context7" ? { ...s, status: "Error" } : s,
          ),
        );
      }
    };

    fetchToolInfo();
  }, [
    toast,
    availableGeminiModels.length,
    availableOpenAIModels.length,
    selectedGeminiModelId,
    selectedOpenAIModelId,
  ]);

  // Citation click handler remains here as it controls local UI state
  const handleCitationClick = (
    messageId: string,
    chunkIndexInSources: number,
  ) => {
    const message = messages.find((m) => m.id === messageId);
    if (message && message.sources && message.sources[chunkIndexInSources]) {
      const sourceChunk = message.sources[
        chunkIndexInSources
      ] as DocumentData & { pageNumber?: number; textToHighlight?: string };

      // Ensure required fields for PDF preview are present
      if (
        sourceChunk.originalFileName &&
        sourceChunk.documentId &&
        typeof sourceChunk.pageNumber === "number" &&
        sourceChunk.textToHighlight
      ) {
        setCitationPreview({
          fileName: sourceChunk.originalFileName,
          pdfUrl: `/api/files/${encodeURIComponent(sourceChunk.documentId)}`,
          pageNumber: sourceChunk.pageNumber,
          textToHighlight: sourceChunk.textToHighlight,
          documentId: sourceChunk.documentId,
          chunkId: sourceChunk.chunkId,
        });
        setIsCitationSidebarOpen(true);
      } else {
        // Fallback for older data or if critical info is missing
        setCitationPreview({
          fileName: sourceChunk.originalFileName || "Unknown File",
          content:
            sourceChunk.content ||
            sourceChunk.textToHighlight ||
            "No content available for preview.",
          pdfUrl: "",
          pageNumber: 0,
          textToHighlight:
            sourceChunk.textToHighlight || sourceChunk.content || "",
          documentId: sourceChunk.documentId,
          chunkId: sourceChunk.chunkId,
        });
        setIsCitationSidebarOpen(true);
        toast({
          title: "Citation Preview Issue",
          description:
            "Could not fully load PDF preview data. Displaying available content.",
          variant: "default",
        });
      }
    } else {
      console.warn(
        `Could not find source for message ${messageId}, chunk index ${chunkIndexInSources}`,
      );
      toast({
        title: "Citation Error",
        description: "Could not load citation source.",
        variant: "destructive",
      });
    }
  };

  // Shared components config for ReactMarkdown with arrow function syntax
  const markdownComponents = {
    p: ({
      children,
      ...props
    }: React.PropsWithChildren<React.HTMLAttributes<HTMLParagraphElement>>) => {
      const hasPreElement = (children: React.ReactNode): boolean => {
        return React.Children.toArray(children).some((child) => {
          if (React.isValidElement(child)) {
            if (child.type === "pre") return true;
            if (child.type === "code") return true;
            if (child.props && child.props.children) {
              return hasPreElement(child.props.children);
            }
          }
          return false;
        });
      };
      if (hasPreElement(children)) {
        return <>{children}</>;
      }
      return <p {...props}>{children}</p>;
    },

    code: ({
      className,
      children,
      inline,
    }: React.PropsWithChildren<{ className?: string; inline?: boolean }>) => {
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : "";
      if (inline) {
        return <code className={className}>{children}</code>;
      }
      if (language === "mermaid") {
        return (
          <div className="not-prose">
            <pre className="mermaid" key={crypto.randomUUID()}>
              {String(children).replace(/\n$/, "")}
            </pre>
          </div>
        );
      }
      return (
        <div className="not-prose">
          <pre
            className={className || ""}
            style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}
          >
            <code className={className}>{children}</code>
          </pre>
        </div>
      );
    },

    table: ({ children, ...props }: React.PropsWithChildren<{}>) => (
      <div className="overflow-x-auto">
        <table
          className="my-4 w-full border-collapse border border-border text-sm"
          {...props}
        >
          {children}
        </table>
      </div>
    ),

    thead: ({ children, ...props }: React.PropsWithChildren<{}>) => (
      <thead className="bg-muted" {...props}>
        {children}
      </thead>
    ),

    tbody: ({ children, ...props }: React.PropsWithChildren<{}>) => (
      <tbody {...props}>{children}</tbody>
    ),

    tr: ({ children, ...props }: React.PropsWithChildren<{}>) => (
      <tr className="border-b border-border" {...props}>
        {children}
      </tr>
    ),

    th: ({ children, ...props }: React.PropsWithChildren<{}>) => (
      <th
        className="border-r border-border px-4 py-2 text-left font-medium text-muted-foreground last:border-r-0"
        {...props}
      >
        {children}
      </th>
    ),

    td: ({ children, ...props }: React.PropsWithChildren<{}>) => (
      <td
        className="border-r border-border px-4 py-2 last:border-r-0"
        {...props}
      >
        {children}
      </td>
    ),
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="relative h-screen overflow-hidden">
        <PdfWorkerSetup />
        <div key={`chat-container-${renderKey}`} className="flex h-full w-full">
          <CitationPreviewSidebar
            isOpen={isCitationSidebarOpen}
            onClose={() => setIsCitationSidebarOpen(false)}
            previewData={citationPreview}
          />
          <aside className="hidden md:flex md:flex-col md:w-[250px] border-r bg-muted/40 p-4 h-full overflow-y-auto">
            <ChatConfigSidebar
              chatMode={chatMode}
              onChatModeChange={setChatMode}
              selectedGeminiModelId={selectedGeminiModelId}
              onSelectedGeminiModelIdChange={setSelectedGeminiModelId}
              availableGeminiModels={availableGeminiModels}
              selectedOpenAIModelId={selectedOpenAIModelId}
              onSelectedOpenAIModelIdChange={setSelectedOpenAIModelId}
              availableOpenAIModels={availableOpenAIModels}
              temperaturePreset={temperaturePreset}
              onTemperaturePresetChange={setTemperaturePreset}
              maxTokens={maxTokens}
              onMaxTokensChange={setMaxTokens}
            />
            <ServerStatusDisplay connectedServers={connectedServers} />
            
            <div className="p-2 mt-auto">
              <div className="flex space-x-2 w-full">
                  <Button variant="outline" className="flex-1" onClick={clearChat}>
                      Clear Chat
                  </Button>
                  <Button variant="outline" className="flex-none" onClick={() => setRenderKey(Date.now())} title="Refresh UI">
                      Refresh
                  </Button>
              </div>
            </div>
            <div className="mt-4 pt-2 border-t">
              <p className="text-center text-xs text-muted-foreground">
                Powered by GenkitChat
              </p>
            </div>
          </aside>
          <div className="flex-1 p-4 flex flex-col relative">
                <Card className="flex flex-1 flex-col overflow-hidden">
                  <CardContent className="relative flex-1 p-0 overflow-hidden">
                    <ScrollArea
                      className="h-full w-full pb-0"
                      ref={scrollAreaRef as React.RefObject<HTMLDivElement>}
                    >
                      <div
                        className="flex flex-col gap-4 p-4 pb-48"
                        key={`messages-${renderKey}`}
                        data-messages-container="true"
                      >
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex w-full flex-col animate-fade-in-slide-up",
                          message.sender === "user"
                            ? "items-end"
                            : "items-start",
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
                          {/* Debug info for message text structure - only shown in development */}
                          {process.env.NODE_ENV === "development" &&
                            message.sender === "bot" &&
                            message.text &&
                            message.text !== "No content to display" &&
                            !(
                              typeof message.text === "string" &&
                              message.text.trim() === ""
                            ) && (
                              <div className="text-xs text-muted-foreground mb-2 border-b border-muted pb-1">
                                <span>Text type: {typeof message.text}</span>
                                {Array.isArray(message.text) && (
                                  <span>
                                    {" "}
                                    (Array with {message.text.length} items)
                                  </span>
                                )}
                                {typeof message.text === "object" &&
                                  message.text !== null &&
                                  !Array.isArray(message.text) && (
                                    <span>
                                      {" "}
                                      (Object with keys:{" "}
                                      {Object.keys(message.text || {}).join(
                                        ", ",
                                      )}
                                      )
                                    </span>
                                  )}
                                <span className="block mt-1">
                                  Length: {typeof message.text === "string" 
                                    ? message.text.length 
                                    : Array.isArray(message.text)
                                      ? message.text.join('').length
                                      : JSON.stringify(message.text).length} chars
                                </span>
                              </div>
                            )}

                          <div className="relative">
                            {message.sender === "user" ? (
                              // Render user messages directly
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeHighlight]}
                                components={markdownComponents}
                              >
                                {typeof message.text === "string"
                                  ? message.text
                                  : String(message.text || "")}
                              </ReactMarkdown>
                            ) : message.text ? (
                              // Always use ChatMessageContent for bot messages
                              // This handles both citation and non-citation messages
                              // and normalizes different text formats
                              <ChatMessageContent
                                text={message.text}
                                onCitationClick={
                                  message.sources && 
                                  message.sources.length > 0 && 
                                  (typeof message.text === "string" && message.text.includes("[Source:"))
                                    ? (chunkIndex) => handleCitationClick(message.id, chunkIndex)
                                    : () => {} // Empty handler for non-citation text
                                }
                                components={markdownComponents}
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
                        {message.sender === "bot" &&
                          message.toolInvocations &&
                          message.toolInvocations.length > 0 && (
                            <div className="mt-2 w-full max-w-[85%] rounded-md border border-border bg-muted p-3 text-xs">
                              <p className="mb-2 flex items-center gap-1 font-medium text-muted-foreground">
                                <Code size={14} /> Tool Calls:{" "}
                                <span className="ml-1 text-xs text-muted-foreground">
                                  ({message.toolInvocations.length})
                                </span>
                              </p>
                              {message.toolInvocations.map(
                                (inv, index: number) => (
                                  <details
                                    key={index}
                                    className="mb-2 last:mb-0"
                                  >
                                    <summary className="cursor-pointer hover:underline">
                                      {inv.toolName}
                                    </summary>
                                    <div className="mt-1 pl-4 space-y-1">
                                      <div>
                                        <span className="font-semibold">
                                          Input:
                                        </span>
                                        <pre className="mt-1 p-2 rounded bg-background text-xs overflow-x-auto">
                                          {JSON.stringify(inv.input, null, 2)}
                                        </pre>
                                      </div>
                                      {inv.output && (
                                        <div>
                                          <span className="font-semibold">
                                            Output:
                                          </span>
                                          <pre className="mt-1 p-2 rounded bg-background text-xs overflow-x-auto">
                                            {JSON.stringify(
                                              inv.output,
                                              null,
                                              2,
                                            )}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  </details>
                                ),
                              )}
                            </div>
                          )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                    {isLoading && (
                      <div className="flex w-full flex-col items-start" data-testid="loading-indicator">
                        <div className="max-w-[85%] rounded-lg px-4 py-3 bg-secondary text-secondary-foreground">
                          <div className="bouncing-loader">
                            <div></div>
                            <div></div>
                            <div></div>
                          </div>
                        </div>
                      </div>
                    )}
                    {!isLoading &&
                      messages.length > 0 &&
                      process.env.NODE_ENV === "development" && (
                        <div className="flex w-full flex-col items-center mt-2">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => setRenderKey(Date.now())}
                              className="px-2 py-1 text-xs bg-muted text-muted-foreground hover:bg-muted/80 rounded"
                              title="Force UI refresh if message appears truncated"
                            >
                              Refresh UI
                            </button>
                            <button
                              onClick={() => {
                                const fixed = fixTruncatedMessage();
                                setRenderKey(Date.now());
                              }}
                              className="px-2 py-1 text-xs bg-muted text-muted-foreground hover:bg-muted/80 rounded"
                              title="Fix message formatting and refresh UI"
                            >
                              Refresh Messages
                            </button>
                            <button
                              onClick={() => {
                                // Show message lengths
                                const messageStats = messages
                                  .filter(m => m.sender === 'bot')
                                  .map(m => ({
                                    id: m.id.substring(0, 6),
                                    type: typeof m.text,
                                    length: typeof m.text === 'string' 
                                      ? m.text.length 
                                      : JSON.stringify(m.text).length
                                  }));
                                console.table(messageStats);
                                toast({
                                  title: "Message Stats",
                                  description: `${messages.length} messages, logged to console`,
                                  variant: "default",
                                });
                              }}
                              className="px-2 py-1 text-xs bg-muted text-muted-foreground hover:bg-muted/80 rounded"
                              title="Log message stats to console"
                            >
                              Debug Stats
                            </button>
                          </div>
                        </div>
                      )}
                  </div>
                </ScrollArea>
              </CardContent>

              <div
                className="fixed bottom-0 z-10 bg-card shadow-md border-t transition-all duration-300 w-full left-0 md:left-[250px] md:w-[calc(100%-250px)]"
                key="input-container"
              >
                <FileUploadManager
                  uploadedFiles={uploadedFiles}
                  onRemoveFile={removeFile}
                  onClearAll={resetUploadedFiles}
                />

                <div className="p-4">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => handleFileChange(e.target.files)}
                    className="hidden"
                    multiple
                  />

                  <ChatInputControls
                    userInput={userInput}
                    onUserInputChanges={setUserInput}
                    onSendMessage={handleSendMessage}
                    isLoading={isLoading}
                    isUploading={isUploading}
                    tavilySearchEnabled={tavilySearchEnabled}
                    onTavilySearchToggle={() =>
                      setTavilySearchEnabled(!tavilySearchEnabled)
                    }
                    tavilyExtractEnabled={tavilyExtractEnabled}
                    onTavilyExtractToggle={() =>
                      setTavilyExtractEnabled(!tavilyExtractEnabled)
                    }
                    perplexitySearchEnabled={perplexitySearchEnabled}
                    onPerplexitySearchToggle={() =>
                      setPerplexitySearchEnabled(!perplexitySearchEnabled)
                    }
                    perplexityDeepResearchEnabled={
                      perplexityDeepResearchEnabled
                    }
                    onPerplexityDeepResearchToggle={() =>
                      setPerplexityDeepResearchEnabled(
                        !perplexityDeepResearchEnabled,
                      )
                    }
                    onFileUploadTrigger={triggerFileUpload}
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default GenkitChat;
