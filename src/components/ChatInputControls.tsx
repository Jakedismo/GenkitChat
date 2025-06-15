import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  BrainCircuit,
  ExternalLink,
  Paperclip,
  Search,
  Sparkles,
} from "lucide-react";
import React from "react";

interface ChatInputControlsProps {
  userInput: string;
  onUserInputChanges: (value: string) => void;
  onSendMessage: () => void;
  isLoading: boolean;
  isUploading: boolean; // For disabling parts during file uploads

  tavilySearchEnabled: boolean;
  onTavilySearchToggle: () => void;
  tavilyExtractEnabled: boolean;
  onTavilyExtractToggle: () => void;
  perplexitySearchEnabled: boolean;
  onPerplexitySearchToggle: () => void;
  perplexityDeepResearchEnabled: boolean;
  onPerplexityDeepResearchToggle: () => void;

  onFileUploadTrigger: () => void; // To trigger the hidden file input in parent
}

const ChatInputControls: React.FC<ChatInputControlsProps> = ({
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
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  return (
    <div className="border-t p-4">
      <TooltipProvider delayDuration={100}>
        <div className="flex items-center justify-end space-x-2 mb-2 pr-1">
          {" "}
          {/* Reduced space-x from 4 to 2 */}
          {/* Tavily Search Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onTavilySearchToggle}
                disabled={isLoading || isUploading}
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7")}
              >
                <Search
                  className={cn(
                    "h-4 w-4",
                    tavilySearchEnabled
                      ? "text-blue-500"
                      : "text-muted-foreground",
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {tavilySearchEnabled ? "Disable" : "Enable"} Tavily Web Search
              </p>
            </TooltipContent>
          </Tooltip>
          {/* Tavily Extract Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onTavilyExtractToggle}
                disabled={isLoading || isUploading}
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7")}
              >
                <ExternalLink
                  className={cn(
                    "h-4 w-4",
                    tavilyExtractEnabled
                      ? "text-green-500"
                      : "text-muted-foreground",
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {tavilyExtractEnabled ? "Disable" : "Enable"} Tavily Web Content
                Extraction
              </p>
            </TooltipContent>
          </Tooltip>
          {/* Perplexity Search Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onPerplexitySearchToggle}
                disabled={isLoading || isUploading}
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7")}
              >
                <Sparkles
                  className={cn(
                    "h-4 w-4",
                    perplexitySearchEnabled
                      ? "text-purple-500"
                      : "text-muted-foreground",
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {perplexitySearchEnabled ? "Disable" : "Enable"} Perplexity Web
                Search
              </p>
            </TooltipContent>
          </Tooltip>
          {/* Perplexity Deep Research Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onPerplexityDeepResearchToggle}
                disabled={isLoading || isUploading}
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7")}
              >
                <BrainCircuit
                  className={cn(
                    "h-4 w-4",
                    perplexityDeepResearchEnabled
                      ? "text-orange-500"
                      : "text-muted-foreground",
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {perplexityDeepResearchEnabled ? "Disable" : "Enable"}{" "}
                Perplexity Deep Research
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      <div className="flex w-full items-start space-x-2 pt-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onFileUploadTrigger}
              disabled={isLoading || isUploading}
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-10 w-10 p-2")}
            >
              <Paperclip size={20} /> {/* Slightly larger icon */}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Upload file(s)</p>
          </TooltipContent>
        </Tooltip>
        <input
          type="text"
          placeholder="Enter your message..."
          value={userInput}
          onChange={(e) => onUserInputChanges(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading || isUploading}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm flex-1"
          spellCheck={false}
        />
        <button
          onClick={onSendMessage}
          disabled={isLoading || isUploading || !userInput.trim()}
          className={cn(buttonVariants({ variant: "default", size: "default" }))}
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
};

export default ChatInputControls;
