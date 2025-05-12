"use client";

import { useCallback } from "react";
import { safeDestr } from "destr";
import { DocumentData, ToolInvocation, ParsedJsonData } from "@/types/chat"; // Assuming types are in @/types/chat

export interface StreamEventCallbacks {
  onText: (textChunk: string) => void;
  onSources: (sources: DocumentData[]) => void;
  onToolInvocation: (toolInvocation: ToolInvocation) => void;
  onMultipleToolInvocations: (toolInvocations: ToolInvocation[]) => void;
  onFinalResponse: (
    finalData: ParsedJsonData,
    serverSessionId?: string,
  ) => void;
  onStreamError: (errorMessage: string) => void;
  onStreamEnd?: () => void; // Optional: if specific actions are needed when the stream cleanly ends
  onReaderDone?: () => void; // Optional: callback for when the reader itself is done
}

// This hook doesn't manage state itself but encapsulates the stream processing logic.
// It could be a simple utility function rather than a hook if it doesn't need React context/hooks.
// For now, making it a function that can be called. If it needs to be a hook (e.g. for internal state or effects),
// we can wrap it in useCallback or define it as `export function useProcessStream() { return processStream; }`
// For simplicity, let's make `processStream` directly callable.

export async function processStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: StreamEventCallbacks,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  let currentSSEEventType: string | null = null;
  let currentSSEDataLines: string[] = [];
  let done = false;

  console.log(">>> [useChatStreaming] Entering main stream read loop");

  while (!done) {
    try {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;

      if (done) {
        console.log(">>> [useChatStreaming] Reader is done.");
        if (callbacks.onReaderDone) {
          callbacks.onReaderDone();
        }
        // Process any remaining buffer content if the stream ends unexpectedly
        // or if the last event didn't have a trailing newline.
        // However, SSE usually relies on the blank line for event termination.
        // If buffer has content here, it might be an incomplete event.
        if (buffer.trim()) {
          console.warn(
            "[useChatStreaming] Stream ended with unprocessed data in buffer:",
            buffer,
          );
          // Attempt to process the last line if it seems like a data line without a newline
          if (currentSSEDataLines.length > 0 && buffer.startsWith("data:")) {
            currentSSEDataLines.push(buffer.substring(5));
          }
        }
        // Final processing of any pending event data before breaking
        if (currentSSEDataLines.length > 0) {
          processSseEvent(currentSSEEventType, currentSSEDataLines, callbacks);
        }
        break;
      }

      const rawChunk = decoder.decode(value, { stream: true }); // stream: true is important for multi-byte characters
      let normalizedChunk = rawChunk.replace(/\\n/g, "\n").replace(/\r/g, "");
      buffer += normalizedChunk;

      let lineEndPos;
      while ((lineEndPos = buffer.indexOf("\n")) !== -1) {
        const line = buffer.substring(0, lineEndPos);
        buffer = buffer.substring(lineEndPos + 1);

        if (line === "") {
          // Empty line: event boundary
          if (currentSSEDataLines.length > 0) {
            processSseEvent(
              currentSSEEventType,
              currentSSEDataLines,
              callbacks,
            );
          }
          currentSSEEventType = null;
          currentSSEDataLines = [];
        } else if (line.startsWith("event:")) {
          currentSSEEventType = line.substring(6).trim();
        } else if (line.startsWith("data:")) {
          currentSSEDataLines.push(line.substring(5).trim()); // Trim individual data lines
        } else if (line.startsWith(":")) {
          // Comment, ignore
        } else {
          // Ignore other non-empty lines for robustness
        }
      }
    } catch (error) {
      console.error("[useChatStreaming] Error reading from stream:", error);
      callbacks.onStreamError(
        error instanceof Error ? error.message : "Unknown stream reading error",
      );
      done = true; // Terminate loop on error
    }
  }

  console.log("<<< [useChatStreaming] Exiting main stream read loop");
  if (callbacks.onStreamEnd) {
    callbacks.onStreamEnd();
  }
}

function processSseEvent(
  eventType: string | null,
  dataLines: string[],
  callbacks: StreamEventCallbacks,
): void {
  const eventTypeToProcess = eventType || "message"; // Default event type
  const joinedDataPayload = dataLines.join(""); // Data lines are already trimmed

  if (!joinedDataPayload.trim()) {
    return; // Skip empty data payloads
  }

  console.log(
    `[useChatStreaming] Processing SSE Event: Type='${eventTypeToProcess}', Payload='${joinedDataPayload}'`,
  );
      
  // For debugging problematic payloads
  if (eventTypeToProcess === 'final_response') {
    console.log(
      `[useChatStreaming] Final response payload (char by char): ${
        Array.from(joinedDataPayload).map(c => 
          c === '\\' ? '\\\\' : 
          c === '\n' ? '\\n' : 
          c === '\r' ? '\\r' : 
          c === '\t' ? '\\t' : c
        ).join('')
      }`
    );
  }

  // MODIFICATION: Treat 'chunk' like 'text'
  if (eventTypeToProcess === "text" || eventTypeToProcess === "chunk") {
    let textContent = "";
    let parsedSuccessfully = false;

    // Log chunk details for debugging
    console.log(`[useChatStreaming] Processing ${eventTypeToProcess} event, length: ${joinedDataPayload.length}`);
    
    // First, handle backslashes and special characters to prevent JSON parsing issues
    const safePayload = joinedDataPayload
      .replace(/\\/g, '\\\\')  // Double-escape backslashes first to prevent escaping issues
      .replace(/\n/g, '\\n')   // Replace literal newlines with \n escape sequence
      .replace(/\r/g, '\\r')   // Replace literal carriage returns with \r escape sequence
      .replace(/\t/g, '\\t');  // Replace literal tabs with \t escape sequence

    // Check if it's likely a JSON-like structure intended to contain text
    // A more comprehensive check: starts with '{' and includes "text" or "content" substrings
    const isPotentialJsonTextContainer =
      joinedDataPayload.startsWith("{") && 
      (joinedDataPayload.includes('"text"') || joinedDataPayload.includes('"content"'));

    if (isPotentialJsonTextContainer) {
      try {
        // First attempt with sanitized payload
        const parsedAsJson = safeDestr<{ text?: string; parts?: {text?: string}[] }>(safePayload);
        
        // Handle different JSON structures we might receive
        if (parsedAsJson && typeof parsedAsJson.text === "string") {
          // Direct text field
          textContent = parsedAsJson.text;
          parsedSuccessfully = true;
          console.log(`[useChatStreaming] Successfully parsed JSON text of length: ${textContent.length}`);
        } else if (parsedAsJson && Array.isArray(parsedAsJson.parts)) {
          // Parts array structure (from chunked responses)
          // Instead of just finding one part, concatenate all text parts
          let combinedText = "";
          for (const part of parsedAsJson.parts) {
            if (part && typeof part.text === 'string') {
              combinedText += part.text;
            }
          }
          
          if (combinedText) {
            textContent = combinedText;
            parsedSuccessfully = true;
            console.log(`[useChatStreaming] Combined ${parsedAsJson.parts.length} text parts, total length: ${textContent.length}`);
          }
        }
      } catch (e) {
        // JSON parsing failed with sanitized payload
        try {
          // Try broader regex pattern for extraction as a fallback
          const matches = safePayload.matchAll(/"(?:text|content)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g);
          let allMatches = "";
          
          for (const match of matches) {
            if (match && match[1]) {
              // Properly unescape the extracted content
              const matchText = match[1]
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t')
                .replace(/\\\\/g, '\\')
                .replace(/\\"/g, '"');
              allMatches += matchText;
            }
          }
          
          if (allMatches) {
            textContent = allMatches;
            parsedSuccessfully = true;
            console.log(`[useChatStreaming] Extracted text via regex, length: ${textContent.length}`);
          }
        } catch (e2) {
          console.error(
            `[useChatStreaming] Both JSON parsing methods failed for ${eventTypeToProcess} event payload: ${(e as Error).message}. Payload: '${joinedDataPayload}'`,
          );
          // Fall through to manual extraction or raw text handling
        }
      }
    }

    if (!parsedSuccessfully) {
      // More aggressive extraction for partially formed JSON
      if (joinedDataPayload.includes('"text":"')) {
        try {
          // Extract ALL content between text:" patterns
          let extractedText = "";
          const regex = /"text":"(.*?)(?<!\\)(?:"|$)/gs;
          let match;
          
          while ((match = regex.exec(joinedDataPayload)) !== null) {
            if (match[1]) {
              extractedText += match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            }
          }
          
          if (extractedText) {
            textContent = extractedText;
            parsedSuccessfully = true;
            console.log(`[useChatStreaming] Advanced extraction found text of length: ${textContent.length}`);
          }
        } catch (e) {
          console.warn(`[useChatStreaming] Advanced text extraction failed: ${e}`);
        }
      }
      
      // If still not successful, try the original method
      if (!parsedSuccessfully) {
        if (joinedDataPayload.startsWith('{\"text\":\"')) {
          // Existing manual extraction for {\"text\":\"...\"}
          let extracted = joinedDataPayload.substring('{\"text\":\"'.length);
          if (joinedDataPayload.endsWith('\"}')) {
            textContent = extracted.slice(0, -2); // Remove \"}
          } else if (joinedDataPayload.endsWith('\"')) {
            textContent = extracted.slice(0, -1); // Remove \"
          } else {
            // Likely an unterminated string, e.g. {\"text\":\"foo
            textContent = extracted;
          }
          console.warn(
            `[useChatStreaming] ${eventTypeToProcess} event payload was not valid JSON or did not match expected structure. Manually extracted: '${textContent.length} chars'`,
          );
        } else if (
          eventTypeToProcess === "chunk" &&
          !isPotentialJsonTextContainer
        ) {
          // For 'chunk' events without JSON structure, treat as raw text
          textContent = joinedDataPayload;
          console.warn(
            `[useChatStreaming] 'chunk' event payload not recognized as JSON text structure. Treating as raw text of length: ${textContent.length}`,
          );
        } else if (isPotentialJsonTextContainer) {
          // It was identified as potential JSON but parsing failed
          console.warn(
            `[useChatStreaming] ${eventTypeToProcess} event was JSON-like but text extraction failed. Payload length: ${joinedDataPayload.length}`,
          );
          
          // Extract all text between any quoted strings after "text":
          try {
            const regex = /"text"\s*:\s*"([^"]*)"/g;
            let match;
            let extractedContent = "";
            
            while ((match = regex.exec(joinedDataPayload)) !== null) {
              if (match[1]) {
                extractedContent += match[1];
              }
            }
            
            if (extractedContent) {
              textContent = extractedContent;
              console.log(`[useChatStreaming] Last resort extraction succeeded, length: ${textContent.length}`);
            }
          } catch (e) {
            // Keep textContent empty if all extraction attempts failed
          }
        } else {
          // Default fallback: use raw text
          textContent = joinedDataPayload;
          console.warn(
            `[useChatStreaming] ${eventTypeToProcess} event payload not recognized as structured text. Using raw text of length: ${textContent.length}`,
          );
        }
      }
    }

    // Always send non-empty text content to the callback
    if (textContent) {
      // Unescape any lingering escape sequences in the final text content
      const finalText = textContent
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      
      console.log(`[useChatStreaming] Sending text chunk of length: ${finalText.length}`);
      callbacks.onText(finalText);
    } else if (joinedDataPayload) {
      // If extraction completely failed but payload wasn't empty
      callbacks.onText("");
      console.warn(
        `[useChatStreaming] ${eventTypeToProcess} event processing resulted in empty textContent from non-empty payload of length: ${joinedDataPayload.length}`,
      );
    }
    // If both joinedDataPayload and textContent are empty, onText won't be called.
  } else {
    // Handle other event types that expect well-formed JSON
    try {
      // Comprehensive payload sanitization for JSON parsing
      let sanitizedPayload = joinedDataPayload;
      
      // Step 1: Log the raw payload for debugging serious issues
      if (eventTypeToProcess === 'final_response') {
        console.log(`[useChatStreaming] Raw ${eventTypeToProcess} payload: `, 
          joinedDataPayload.slice(0, 100) + (joinedDataPayload.length > 100 ? '...' : ''));
      }
      
      // Step 2: Handle special characters and escaping comprehensively
      
      // First handle trailing backslashes which often cause JSON parsing errors
      const trailingBackslashMatch = sanitizedPayload.match(/\\+$/);
      if (trailingBackslashMatch) {
        console.warn(
          `[useChatStreaming] Detected ${trailingBackslashMatch[0].length} trailing backslash(es) in ${eventTypeToProcess} event`
        );
        
        // For odd number of trailing backslashes, add one more to properly escape
        if (trailingBackslashMatch[0].length % 2 !== 0) {
          sanitizedPayload = sanitizedPayload + '\\';
        }
      }
      
      // Check for and fix common JSON structure issues
      if (sanitizedPayload.includes('"response":"')) {
        // Check for unterminated response string (missing closing quote and brace)
        if (!sanitizedPayload.includes('"}') && !sanitizedPayload.match(/"response":".*?(?<!\\)"/)) {
          console.warn(
            `[useChatStreaming] Detected unterminated response string in ${eventTypeToProcess} event, attempting repair`
          );
          
          // Proper termination based on context
          if (sanitizedPayload.includes('","toolInvocations":')) {
            // If we have a partial structure, preserve it
            const partialMatch = sanitizedPayload.match(/(.*?"response":"[^"]*)/);
            if (partialMatch) {
              const partial = partialMatch[1];
              sanitizedPayload = partial + '","toolInvocations":[],"sessionId":""}';
            } else {
              sanitizedPayload = sanitizedPayload + '"}';
            }
          } else {
            // Simple termination
            sanitizedPayload = sanitizedPayload + '","toolInvocations":[],"sessionId":""}';
          }
        }
      }
      
      // Apply comprehensive character escaping
      sanitizedPayload = sanitizedPayload
        .replace(/\\/g, '\\\\')    // Must come first to avoid double-escaping
        .replace(/\n/g, '\\n')     // Newlines
        .replace(/\r/g, '\\r')     // Carriage returns
        .replace(/\t/g, '\\t')     // Tabs
        .replace(/[\u0000-\u001F]/g, match => `\\u${match.charCodeAt(0).toString(16).padStart(4, '0')}`); // Control chars
        
      // Log the sanitized payload for debugging
      if (eventTypeToProcess === 'final_response') {
        console.log(`[useChatStreaming] Sanitized payload for JSON parsing (first 100 chars): ${sanitizedPayload.slice(0, 100)}...`);
      }
        
      // Attempt to parse the sanitized JSON
      let jsonData;
      try {
        jsonData = safeDestr<any>(sanitizedPayload);
      } catch (parseError) {
        console.error(`[useChatStreaming] Initial JSON parse failed: ${parseError}`);
        // Fallback to JSON.parse with try/catch for more specific error information
        try {
          jsonData = JSON.parse(sanitizedPayload);
        } catch (jsonError) {
          console.error(`[useChatStreaming] Both parsing methods failed: ${jsonError}`);
          jsonData = undefined;
        }
      }
      
      if (jsonData === undefined && joinedDataPayload.trim().length > 0) {
        // If safeDestr returns undefined for a non-empty payload, it means parsing failed.
        console.error(
          `[useChatStreaming] JSON parsing failed for ${eventTypeToProcess} event with payload: ${joinedDataPayload}`
        );
        throw new Error(
          `Parsing failed: Could not parse ${eventTypeToProcess} data. The response may be incomplete.`,
        );
      }

      switch (eventTypeToProcess) {
        case "sources":
          if (jsonData?.sources && Array.isArray(jsonData.sources)) {
            const mappedSources: DocumentData[] = jsonData.sources.map(
              (doc: any) => ({
                documentId:
                  doc.metadata?.documentId || `doc-${crypto.randomUUID()}`,
                chunkId:
                  doc.metadata?.chunkId || `chunk-${crypto.randomUUID()}`,
                originalFileName:
                  doc.metadata?.originalFileName || "Unknown Source",
                pageNumber: doc.metadata?.pageNumber,
                textToHighlight: doc.metadata?.textToHighlight,
                content: Array.isArray(doc.content)
                  ? doc.content.map((p: any) => p?.text || "").join("\n")
                  : typeof doc.content === "string"
                    ? doc.content
                    : "",
                chunkIndex:
                  typeof doc.metadata?.chunkIndex === "number"
                    ? doc.metadata.chunkIndex
                    : -1,
              }),
            );
            callbacks.onSources(mappedSources);
          } else {
            console.warn(
              `[useChatStreaming] 'sources' event missing or malformed 'sources' array. Payload:`,
              joinedDataPayload,
            );
          }
          break;
        case "tool_invocation":
          const toolData = jsonData as {
            name?: string;
            input?: unknown;
            output?: unknown;
          };
          const newToolInvocation: ToolInvocation = {
            toolName: toolData.name || "unknown_tool",
            input:
              typeof toolData.input === "object" && toolData.input !== null
                ? (toolData.input as Record<string, unknown>)
                : undefined,
            output:
              typeof toolData.output === "object" && toolData.output !== null
                ? (toolData.output as Record<string, unknown>)
                : undefined,
          };
          callbacks.onToolInvocation(newToolInvocation);
          break;
        case "tool_invocations":
          const incomingInvocations =
            (jsonData as Array<{
              name?: string;
              input?: unknown;
              output?: unknown;
            }>) || [];
          const mappedToolInvocations: ToolInvocation[] =
            incomingInvocations.map((inv) => ({
              toolName: inv.name || "unknown_tool",
              input:
                typeof inv.input === "object" && inv.input !== null
                  ? (inv.input as Record<string, unknown>)
                  : undefined,
              output:
                typeof inv.output === "object" && inv.output !== null
                  ? (inv.output as Record<string, unknown>)
                  : undefined,
            }));
          callbacks.onMultipleToolInvocations(mappedToolInvocations);
          break;
        case "error":
          const errorMsg =
            (jsonData as ParsedJsonData).error || "Unknown server error event";
          callbacks.onStreamError(errorMsg);
          break;
        case "final_response":
          try {
            // Advanced validation and recovery for final_response
            if (!jsonData) {
              console.error("[useChatStreaming] final_response contained null or undefined jsonData");
              
              // Comprehensive manual extraction as a last resort
              if (joinedDataPayload.includes('"response":"')) {
                try {
                  // More robust pattern matching for complete response content
                  // This regex captures the entire content between response:" and the next unescaped quote
                  const responsePattern = /"response":"((?:\\.|[^"\\])*)(?<!\\)"/s;
                  const responseMatch = joinedDataPayload.match(responsePattern);
                  const sessionIdMatch = joinedDataPayload.match(/"sessionId":"([^"]+)"/);
                  
                  if (responseMatch && responseMatch[1]) {
                    // Properly unescape the extracted content
                    const extractedText = responseMatch[1]
                      .replace(/\\"/g, '"')
                      .replace(/\\n/g, '\n')
                      .replace(/\\r/g, '\r')
                      .replace(/\\t/g, '\t')
                      .replace(/\\\\/g, '\\');
                      
                    jsonData = {
                      response: extractedText,
                      sessionId: sessionIdMatch ? sessionIdMatch[1] : "",
                      toolInvocations: []
                    };
                    console.log(`[useChatStreaming] Recovered final_response data via manual parsing, length: ${extractedText.length}`);
                  } else {
                    // Try a more comprehensive extraction that captures all text
                    // This handles cases where the JSON is malformed but contains the full response
                    let fullText = "";
                    let startIdx = joinedDataPayload.indexOf('"response":"');
                    
                    if (startIdx >= 0) {
                      startIdx += '"response":"'.length;
                      let endQuotePos = -1;
                      let escaped = false;
                      
                      // Manually parse the string to handle escaped quotes correctly
                      for (let i = startIdx; i < joinedDataPayload.length; i++) {
                        if (joinedDataPayload[i] === '\\') {
                          escaped = !escaped; // Toggle escape state
                          continue;
                        }
                        
                        if (joinedDataPayload[i] === '"' && !escaped) {
                          endQuotePos = i;
                          break;
                        }
                        
                        if (escaped) {
                          escaped = false;
                        }
                      }
                      
                      if (endQuotePos > startIdx) {
                        fullText = joinedDataPayload.substring(startIdx, endQuotePos)
                          .replace(/\\"/g, '"')
                          .replace(/\\n/g, '\n')
                          .replace(/\\r/g, '\r')
                          .replace(/\\t/g, '\t')
                          .replace(/\\\\/g, '\\');
                      } else {
                        // If we can't find the closing quote, take everything after "response":"
                        fullText = joinedDataPayload.substring(startIdx)
                          .replace(/\\"/g, '"')
                          .replace(/\\n/g, '\n')
                          .replace(/\\r/g, '\r')
                          .replace(/\\t/g, '\t')
                          .replace(/\\\\/g, '\\');
                      }
                      
                      if (fullText) {
                        jsonData = {
                          response: fullText,
                          sessionId: sessionIdMatch ? sessionIdMatch[1] : "",
                          toolInvocations: []
                        };
                        console.log(`[useChatStreaming] Recovered full response text via manual extraction, length: ${fullText.length}`);
                      } else {
                        throw new Error("Failed to extract meaningful response content");
                      }
                    } else {
                      throw new Error("All manual parsing methods failed");
                    }
                  }
                } catch (manualParseError) {
                  console.error(`[useChatStreaming] Manual parsing error: ${manualParseError}`);
                  
                  // Last resort: construct minimal valid response
                  jsonData = {
                    response: "Error: Could not parse complete response. Please try again.",
                    sessionId: "",
                    toolInvocations: []
                  };
                }
              } else {
                throw new Error("Response data is missing required 'response' field");
              }
            }
            
            // Ensure all required fields exist and have valid types
            if (jsonData.response !== undefined) {
              // Ensure response is a properly cleaned string
              if (typeof jsonData.response !== 'string') {
                jsonData.response = String(jsonData.response);
              }
              
              // Check if the response appears truncated by looking for abrupt endings
              const responseText = jsonData.response;
              const lastSentenceBreak = Math.max(
                responseText.lastIndexOf('. '),
                responseText.lastIndexOf('.\n'),
                responseText.lastIndexOf('? '),
                responseText.lastIndexOf('! ')
              );
              
              // If no sentence break found in the last 20% of the text, it might be truncated
              if (lastSentenceBreak > 0 && lastSentenceBreak < responseText.length * 0.8) {
                console.warn(`[useChatStreaming] Response may be truncated: last sentence break at ${lastSentenceBreak}/${responseText.length}`);
              }
              
              // At this point, jsonData.response is the string as parsed by safeDestr (or after String() conversion).
              // Standard JSON unescaping (like \\n to \n, \\\" to \") should have already occurred.

              // First check for raw message structure with content array (most common case causing truncation)
              if (jsonData.message && jsonData.message.content && Array.isArray(jsonData.message.content)) {
                console.log(`[useChatStreaming] Found message.content array with ${jsonData.message.content.length} items`);
                // Extract and join text from all content parts
                const contentParts = jsonData.message.content.map((part: any) => {
                  if (typeof part === 'string') return part;
                  if (part && typeof part === 'object' && part.text) return part.text;
                  return JSON.stringify(part);
                });
                jsonData.response = contentParts.join('');
                console.log(`[useChatStreaming] Joined message.content array parts into response (${jsonData.response.length} chars)`);
              }
              // Check for candidates array structure
              else if (jsonData.custom && jsonData.custom.candidates && Array.isArray(jsonData.custom.candidates) && jsonData.custom.candidates.length > 0) {
                const candidate = jsonData.custom.candidates[0];
                if (candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts)) {
                  console.log(`[useChatStreaming] Found candidate content parts array with ${candidate.content.parts.length} items`);
                  // Extract and join text from all content parts
                  const contentParts = candidate.content.parts.map((part: any) => {
                    if (typeof part === 'string') return part;
                    if (part && typeof part === 'object' && part.text) return part.text;
                    return JSON.stringify(part);
                  });
                  jsonData.response = contentParts.join('');
                  console.log(`[useChatStreaming] Joined candidate content parts into response (${jsonData.response.length} chars)`);
                }
              }
              // Check if the response itself is a string that looks like stringified JSON (nested JSON)
              else if (typeof jsonData.response === 'string' && jsonData.response.startsWith('{') && jsonData.response.endsWith('}')) {
                try {
                  const nestedJson = JSON.parse(jsonData.response); // Attempt to parse it
                  // Check for known tool response structures and extract the actual content string
                  if (nestedJson.perplexityDeepResearch_response?.content?.response && typeof nestedJson.perplexityDeepResearch_response.content.response === 'string') {
                    jsonData.response = nestedJson.perplexityDeepResearch_response.content.response;
                    console.log("[useChatStreaming] Extracted content from nested Perplexity response.");
                  } else if (nestedJson.tavilySearch_response?.result && typeof nestedJson.tavilySearch_response.result === 'string') {
                    jsonData.response = nestedJson.tavilySearch_response.result;
                    console.log("[useChatStreaming] Extracted content from nested Tavily response.");
                  } else if (nestedJson.message && nestedJson.message.content && Array.isArray(nestedJson.message.content)) {
                    // Handle nested message structure
                    const contentParts = nestedJson.message.content.map((part: any) => {
                      if (typeof part === 'string') return part;
                      if (part && typeof part === 'object' && part.text) return part.text;
                      return JSON.stringify(part);
                    });
                    jsonData.response = contentParts.join('');
                    console.log(`[useChatStreaming] Extracted and joined content from nested message structure`);
                  }
                  // Add more checks for other potential nested tool responses if needed.
                  // Ensure that after extraction, jsonData.response is set to the innermost string content.
                } catch (nestedJsonError) {
                  console.warn("[useChatStreaming] Failed to parse potential nested JSON in response. Response might be an actual JSON object string not from a tool, or malformed.", nestedJsonError);
                  // If parsing nested JSON fails, jsonData.response remains the original string (which might be stringified JSON or just a string that happens to start/end with braces).
                }
              }

              // Final cleanup: if jsonData.response is still a string (it should be),
              // remove a single trailing backslash. This is applied after potential nested JSON extraction.
              if (typeof jsonData.response === 'string') {
                jsonData.response = jsonData.response.replace(/\\$/, '');
                }

              } else {
                jsonData.response = "";
              }
            
              // If response is still empty or undefined, try one last content extraction
              if (!jsonData.response && jsonData.message) {
                if (typeof jsonData.message.text === 'function') {
                  try {
                    // Some AI clients (like Google AI) provide a text() function
                    const extractedText = jsonData.message.text();
                    if (extractedText && typeof extractedText === 'string') {
                      jsonData.response = extractedText;
                      console.log(`[useChatStreaming] Extracted text from message.text() function`);
                    }
                  } catch (functionError) {
                    console.warn(`[useChatStreaming] Error calling message.text() function:`, functionError);
                  }
                }
              }
            
              // Ensure other required fields exist
              if (!jsonData.toolInvocations) {
                jsonData.toolInvocations = [];
              }
            
              if (!jsonData.sessionId) {
                jsonData.sessionId = "";
              }
            
              // Log successful recovery
              console.log(`[useChatStreaming] Final response processing complete, text length: ${typeof jsonData.response === 'string' ? jsonData.response.length : 'unknown'}`);
            
            callbacks.onFinalResponse(
              jsonData as ParsedJsonData,
              (jsonData as ParsedJsonData).sessionId,
            );
          } catch (finalResponseError) {
            console.error(
              `[useChatStreaming] Error processing final_response data: ${finalResponseError}`,
              { payload: joinedDataPayload.substring(0, 200) + '...', parsedData: jsonData }
            );
            callbacks.onStreamError(`Error processing final response: ${finalResponseError}`);
          }
          break;
        default:
          console.warn(
            `[useChatStreaming] Unhandled SSE event type: '${eventTypeToProcess}'. Payload:`,
            joinedDataPayload,
          );
      }
    } catch (e) {
      console.error(
        `[useChatStreaming] Error parsing JSON for event '${eventTypeToProcess}'. Payload: '${joinedDataPayload}'. Error: ${(e as Error).message}`,
      );
          
      // Advanced recovery for final_response errors
      if (eventTypeToProcess === 'final_response') {
        try {
          console.log(`[useChatStreaming] Attempting advanced error recovery for final_response`);
          
          // Check for message with content array structure first (common structure causing truncation)
          if (joinedDataPayload.includes('"message"') && joinedDataPayload.includes('"content"') && joinedDataPayload.includes('"text"')) {
            // Try to extract from content array structure
            try {
              const textChunks: string[] = [];
              // Find all text chunks using regex
              const textChunkPattern = /"text"\s*:\s*"((?:\\.|[^"\\])*)"/g;
              let match;
              while ((match = textChunkPattern.exec(joinedDataPayload)) !== null) {
                if (match[1]) {
                  const unescapedText = match[1]
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '\r')
                    .replace(/\\t/g, '\t')
                    .replace(/\\\\/g, '\\');
                  textChunks.push(unescapedText);
                }
              }
                    
              if (textChunks.length > 0) {
                console.log(`[useChatStreaming] Recovered ${textChunks.length} text chunks via regex`);
                const recoveredResponse = {
                  response: textChunks.join(''),
                  toolInvocations: [],
                  sessionId: ""
                };
                callbacks.onFinalResponse(recoveredResponse, "");
                return; // Skip the error callback since we handled it
              }
            } catch (structureError) {
              console.warn(`[useChatStreaming] Failed to extract from content structure:`, structureError);
            }
          }
                
          // Try to extract response with a more comprehensive regex pattern
          // This pattern handles escaped quotes and multi-line content better
          if (joinedDataPayload.includes('"response":"')) {
            // Extract the full message content character by character
            let extractedContent = "";
            let startIdx = joinedDataPayload.indexOf('"response":"');
            
            if (startIdx >= 0) {
              startIdx += '"response":"'.length;
              let inString = true;
              let escaped = false;
              
              // Process the entire string character by character to handle all edge cases
              for (let i = startIdx; i < joinedDataPayload.length; i++) {
                const char = joinedDataPayload[i];
                
                if (char === '\\' && !escaped) {
                  escaped = true;
                  continue;
                }
                
                if (char === '"' && !escaped) {
                  inString = false;
                  break; // End of string reached
                }
                
                if (escaped) {
                  // Handle escaped characters
                  if (char === 'n') extractedContent += '\n';
                  else if (char === 'r') extractedContent += '\r';
                  else if (char === 't') extractedContent += '\t';
                  else extractedContent += char;
                  escaped = false;
                } else {
                  extractedContent += char;
                }
              }
              
              if (extractedContent) {
                console.log(`[useChatStreaming] Manual character extraction recovered ${extractedContent.length} chars`);
                
                const recoveredResponse = {
                  response: extractedContent,
                  toolInvocations: [],
                  sessionId: ""
                };
                
                callbacks.onFinalResponse(recoveredResponse, "");
                return; // Skip the error callback since we handled it
              }
            }
          } else if (joinedDataPayload.includes('"text":"') || joinedDataPayload.includes('"content":"')) {
            // Try to extract from alternate field names
            const altPattern = /"(?:text|content)":"((?:\\.|[^"\\])*)(?:"|$)/s;
            const altMatch = joinedDataPayload.match(altPattern);
            
            if (altMatch && altMatch[1]) {
              const altText = altMatch[1]
                .replace(/\\"/g, '"')
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t')
                .replace(/\\\\/g, '\\');
                
              console.log(`[useChatStreaming] Extracted text from alternate field: "${altText.substring(0, 50)}..."`);
              
              const recoveredResponse = {
                response: altText,
                toolInvocations: [],
                sessionId: ""
              };
              
              callbacks.onFinalResponse(recoveredResponse, "");
              return;
            }
          }
        } catch (extractError) {
          console.error(`[useChatStreaming] All fallback extraction methods failed: ${extractError}`);
        }
      }
          
      callbacks.onStreamError(
        `Failed to parse ${eventTypeToProcess} event: ${(e as Error).message}`,
      );
    }
  }
}