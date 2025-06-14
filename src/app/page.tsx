"use client";

import ChatConfigSidebar from "@/components/chat/ChatConfigSidebar";
import ChatInputControls from "@/components/chat/ChatInputControls";
import ChatMessageContent from "@/components/chat/ChatMessageContent";
import FileUploadManager from "@/components/chat/FileUploadManager";
import ServerStatusDisplay from "@/components/chat/ServerStatusDisplay";
import MermaidDiagram from "@/components/markdown/MermaidDiagram";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useChatManager } from "@/hooks/useChatManager";
import { useChatSettings } from "@/hooks/useChatSettings";
import { useFileUploads } from "@/hooks/useFileUploads";
import { cn } from "@/lib/utils";
import {
  CitationPreviewData,
  ConnectedServer,
  DisplayTool
} from "@/types/chat";
import { getHistoryTokenStats } from "@/utils/messageHistory";
import "highlight.js/styles/github-dark.css";
import { Code } from "lucide-react";
import dynamic from "next/dynamic";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

// Dynamically import components that might have browser-only dependencies
const CitationPreviewSidebar = dynamic(
  () => import("@/components/CitationPreviewSidebar"),
  { ssr: false },
);

const PdfWorkerSetup = dynamic(
  () => import("@/components/PdfWorkerSetup"),
  { ssr: false }
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
  const animatedMessageIds = useRef(new Set<string>());

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
    setContext7GetLibraryDocsEnabled,
    setContext7ResolveLibraryIdEnabled,
  ]);

  // Effect to clear animatedMessageIds when messages are cleared
  useEffect(() => {
    if (messages.length === 0) {
      animatedMessageIds.current.clear();
    }
  }, [messages]);

  // Citation click handler remains here as it controls local UI state
  const handleCitationClick = (
    messageId: string,
    chunkIndexInSources: number,
  ) => {
    const message = messages.find((m) => m.id === messageId);
    if (message && message.sources && message.sources[chunkIndexInSources]) {
      const sourceChunk = message.sources[chunkIndexInSources];

      // 🔗 ENHANCED CLIENT-SIDE CITATION DEBUG LOGGING
      console.log('🔗 ===== CITATION CLICK DEBUG START =====');
      console.log('🔗 Citation sourceChunk raw data:', sourceChunk);
      
      // Extract filename with fallback to originalFileName
      let docId = sourceChunk.documentId;
      // Clean up docId if it unexpectedly contains '::'
      if (docId && docId.includes('::')) {
        const originalProblematicDocId = docId;
        const idParts = docId.split('::');
        // Assume the first part is the true ID.
        docId = idParts[0];
        console.warn(`[handleCitationClick] Cleaned docId from "${originalProblematicDocId}" to "${docId}"`);
      }
      let rawDocFileName = sourceChunk.fileName || sourceChunk.originalFileName;
      
      // Defensive: Ensure docFileName is just the filename part
      if (rawDocFileName && rawDocFileName.includes('::')) {
        console.warn(`[handleCitationClick] rawDocFileName "${rawDocFileName}" contains '::', attempting to clean.`);
        rawDocFileName = rawDocFileName.split('::').pop() || rawDocFileName;
        console.warn(`[handleCitationClick] Cleaned rawDocFileName: "${rawDocFileName}"`);
      }
      const docFileName = rawDocFileName;

      console.log('🔗 Citation data validation:', {
        documentId: docId,
        documentIdType: typeof docId,
        documentIdPresent: !!docId,
        fileName: docFileName, // Log the derived fileName
        originalFileName: sourceChunk.originalFileName, // Log originalFileName for debugging
        fileNameFromProperty: sourceChunk.fileName, // Log direct fileName property for debugging
        fileNameType: typeof docFileName,
        fileNamePresent: !!docFileName,
        pageNumber: sourceChunk.pageNumber,
        pageNumberType: typeof sourceChunk.pageNumber,
        textToHighlight: sourceChunk.textToHighlight ? sourceChunk.textToHighlight.substring(0, 100) + '...' : null
      });

      // Try to construct PDF URL if we have the necessary data
      let pdfUrl = "";
      // THE FIX: Use sourceChunk.documentId directly as it should be sessionId::fileName
      if (sourceChunk.documentId) {
        const rawIdentifier = sourceChunk.documentId; // This is already sessionId::fileName
        console.log('🔧 Raw identifier (should be sessionId::fileName):', rawIdentifier);
        
        const encodedIdentifier = encodeURIComponent(rawIdentifier);
        console.log('🔒 Encoded identifier:', encodedIdentifier);
        
        pdfUrl = `/api/files/${encodedIdentifier}`;
        console.log('🌐 Final PDF URL:', pdfUrl);
      } else {
        console.error('❌ Cannot construct PDF URL - missing sourceChunk.documentId', {
            missingDocumentId: !sourceChunk.documentId,
            fileNameFromSource: sourceChunk.fileName,
            originalFileNameFromSource: sourceChunk.originalFileName,
        });
      }
      console.log('🔗 ===== CITATION CLICK DEBUG END =====');

      // Enhanced validation with detailed error messages
      const missingFields = [];
      if (!docFileName) missingFields.push("fileName");
      if (!sourceChunk.documentId) missingFields.push("documentId (from sourceChunk)");
      if (typeof sourceChunk.pageNumber !== "number") missingFields.push("pageNumber");
      if (!sourceChunk.textToHighlight) missingFields.push("textToHighlight");

      if (missingFields.length === 0 && pdfUrl) { // Also check if pdfUrl was successfully constructed
        // All required fields present
        console.log('[handleCitationClick] Attempting to setCitationPreview with (SUCCESS PATH):', { documentId: sourceChunk.documentId, docFileName, pdfUrl, pageNumber: sourceChunk.pageNumber });
        setCitationPreview({
          fileName: docFileName!,
          pdfUrl: pdfUrl,
          pageNumber: sourceChunk.pageNumber!,
          textToHighlight: sourceChunk.textToHighlight!,
          documentId: sourceChunk.documentId!,
          chunkId: sourceChunk.chunkId,
        });
        setIsCitationSidebarOpen(true);
        console.log('Citation preview opened successfully with full data');
      } else {
        // Fallback handling with detailed logging
        console.warn('Citation data missing fields or pdfUrl construction failed:', missingFields, { pdfUrlAvailable: !!pdfUrl });
        console.log('[handleCitationClick] Attempting to setCitationPreview with (FALLBACK PATH):', { documentId: sourceChunk.documentId, docFileName, pdfUrl, pageNumber: sourceChunk.pageNumber });
        const fallbackData = {
          fileName: docFileName || "Unknown File",
          content:
            sourceChunk.content ||
            sourceChunk.textToHighlight ||
            "No content available for preview.",
          pdfUrl: pdfUrl, // Use constructed URL even if incomplete
          pageNumber: sourceChunk.pageNumber || 1, // Default to page 1 instead of 0
          textToHighlight:
            sourceChunk.textToHighlight || sourceChunk.content || "",
          documentId: sourceChunk.documentId || "unknown",
          chunkId: sourceChunk.chunkId || 0,
        };
        
        setCitationPreview(fallbackData);
        setIsCitationSidebarOpen(true);
        
        // Provide detailed feedback about what's missing
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
      const childrenArray = React.Children.toArray(children);
      

      
      // Check if this paragraph contains only a single code block
      if (childrenArray.length === 1) {
        const child = childrenArray[0];
        if (React.isValidElement(child) && child.type === 'code') {
          const className = child.props?.className || '';

          // If it has a language class or is not inline, it's a code block
          if (className.includes('language-') || !child.props?.inline) {

            return <>{children}</>;
          }
        }
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
        return <code className={`${className} bg-muted px-1.5 py-0.5 rounded text-sm font-mono`}>{children}</code>;
      }
      
      if (language === "mermaid") {

        return (
          <MermaidDiagram 
            chart={String(children).replace(/\n$/, "")}
            id={`mermaid-${btoa(String(children).replace(/\n$/, "")).replace(/[^a-zA-Z0-9]/g, '').substring(0, 10)}`}
          />
        );
      }
      
      // Fallback: Check if content looks like Mermaid even without proper language tag
      if (!language && !inline) {
        const content = String(children);
        const mermaidKeywords = ['flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'journey', 'gantt', 'pie', 'gitgraph'];
        const isMermaid = mermaidKeywords.some(keyword => content.includes(keyword));
        
        if (isMermaid) {

          return (
            <MermaidDiagram 
              chart={content.replace(/\n$/, "")}
              id={`mermaid-fallback-${btoa(content.replace(/\n$/, "")).replace(/[^a-zA-Z0-9]/g, '').substring(0, 10)}`}
            />
          );
        }
      }
      

      return (
        <pre
          className={`${className || ""} bg-muted text-foreground p-3 rounded-md my-4 overflow-x-auto`}
          style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}
        >
          <code className={`${className} bg-transparent p-0 text-sm font-mono`}>{children}</code>
        </pre>
      );
    },

    table: ({ children, ...props }: React.PropsWithChildren<React.TableHTMLAttributes<HTMLTableElement>>) => (
      <div className="overflow-x-auto">
        <table
          className="my-4 w-full border-collapse border border-border text-sm"
          {...props}
        >
          {children}
        </table>
      </div>
    ),

    thead: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLTableSectionElement>>) => (
      <thead className="bg-muted" {...props}>
        {children}
      </thead>
    ),

    tbody: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLTableSectionElement>>) => (
      <tbody {...props}>{children}</tbody>
    ),

    tr: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLTableRowElement>>) => (
      <tr className="border-b border-border" {...props}>
        {children}
      </tr>
    ),

    th: ({ children, ...props }: React.PropsWithChildren<React.ThHTMLAttributes<HTMLTableCellElement>>) => (
      <th
        className="border-r border-border px-4 py-2 text-left font-medium text-muted-foreground last:border-r-0"
        {...props}
      >
        {children}
      </th>
    ),

    td: ({ children, ...props }: React.PropsWithChildren<React.TdHTMLAttributes<HTMLTableCellElement>>) => (
      <td
        className="border-r border-border px-4 py-2 last:border-r-0"
        {...props}
      >
        {children}
      </td>
    ),

    // Headings
    h1: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
      <h1 className="text-2xl font-bold mt-6 mb-4" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
      <h2 className="text-xl font-bold mt-5 mb-3" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
      <h3 className="text-lg font-semibold mt-4 mb-2" {...props}>
        {children}
      </h3>
    ),
    h4: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
      <h4 className="font-semibold mt-3 mb-2" {...props}>
        {children}
      </h4>
    ),
    h5: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
      <h5 className="font-semibold mt-3 mb-2" {...props}>
        {children}
      </h5>
    ),
    h6: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
      <h6 className="font-semibold mt-3 mb-2" {...props}>
        {children}
      </h6>
    ),

    // Links
    a: ({ children, href, ...props }: React.PropsWithChildren<{ href?: string }>) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline"
        {...props}
      >
        {children}
      </a>
    ),

    // Lists
    ul: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLUListElement>>) => (
      <ul className="list-disc pl-6 my-3 space-y-1" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLOListElement>>) => (
      <ol className="list-decimal pl-6 my-3 space-y-1" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }: React.PropsWithChildren<React.LiHTMLAttributes<HTMLLIElement>>) => (
      <li {...props}>{children}</li>
    ),

    // Blockquote
    blockquote: ({ children, ...props }: React.PropsWithChildren<React.BlockquoteHTMLAttributes<HTMLQuoteElement>>) => (
      <blockquote className="border-l-4 border-muted-foreground pl-4 py-1 my-3 italic" {...props}>
        {children}
      </blockquote>
    ),

    // Horizontal rule
    hr: ({ ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHRElement>>) => (
      <hr className="my-6 border-border" {...props} />
    ),

    // Emphasis
    em: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>) => (
      <em {...props}>{children}</em>
    ),
    strong: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>) => (
      <strong className="font-semibold" {...props}>{children}</strong>
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
                            message.sender === "user"
                              ? "items-end"
                              : "items-start",
                            M_SHOULD_ANIMATE && "animate-fade-in-slide-up"
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
                                  message.sources && message.sources.length > 0
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
                      );
                    })}
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
                                fixTruncatedMessage();
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
                            <button
                              onClick={() => {
                                // Show history token statistics
                                const stats = getHistoryTokenStats(messages, selectedGeminiModelId || selectedOpenAIModelId);
                                console.log('[History Token Stats]', stats);
                                toast({
                                  title: "History Token Stats",
                                  description: `${stats.processedMessages}/${stats.totalMessages} messages, ${stats.estimatedTokens}/${stats.tokenLimit} tokens`,
                                  variant: stats.withinLimit ? "default" : "destructive",
                                });
                              }}
                              className="px-2 py-1 text-xs bg-muted text-muted-foreground hover:bg-muted/80 rounded"
                              title="Show conversation history token usage"
                            >
                              History Tokens
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
