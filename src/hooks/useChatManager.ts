import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  ChatMessage,
  ChatMode,
  TemperaturePreset,
  UploadedFile,
  DocumentData, // Ensure DocumentData is imported
  ToolInvocation, // Import ToolInvocation type
} from "@/types/chat";
// import mermaid from "mermaid"; // Import mermaid - Unused
import { safeDestr } from "destr";
import { v4 as uuidv4 } from "uuid"; // For generating session IDs
// import { unknown } from "zod"; // Unused zod import

type ParsedJsonData = {
  sources?: Array<{
    metadata?: {
      documentId?: string;
      chunkId?: string;
      originalFileName?: string;
      chunkIndex?: number;
      [key: string]: unknown; // Allow other metadata properties
    };
    content?: Array<
      { text?: string; [key: string]: unknown } | null | undefined
    >; // Elements of content can have other props
    [key: string]: unknown; // Allow other properties on source elements
  }>;
  text?: string;
  error?: string; // For error events
  toolInvocations?: unknown; // For potential tool invocation data
  sessionId?: string; // For session ID events
  response?: string; // For final response text
  // Allow any other top-level properties for general object logging and other event types
  [key: string]: unknown;
};

// Props expected by the hook
export interface UseChatManagerProps {
  // From useChatSettings
  chatMode: ChatMode;
  selectedGeminiModelId: string;
  selectedOpenAIModelId: string;
  temperaturePreset: TemperaturePreset;
  maxTokens: number;
  // From useFileUploads
  uploadedFiles: UploadedFile[];
  resetUploadedFiles: () => void; // Needed for clearChat
  // Tool toggles (from page.tsx state for now)
  tavilySearchEnabled: boolean;
  tavilyExtractEnabled: boolean;
  perplexitySearchEnabled: boolean;
  perplexityDeepResearchEnabled: boolean;
}

// Structure of the return value
export interface UseChatManagerReturn {
  messages: ChatMessage[];
  // setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>; // Exposing setter is optional
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
  // Destructure dependencies
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(
    undefined,
  );
  const { toast } = useToast();
  // const prevIsLoadingRef = useRef<boolean>(false); // Track previous loading state - Unused

  // Refs for scrolling
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  // Effect to initialize session ID on mount if not already set
  useEffect(() => {
    if (!currentSessionId) {
      const newSessionId = uuidv4();
      setCurrentSessionId(newSessionId);
      console.log(
        "[useChatManager] New chat session started on mount:",
        newSessionId,
      );
    }
    // This effect runs when currentSessionId changes or on mount.
    // It ensures a session ID is initialized if it's not already set.
  }, [currentSessionId]);

  // Function to scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Effect to scroll and re-render Mermaid diagrams when messages change
  useEffect(() => {
    scrollToBottom();
    // Ensure Mermaid runs client-side only
    // if (typeof window !== "undefined") { // mermaid.run() and its try-catch block should be commented out
    //   try {
    //     mermaid.run({
    //       // Specify nodes for Mermaid to scan - querySelectorAll can be safer than run() without args
    //       // This assumes your markdown renderer uses <pre class=\"mermaid\">...</pre>
    //       nodes: document.querySelectorAll("pre.mermaid"),
    //     });
    //   } catch (e) {
    //     console.error("Mermaid rendering error:", e);
    //   }
    // }
  }, [messages, scrollToBottom]); // Depend on messages and scrollToBottom

  // Diagnostic useEffect to log details of the last bot message
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
          toolInvocations: lastMessage.toolInvocations, // Log the actual data
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

  // // Effect to run Mermaid AFTER loading completes  // << COMMENTED OUT TO FIX STREAMING INTERFERENCE
  // useEffect(() => {
  //   // Check if isLoading just changed from true to false
  //   if (prevIsLoadingRef.current && !isLoading) {
  //     // Ensure Mermaid runs client-side only and after render
  //     if (typeof window !== "undefined") {
  //       // Use setTimeout to allow React state updates to fully flush
  //       setTimeout(() => {
  //         try {
  //           console.log("Attempting to run mermaid.run()...");
  //           mermaid.run({
  //             // Query specific Mermaid elements
  //             nodes: document.querySelectorAll("pre.mermaid"),
  //           });
  //           console.log("mermaid.run() executed.");
  //         } catch (e) {
  //           console.error("Mermaid rendering error:", e);
  //           toast({
  //             title: "Diagram Error",
  //             description: "Could not render a diagram.",
  //             variant: "destructive",
  //           });
  //         }
  //       }, 100); // Small delay (100ms) might help ensure DOM is ready
  //     }
  //   }
  //   // Update the ref *after* the effect runs
  //   prevIsLoadingRef.current = isLoading;
  // }, [isLoading, toast]); // Depend on isLoading and toast (for error reporting)

  // Core function to handle sending a message
  const handleSendMessage = useCallback(async () => {
    if (!userInput.trim() || isLoading) return;

    let modelIdToUse: string | null = null;
    let errorDescription: string | null = null;
    const accumulatedJsonString = ""; // Moved accumulator here for early definition

    // Determine model based on props passed to the hook
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
      sessionIdToUse = crypto.randomUUID();
      setCurrentSessionId(sessionIdToUse);
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: "user",
      text: userMessageText,
    };
    const botMessagePlaceholderId = crypto.randomUUID();
    const botMessagePlaceholder: ChatMessage = {
      id: botMessagePlaceholderId,
      sender: "bot",
      text: "",
      toolInvocations: [],
      sources: [],
    };

    setMessages((prevMessages) => [
      ...prevMessages,
      userMessage,
      botMessagePlaceholder,
    ]);
    setUserInput("");

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

      // Process the stream using SSE logic
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = "";

      // Variables for line-by-line processing
      let currentSSEEventType: string | null = null;
      let currentSSEDataLines: string[] = [];

      console.log(">>> Entering main stream read loop (while !done)"); // DEBUG Loop Entry
      while (!done) {
        console.log(">>> Reading from stream..."); // DEBUG Read Start
        const { value, done: readerDone } = await reader.read();
        console.log(
          `>>> Read ${done ? "finished" : value?.byteLength + " bytes"}`,
        ); // DEBUG Read End
        done = readerDone;
        if (done) break; // Exit loop immediately if done
        let rawChunk = decoder.decode(value, { stream: !done });

        // Normalize literal "\\n" to actual newline "\n", then remove any CRs
        let normalizedChunk = rawChunk.replace(/\\n/g, "\n");
        normalizedChunk = normalizedChunk.replace(/\r/g, ""); // Remove any stray CRs

        // Append normalized chunk to buffer
        buffer += normalizedChunk;

        // Process buffer line by line
        let lineEndPos;
        console.log(`--- Processing buffer (length: ${buffer.length})`); // DEBUG Buffer State
        while ((lineEndPos = buffer.indexOf("\n")) !== -1) {
          console.log("--- Processing line loop iteration"); // DEBUG Inner Loop Entry
          const line = buffer.substring(0, lineEndPos);
          buffer = buffer.substring(lineEndPos + 1); // Consume line from buffer
          console.log(`--- Processing line: "${line}"`); // DEBUG Line Content

          if (line === "") {
            // Empty line: event boundary
            // Dispatch event if we have data lines
            if (currentSSEDataLines.length > 0) {
              const eventTypeToProcess = currentSSEEventType || "message"; // Use stored type or default
              const dataPayload = currentSSEDataLines
                .map((dLine) => dLine.trim()) // Trim whitespace from each line
                .join(""); // Join lines directly, assuming fragments of a single JSON object or text stream
              // Using .join("") is safer if server sends JSON fragments on multiple data lines

              // --- Robust Per-Event JSON Parsing Logic (Restoring inner try/catch) ---
              if (dataPayload.trim()) {
                let jsonDataForThisEvent: unknown = undefined;
                let parseError: Error | null = null;

                try {
                  // Add try block around parsing logic
                  // Attempt to parse the accumulated data payload
                  jsonDataForThisEvent = safeDestr<unknown>(dataPayload);

                  // Check if safeDestr failed (returned undefined) on non-empty payload
                  if (
                    jsonDataForThisEvent === undefined &&
                    dataPayload.length > 0
                  ) {
                    // Only treat as error for non-text events. Text events might be fragmented JSON.
                    if (eventTypeToProcess !== "text") {
                      // Set the error object for non-text parse failures
                      parseError = new Error(
                        `Parsing failed: safeDestr returned undefined for non-text event type '${eventTypeToProcess}'`,
                      );
                      // Log details immediately, but error handling happens after try/catch
                      console.error(
                        `Parse Error Detail: Payload was '${dataPayload}'`,
                      );
                    } else {
                      // For text events, fragmentation is possible. Log less severely.
                      console.warn(
                        `[useChatManager] Ignoring text fragment that failed JSON parsing: '${dataPayload}'`,
                      );
                      // jsonDataForThisEvent remains undefined, error is not set
                    }
                  } else {
                    // Parse successful or payload was empty.
                    // Log details for debugging complex events
                    if (
                      eventTypeToProcess !== "text" &&
                      jsonDataForThisEvent !== undefined
                    ) {
                      console.log(
                        `[useChatManager] Parsed event: Type='${eventTypeToProcess}', Data=`,
                        jsonDataForThisEvent,
                      );
                    }
                  }
                } catch (e) {
                  // Catch if safeDestr somehow throws (it shouldn't, but be safe)
                  parseError = e instanceof Error ? e : new Error(String(e));
                  console.error(
                    `Parse Error Detail: Exception during safeDestr. Payload was '${dataPayload}'`,
                  );
                }

                // --- Handle successful parse or errors ---
                if (jsonDataForThisEvent !== undefined) {
                  // Successfully parsed JSON, update state
                  // NOTE: It's crucial that setMessages itself doesn't throw an unhandled error.
                  setMessages((prevMessages) => {
                    const updatedMessages = prevMessages.map((msg) => {
                      if (msg.id === botMessagePlaceholderId) {
                        const updatedMsg = { ...msg };

                        // Handle 'text' event type
                        if (
                          eventTypeToProcess === "text" &&
                          typeof (jsonDataForThisEvent as { text?: string })
                            ?.text === // Type assertion
                            "string"
                        ) {
                          updatedMsg.text += (
                            jsonDataForThisEvent as { text: string }
                          ).text; // Type assertion
                        }
                        // Handle 'sources' event type
                        else if (eventTypeToProcess === "sources") {
                          const mappedSources: DocumentData[] = (
                            (jsonDataForThisEvent as ParsedJsonData).sources ||
                            []
                          ).map((doc) => ({
                            // Let TS infer 'doc' type from the source array
                            documentId:
                              doc.metadata?.documentId ||
                              `doc-${crypto.randomUUID()}`,
                            chunkId:
                              doc.metadata?.chunkId ||
                              `chunk-${crypto.randomUUID()}`,
                            originalFileName:
                              doc.metadata?.originalFileName ||
                              "Unknown Source",
                            pageNumber: doc.metadata?.pageNumber,
                            textToHighlight: doc.metadata?.textToHighlight,
                            // Ensure content is always a string for DocumentData
                            content: Array.isArray(doc.content)
                              ? doc.content
                                  .map((p) => p?.text || "")
                                  .join("\\n")
                              : "",
                            chunkIndex:
                              typeof doc.metadata?.chunkIndex === "number"
                                ? doc.metadata.chunkIndex
                                : -1,
                          }));
                          updatedMsg.sources = mappedSources;
                          console.log(
                            `[useChatManager] Updated message ${msg.id} with ${mappedSources.length} sources.`,
                          );
                        }
                        // Removed redundant 'chunk'/'text' check, handled above
                        else if (eventTypeToProcess === "tool_invocation") {
                          const toolData = jsonDataForThisEvent as {
                            name?: string;
                            input?: unknown;
                            output?: unknown;
                          };
                          if (!updatedMsg.toolInvocations)
                            updatedMsg.toolInvocations = [];
                          updatedMsg.toolInvocations.push({
                            toolName: toolData.name || "unknown_tool",
                            input:
                              typeof toolData.input === "object" &&
                              toolData.input !== null
                                ? (toolData.input as Record<string, unknown>)
                                : undefined,
                            output:
                              typeof toolData.output === "object" &&
                              toolData.output !== null
                                ? (toolData.output as Record<string, unknown>)
                                : undefined,
                          });
                          console.log(
                            `[useChatManager] Added tool invocation ${toolData.name} to message ${msg.id}.`,
                          );
                        } else if (eventTypeToProcess === "tool_invocations") {
                          if (!updatedMsg.toolInvocations)
                            updatedMsg.toolInvocations = [];
                          // Map incoming array to match ToolInvocation type
                          const incomingInvocations =
                            (jsonDataForThisEvent as Array<{
                              name?: string;
                              input?: unknown;
                              output?: unknown;
                            }>) || [];
                          updatedMsg.toolInvocations.push(
                            ...incomingInvocations.map((inv) => ({
                              toolName: inv.name || "unknown_tool", // Map 'name' to 'toolName'
                              input:
                                typeof inv.input === "object" &&
                                inv.input !== null
                                  ? (inv.input as Record<string, unknown>)
                                  : undefined,
                              output:
                                typeof inv.output === "object" &&
                                inv.output !== null
                                  ? (inv.output as Record<string, unknown>)
                                  : undefined,
                            })),
                          );
                        } else if (eventTypeToProcess === "error") {
                          const errorMsg =
                            (jsonDataForThisEvent as ParsedJsonData).error ||
                            "Unknown error";
                          console.error(
                            "Streaming error from server event:",
                            errorMsg,
                          );
                          toast({
                            title: "Stream Error",
                            description: errorMsg,
                            variant: "destructive",
                          });
                          updatedMsg.text += `\n\n[STREAM ERROR: ${errorMsg}]`;
                        } else if (eventTypeToProcess === "final_response") {
                          if (
                            (jsonDataForThisEvent as ParsedJsonData)
                              .sessionId &&
                            !currentSessionId
                          ) {
                            setCurrentSessionId(
                              (jsonDataForThisEvent as ParsedJsonData)
                                .sessionId,
                            );
                          }
                          // Safely update text and toolInvocations from final response
                          const finalData =
                            jsonDataForThisEvent as ParsedJsonData;
                          updatedMsg.text =
                            finalData.response ?? updatedMsg.text;
                          // Check if toolInvocations is an array before assigning
                          if (Array.isArray(finalData.toolInvocations)) {
                            // Assuming finalData.toolInvocations elements match ToolInvocation structure
                            // Add type assertion if necessary, based on how final_response sends tool data
                            updatedMsg.toolInvocations =
                              (finalData.toolInvocations as ToolInvocation[]) ??
                              updatedMsg.toolInvocations;
                          } else {
                            // Handle case where it's present but not an array, or keep existing
                            updatedMsg.toolInvocations =
                              updatedMsg.toolInvocations;
                          }
                        }
                        // If event type is not handled above, return message unchanged within this branch
                        return updatedMsg;
                      }
                      // If message ID doesn't match, return original message
                      return msg;
                    });
                    return updatedMessages;
                  }); // End setMessages
                } else if (parseError) {
                  // Check if parseError object was set during the try block
                  // Log errors only for non-text events where parsing failed unexpectedly
                  // This corresponds to the location of the user's original DEBUG_PARSE_ERROR log
                  console.error(
                    `DEBUG_PARSE_ERROR (per-event): EventType: \'${eventTypeToProcess}\'. Payload was: \'${dataPayload}\'. Error: ${parseError.message}`,
                  );
                }
                // If it was an ignored text fragment (jsonDataForThisEvent is undefined, parseError is null), no action is taken here.
              } // End if(dataPayload.trim())
              // End of simplified per-event parsing logic.
              // `accumulatedJsonString` (if still present in the outer scope) is not used by this block
              // to carry state between distinct SSE events processed by this `if (line === "")` block.
            } // End of processing event data

            // Reset event type and data lines for the next event
            currentSSEEventType = null;
            // currentSSEDataLines was already reset above if data was processed
            currentSSEDataLines = [];
          } else if (line.startsWith("event:")) {
            currentSSEEventType = line.substring(6).trim();
          } else if (line.startsWith("data:")) {
            currentSSEDataLines.push(line.substring(5)); // Store raw data part (leading space might exist)
          } else if (line.startsWith(":")) {
            // Comment, ignore
          } else {
            // Ignore other non-empty lines for robustness
          }
        } // End while(lineEndPos !== -1) - inner line processing loop
      } // End while(!done) - outer stream reading loop
      console.log("<<< Exiting main stream read loop"); // DEBUG Loop Exit

      // Final check: If stream ends and there's data left in accumulatedJsonString, it implies incomplete JSON at end of stream.
      if (accumulatedJsonString) {
        console.error(
          "SSE Stream ended with incomplete JSON data in accumulator:",
          accumulatedJsonString,
        );
        // Decide if you want to show an error to the user
        toast({
          title: "Response Error",
          description:
            "Stream ended unexpectedly, response might be incomplete.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error sending message (useChatManager):", error);
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      // Update placeholder message with error
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === botMessagePlaceholderId
            ? { ...msg, text: msg.text + `\n\n[ERROR: ${errorMessage}]` }
            : msg,
        ),
      );
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    // List ALL dependencies used inside useCallback
    userInput,
    isLoading,
    chatMode,
    selectedGeminiModelId,
    selectedOpenAIModelId,
    temperaturePreset,
    maxTokens,
    currentSessionId,
    uploadedFiles,
    tavilySearchEnabled,
    tavilyExtractEnabled,
    perplexitySearchEnabled,
    perplexityDeepResearchEnabled,
    setUserInput,
    setIsLoading,
    setMessages,
    setCurrentSessionId,
    toast, // Include setters used internally
    // Note: uploadedFiles & resetUploadedFiles are dependencies from props
    resetUploadedFiles,
  ]);

  // Function to clear the chat state
  const clearChat = useCallback(() => {
    setMessages([]);
    resetUploadedFiles(); // Call function passed via props
    setCurrentSessionId(undefined);
    toast({
      title: "Chat Cleared",
      description: "Ready for a new conversation.",
    });
  }, [setMessages, setCurrentSessionId, resetUploadedFiles, toast]); // Add dependencies

  return {
    messages,
    // setMessages, // Exposing setter is optional
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
