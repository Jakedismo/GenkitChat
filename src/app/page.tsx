"use client";

import ChatConfigSidebar from "@/components/chat/ChatConfigSidebar";
import ChatHistory from "@/components/chat/ChatHistory";
import ChatInputContainer from "@/components/chat/ChatInputContainer";
import ServerStatusDisplay from "@/components/chat/ServerStatusDisplay";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useChatManager } from "@/hooks/useChatManager";
import { useChatSettings } from "@/hooks/useChatSettings";
import { useCitationPreview } from "@/hooks/useCitationPreview";
import { useFileUploads } from "@/hooks/useFileUploads";
import { useServerStatus } from "@/hooks/useServerStatus";
import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";

// Dynamically import components that might have browser-only dependencies
const CitationPreviewSidebar = dynamic(
  () => import("@/components/CitationPreviewSidebar"),
  { ssr: false },
);

const PdfWorkerSetup = dynamic(() => import("@/components/PdfWorkerSetup"), {
  ssr: false,
});

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

  const connectedServers = useServerStatus(
    setContext7ResolveLibraryIdEnabled,
    setContext7GetLibraryDocsEnabled,
  );

  const {
    citationPreview,
    setCitationPreview,
    isCitationSidebarOpen,
    setIsCitationSidebarOpen,
  } = useCitationPreview();

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
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={clearChat}
                >
                  Clear Chat
                </Button>
                <Button
                  variant="outline"
                  className="flex-none"
                  onClick={() => setRenderKey(Date.now())}
                  title="Refresh UI"
                >
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
            <ChatHistory
              messages={messages}
              isLoading={isLoading}
              messagesEndRef={messagesEndRef}
              scrollAreaRef={scrollAreaRef}
              setCitationPreview={setCitationPreview}
              setIsCitationSidebarOpen={setIsCitationSidebarOpen}
              fixTruncatedMessage={fixTruncatedMessage}
            />
            <ChatInputContainer
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
              perplexityDeepResearchEnabled={perplexityDeepResearchEnabled}
              onPerplexityDeepResearchToggle={() =>
                setPerplexityDeepResearchEnabled(!perplexityDeepResearchEnabled)
              }
              onFileUploadTrigger={triggerFileUpload}
              uploadedFiles={uploadedFiles}
              onRemoveFile={removeFile}
              onClearAll={resetUploadedFiles}
              fileInputRef={fileInputRef}
              handleFileChange={handleFileChange}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default GenkitChat;
