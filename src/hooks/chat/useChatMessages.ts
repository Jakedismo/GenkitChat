"use client";

import { useState, useCallback } from "react";
import { ChatMessage, DocumentData, ToolInvocation, ParsedJsonData } from "@/types/chat";

export interface UseChatMessagesReturn {
  messages: ChatMessage[];
  addUserMessage: (text: string) => string; // Returns user message ID
  addBotPlaceholder: () => string; // Returns bot placeholder ID
  updateBotMessageText: (botMessageId: string, textChunk: string) => void;
  updateBotMessageSources: (botMessageId: string, sources: DocumentData[]) => void;
  addToolInvocationToBotMessage: (
    botMessageId: string,
    toolInvocation: ToolInvocation,
  ) => void;
  addMultipleToolInvocationsToBotMessage: ( // For final_response or tool_invocations event
    botMessageId: string,
    toolInvocations: ToolInvocation[],
  ) => void;
  updateBotMessageFromFinalResponse: ( // For final_response event
    botMessageId: string,
    finalResponse: ParsedJsonData, // Using ParsedJsonData for now, might need a more specific type
  ) => void;
  injectErrorIntoBotMessage: (botMessageId: string, error: string) => void;
  clearMessages: () => void;
  // Expose setMessages directly if needed for complex/direct manipulations not covered by helpers
  // setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>; 
}

export function useChatMessages(): UseChatMessagesReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const addUserMessage = useCallback((text: string): string => {
    const userMessageId = crypto.randomUUID();
    const userMessage: ChatMessage = {
      id: userMessageId,
      sender: "user",
      text,
    };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    return userMessageId;
  }, []);

  const addBotPlaceholder = useCallback((): string => {
    const botMessageId = crypto.randomUUID();
    const botMessagePlaceholder: ChatMessage = {
      id: botMessageId,
      sender: "bot",
      text: "",
      toolInvocations: [],
      sources: [],
    };
    setMessages((prevMessages) => [...prevMessages, botMessagePlaceholder]);
    return botMessageId;
  }, []);

  const updateBotMessageText = useCallback(
    (botMessageId: string, textChunk: string) => {
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === botMessageId
            ? { ...msg, text: msg.text + textChunk }
            : msg,
        ),
      );
    },
    [],
  );

  const updateBotMessageSources = useCallback(
    (botMessageId: string, sources: DocumentData[]) => {
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === botMessageId ? { ...msg, sources } : msg,
        ),
      );
    },
    [],
  );
  
  const addToolInvocationToBotMessage = useCallback(
    (botMessageId: string, toolInvocation: ToolInvocation) => {
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === botMessageId
            ? {
                ...msg,
                toolInvocations: [
                  ...(msg.toolInvocations || []),
                  toolInvocation,
                ],
              }
            : msg,
        ),
      );
    },
    [],
  );

  const addMultipleToolInvocationsToBotMessage = useCallback(
    (botMessageId: string, toolInvocations: ToolInvocation[]) => {
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === botMessageId
            ? {
                ...msg,
                toolInvocations: [ // Can decide to append or replace based on desired behavior
                  ...(msg.toolInvocations || []), 
                  ...toolInvocations
                ],
              }
            : msg,
        ),
      );
    },
    [],
  );
  
  const updateBotMessageFromFinalResponse = useCallback(
    (botMessageId: string, finalResponse: ParsedJsonData) => {
      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg.id === botMessageId) {
            const updatedMsg = { ...msg };
            if (finalResponse.response) {
              updatedMsg.text = finalResponse.response;
            }
            if (Array.isArray(finalResponse.toolInvocations)) {
              // Assuming finalData.toolInvocations elements match ToolInvocation structure
              // If they need mapping, it should be done here or before calling this function
              updatedMsg.toolInvocations = finalResponse.toolInvocations as ToolInvocation[];
            }
            return updatedMsg;
          }
          return msg;
        }),
      );
    },
    [],
  );

  const injectErrorIntoBotMessage = useCallback(
    (botMessageId: string, errorText: string) => {
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === botMessageId
            ? { ...msg, text: msg.text + `\n\n[ERROR: ${errorText}]` }
            : msg,
        ),
      );
    },
    [],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
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
    // setMessages, // Expose if needed
  };
}