import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  ExternalLink,
  Sparkles,
  BrainCircuit,
  Paperclip,
} from "lucide-react";

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
              <Button
                variant="ghost"
                size="icon"
                onClick={onTavilySearchToggle}
                className="h-7 w-7"
                disabled={isLoading || isUploading}
              >
                <Search
                  className={cn(
                    "h-4 w-4",
                    tavilySearchEnabled
                      ? "text-blue-500"
                      : "text-muted-foreground",
                  )}
                />
              </Button>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={onTavilyExtractToggle}
                className="h-7 w-7"
                disabled={isLoading || isUploading}
              >
                <ExternalLink
                  className={cn(
                    "h-4 w-4",
                    tavilyExtractEnabled
                      ? "text-green-500"
                      : "text-muted-foreground",
                  )}
                />
              </Button>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={onPerplexitySearchToggle}
                className="h-7 w-7"
                disabled={isLoading || isUploading}
              >
                <Sparkles
                  className={cn(
                    "h-4 w-4",
                    perplexitySearchEnabled
                      ? "text-purple-500"
                      : "text-muted-foreground",
                  )}
                />
              </Button>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={onPerplexityDeepResearchToggle}
                className="h-7 w-7"
                disabled={isLoading || isUploading}
              >
                <BrainCircuit
                  className={cn(
                    "h-4 w-4",
                    perplexityDeepResearchEnabled
                      ? "text-orange-500"
                      : "text-muted-foreground",
                  )}
                />
              </Button>
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
            <Button
              variant="ghost"
              onClick={onFileUploadTrigger}
              className="h-10 p-2 flex items-center" // Ensure consistent height with input, remove w-10, add flex
              disabled={isLoading || isUploading}
            >
              <Paperclip size={20} className="mr-0 md:mr-2" /> {/* Add margin for desktop */}
              <span className="hidden md:inline">Attach Files</span> {/* Responsive label */}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Attach files for context</p>
          </TooltipContent>
        </Tooltip>
        <Input
          type="text"
          placeholder="Enter your message..."
          value={userInput}
          onChange={(e) => onUserInputChanges(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading || isUploading}
          className="flex-1"
          spellCheck={false}
        />
        <Button
          onClick={onSendMessage}
          disabled={isLoading || isUploading || !userInput.trim()}
        >
          {isLoading ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
};

export default ChatInputControls;
