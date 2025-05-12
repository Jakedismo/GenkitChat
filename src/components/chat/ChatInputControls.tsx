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
  Book,
  Library,
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
  
  // Context7 tools
  context7ResolveLibraryIdEnabled?: boolean;
  context7GetLibraryDocsEnabled?: boolean;

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
  context7ResolveLibraryIdEnabled = false,
  context7GetLibraryDocsEnabled = false,
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
          {/* Context7 Library ID Resolver */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={isLoading || isUploading}
              >
                <Library
                  className={cn(
                    "h-4 w-4",
                    context7ResolveLibraryIdEnabled
                      ? "text-cyan-500"
                      : "text-muted-foreground",
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Context7 Library ID Resolver</p>
            </TooltipContent>
          </Tooltip>
          {/* Context7 Library Docs */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={isLoading || isUploading}
              >
                <Book
                  className={cn(
                    "h-4 w-4",
                    context7GetLibraryDocsEnabled
                      ? "text-emerald-500"
                      : "text-muted-foreground",
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Context7 Library Documentation</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      <div className="flex w-full items-start space-x-2 pt-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onFileUploadTrigger}
              className="h-10 w-10 p-2" // Ensure consistent height with input
              disabled={isLoading || isUploading}
            >
              <Paperclip size={20} /> {/* Slightly larger icon */}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Upload file(s)</p>
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
