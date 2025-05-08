import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  ChatMessage,
  ChatMode,
  TemperaturePreset,
  UploadedFile,
  DocumentData, // Ensure DocumentData is imported
} from "@/types/chat";
import mermaid from "mermaid"; // Import mermaid
// Import Genkit/AI instance if needed for direct calls (currently fetch is used)
// import { aiInstance } from '@/lib/genkit-instance';
// Import Tool types if manipulating tool definitions directly
// import { GenkitTool } from 'genkit/tool';

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

  // Refs for scrolling
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

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
      if (lastMessage.sender === 'bot') {
        console.log('DEBUG: Last bot message state:', {
          id: lastMessage.id,
          textLength: lastMessage.text.length,
          hasToolInvocations: !!(lastMessage.toolInvocations && lastMessage.toolInvocations.length > 0),
          toolInvocationsCount: lastMessage.toolInvocations?.length || 0,
          toolInvocations: lastMessage.toolInvocations, // Log the actual data
          hasSources: !!(lastMessage.sources && lastMessage.sources.length > 0),
          sourcesCount: lastMessage.sources?.length || 0,
        });
        if (lastMessage.toolInvocations && lastMessage.toolInvocations.length > 0) {
          console.log('DEBUG: Tool invocations found on last bot message:', JSON.stringify(lastMessage.toolInvocations, null, 2));
        } else {
          console.log('DEBUG: No tool invocations on last bot message.');
        }
      }
    }
  }, [messages]);

  // Core function to handle sending a message
  const handleSendMessage = useCallback(async () => {
    if (!userInput.trim() || isLoading) return;

    let modelIdToUse: string | null = null;
    let errorDescription: string | null = null;

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
      let jsonAssemblyBuffer = ""; // Buffer to assemble fragmented JSON

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        let rawChunk = decoder.decode(value, { stream: !done });

        // Normalize literal "\\n" to actual newline "\n", then remove any CRs
        let normalizedChunk = rawChunk.replace(/\\n/g, "\n"); 
        normalizedChunk = normalizedChunk.replace(/\r/g, ""); // Remove any stray CRs

        buffer += normalizedChunk; 

        let boundary = buffer.indexOf("\n\n"); 
        while (boundary !== -1) {
          const eventData = buffer.substring(0, boundary);
          // The boundary is two newline characters.
          buffer = buffer.substring(boundary + 2); 

          let eventType = "message";
          let dataPayload = "";
          const lines = eventData.split("\n");
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.substring(6).trim();
            } else if (line.startsWith("data:")) {
              dataPayload += line.substring(5).trim();
            } // Ignore comments and empty lines
          }

          if (dataPayload) { // If current event provided data
            jsonAssemblyBuffer += dataPayload;
            // console.log(`SSE_BUFFER_APPEND: EventType: '${eventType}'. Buffer now: '${jsonAssemblyBuffer}'`);
          }

          // Try to parse if the assembly buffer has content
          if (jsonAssemblyBuffer) {
            // console.log(`SSE_PARSE_ATTEMPT: EventType: '${eventType}'. Trying to parse: '${jsonAssemblyBuffer}'`);
            try {
              const jsonData = JSON.parse(jsonAssemblyBuffer);
              
              // Successfully parsed a complete JSON object
              // console.log(`SSE_PARSE_SUCCESS: EventType: \\\'${eventType}\\\'. Parsed:`, jsonData);

              setMessages((prevMessages) => {
                const updatedMessages = prevMessages.map((msg) => {
                  if (msg.id === botMessagePlaceholderId) {
                    // Handle different event types based on the eventType of the current SSE event
                    // (which is the one that completed the JSON object)
                    if (eventType === "sources") {
                      const mappedSources: DocumentData[] = (
                        jsonData.sources || []
                      ).map((doc: any) => {
                        const textContent = (doc.content || [])
                          .filter(
                            (part: any) =>
                              part && typeof part.text === "string",
                          )
                          .map((part: any) => part.text)
                          .join("\n\n");
                        return {
                          documentId:
                            doc.metadata?.documentId ||
                            `doc-${crypto.randomUUID()}`,
                          chunkId:
                            doc.metadata?.chunkId ||
                            `chunk-${crypto.randomUUID()}`,
                          originalFileName:
                            doc.metadata?.originalFileName || "Unknown Source",
                          chunkIndex:
                            typeof doc.metadata?.chunkIndex === "number"
                              ? doc.metadata.chunkIndex
                              : -1,
                          content: textContent,
                        };
                      });
                      return { ...msg, sources: mappedSources };
                    } else if (eventType === "chunk" || eventType === "text") {
                      return { ...msg, text: msg.text + (jsonData.text || "") };
                    } else if (eventType === "tool_invocation") { 
                      return {
                        ...msg,
                        toolInvocations: [
                          ...(msg.toolInvocations || []),
                          ...(jsonData ? [jsonData] : []), 
                        ],
                      };
                    } else if (eventType === "tool_invocations") { 
                      return {
                        ...msg,
                        toolInvocations: [
                          ...(msg.toolInvocations || []),
                          ...(jsonData || []),
                        ],
                      };
                    } else if (eventType === "error") {
                      console.error(
                        "Streaming error from server event:",
                        jsonData.error,
                      );
                      toast({
                        title: "Stream Error",
                        description: jsonData.error || "Unknown error",
                        variant: "destructive",
                      });
                      return {
                        ...msg,
                        text:
                          msg.text +
                          `\n\n[STREAM ERROR: ${jsonData.error || "Unknown error"}]`,
                      };
                    } else if (eventType === "final_response") {
                      if (jsonData.sessionId && !currentSessionId) {
                        setCurrentSessionId(jsonData.sessionId);
                      }
                      return {
                        ...msg,
                        text: jsonData.response ?? msg.text, 
                        toolInvocations:
                          jsonData.toolInvocations ?? 
                          msg.toolInvocations,
                      };
                    }
                    return msg; 
                  }
                  return msg; 
                });
                return updatedMessages;
              });

              jsonAssemblyBuffer = ""; // Reset buffer after successful processing
            } catch (parseError) {
              if (parseError instanceof SyntaxError) {
                // JSON is likely incomplete. Hold data in buffer and wait for more.
                // console.log(`SSE_PARSE_INCOMPLETE: EventType: '${eventType}'. Buffer: '${jsonAssemblyBuffer}'. Error: ${parseError.message}`);
              } else {
                // A non-SyntaxError occurred
                console.error(
                  "SSE JSON Non-Syntax Parse Error (useChatManager - assembled):",
                  parseError,
                  "Data was:",
                  jsonAssemblyBuffer,
                );
                toast({
                  title: "Response Error",
                  description: "Received unrecoverable malformed data from server.",
                  variant: "destructive",
                });
                jsonAssemblyBuffer = ""; // Clear buffer on other errors to prevent carry-over
              }
            }
          } else if (!dataPayload && !jsonAssemblyBuffer) { 
            // Current event is empty and buffer is empty. This isn't an error.
            // console.log(`SSE_EVENT_NO_DATA: EventType: '${eventType}'. No data in current event, assembly buffer is empty.`);
          }
 
        // Look for the *next* message boundary in the remaining buffer
          boundary = buffer.indexOf("\n\n"); 
        }
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
