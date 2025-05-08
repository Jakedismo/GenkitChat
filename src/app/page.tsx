"use client";

import React, { useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar/index"; // Explicitly point to index
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
// Removed direct imports for server-side functions
// Keep type imports if needed elsewhere, though RagEndpoint/BedrockModel might be removable now
// import type { RagEndpoint } from '@/services/rag';
// import type { BedrockModel } from '@/services/bedrock';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Code } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ChatMessageContent from "@/components/chat/ChatMessageContent"; // Added import
import CitationPreviewSidebar from "@/components/CitationPreviewSidebar"; // Added import
import ChatConfigSidebar from "@/components/chat/ChatConfigSidebar";
import ServerStatusDisplay from "@/components/chat/ServerStatusDisplay"; // Added import
import ChatInputControls from "@/components/chat/ChatInputControls"; // Added import
import FileUploadManager from "@/components/chat/FileUploadManager"; // Added import
import { useChatSettings } from "@/hooks/useChatSettings"; // Added hook import
import { useFileUploads } from "@/hooks/useFileUploads"; // Added hook import
import { useChatManager } from "@/hooks/useChatManager"; // Added hook import
import {
  DocumentData,
  CitationPreviewData,
  ConnectedServer,
  DisplayTool,
} from "@/types/chat"; // Import shared types
// Removed ragAugmentedChatFlow import as it's no longer used
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import mermaid from "mermaid";
// Removed pdfjs-dist imports (static and dynamic)

// Represents the structure of a document chunk's metadata and content, (Moved to types/chat.ts)
// interface DocumentData { ... }

// Interface ChatMessage moved to types/chat.ts
// interface ChatMessage { ... }

// File representation for upload (Moved to types/chat.ts)
// ChatMode enum (Moved to types/chat.ts)

// ServiceSelector might be removable if Bedrock models/RAG endpoints are fully gone
// Keeping for now in case it's reused, but it's unused in the current state.
// interface ServiceSelectorProps {
//   label: string;
//   items: { id: string; name: string }[];
//   selectedId: string;
//   onSelect: (id: string) => void;
//   icon?: LucideIcon;
//   disabled?: boolean;
// }
// const ServiceSelector: React.FC<ServiceSelectorProps> = ({...}) => {...};

// Define types for UI display (Moved to types/chat.ts)
// interface DisplayTool { ... }
// interface ConnectedServer { ... }

// Define OpenAI models for UI (Moved to @/ai/available-models.ts)
// const availableOpenAIModels = [...] // No longer needed here, provided by hook

// Temperature Preset type (Moved to types/chat.ts)

// Initialize Mermaid on client mount
mermaid.initialize({ startOnLoad: false }); // Don't run automatically on load

// Interface for uploaded files with additional metadata (Moved to types/chat.ts)
// interface UploadedFile { ... }

const LambdaChat: React.FC = () => {
  // Use the custom hook for chat settings state
  const {
    chatMode,
    setChatMode,
    selectedGeminiModelId,
    setSelectedGeminiModelId,
    availableGeminiModels, // Provided by hook
    selectedOpenAIModelId,
    setSelectedOpenAIModelId,
    availableOpenAIModels, // Provided by hook
    temperaturePreset,
    setTemperaturePreset,
    maxTokens,
    setMaxTokens,
    // Get tool toggle state and setters from the hook
    tavilySearchEnabled,
    setTavilySearchEnabled,
    tavilyExtractEnabled,
    setTavilyExtractEnabled,
    perplexitySearchEnabled,
    setPerplexitySearchEnabled,
    perplexityDeepResearchEnabled,
    setPerplexityDeepResearchEnabled,
  } = useChatSettings();

  // Need currentSessionId for useFileUploads, defined below
  const [currentSessionIdForUpload, setCurrentSessionIdForUpload] = useState<
    string | undefined
  >(undefined);

  // File Upload state and logic managed by custom hook
  const {
    uploadedFiles,
    isUploading,
    fileInputRef,
    handleFileChange,
    removeFile,
    triggerFileUpload,
    resetUploadedFiles, // Function to clear the file list
  } = useFileUploads(() => currentSessionIdForUpload); // Pass getter for currentSessionId

  // Tool toggles state moved into useChatSettings hook

  // Core chat state and logic managed by custom hook
  const {
    messages,
    // setMessages, // Setter exposed if needed externally
    userInput,
    setUserInput,
    isLoading, // Loading state for message sending
    currentSessionId, // Session ID managed by chat manager now
    // setCurrentSessionId, // Setter exposed if needed externally
    handleSendMessage,
    clearChat, // Use clearChat from hook
    messagesEndRef, // Use ref from hook
    scrollAreaRef, // Use ref from hook
  } = useChatManager({
    // Pass dependencies from other hooks/state
    chatMode,
    selectedGeminiModelId,
    selectedOpenAIModelId,
    temperaturePreset,
    maxTokens,
    uploadedFiles, // Pass current uploaded files state
    resetUploadedFiles, // Pass reset function from useFileUploads
    tavilySearchEnabled,
    tavilyExtractEnabled,
    perplexitySearchEnabled,
    perplexityDeepResearchEnabled,
  });

  // Need to sync session ID used for uploads with the one from chat manager
  useEffect(() => {
    setCurrentSessionIdForUpload(currentSessionId);
  }, [currentSessionId]);

  const [connectedServers, setConnectedServers] = useState<ConnectedServer[]>(
    [],
  );
  // const fileInputRef = useRef<HTMLInputElement>(null); // Moved to useFileUploads
  const { toast } = useToast(); // toast is used by useChatManager (via useEffect/handleSendMessage)

  // State for citation preview sidebar
  // Assuming CitationPreviewData is imported from where it's defined (e.g., types/chat.ts or CitationPreviewSidebar.tsx)
  // For this edit, we assume the type is correctly imported and matches the sidebar's expectation.
  const [citationPreview, setCitationPreview] =
    useState<CitationPreviewData | null>(null);
  const [isCitationSidebarOpen, setIsCitationSidebarOpen] = useState(false);

  // Effect for fetching tool info remains here
  useEffect(() => {
    // Rest of the useEffect...
    if (!selectedGeminiModelId && availableGeminiModels.length > 0) {
      // This logic might be redundant if useChatSettings handles defaults
      // setSelectedGeminiModelId(availableGeminiModels[0].id);
    }
    if (!selectedOpenAIModelId && availableOpenAIModels.length > 0) {
      // This logic might be redundant if useChatSettings handles defaults
      // setSelectedOpenAIModelId(availableOpenAIModels[0].id);
    }

    // Fetch tools and update server status
    const fetchToolInfo = async () => {
      const initialServers: ConnectedServer[] = [
        { name: "context7", status: "Pending", tools: [] }, // Assuming context7 is still relevant
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

    // Dependencies for fetching tool info - check if model IDs are needed
  }, [
    toast,
    availableGeminiModels.length,
    availableOpenAIModels.length,
    selectedGeminiModelId,
    selectedOpenAIModelId,
  ]); // Added missing dependencies

  // Citation click handler remains here as it controls local UI state
  const handleCitationClick = (
    messageId: string,
    chunkIndexInSources: number,
  ) => {
    const message = messages.find((m) => m.id === messageId);
    if (message && message.sources && message.sources[chunkIndexInSources]) {
      const sourceChunk = message.sources[
        chunkIndexInSources
      ] as DocumentData & { pageNumber?: number; textToHighlight?: string }; // Cast to include new optional fields

      // Ensure required fields for PDF preview are present
      if (
        sourceChunk.originalFileName &&
        sourceChunk.documentId &&
        typeof sourceChunk.pageNumber === "number" &&
        sourceChunk.textToHighlight
      ) {
        setCitationPreview({
          fileName: sourceChunk.originalFileName,
          pdfUrl: `/api/files/${encodeURIComponent(sourceChunk.documentId)}`, // Construct URL for PDF serving API
          pageNumber: sourceChunk.pageNumber,
          textToHighlight: sourceChunk.textToHighlight,
          documentId: sourceChunk.documentId,
          chunkId: sourceChunk.chunkId,
        });
        setIsCitationSidebarOpen(true);
      } else {
        // Fallback for older data or if critical info is missing for PDF preview
        // This could show the raw content as before, or a specific error.
        console.warn(
          `Source chunk for message ${messageId}, index ${chunkIndexInSources} is missing data for PDF preview. Got:`,
          sourceChunk,
        );
        // Displaying raw content as a fallback:
        setCitationPreview({
          fileName: sourceChunk.originalFileName || "Unknown File",
          content:
            sourceChunk.content ||
            sourceChunk.textToHighlight ||
            "No content available for preview.",
          pdfUrl: "", // Invalid URL to indicate no PDF preview
          pageNumber: 0, // Invalid page number
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

  // Shared components config for ReactMarkdown
  const markdownComponents = {
    // টাইপ PropsWithChildren<P> মানে হল যে কম্পোনেন্টটি children prop গ্রহণ করতে পারে।
    // React.HTMLAttributes<HTMLParagraphElement> মানে হল যে কম্পোনেন্টটি <p> ট্যাগের সকল স্ট্যান্ডার্ড HTML অ্যাট্রিবিউট গ্রহণ করতে পারে।
    p: ({
      children,
      ...props
    }: React.PropsWithChildren<React.HTMLAttributes<HTMLParagraphElement>>) => {
      // Check the React children being passed to this <p> component.
      // If any of them is a <pre> tag (which our custom code renderer produces for block code),
      // then we should not wrap these children with an actual <p> DOM element.
      const containsPreElement = React.Children.toArray(children).some(
        // টাইপ গার্ড ব্যবহার করে child এলিমেন্টটি একটি ReactElement এবং তার 'type' প্রপার্টি আছে কিনা তা পরীক্ষা করা হচ্ছে।
        (child): child is React.ReactElement =>
          React.isValidElement(child) && child.type === "pre",
      );

      if (containsPreElement) {
        // If children include a <pre> element, render them in a fragment
        // to avoid <p><pre>...</pre></p> nesting.
        return <>{children}</>;
      }
      // Otherwise, render as a normal paragraph.
      return <p {...props}>{children}</p>;
    },
    code({
      className,
      children,
    }: React.PropsWithChildren<{ className?: string; inline?: boolean }>) {
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : "";
      if (language === "mermaid") {
        return (
          <pre className="mermaid" key={crypto.randomUUID()}>
            {String(children).replace(/\n$/, "")}
          </pre>
        );
      }
      return (
        <pre
          className={className || ""}
          style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}
        >
          <code className={className}>{children}</code>
        </pre>
      );
    },
  };

  // handleSendMessage logic moved to useChatManager hook
  // clearChat logic moved to useChatManager hook

  return (
    <SidebarProvider>
      <div className="flex h-screen">
        <CitationPreviewSidebar
          isOpen={isCitationSidebarOpen}
          onClose={() => setIsCitationSidebarOpen(false)}
          previewData={citationPreview}
        />
        <Sidebar>
          <SidebarTrigger />
          <SidebarContent>
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
              <Button variant="outline" className="w-full" onClick={clearChat}>
                Clear Chat
              </Button>
            </div>
          </SidebarContent>
          <SidebarFooter>
            <p className="text-center text-xs text-muted-foreground">
              Powered by Firebase Studio
            </p>
          </SidebarFooter>
        </Sidebar>
        <div className="flex-1 p-4">
          {" "}
          {/* Main content area */}
          <Card className="flex h-full flex-col">
            <CardContent className="relative flex-1">
              <ScrollArea
                className="h-full w-full"
                ref={scrollAreaRef as React.RefObject<HTMLDivElement>}
              >
                <div className="flex flex-col gap-4 p-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex w-full flex-col",
                        message.sender === "user" ? "items-end" : "items-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg px-4 py-2",
                          "prose dark:prose-invert prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-li:my-0",
                          message.sender === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground",
                        )}
                      >
                        {message.sender === "bot" &&
                        message.sources &&
                        message.sources.length > 0 &&
                        message.text.includes("[Source:") ? (
                          <ChatMessageContent
                            text={message.text}
                            onCitationClick={(chunkIndex) =>
                              handleCitationClick(message.id, chunkIndex)
                            }
                            components={markdownComponents}
                          />
                        ) : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            components={markdownComponents}
                          >
                            {message.text}
                          </ReactMarkdown>
                        )}
                      </div>
                      {/* Tool Invocation Display */}
                      {message.sender === "bot" &&
                        message.toolInvocations &&
                        message.toolInvocations.length > 0 && (
                          <div className="mt-2 w-full max-w-[80%] rounded-md border border-border bg-muted p-3 text-xs">
                            <p className="mb-2 flex items-center gap-1 font-medium text-muted-foreground">
                              <Code size={14} /> Tool Calls:
                            </p>
                            {message.toolInvocations.map(
                              (
                                inv,
                                index: number, // Added types
                              ) => (
                                <details key={index} className="mb-2 last:mb-0">
                                  <summary className="cursor-pointer hover:underline">
                                    {inv.toolName}
                                  </summary>
                                  <div className="mt-1 pl-4 space-y-1">
                                    {/* ... rest of the code ... */}
                                    <div>
                                      <span className="font-semibold">
                                        Input:
                                      </span>
                                      <pre className="mt-1 p-2 rounded bg-background text-xs overflow-x-auto">
                                        {JSON.stringify(inv.input, null, 2)}
                                      </pre>
                                    </div>
                                    {inv.output && ( // Conditionally render output
                                      <div>
                                        <span className="font-semibold">
                                          Output:
                                        </span>
                                        <pre className="mt-1 p-2 rounded bg-background text-xs overflow-x-auto">
                                          {JSON.stringify(inv.output, null, 2)}
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
                  {/* Loading indicator using isLoading from useChatManager */}
                  {isLoading && (
                    <div className="flex w-full flex-col items-start">
                      <div className="max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap bg-secondary text-secondary-foreground opacity-70 animate-pulse">
                        Thinking...
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
            <FileUploadManager
              uploadedFiles={uploadedFiles}
              onRemoveFile={removeFile}
            />

            <div className="border-t p-4">
              {/* Hidden file input uses ref/handler from useFileUploads */}
              <input
                type="file"
                ref={fileInputRef} // Use ref from hook
                onChange={(e) => handleFileChange(e.target.files)} // Use handler from hook
                className="hidden"
                multiple // Allow multiple files
              />

              {/* Chat input controls use state/handlers from hooks */}
              <ChatInputControls
                userInput={userInput}
                onUserInputChanges={setUserInput}
                onSendMessage={handleSendMessage}
                isLoading={isLoading} // from useChatManager
                isUploading={isUploading} // from useFileUploads
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
                perplexityDeepResearchEnabled={perplexityDeepResearchEnabled}
                onPerplexityDeepResearchToggle={() =>
                  setPerplexityDeepResearchEnabled(
                    !perplexityDeepResearchEnabled,
                  )
                }
                onFileUploadTrigger={triggerFileUpload}
              />
            </div>
          </Card>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default LambdaChat;
