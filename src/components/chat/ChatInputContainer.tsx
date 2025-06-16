import { UploadedFile } from "@/types/chat";
import React from "react";
import ChatInputControls from "./ChatInputControls";
import FileUploadManager from "./FileUploadManager";

interface ChatInputContainerProps {
  userInput: string;
  onUserInputChanges: (value: string) => void;
  onSendMessage: () => void;
  isLoading: boolean;
  isUploading: boolean;
  tavilySearchEnabled: boolean;
  onTavilySearchToggle: () => void;
  tavilyExtractEnabled: boolean;
  onTavilyExtractToggle: () => void;
  perplexitySearchEnabled: boolean;
  onPerplexitySearchToggle: () => void;
  perplexityDeepResearchEnabled: boolean;
  onPerplexityDeepResearchToggle: () => void;
  onFileUploadTrigger: () => void;
  uploadedFiles: UploadedFile[];
  onRemoveFile: (id: string) => void;
  onClearAll: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (files: FileList | null) => void;
}

const ChatInputContainer: React.FC<ChatInputContainerProps> = ({
  userInput,
  onUserInputChanges,
  onSendMessage,
  isLoading,
  isUploading,
  tavilySearchEnabled,
  onTavilySearchToggle,
  tavilyExtractEnabled,
  onTavilyExtractToggle,
  perplexitySearchEnabled,
  onPerplexitySearchToggle,
  perplexityDeepResearchEnabled,
  onPerplexityDeepResearchToggle,
  onFileUploadTrigger,
  uploadedFiles,
  onRemoveFile,
  onClearAll,
  fileInputRef,
  handleFileChange,
}) => {
  return (
    <div
      className="fixed bottom-0 z-10 bg-card shadow-md border-t transition-all duration-300 w-full left-0 md:left-[250px] md:w-[calc(100%-250px)]"
      key="input-container"
    >
      <FileUploadManager
        uploadedFiles={uploadedFiles}
        onRemoveFile={onRemoveFile}
        onClearAll={onClearAll}
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
          onUserInputChanges={onUserInputChanges}
          onSendMessage={onSendMessage}
          isLoading={isLoading}
          isUploading={isUploading}
          tavilySearchEnabled={tavilySearchEnabled}
          onTavilySearchToggle={onTavilySearchToggle}
          tavilyExtractEnabled={tavilyExtractEnabled}
          onTavilyExtractToggle={onTavilyExtractToggle}
          perplexitySearchEnabled={perplexitySearchEnabled}
          onPerplexitySearchToggle={onPerplexitySearchToggle}
          perplexityDeepResearchEnabled={perplexityDeepResearchEnabled}
          onPerplexityDeepResearchToggle={onPerplexityDeepResearchToggle}
          onFileUploadTrigger={onFileUploadTrigger}
        />
      </div>
    </div>
  );
};

export default ChatInputContainer;