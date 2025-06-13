"use client";

import { DocumentData, ParsedJsonData, ToolInvocation } from "@/types/chat";
import { unescapeMarkdown } from "../../utils/markdown"; // Import unescapeMarkdown
import { processSseEvent } from "./handlers/sseEventHandlers";

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

  while (!done) {
    try {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;

      if (done) {

        if (callbacks.onReaderDone) {
          callbacks.onReaderDone();
        }
        // Process any remaining buffer content if the stream ends unexpectedly
        // or if the last event didn't have a trailing newline.
        // However, SSE usually relies on the blank line for event termination.
        // If buffer has content here, it might be an incomplete event.
        if (buffer.trim()) {
          // Try to process remaining buffer content
          const remainingLines = buffer.split('\n');
          for (const line of remainingLines) {
            if (line.startsWith("event:")) {
              currentSSEEventType = line.substring(6).trim();
            } else if (line.startsWith("data:")) {
              currentSSEDataLines.push(line.substring(5).trim());
            }
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
          const dataLine = line.substring(5); // Don't trim - preserve spaces
          currentSSEDataLines.push(dataLine);
        } else if (line.startsWith(":")) {
          // Comment, ignore
        } else if (currentSSEDataLines.length > 0) {
          // If we're in the middle of collecting data lines and encounter a non-SSE line,
          // it might be part of multi-line JSON content - add it as a continuation
          currentSSEDataLines.push(line);
        } else {
          // Ignore other non-empty lines for robustness
          callbacks.onText(unescapeMarkdown(line)); // Apply unescapeMarkdown here
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

  if (callbacks.onStreamEnd) {
    callbacks.onStreamEnd();
  }
}