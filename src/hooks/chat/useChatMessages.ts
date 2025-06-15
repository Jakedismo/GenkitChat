"use client";

import {
  ChatMessage,
  CitationMeta,
  DocumentData,
  ParsedJsonData,
  ToolInvocation,
} from "@/types/chat";
import { normalizeText } from "@/utils/message-normalization";
import { useCallback, useState } from "react";

export interface UseChatMessagesReturn {
  messages: ChatMessage[];
  addUserMessage: (text: string) => string; // Returns user message ID
  addBotPlaceholder: () => string; // Returns bot placeholder ID
  updateBotMessageText: (botMessageId: string, textChunk: string, options?: { replace?: boolean }) => void;
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
  fixTruncatedBotMessage: (botMessageId: string) => boolean; // Returns true if fixed, false if no fix needed
  clearMessages: () => void;
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
    (botMessageId: string, textChunk: string, options?: { replace?: boolean }) => {
      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg.id === botMessageId) {
            // Process the text chunk to handle any escaped characters
            const processedChunk = textChunk
              .replace(/\\"/g, '"')
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '\r')
              .replace(/\\t/g, '\t')
              .replace(/\\\\/g, '\\')
              .replace(/\\+$/, ''); // Remove trailing backslashes
            

            
            // If replacing the text, ensure the new content isn't empty
            if (options?.replace && processedChunk.trim()) {
              return {
                ...msg,
                text: processedChunk, // Corrected: Use processedChunk directly for replace
              };
            }


            // Otherwise append the text (default behavior) - IMMUTABLE
            let finalTextToAppend: string | string[] | { text?: string; [key: string]: unknown } = '';
 
            if (Array.isArray(msg.text)) {
              const originalArray = msg.text as string[];
              if (originalArray.length > 0 && typeof originalArray[originalArray.length - 1] === 'string') {
                finalTextToAppend = [
                  ...originalArray.slice(0, -1),
                  (originalArray[originalArray.length - 1] as string) + processedChunk,
                ];
              } else {
                finalTextToAppend = [...originalArray, processedChunk];
              }
            } else if (msg.text && typeof msg.text === 'object') {
              const originalObject = msg.text as { text?: string; content?: string; parts?: unknown[]; [key: string]: unknown };
              let handled = false;
 
              if (typeof originalObject.text === 'string') {
                finalTextToAppend = { ...originalObject, text: originalObject.text + processedChunk };
                handled = true;
              } else if (typeof originalObject.content === 'string') {
                finalTextToAppend = { ...originalObject, content: originalObject.content + processedChunk };
                handled = true;
              } else if (Array.isArray(originalObject.parts)) {
                const originalParts = originalObject.parts;
                let updatedParts;
                if (originalParts.length > 0 && typeof originalParts[originalParts.length - 1] === 'string') {
                  updatedParts = [
                    ...originalParts.slice(0, -1),
                    originalParts[originalParts.length - 1] + processedChunk,
                  ];
                } else {
                  updatedParts = [...originalParts, processedChunk];
                }
                finalTextToAppend = { ...originalObject, parts: updatedParts };
                handled = true;
              }

              if (!handled) {
                // Fallback: convert the existing object to string and append
                const baseString = originalObject.text || originalObject.content || JSON.stringify(originalObject);
                finalTextToAppend = baseString + processedChunk;
              }
            } else if (typeof msg.text === 'string') {
              finalTextToAppend = msg.text + processedChunk;
            } else {
              // Fallback for null, undefined, or other types
              finalTextToAppend = String(msg.text || '') + processedChunk;
            }

            return {
              ...msg,

              text: finalTextToAppend, // Corrected: Use the immutably created text
            };
          }
          return msg;
        }),
      );
    },
    [],
  );

  const updateBotMessageSources = useCallback(
    (botMessageId: string, sources: DocumentData[]) => {
      const citationSources: CitationMeta[] = sources.map((doc) => ({
        ...doc,
        fileName: doc.originalFileName,
      }));
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === botMessageId ? { ...msg, sources: citationSources } : msg,
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
                toolInvocations: [
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
      const extractors = [
        (response: ParsedJsonData) =>
          response.message?.content,
        (response: ParsedJsonData) =>
          response.custom?.candidates?.[0]?.content?.parts,
        (response: ParsedJsonData) =>
          response.response,
      ];

      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg.id === botMessageId) {
            const updatedMsg = { ...msg };
            let foundContent = false;

            for (const extractor of extractors) {
              const content = extractor(finalResponse);
              if (content) {
                const fullText = normalizeText(content);
                if (fullText.trim()) {
                  const existingText = normalizeText(msg.text);
                  if (
                    !existingText ||
                    existingText.length < 100 ||
                    fullText.length > existingText.length
                  ) {
                    updatedMsg.text = fullText;
                  }
                  foundContent = true;
                  break;
                }
              }
            }

            if (!foundContent) {
              console.warn(
                `[useChatMessages] Could not extract valid content from finalResponse for message ${msg.id}`,
              );
            }

            if (Array.isArray(finalResponse.toolInvocations)) {
              updatedMsg.toolInvocations =
                finalResponse.toolInvocations as ToolInvocation[];
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
        prevMessages.map((msg) => {
          if (msg.id === botMessageId) {
            // Check if this error is already injected to avoid duplicates
            if (msg.text && typeof msg.text === 'string' && msg.text.includes(`[ERROR: ${errorText}]`)) {
              return msg;
            }
            
            // Format error message to append to existing text
            const errorMsg = `\n\n[ERROR: ${errorText}]`;
            
            // Handle different message text formats
            if (typeof msg.text === 'string') {
              return { ...msg, text: msg.text + errorMsg };
            } else if (Array.isArray(msg.text)) {
              const textString = msg.text
                .map(chunk => typeof chunk === 'string' ? chunk : JSON.stringify(chunk))
                .join('');
              return { ...msg, text: textString + errorMsg };
            } else if (msg.text && typeof msg.text === 'object') {
              return { ...msg, text: JSON.stringify(msg.text) + errorMsg };
            } else {
              return { ...msg, text: String(msg.text || '') + errorMsg };
            }
          }
          return msg;
        }),
      );
    },
    [],
  );
  
  const fixTruncatedBotMessage = useCallback((botMessageId: string): boolean => {
    let wasFixed = false;
    
    setMessages((prevMessages) => {
      return prevMessages.map((msg) => {
        if (msg.id !== botMessageId || msg.sender !== 'bot') {
          return msg;
        }
        
        // Handle various text formats
        let textToFix: string = '';
        
        if (typeof msg.text === 'string') {
          textToFix = msg.text;
        } else if (Array.isArray(msg.text)) {
          // Join array items
          textToFix = msg.text.map(item =>
            typeof item === 'string' ? item :
            (item && typeof item === 'object' && 'text' in item && typeof (item as any).text === 'string') ? (item as any).text :
            JSON.stringify(item)
          ).join('');
          wasFixed = true;
        } else if (msg.text && typeof msg.text === 'object' && msg.text.text) {
          // Extract text property
          textToFix = typeof msg.text.text === 'string' ? msg.text.text : JSON.stringify(msg.text.text);
          wasFixed = true;
        } else if (msg.text && typeof msg.text === 'object') {
          // Stringify object
          textToFix = JSON.stringify(msg.text);
          wasFixed = true;
        } else {
          // Fallback for other types
          textToFix = String(msg.text || '');
          wasFixed = true;
        }
        
        // Check if the text appears to be truncated
        const suspiciousPatterns = [
          /[^.!?]\s*$/, // Ends without proper punctuation
          /\\$/, // Ends with a backslash
          /"$/, // Ends with a quote
          /[{\[]$/ // Ends with an opening brace/bracket
        ];
        
        const mightBeTruncated = suspiciousPatterns.some(pattern => 
          pattern.test(textToFix.substring(textToFix.length - 10))
        );
        
        if (mightBeTruncated) {
          // Fix potential truncation issues
          let fixedText = textToFix;
          
          // Balance code blocks
          const codeBlockCount = (fixedText.match(/```/g) || []).length;
          if (codeBlockCount % 2 !== 0) {
            fixedText += '\n```';
            wasFixed = true;
          }
          
          // Balance parentheses/brackets/braces
          const openBraces = (fixedText.match(/{/g) || []).length;
          const closeBraces = (fixedText.match(/}/g) || []).length;
          if (openBraces > closeBraces) {
            fixedText += '}'.repeat(openBraces - closeBraces);
            wasFixed = true;
          }
          
          const openBrackets = (fixedText.match(/\[/g) || []).length;
          const closeBrackets = (fixedText.match(/\]/g) || []).length;
          if (openBrackets > closeBrackets) {
            fixedText += ']'.repeat(openBrackets - closeBrackets);
            wasFixed = true;
          }
          
          // Remove trailing backslashes that might cause rendering issues
          if (fixedText.endsWith('\\')) {
            fixedText = fixedText.replace(/\\+$/, '');
            wasFixed = true;
          }
          
          return { ...msg, text: fixedText };
        }
        
        // If we've detected and fixed a complex structure but no truncation
        if (wasFixed) {
          return { ...msg, text: textToFix };
        }
        
        return msg;
      });
    });
    
    return wasFixed;
  }, []);

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
    fixTruncatedBotMessage,
    clearMessages,
  };
}