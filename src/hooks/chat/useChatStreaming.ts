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

    // Sanitize the payload to prevent common parsing errors
    // This is for attempted JSON parse only - we'll still have the original for manual methods
    const sanitizedPayload = joinedDataPayload
      .replace(/\n/g, '\\n')  // Replace literal newlines with \n escape sequence
      .replace(/\r/g, '\\r'); // Replace literal carriage returns with \r escape sequence

    // Check if it's likely a JSON-like structure intended to contain text
    // A simple check: starts with '{' and includes "text" substring
    const isPotentialJsonTextContainer =
      joinedDataPayload.startsWith("{") && joinedDataPayload.includes('"text"');

    if (isPotentialJsonTextContainer) {
      try {
        // First attempt with sanitized payload
        const parsedAsJson = safeDestr<{ text?: string }>(sanitizedPayload);
        if (parsedAsJson && typeof parsedAsJson.text === "string") {
          textContent = parsedAsJson.text;
          parsedSuccessfully = true;
        }
      } catch (e) {
        // JSON parsing failed with sanitized payload
        try {
          // Try manual JSON parsing as a fallback
          const match = sanitizedPayload.match(/\{\s*"text"\s*:\s*"([^"]*)"\s*\}/);
          if (match && match[1]) {
            textContent = match[1].replace(/\\n/g, '\n').replace(/\\r/g, '\r');
            parsedSuccessfully = true;
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
      // This block is reached if:
      // 1. It wasn't considered potential JSON text container OR
      // 2. Both parsing methods failed OR
      // 3. Parsing succeeded but didn't match {"text": "string"}

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
          `[useChatStreaming] ${eventTypeToProcess} event payload was not valid JSON or did not match expected structure. Manually extracted: '${textContent}' from payload: '${joinedDataPayload}'`,
        );
      } else if (
        eventTypeToProcess === "chunk" &&
        !isPotentialJsonTextContainer
      ) {
        // If it's a 'chunk' event and wasn't identified as a JSON text container,
        // treat its payload as raw text directly.
        textContent = joinedDataPayload;
        console.warn(
          `[useChatStreaming] 'chunk' event payload not recognized as JSON text structure. Treating as raw text: '${joinedDataPayload}'`,
        );
      } else if (isPotentialJsonTextContainer) {
        // It was identified as potential JSON but specific parsing/extraction failed to yield text.
        // This could be a valid JSON but not with a top-level "text" field, or still malformed.
        console.warn(
          `[useChatStreaming] ${eventTypeToProcess} event was JSON-like but text extraction failed. Payload: '${joinedDataPayload}'. Treating as empty text for callback.`,
        );
        // textContent remains "", leading to onText("") if original payload wasn't empty
      } else {
        // Default fallback for "text" events if not JSON-like and not the specific {\"text\":\"...\"} structure
        // For "chunk" this path is less likely due to the explicit condition above.
        textContent = joinedDataPayload;
        console.warn(
          `[useChatStreaming] ${eventTypeToProcess} event payload not recognized as structured text. Treating as raw text: '${joinedDataPayload}'`,
        );
      }
    }

    if (textContent) {
      callbacks.onText(textContent);
    } else if (joinedDataPayload) {
      // If textContent is empty but original payload wasn't, means extraction failed to produce text
      // or it was a non-text chunk meant for other purposes (though we're in text/chunk block).
      // Sending onText(\"\") ensures the placeholder logic might still clear/update.
      callbacks.onText("");
      console.warn(
        `[useChatStreaming] ${eventTypeToProcess} event processing resulted in empty textContent from non-empty payload: '${joinedDataPayload}'`,
      );
    }
    // If both joinedDataPayload and textContent are empty, onText won\'t be called.
  } else {
    // Handle other event types that expect well-formed JSON
    try {
      // First try to sanitize the payload to handle common JSON issues
      let sanitizedPayload = joinedDataPayload;
      
      // Handle trailing backslashes which cause JSON parsing errors
      // If the string ends with an odd number of backslashes, it will escape the closing quote
      if (sanitizedPayload.match(/\\+$/)) {
        console.warn(
          `[useChatStreaming] Detected trailing backslash(es) in ${eventTypeToProcess} event, handling special case`
        );
        
        // Count trailing backslashes to ensure proper escaping
        const trailingBackslashMatch = sanitizedPayload.match(/\\+$/);
        if (trailingBackslashMatch) {
          const trailingBackslashes = trailingBackslashMatch[0];
          // Add an extra backslash to properly escape each one
          sanitizedPayload = sanitizedPayload + '\\'.repeat(trailingBackslashes.length);
        }
      }
      
      // If it looks like we're getting a truncated JSON string, try to repair it
      if (sanitizedPayload.includes('"response":"') && 
          !sanitizedPayload.includes('"}') && 
          !sanitizedPayload.endsWith('"')) {
        console.warn(
          `[useChatStreaming] Possible truncated JSON detected in ${eventTypeToProcess} event, attempting repair`
        );
        sanitizedPayload = sanitizedPayload + '"}';
      }
      
      // Apply additional escaping for problematic characters
      sanitizedPayload = sanitizedPayload
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
        
      let jsonData = safeDestr<any>(sanitizedPayload);
      
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
            // Additional validation and safety checks for final_response
            if (!jsonData) {
              console.error("[useChatStreaming] final_response contained null or undefined jsonData");
              
              // Last-attempt manual parsing for common patterns
              if (joinedDataPayload.includes('"response":"')) {
                try {
                  const responseMatch = joinedDataPayload.match(/"response":"(.*?)(?<!\\)"/);
                  const sessionIdMatch = joinedDataPayload.match(/"sessionId":"([^"]+)"/);
                  
                  if (responseMatch && responseMatch[1]) {
                    jsonData = {
                      response: responseMatch[1].replace(/\\"/g, '"'),
                      sessionId: sessionIdMatch ? sessionIdMatch[1] : "",
                      toolInvocations: []
                    };
                    console.log('[useChatStreaming] Recovered final_response data via manual parsing');
                  } else {
                    throw new Error("Manual parsing failed");
                  }
                } catch (manualParseError) {
                  throw new Error("Invalid response data received and manual parsing failed");
                }
              } else {
                throw new Error("Invalid response data received");
              }
            }
            
            // Ensure response is a string if present
            if (jsonData.response !== undefined && typeof jsonData.response !== 'string') {
              jsonData.response = String(jsonData.response);
            }
            
            // Ensure toolInvocations exists to prevent undefined errors
            if (!jsonData.toolInvocations) {
              jsonData.toolInvocations = [];
            }
            
            callbacks.onFinalResponse(
              jsonData as ParsedJsonData,
              (jsonData as ParsedJsonData).sessionId,
            );
          } catch (finalResponseError) {
            console.error(
              `[useChatStreaming] Error processing final_response data: ${finalResponseError}`,
              { payload: joinedDataPayload, parsedData: jsonData }
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
      callbacks.onStreamError(
        `Failed to parse ${eventTypeToProcess} event: ${(e as Error).message}`,
      );
    }
  }
}
