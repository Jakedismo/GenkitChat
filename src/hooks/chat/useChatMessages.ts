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
      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg.id === botMessageId) {
            const updatedMsg = { ...msg };
            let foundContent = false;
            
            try {
              // First priority: Check for Google/Gemini message.content array
              if (finalResponse.message?.content && Array.isArray(finalResponse.message.content)) {
                console.log(`[useChatMessages] Processing message.content array with ${finalResponse.message.content.length} items`);
                
                const contentParts = finalResponse.message.content.map((part: any) => {
                  if (typeof part === 'string') return part;
                  if (part && typeof part === 'object' && part.text) return part.text;
                  return JSON.stringify(part);
                });
                
                const fullText = contentParts.join('');
                console.log(`[useChatMessages] Joined message.content into text (${fullText.length} chars)`);
                
                if (fullText.trim()) {
                  updatedMsg.text = fullText;
                  foundContent = true;
                }
              }
              
              // Second priority: Check for custom.candidates structure
              if (!foundContent && finalResponse.custom?.candidates?.length > 0) {
                const candidate = finalResponse.custom.candidates[0];
                
                if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
                  console.log(`[useChatMessages] Processing candidate.content.parts with ${candidate.content.parts.length} items`);
                  
                  const contentParts = candidate.content.parts.map((part: any) => {
                    if (typeof part === 'string') return part;
                    if (part && typeof part === 'object' && part.text) return part.text;
                    return JSON.stringify(part);
                  });
                  
                  const fullText = contentParts.join('');
                  console.log(`[useChatMessages] Joined candidate.content.parts into text (${fullText.length} chars)`);
                  
                  if (fullText.trim()) {
                    updatedMsg.text = fullText;
                    foundContent = true;
                  }
                } else if (typeof candidate.content?.text === 'string') {
                  updatedMsg.text = candidate.content.text;
                  foundContent = true;
                }
              }
              
              // Third priority: Use response property
              if (!foundContent && finalResponse.response) {
                if (Array.isArray(finalResponse.response)) {
                  // Array response
                  const fullText = finalResponse.response
                    .map(chunk => {
                      if (typeof chunk === 'string') return chunk;
                      if (chunk && typeof chunk === 'object' && chunk.text) return chunk.text;
                      return JSON.stringify(chunk);
                    })
                    .join('');
                  
                  if (fullText.trim()) {
                    updatedMsg.text = fullText;
                    foundContent = true;
                  }
                } else if (typeof finalResponse.response === 'string') {
                  // String response
                  if (finalResponse.response.trim()) {
                    updatedMsg.text = finalResponse.response;
                    foundContent = true;
                  }
                } else if (finalResponse.response && typeof finalResponse.response === 'object') {
                  // Object response, might contain nested content
                  if (finalResponse.response.content && Array.isArray(finalResponse.response.content)) {
                    const fullText = finalResponse.response.content
                      .map((chunk: any) => {
                        if (typeof chunk === 'string') return chunk;
                        if (chunk && typeof chunk === 'object' && chunk.text) return chunk.text;
                        return JSON.stringify(chunk);
                      })
                      .join('');
                    
                    if (fullText.trim()) {
                      updatedMsg.text = fullText;
                      foundContent = true;
                    }
                  }
                }
              }
              
              if (!foundContent) {
                console.warn(`[useChatMessages] Could not extract valid content from finalResponse for message ${msg.id}`);
              } else {
                console.log(`[useChatMessages] Updated message ${msg.id} with final response (${typeof updatedMsg.text === 'string' ? updatedMsg.text.length : 'non-string'} chars)`);
              }
            } catch (error) {
              console.error(`[useChatMessages] Error processing finalResponse:`, error);
            }
            
            // Always add tool invocations if present
            if (Array.isArray(finalResponse.toolInvocations)) {
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