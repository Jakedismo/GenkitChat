"use client";

import { useState, useCallback } from "react";
import { ChatMessage, DocumentData, ToolInvocation, ParsedJsonData } from "@/types/chat";

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
            
              console.log(`[useChatMessages] Processing chunk for message ${msg.id} (${processedChunk.length} chars)`);
            
              // If replacing the text, ensure the new content isn't empty
              if (options?.replace && processedChunk.trim()) {
                return { 
                  ...msg, 
                  text: processedChunk 
                };
              } 
            
              // Otherwise append the text (default behavior)
              // Handle different text types when appending
              let updatedText: string;
            
              if (typeof msg.text === 'string') {
                // Simple string append
                updatedText = msg.text + processedChunk;
              } else if (Array.isArray(msg.text)) {
                // If text is an array, convert to string and append
                updatedText = msg.text.map(chunk => 
                  typeof chunk === 'string' ? chunk : 
                  (chunk && typeof chunk === 'object' && chunk.text) ? chunk.text : 
                  JSON.stringify(chunk)
                ).join('') + processedChunk;
              } else if (msg.text && typeof msg.text === 'object') {
                // If text is an object, try to extract content
                const existingText = msg.text.text || msg.text.content || JSON.stringify(msg.text);
                updatedText = (typeof existingText === 'string' ? existingText : JSON.stringify(existingText)) + processedChunk;
              } else {
                // Fallback for other types
                updatedText = String(msg.text || '') + processedChunk;
              }
            
              return { 
                ...msg, 
                text: updatedText
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
            
            // Handle potentially complex response structures
            if (finalResponse.response) {
              let processedResponse = '';
              
              // Handle response that's an array of text chunks (common in streaming responses)
              if (Array.isArray(finalResponse.response)) {
                console.log(`[useChatMessages] Processing array response with ${finalResponse.response.length} chunks`);
                processedResponse = finalResponse.response
                  .map(chunk => {
                    // Handle different chunk formats
                    if (typeof chunk === 'string') return chunk;
                    if (typeof chunk === 'object' && chunk !== null) {
                      // Extract text property if it exists
                      return chunk.text || JSON.stringify(chunk);
                    }
                    return String(chunk || '');
                  })
                  .join('');
              } else if (typeof finalResponse.response === 'object' && finalResponse.response !== null) {
                // Handle response that's an object with nested content
                if (finalResponse.response.content && Array.isArray(finalResponse.response.content)) {
                  console.log(`[useChatMessages] Processing object response with ${finalResponse.response.content.length} content chunks`);
                  processedResponse = finalResponse.response.content
                    .map(chunk => {
                      if (typeof chunk === 'string') return chunk;
                      if (typeof chunk === 'object' && chunk !== null) {
                        return chunk.text || JSON.stringify(chunk);
                      }
                      return String(chunk || '');
                    })
                    .join('');
                } else {
                  // Fallback for other object structures
                  processedResponse = JSON.stringify(finalResponse.response);
                }
              } else if (typeof finalResponse.response === 'string') {
                // Direct string response
                processedResponse = finalResponse.response;
              } else {
                // Fallback for other types
                processedResponse = String(finalResponse.response || '');
              }
              
              // Only update if we have actual content
              if (processedResponse.trim()) {
                console.log(`[useChatMessages] Updating message ${msg.id} with final response text (length: ${processedResponse.length})`);
                updatedMsg.text = processedResponse;
              } else {
                console.warn(`[useChatMessages] Empty processed response for message ${msg.id} - keeping existing text`);
              }
            } else {
              console.warn(`[useChatMessages] No response property in finalResponse for message ${msg.id}`);
            }
            
            if (Array.isArray(finalResponse.toolInvocations)) {
              // Assuming finalData.toolInvocations elements match ToolInvocation structure
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
        prevMessages.map((msg) => {
          if (msg.id === botMessageId) {
            // Check if this error is already injected to avoid duplicates
            if (msg.text.includes(`[ERROR: ${errorText}]`)) {
              return msg;
            }
            return { ...msg, text: msg.text + `\n\n[ERROR: ${errorText}]` };
          }
          return msg;
        }),
      );
    },
    [],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

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
            (item && typeof item === 'object' && item.text) ? item.text : 
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
  }, [setMessages]);

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
    // setMessages, // Expose if needed
  };
}