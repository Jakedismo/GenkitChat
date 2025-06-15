import { useToast } from "@/hooks/use-toast";
import {
  ChatMessage,
  ChatMode,
  DocumentData,
  ParsedJsonData,
  TemperaturePreset,
  ToolInvocation,
  UploadedFile,
} from "@/types/chat";
import { normalizeText } from "@/utils/message-normalization";
import { convertChatMessagesToHistory } from "@/utils/messageHistory";
import { useCallback, useEffect, useRef, useState } from "react";
// Corrected imports for custom hooks
import { useChatInputControls } from "@/hooks/chat/useChatInputControls";
import { useChatMessages } from "@/hooks/chat/useChatMessages";
import { useChatSession } from "@/hooks/chat/useChatSession";

// Corrected import for streaming utilities
import {
  processStream,
  StreamEventCallbacks,
} from "@/hooks/chat/useChatStreaming";
import { streamChatResponse } from "@/services/chatService";

export interface UseChatManagerProps {
  chatMode: ChatMode;
  selectedGeminiModelId: string | null;
  selectedOpenAIModelId: string | null;
  temperaturePreset: TemperaturePreset;
  maxTokens: number;
  uploadedFiles: UploadedFile[];
  resetUploadedFiles: () => void;
  tavilySearchEnabled: boolean;
  tavilyExtractEnabled: boolean;
  perplexitySearchEnabled: boolean;
  perplexityDeepResearchEnabled: boolean;
  context7ResolveLibraryIdEnabled: boolean;
  context7GetLibraryDocsEnabled: boolean;
}

export interface UseChatManagerReturn {
  messages: ChatMessage[];
  userInput: string;
  setUserInput: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  currentSessionId: string | undefined;
  handleSendMessage: () => Promise<void>;
  clearChat: () => void;
  fixTruncatedMessage: (messageId?: string) => boolean; // Add method to fix truncated messages
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
  context7ResolveLibraryIdEnabled,
  context7GetLibraryDocsEnabled,
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
    fixTruncatedBotMessage,
    clearMessages,
  } = useChatMessages();
  const { userInput, setUserInput, clearUserInput } = useChatInputControls();
  const [isLoading, setIsLoading] = useState(false);
  const { currentSessionId, setCurrentSessionId, startNewSession } =
    useChatSession();
  const { toast } = useToast();
  const finalizedMessageIds = useRef(new Set<string>());

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    // Check if last message is truncated
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.sender === "bot") {
        if (typeof lastMessage.text === "string") {
          // Placeholder for future logic
        }
      }
    }
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.sender === "bot") {
        // Basic message processing for bot responses
        if (typeof lastMessage.text === "string") {
          // Message text is available for processing
        }

        if (
          lastMessage.toolInvocations &&
          lastMessage.toolInvocations.length > 0
        ) {
          // Tool invocations are available for processing
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
      sessionIdToUse = await startNewSession();
    }

    // Capture conversation history before adding the current message
    const conversationHistory = convertChatMessagesToHistory(
      messages,
      modelIdToUse,
    );

    addUserMessage(userMessageText);
    const botMessagePlaceholderId = addBotPlaceholder();

    clearUserInput();
    setIsLoading(true);

    try {
      const useRag = uploadedFiles.some(
        (f: UploadedFile) => f.status === "success",
      );
      const endpointUrl = useRag ? "/api/rag-chat" : "/api/basic-chat";
      const requestBody = {
        query: userMessageText,
        userMessage: userMessageText,
        modelId: modelIdToUse,
        temperaturePreset: temperaturePreset,
        maxTokens: maxTokens,
        sessionId: sessionIdToUse,
        history: conversationHistory,
        tavilySearchEnabled: tavilySearchEnabled,
        tavilyExtractEnabled: tavilyExtractEnabled,
        perplexitySearchEnabled: perplexitySearchEnabled,
        perplexityDeepResearchEnabled: perplexityDeepResearchEnabled,
        context7ResolveLibraryIdEnabled: context7ResolveLibraryIdEnabled,
        context7GetLibraryDocsEnabled: context7GetLibraryDocsEnabled,
      };

      const response = await streamChatResponse(requestBody, endpointUrl);

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
          // Process text chunk, ensuring proper handling of special characters
          const processedChunk = textChunk
            .replace(/\\+$/, "") // Remove trailing backslashes that might cause issues
            .replace(/\\\"/g, '"') // Replace escaped quotes with actual quotes
            .replace(/\\n/g, "\n") // Convert escaped newlines to actual newlines
            .replace(/\\r/g, "\r") // Convert escaped carriage returns
            .replace(/\\t/g, "\t"); // Convert escaped tabs

          // Always append the incoming chunk - let the final response handler decide what to do
          updateBotMessageText(botMessagePlaceholderId, processedChunk);
        },
        onSources: (sources: DocumentData[]) => {
          updateBotMessageSources(botMessagePlaceholderId, sources);
        },
        onToolInvocation: (toolInvocation: ToolInvocation) => {
          addToolInvocationToBotMessage(
            botMessagePlaceholderId,
            toolInvocation,
          );
        },
        onMultipleToolInvocations: (toolInvocations: ToolInvocation[]) => {
          addMultipleToolInvocationsToBotMessage(
            botMessagePlaceholderId,
            toolInvocations,
          );
        },
        onFinalResponse: (
          finalData: ParsedJsonData,
          serverSessionId?: string,
        ) => {
          if (serverSessionId && !currentSessionId) {
            setCurrentSessionId(serverSessionId);
          }

          // Log message content structure if present (Gemini format)
          // This block was for debugging and is no longer needed.

          updateBotMessageFromFinalResponse(botMessagePlaceholderId, finalData);
          // Mark this message ID as finalized
          finalizedMessageIds.current.add(botMessagePlaceholderId);
        },
        onStreamError: (
          error: string | Error | { toString: () => string },
        ) => {
          // Enhanced defensive coding - handle both string error messages and error objects
          const originalError = error;
          let errorMessage = "";

          // Convert errors to strings with special handling for common issues
          if (typeof error !== "string") {
            if (error instanceof Error) {
              // Standard Error object
              errorMessage = error.message;
            } else if (error && typeof error === "object") {
              // Handle the specific 'Cannot read properties of undefined (reading 'name')' error
              if (
                error
                  .toString()
                  .includes("Cannot read properties of undefined (reading 'name')")
              ) {
                console.error(
                  "[useChatManager] Caught tool name access error, using defensive handler",
                );
                errorMessage =
                  "Error processing tool invocation: missing tool information";
              } else {
                // Generic object error
                errorMessage = String(error);
              }
            } else {
              // Fallback for any other type
              errorMessage = String(error || "Unknown error");
            }
            console.error(
              "[useChatManager] Converted error object to string:",
              {
                originalError,
                stringMessage: errorMessage,
              },
            );
          } else {
            errorMessage = error;
          }
          // Extract relevant error details for better user feedback
          let userFriendlyMessage: string | React.ReactNode = errorMessage;
          let detailedLog: Record<string, unknown> = {
            originalError: errorMessage,
          };
          let shouldHideError = false;
          let shouldAttemptRecovery = false;

          // Handle JSON parsing errors more specifically
          if (
            errorMessage.includes("JSON") ||
            errorMessage.includes("parse")
          ) {
            detailedLog = {
              ...detailedLog,
              errorType: "json_parsing_error",
              message: "JSON parsing error in stream: " + errorMessage,
              context: "This may indicate a malformed response from the API",
              sessionId: sessionIdToUse,
            };

            // Always attempt to recover for parsing errors
            shouldAttemptRecovery = true;
            shouldHideError = true;

            // Specific handling for common JSON parsing errors
            if (errorMessage.includes("Unterminated string")) {
              userFriendlyMessage =
                "The AI response was truncated. We're showing what we received.";
              // Continue showing what we received, don't change the content that was already streamed
            } else if (
              errorMessage.includes("backslash") ||
              errorMessage.includes("\\")
            ) {
              userFriendlyMessage =
                "The response contained special characters that were corrected.";
              // For backslash errors, we can usually still display the content
            } else {
              userFriendlyMessage =
                "The AI response couldn't be properly processed. This has been reported.";
            }

            console.error(detailedLog);
          } else {
            if (Object.keys(detailedLog).length > 1) {
              console.error(detailedLog);
            } else {
              console.error({
                message:
                  "Streaming error from useChatStreaming: " + errorMessage,
                errorType: "stream_error",
                timestamp: new Date().toISOString(),
                sessionId: sessionIdToUse,
              });
            }
          }

          // Only show a toast for errors that aren't related to content formatting
          if (!shouldHideError) {
            toast({
              title: "Stream Error",
              description: userFriendlyMessage,
              variant: "destructive",
            });

            // Update the message with the error
            injectErrorIntoBotMessage(
              botMessagePlaceholderId,
              `Error: ${userFriendlyMessage}\n\nPlease try again or refresh the page if the issue persists.`,
            );
          } else if (shouldAttemptRecovery) {
            // Add a note at the bottom of the message but preserve content
            const recoveryNote = `\n\n_Note: Some content may have been truncated due to formatting issues._`;

            // Get current messages to find existing text
            const currentMessage = messages.find(
              (m) => m.id === botMessagePlaceholderId,
            );
            if (currentMessage) {
              const currentText = normalizeText(currentMessage.text);
              // Don't add the note if we've already added it
              if (!currentText.includes(recoveryNote)) {
                updateBotMessageText(
                  botMessagePlaceholderId,
                  currentText + recoveryNote,
                );
              }
            }
          }
        },
        onStreamEnd: () => {},
        onReaderDone: () => {},
      };

      await processStream(reader, streamEventCallbacks);
    } catch (error) {
      // Extract and format error details
      const errorMessage =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as Error).message)
          : String(error);

      // Create structured error log
      const errorLog: Record<string, unknown> = {
        message: "Error sending message (useChatManager): " + errorMessage,
        errorObject: error,
        sessionId: sessionIdToUse,
        timestamp: new Date().toISOString(),
        modelId: modelIdToUse,
        chatMode,
      };

      // Provide user-friendly error message with recovery options
      let userFriendlyMessage = errorMessage;
      let recoveryAttempted = false;
      let suppressErrorDisplay = false;

      // Enhanced error classification and recovery
      if (errorMessage.includes("JSON") || errorMessage.includes("parse")) {
        errorLog.errorType = "json_parsing_error";

        // Get the current message content before attempting recovery
        const currentMessage = messages.find(
          (m) => m.id === botMessagePlaceholderId,
        );
        const existingText = currentMessage
          ? normalizeText(currentMessage.text)
          : "";

        // Always attempt to preserve content for JSON errors
        suppressErrorDisplay = true;
        recoveryAttempted = true;

        // Specific JSON error handling
        if (errorMessage.includes("Unterminated string")) {
          userFriendlyMessage =
            "The AI response was truncated. We've saved what we could.";

          // Try to recover partial content if possible - this helps users not lose their entire response
          try {
            if (botMessagePlaceholderId && existingText) {
              // Keep the existing text but add a note about truncation
              const noteText =
                "\n\n_Note: The response was truncated due to a technical issue._";

              // Only add the note if it's not already there
              if (
                typeof existingText === "string" &&
                !existingText.includes(noteText)
              ) {
                updateBotMessageText(
                  botMessagePlaceholderId,
                  existingText + noteText,
                );
              }
            }
          } catch (recoveryError) {
            console.warn("Recovery attempt failed:", recoveryError);
          }
        } else if (
          errorMessage.includes("backslash") ||
          errorMessage.includes("\\")
        ) {
          userFriendlyMessage =
            "The response contained special characters that were handled automatically.";

          // For backslash errors, try to fix the content
          try {
            if (
              botMessagePlaceholderId &&
              typeof existingText === "string"
            ) {
              // Fix common backslash issues in the existing text
              const fixedText = existingText
                .replace(/\\+$/, "") // Remove trailing backslashes
                .replace(/\\"/g, '"') // Replace escaped quotes with actual quotes
                .replace(/\\\\/g, "\\"); // Replace double backslashes with single ones

              updateBotMessageText(botMessagePlaceholderId, fixedText);
            }
          } catch (fixError) {
            console.warn("Error fixing backslashes:", fixError);
          }
        } else {
          userFriendlyMessage =
            "There was an error processing the AI response. Our team has been notified.";
        }
      } else if (
        errorMessage.includes("network") ||
        errorMessage.includes("fetch")
      ) {
        errorLog.errorType = "network_error";
        userFriendlyMessage =
          "Network error. Please check your connection and try again.";
      } else if (
        errorMessage.includes("timeout") ||
        errorMessage.includes("timed out")
      ) {
        errorLog.errorType = "timeout_error";
        userFriendlyMessage =
          "The request timed out. This might happen with complex queries or during high traffic.";
      } else {
        errorLog.errorType = "general_error";
      }

      // Log the structured error
      if (Object.keys(errorLog).length > 1) {
        console.error(errorLog);
      } else {
        console.error({
          message: "Error sending message (useChatManager): " + errorMessage,
          errorObject: error,
          sessionId: sessionIdToUse,
          timestamp: new Date().toISOString(),
          modelId: modelIdToUse,
          chatMode,
        });
      }

      // Update UI with error message if no recovery was attempted and error display isn't suppressed
      if (
        botMessagePlaceholderId &&
        !recoveryAttempted &&
        !suppressErrorDisplay
      ) {
        injectErrorIntoBotMessage(
          botMessagePlaceholderId,
          `Error: ${userFriendlyMessage}\n\nTry again or refresh the page.`,
        );
      }

      // For JSON parsing errors where we've preserved content, add a subtle indicator
      if (
        recoveryAttempted &&
        suppressErrorDisplay &&
        errorLog.errorType === "json_parsing_error"
      ) {
        // Check if we need to show a toast (only for serious errors)
        const shouldShowToast =
          !errorMessage.includes("backslash") &&
          !errorMessage.includes("\\") &&
          !errorMessage.includes("Unterminated");

        if (shouldShowToast) {
          toast({
            title: "Content Issue",
            description:
              "Some formatting issues were automatically corrected.",
            variant: "default",
          });
        }
      }
      // Show toast with error message only if we're not suppressing error display
      else if (!suppressErrorDisplay) {
        toast({
          title: "Error",
          description: userFriendlyMessage,
          variant: "destructive",
        });
      }
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
    messages,
    context7GetLibraryDocsEnabled,
    context7ResolveLibraryIdEnabled,
  ]);

  const clearChat = useCallback(() => {
    clearMessages();
    resetUploadedFiles();
    startNewSession();
    finalizedMessageIds.current.clear(); // Clear the finalized IDs on chat clear
    toast({
      title: "Chat Cleared",
      description: "Ready for a new conversation.",
    });
  }, [clearMessages, resetUploadedFiles, startNewSession, toast]);

  // Function to fix truncated messages - defaults to fixing the last bot message if no ID provided
  const fixTruncatedMessage = useCallback(
    (messageId?: string): boolean => {
      // If no messageId provided, try to fix the last bot message
      if (!messageId && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.sender === "bot") {
          return fixTruncatedBotMessage(lastMessage.id);
        }
        return false;
      }

      // Fix specific message if ID is provided
      if (messageId) {
        return fixTruncatedBotMessage(messageId);
      }

      return false;
    },
    [messages, fixTruncatedBotMessage],
  );

  return {
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
  };
}
