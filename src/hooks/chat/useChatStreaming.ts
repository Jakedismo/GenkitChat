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

  // MODIFICATION: Treat 'chunk' like 'text'
  if (eventTypeToProcess === "text" || eventTypeToProcess === "chunk") {
    let textContent = "";
    let parsedSuccessfully = false;

    // Check if it's likely a JSON-like structure intended to contain text
    // A simple check: starts with '{' and includes "text" substring
    const isPotentialJsonTextContainer =
      joinedDataPayload.startsWith("{") && joinedDataPayload.includes('"text"');

    if (isPotentialJsonTextContainer) {
      try {
        // Attempt to parse as {"text": "..."}
        const parsedAsJson = safeDestr<{ text?: string }>(joinedDataPayload);
        if (parsedAsJson && typeof parsedAsJson.text === "string") {
          textContent = parsedAsJson.text;
          parsedSuccessfully = true;
        }
      } catch (e) {
        console.error(
          `[useChatStreaming] safeDestr failed for ${eventTypeToProcess} event payload: ${(e as Error).message}. Payload: '${joinedDataPayload}'`,
        );
        // Fall through to manual extraction or raw text handling
      }
    }

    if (!parsedSuccessfully) {
      // This block is reached if:
      // 1. It wasn't considered potential JSON text container OR
      // 2. safeDestr failed OR
      // 3. safeDestr parsed but didn't match {"text": "string"}

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
      const jsonData = safeDestr<any>(joinedDataPayload);
      if (jsonData === undefined && joinedDataPayload.trim().length > 0) {
        // If safeDestr returns undefined for a non-empty payload, it means parsing failed.
        // This is more explicit than just checking if jsonData is falsy.
        throw new Error(
          `Parsing failed: safeDestr returned undefined for non-empty payload.`,
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
          callbacks.onFinalResponse(
            jsonData as ParsedJsonData,
            (jsonData as ParsedJsonData).sessionId,
          );
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
