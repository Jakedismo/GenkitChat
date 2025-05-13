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
  const [finalizedMessageIds, setFinalizedMessageIds] = useState<Set<string>>(
    new Set()
  );

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    // Check if last message is truncated
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.sender === "bot") {
        const textLength =
          typeof lastMessage.text === "string" ? lastMessage.text.length : 0;
        console.log(
          `[useChatManager] Last message length: ${textLength} chars`
        );

        // Debug message contents if it's not too long
        if (textLength > 0 && textLength < 2000) {
          console.log(
            `[useChatManager] Last message preview:`,
            typeof lastMessage.text === "string"
              ? `${lastMessage.text.substring(
                  0,
                  50
                )}...${lastMessage.text.substring(
                  Math.max(0, lastMessage.text.length - 50)
                )}`
              : lastMessage.text
          );
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
        console.log("DEBUG: Last bot message state:", {
          id: lastMessage.id,
          textLength:
            typeof lastMessage.text === "string"
              ? lastMessage.text.length
              : "non-string type",
          textType: typeof lastMessage.text,
          isTextArray: Array.isArray(lastMessage.text),
          textStructure: Array.isArray(lastMessage.text)
            ? `Array with ${lastMessage.text.length} items`
            : typeof lastMessage.text === "object"
            ? "Object"
            : "Primitive",
          hasToolInvocations: !!(
            lastMessage.toolInvocations &&
            lastMessage.toolInvocations.length > 0
          ),
          toolInvocationsCount: lastMessage.toolInvocations?.length || 0,
          toolInvocations: lastMessage.toolInvocations,
          hasSources: !!(lastMessage.sources && lastMessage.sources.length > 0),
          sourcesCount: lastMessage.sources?.length || 0,
        });

        // Check for potential truncation issues
        if (typeof lastMessage.text === "string") {
          const suspiciousEndingPatterns = [
            /[^.!?]\s*$/, // Ends without proper punctuation
            /\\$/, // Ends with a backslash
            /"\s*$/, // Ends with a quote
            /[{[]$/, // Ends with an opening brace/bracket
          ];

          const potentialTruncation = suspiciousEndingPatterns.some((pattern) =>
            pattern.test(
              lastMessage.text.substring(lastMessage.text.length - 10)
            )
          );

          if (potentialTruncation) {
            console.warn(
              "DEBUG: Potential message truncation detected in last bot message!"
            );
            console.log(
              "DEBUG: Last 100 chars:",
              lastMessage.text.substring(lastMessage.text.length - 100)
            );
          }
        } else if (Array.isArray(lastMessage.text)) {
          console.log(
            "DEBUG: Bot message text is an array, might need to be joined:",
            lastMessage.text
              .map((chunk) =>
                typeof chunk === "string" ? chunk.length : "non-string"
              )
              .join(", ")
          );
        }

        if (
          lastMessage.toolInvocations &&
          lastMessage.toolInvocations.length > 0
        ) {
          console.log(
            "DEBUG: Tool invocations found on last bot message:",
            JSON.stringify(lastMessage.toolInvocations, null, 2)
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
        "Model ID to use is somehow null/undefined despite passing checks."
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
      // Check if the user message specifically asks to use context7
      const shouldEnableContext7 =
        userMessageText.toLowerCase().includes("context7") ||
        userMessageText.toLowerCase().includes("library docs") ||
        userMessageText.toLowerCase().includes("library documentation");

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
        context7ResolveLibraryIdEnabled: context7ResolveLibraryIdEnabled,
        context7GetLibraryDocsEnabled: context7GetLibraryDocsEnabled,
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
          // Do not update text if the final response for this message has already been processed
          if (finalizedMessageIds.has(botMessagePlaceholderId)) {
            console.log(
              `[useChatManager] Ignoring text chunk for finalized message ID: ${botMessagePlaceholderId}`
            );
            return;
          }

          // Process text chunk, ensuring proper handling of special characters
          const processedChunk = textChunk
            .replace(/\\+$/, "") // Remove trailing backslashes that might cause issues
            .replace(/\\\"/g, '"') // Replace escaped quotes with actual quotes
            .replace(/\\n/g, "\n") // Convert escaped newlines to actual newlines
            .replace(/\\r/g, "\r") // Convert escaped carriage returns
            .replace(/\\t/g, "\t"); // Convert escaped tabs

          // Always append the incoming chunk
          updateBotMessageText(botMessagePlaceholderId, processedChunk);
        },
        onSources: (sources: DocumentData[]) => {
          updateBotMessageSources(botMessagePlaceholderId, sources);
          console.log(
            `[useChatManager] Updated message ${botMessagePlaceholderId} with ${sources.length} sources via callback.`
          );
        },
        onToolInvocation: (toolInvocation: ToolInvocation) => {
          addToolInvocationToBotMessage(
            botMessagePlaceholderId,
            toolInvocation
          );
          console.log(
            `[useChatManager] Added tool invocation ${toolInvocation.toolName} to message ${botMessagePlaceholderId} via callback.`
          );
        },
        onMultipleToolInvocations: (toolInvocations: ToolInvocation[]) => {
          addMultipleToolInvocationsToBotMessage(
            botMessagePlaceholderId,
            toolInvocations
          );
          console.log(
            `[useChatManager] Added ${toolInvocations.length} tool invocations to message ${botMessagePlaceholderId} via callback.`
          );
        },
        onFinalResponse: (
          finalData: ParsedJsonData,
          serverSessionId?: string
        ) => {
          if (serverSessionId && !currentSessionId) {
            setCurrentSessionId(serverSessionId);
            console.log(
              "[useChatManager] Session ID updated from final_response via callback:",
              serverSessionId
            );
          }

          // Enhanced debug logging for the final response structure
          console.log("Raw Final Response Object:", finalData);

          // Debug the response structure before processing
          console.log("[useChatManager] Final response data structure:", {
            hasResponse: !!finalData.response,
            responseType: typeof finalData.response,
            responseLength:
              typeof finalData.response === "string"
                ? finalData.response.length
                : "non-string",
            hasToolInvocations:
              Array.isArray(finalData.toolInvocations) &&
              finalData.toolInvocations.length > 0,
            responsePreview:
              typeof finalData.response === "string"
                ? `${finalData.response.substring(
                    0,
                    50
                  )}...${finalData.response.substring(
                    finalData.response.length - 50
                  )}`
                : JSON.stringify(finalData.response).substring(0, 100),
          });

          // Log message content structure if present (Gemini format)
          if (finalData.message && finalData.message.content) {
            console.log("Response Debug [finalResponse]");
            const contentType = Array.isArray(finalData.message.content)
              ? "array"
              : typeof finalData.message.content;
            const contentLength = Array.isArray(finalData.message.content)
              ? finalData.message.content.length
              : "n/a";

            console.log(`  Analysis: {
    totalLength: ${JSON.stringify(finalData).length},
    isTruncated: false,
    structureInfo: { isArray: ${Array.isArray(finalData)}, isObject: ${
              typeof finalData === "object"
            }, hasNestedContent: ${!!finalData.message?.content} }
  }`);

            console.log(`  Object keys: ${Object.keys(finalData)}`);

            if (Array.isArray(finalData.message.content)) {
              console.log(
                `  Message content: Array with ${finalData.message.content.length} items`
              );
              finalData.message.content.forEach((item, index) => {
                console.log(
                  `    Item ${index}: ${
                    typeof item === "object"
                      ? JSON.stringify(item).substring(0, 100)
                      : item
                  }`
                );
              });
            }
          }

          console.log(
            "[useChatManager] Calling updateBotMessageFromFinalResponse with finalData"
          );
          updateBotMessageFromFinalResponse(botMessagePlaceholderId, finalData);
          console.log(
            "[useChatManager] Final response processed via callback for message:",
            botMessagePlaceholderId,
            "Final text length:",
            messages.find((m) => m.id === botMessagePlaceholderId)?.text
              ?.length || "unknown"
          );
          // Mark this message ID as finalized
          setFinalizedMessageIds((prev) =>
            new Set(prev).add(botMessagePlaceholderId)
          );
        },
        onStreamError: (errorMessage: any) => {
          // Enhanced defensive coding - handle both string error messages and error objects
          let originalError = errorMessage;
          
          // Convert errors to strings with special handling for common issues
          if (typeof errorMessage !== 'string') {
            if (errorMessage instanceof Error) {
              // Standard Error object
              errorMessage = errorMessage.message;
            } else if (errorMessage && typeof errorMessage === 'object') {
              // Handle the specific 'Cannot read properties of undefined (reading 'name')' error
              if (errorMessage.toString().includes("Cannot read properties of undefined (reading 'name')")) {
                console.error('[useChatManager] Caught tool name access error, using defensive handler');
                errorMessage = 'Error processing tool invocation: missing tool information';
              } else {
                // Generic object error
                errorMessage = String(errorMessage);
              }
            } else {
              // Fallback for any other type
              errorMessage = String(errorMessage || 'Unknown error');
            }
            console.error('[useChatManager] Converted error object to string:', {
              originalError,
              stringMessage: errorMessage
            });
          }
          // Extract relevant error details for better user feedback
          let userFriendlyMessage = errorMessage;
          let detailedLog: Record<string, any> = {
            originalError: errorMessage,
          };
          let shouldHideError = false;
          let shouldAttemptRecovery = false;

          // Handle JSON parsing errors more specifically
          if (errorMessage.includes("JSON") || errorMessage.includes("parse")) {
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
            console.error({
              message: "Streaming error from useChatStreaming: " + errorMessage,
              errorType: "stream_error",
              timestamp: new Date().toISOString(),
              sessionId: sessionIdToUse,
            });
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
              `Error: ${userFriendlyMessage}\n\nPlease try again or refresh the page if the issue persists.`
            );
          } else if (shouldAttemptRecovery) {
            // Add a note at the bottom of the message but preserve content
            const recoveryNote = `\n\n_Note: Some content may have been truncated due to formatting issues._`;

            // Get current messages to find existing text
            const currentMessage = messages.find(
              (m) => m.id === botMessagePlaceholderId
            );
            if (currentMessage) {
              // Don't add the note if we've already added it
              if (!currentMessage.text.includes(recoveryNote)) {
                updateBotMessageText(
                  botMessagePlaceholderId,
                  currentMessage.text + recoveryNote
                );
              }
            }
          }
        },
        onStreamEnd: () => {
          console.log("[useChatManager] Stream ended (via callback).");
        },
        onReaderDone: () => {
          console.log(
            "[useChatManager] Stream reader reported done (via callback)."
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
          (m) => m.id === botMessagePlaceholderId
        );
        const existingText = currentMessage ? currentMessage.text : "";

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
              if (!existingText.includes(noteText)) {
                updateBotMessageText(
                  botMessagePlaceholderId,
                  existingText + noteText
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
            if (botMessagePlaceholderId && existingText) {
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
      console.error(errorLog);

      // Update UI with error message if no recovery was attempted and error display isn't suppressed
      if (
        botMessagePlaceholderId &&
        !recoveryAttempted &&
        !suppressErrorDisplay
      ) {
        injectErrorIntoBotMessage(
          botMessagePlaceholderId,
          `Error: ${userFriendlyMessage}\n\nTry again or refresh the page.`
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
            description: "Some formatting issues were automatically corrected.",
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
    setFinalizedMessageIds(new Set()); // Clear the finalized IDs on chat clear
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
    [messages, fixTruncatedBotMessage]
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
