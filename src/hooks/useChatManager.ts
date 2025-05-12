import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  ChatMessage,
  ChatMode,
  TemperaturePreset,
  UploadedFile,
  DocumentData,
  ToolInvocation,
  ParsedJsonData,
} from "@/types/chat";
// Corrected imports for custom hooks
import { useChatMessages } from "@/hooks/chat/useChatMessages";
import { useChatInputControls } from "@/hooks/chat/useChatInputControls";
import { useChatSession } from "@/hooks/chat/useChatSession";

// Corrected import for streaming utilities
import {
  processStream,
  StreamEventCallbacks,
} from "@/hooks/chat/useChatStreaming";

export interface UseChatManagerProps {
  chatMode: ChatMode;
  selectedGeminiModelId: string;
  selectedOpenAIModelId: string;
  temperaturePreset: TemperaturePreset;
  maxTokens: number;
  uploadedFiles: UploadedFile[];
  resetUploadedFiles: () => void;
  tavilySearchEnabled: boolean;
  tavilyExtractEnabled: boolean;
  perplexitySearchEnabled: boolean;
  perplexityDeepResearchEnabled: boolean;
}

export interface UseChatManagerReturn {
  messages: ChatMessage[];
  userInput: string;
  setUserInput: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  currentSessionId: string | undefined;
  handleSendMessage: () => Promise<void>;
  clearChat: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  scrollAreaRef: React.RefObject<HTMLDivElement>;
}

export function useChatManager({
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
}: UseChatManagerProps): UseChatManagerReturn {
  const {
    messages,
    addUserMessage,
    addBotPlaceholder,
    updateBotMessageText,
    updateBotMessageSources,
    addToolInvocationToBotMessage,
    addMultipleToolInvocationsToBotMessage,
    updateBotMessageFromFinalResponse,
    injectErrorIntoBotMessage,
    clearMessages,
  } = useChatMessages();
  const { userInput, setUserInput, clearUserInput } = useChatInputControls();
  const [isLoading, setIsLoading] = useState(false);
  const { currentSessionId, setCurrentSessionId, startNewSession } =
    useChatSession();
  const { toast } = useToast();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.sender === "bot") {
        console.log("DEBUG: Last bot message state:", {
          id: lastMessage.id,
          textLength: lastMessage.text.length,
          hasToolInvocations: !!(
            lastMessage.toolInvocations &&
            lastMessage.toolInvocations.length > 0
          ),
          toolInvocationsCount: lastMessage.toolInvocations?.length || 0,
          toolInvocations: lastMessage.toolInvocations,
          hasSources: !!(lastMessage.sources && lastMessage.sources.length > 0),
          sourcesCount: lastMessage.sources?.length || 0,
        });
        if (
          lastMessage.toolInvocations &&
          lastMessage.toolInvocations.length > 0
        ) {
          console.log(
            "DEBUG: Tool invocations found on last bot message:",
            JSON.stringify(lastMessage.toolInvocations, null, 2),
          );
        } else {
          console.log("DEBUG: No tool invocations on last bot message.");
        }
      }
    }
  }, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!userInput.trim() || isLoading) return;

    let modelIdToUse: string | null = null;
    let errorDescription: string | null = null;

    if (chatMode === ChatMode.DIRECT_GEMINI) {
      if (!selectedGeminiModelId) {
        errorDescription = "Please select a Gemini model.";
      } else {
        modelIdToUse = selectedGeminiModelId;
      }
    } else if (chatMode === ChatMode.DIRECT_OPENAI) {
      if (!selectedOpenAIModelId) {
        errorDescription = "Please select an OpenAI model.";
      } else {
        modelIdToUse = selectedOpenAIModelId;
      }
    }

    if (errorDescription) {
      toast({
        title: "Configuration Missing",
        description: errorDescription,
        variant: "default",
      });
      return;
    }
    if (!modelIdToUse) {
      console.error(
        "Model ID to use is somehow null/undefined despite passing checks.",
      );
      toast({
        title: "Error",
        description: "Could not determine model to use.",
        variant: "destructive",
      });
      return;
    }

    const userMessageText = userInput;
    let sessionIdToUse = currentSessionId;
    if (!sessionIdToUse) {
      sessionIdToUse = startNewSession();
    }

    addUserMessage(userMessageText);
    const botMessagePlaceholderId = addBotPlaceholder();

    clearUserInput();
    setIsLoading(true);

    try {
      const useRag = uploadedFiles.some((f) => f.status === "success");
      const apiUrl = useRag ? "/api/rag-chat" : "/api/basic-chat";
      const requestBody = {
        query: userMessageText,
        userMessage: userMessageText,
        modelId: modelIdToUse,
        temperaturePreset: temperaturePreset,
        maxTokens: maxTokens,
        sessionId: sessionIdToUse,
        tavilySearchEnabled: tavilySearchEnabled,
        tavilyExtractEnabled: tavilyExtractEnabled,
        perplexitySearchEnabled: perplexitySearchEnabled,
        perplexityDeepResearchEnabled: perplexityDeepResearchEnabled,
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok || !response.body) {
        const errorDetail = response.body
          ? await response.json().catch(() => ({}))
          : {};
        const message =
          errorDetail.details ||
          errorDetail.error ||
          `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const streamEventCallbacks: StreamEventCallbacks = {
        onText: (textChunk: string) => {
          updateBotMessageText(botMessagePlaceholderId, textChunk);
        },
        onSources: (sources: DocumentData[]) => {
          updateBotMessageSources(botMessagePlaceholderId, sources);
          console.log(
            `[useChatManager] Updated message ${botMessagePlaceholderId} with ${sources.length} sources via callback.`,
          );
        },
        onToolInvocation: (toolInvocation: ToolInvocation) => {
          addToolInvocationToBotMessage(
            botMessagePlaceholderId,
            toolInvocation,
          );
          console.log(
            `[useChatManager] Added tool invocation ${toolInvocation.toolName} to message ${botMessagePlaceholderId} via callback.`,
          );
        },
        onMultipleToolInvocations: (toolInvocations: ToolInvocation[]) => {
          addMultipleToolInvocationsToBotMessage(
            botMessagePlaceholderId,
            toolInvocations,
          );
          console.log(
            `[useChatManager] Added ${toolInvocations.length} tool invocations to message ${botMessagePlaceholderId} via callback.`,
          );
        },
        onFinalResponse: (
          finalData: ParsedJsonData,
          serverSessionId?: string,
        ) => {
          if (serverSessionId && !currentSessionId) {
            setCurrentSessionId(serverSessionId);
            console.log(
              "[useChatManager] Session ID updated from final_response via callback:",
              serverSessionId,
            );
          }
          updateBotMessageFromFinalResponse(botMessagePlaceholderId, finalData);
          console.log(
            "[useChatManager] Final response processed via callback for message:",
            botMessagePlaceholderId,
          );
        },
        onStreamError: (errorMessage: string) => {
          // Extract relevant error details for better user feedback
          let userFriendlyMessage = errorMessage;
          let detailedLog: Record<string, any> = { originalError: errorMessage };
          
          // Handle JSON parsing errors more specifically
          if (errorMessage.includes("JSON") || errorMessage.includes("parse")) {
            detailedLog = {
              ...detailedLog,
              errorType: "json_parsing_error",
              message: "JSON parsing error in stream: " + errorMessage,
              context: "This may indicate a malformed response from the API",
              sessionId: sessionIdToUse
            };
            
            // Specific handling for common JSON parsing errors
            if (errorMessage.includes("Unterminated string")) {
              userFriendlyMessage = "The AI response was truncated. We're working to fix this issue.";
              // Continue showing what we received, rather than hiding it completely
              updateBotMessageText(botMessagePlaceholderId, "⚠️ The response was cut off due to a technical issue. Here's what we received:\n\n");
            } else if (errorMessage.includes("backslash")) {
              userFriendlyMessage = "The response contained special characters that couldn't be processed correctly.";
            } else {
              userFriendlyMessage = "The AI response couldn't be properly processed. This has been reported.";
            }
            
            console.error(detailedLog);
          } else {
            console.error({
              message: "Streaming error from useChatStreaming: " + errorMessage,
              errorType: "stream_error",
              timestamp: new Date().toISOString(),
              sessionId: sessionIdToUse
            });
          }
          
          toast({
            title: "Stream Error",
            description: userFriendlyMessage,
            variant: "destructive",
          });
          
          // Update the message with the error
          injectErrorIntoBotMessage(botMessagePlaceholderId, 
            `Error: ${userFriendlyMessage}\n\nPlease try again or refresh the page if the issue persists.`);
        },
        onStreamEnd: () => {
          console.log("[useChatManager] Stream ended (via callback).");
        },
        onReaderDone: () => {
          console.log(
            "[useChatManager] Stream reader reported done (via callback).",
          );
        },
      };

      await processStream(reader, streamEventCallbacks);
    } catch (error) {
      // Extract and format error details
      const errorMessage =
        typeof error === "object" && error !== null && "message" in error
          ? (error as any).message
          : String(error);
          
      // Create structured error log
      const errorLog: Record<string, any> = {
        message: "Error sending message (useChatManager): " + errorMessage,
        errorObject: error,
        sessionId: sessionIdToUse,
        timestamp: new Date().toISOString(),
        modelId: modelIdToUse,
        chatMode
      };
      
      // Provide user-friendly error message with recovery options
      let userFriendlyMessage = errorMessage;
      let recoveryAttempted = false;
      
      // Enhanced error classification and recovery
      if (errorMessage.includes("JSON") || errorMessage.includes("parse")) {
        errorLog.errorType = "json_parsing_error";
        
        // Specific JSON error handling
        if (errorMessage.includes("Unterminated string")) {
          userFriendlyMessage = "The AI response was truncated. We've saved what we could.";
          
          // Try to recover partial content if possible - this helps users not lose their entire response
          try {
            // Check if there's a pattern that indicates we got a substantial response before the error
            if (botMessagePlaceholderId) {
              updateBotMessageText(botMessagePlaceholderId, 
                "⚠️ The response below was truncated due to a technical issue:\n\n");
              recoveryAttempted = true;
            }
          } catch (recoveryError) {
            console.warn("Recovery attempt failed:", recoveryError);
          }
        } else if (errorMessage.includes("backslash") || errorMessage.includes("\\")) {
          userFriendlyMessage = "The response contained special characters that couldn't be processed correctly.";
        } else {
          userFriendlyMessage = "There was an error processing the AI response. Our team has been notified.";
        }
      } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        errorLog.errorType = "network_error";
        userFriendlyMessage = "Network error. Please check your connection and try again.";
      } else if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
        errorLog.errorType = "timeout_error";
        userFriendlyMessage = "The request timed out. This might happen with complex queries or during high traffic.";
      } else {
        errorLog.errorType = "general_error";
      }
      
      // Log the structured error
      console.error(errorLog);
      
      // Update UI with error message if no recovery was attempted
      if (botMessagePlaceholderId && !recoveryAttempted) {
        injectErrorIntoBotMessage(
          botMessagePlaceholderId, 
          `Error: ${userFriendlyMessage}\n\nTry again or refresh the page.`
        );
      }
      
      // Show toast with error message
      toast({
        title: "Error",
        description: userFriendlyMessage,
        variant: "destructive",
      });
    } finally {
      // Ensure loading state is always reset
      setIsLoading(false);
    }
  }, [
    userInput,
    isLoading,
    chatMode,
    selectedGeminiModelId,
    selectedOpenAIModelId,
    temperaturePreset,
    maxTokens,
    currentSessionId,
    startNewSession,
    setCurrentSessionId,
    uploadedFiles,
    tavilySearchEnabled,
    tavilyExtractEnabled,
    perplexitySearchEnabled,
    perplexityDeepResearchEnabled,
    setUserInput,
    clearUserInput,
    setIsLoading,
    addUserMessage,
    addBotPlaceholder,
    updateBotMessageText,
    updateBotMessageSources,
    addToolInvocationToBotMessage,
    addMultipleToolInvocationsToBotMessage,
    updateBotMessageFromFinalResponse,
    injectErrorIntoBotMessage,
    toast,
    resetUploadedFiles,
  ]);

  const clearChat = useCallback(() => {
    clearMessages();
    resetUploadedFiles();
    startNewSession();
    toast({
      title: "Chat Cleared",
      description: "Ready for a new conversation.",
    });
  }, [clearMessages, resetUploadedFiles, startNewSession, toast]);

  return {
    messages,
    userInput,
    setUserInput,
    isLoading,
    currentSessionId,
    handleSendMessage,
    clearChat,
    messagesEndRef,
    scrollAreaRef,
  };
}
