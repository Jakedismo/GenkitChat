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


          if (dataPayload) {
            try {
              const jsonData = JSON.parse(dataPayload);
              setMessages((prevMessages) => {
                const updatedMessages = prevMessages.map((msg) => {

                  if (msg.id === botMessagePlaceholderId) {

                    // Handle different event types
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
                      // AGGRESSIVE DIAGNOSTIC was here, reverting to normal concatenation.
                      return { ...msg, text: msg.text + (jsonData.text || "") };
                    } else if (eventType === "tool_invocation") { // Singular, from RAG
                      // jsonData is a single tool invocation object
                      return {
                        ...msg,
                        toolInvocations: [
                          ...(msg.toolInvocations || []),
                          ...(jsonData ? [jsonData] : []), // Wrap single object in array
                        ],
                      };
                    } else if (eventType === "tool_invocations") {
                      // TODO: Define ToolInvocation type properly if not already available via types/chat
                      // Assumes jsonData here is an array if this event type is used
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
                      // TODO: Define structure for jsonData.response if needed
                      if (jsonData.sessionId && !currentSessionId) {
                        setCurrentSessionId(jsonData.sessionId);
                      }
                      return {
                        ...msg,
                        text: jsonData.response ?? msg.text, // Corrected path for text
                        toolInvocations:
                          jsonData.toolInvocations ?? // Corrected path for toolInvocations
                          msg.toolInvocations,
                      };
                    }
                    return msg; // Return unchanged if eventType is unknown for this message
                  }
                  return msg; // Return other messages unchanged
                });
                return updatedMessages;
              });
            } catch (parseError) {
              console.error(
                "SSE JSON Parse Error (useChatManager):",
                parseError,
                "Data was:",
                dataPayload,
              );
              toast({
                title: "Response Error",
                description: "Received malformed data from server.",
                variant: "destructive",
              });
            }
          }
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
