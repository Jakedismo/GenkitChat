"use client";

import { useCallback } from "react";
import { DocumentData, ToolInvocation, ParsedJsonData } from "@/types/chat";
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
            buffer.substring(0, 200) + (buffer.length > 200 ? '...' : ''),
          );
          console.log("[useChatStreaming] Full buffer content:", buffer);
          
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
          console.log("[useChatStreaming] Processing final event data:", {
            eventType: currentSSEEventType,
            dataLines: currentSSEDataLines.length,
            preview: currentSSEDataLines.join('').substring(0, 100) + '...'
          });
          processSseEvent(currentSSEEventType, currentSSEDataLines, callbacks);
        }
        break;
      }

      const rawChunk = decoder.decode(value, { stream: true }); // stream: true is important for multi-byte characters
      let normalizedChunk = rawChunk.replace(/\\n/g, "\n").replace(/\r/g, "");
      buffer += normalizedChunk;

      console.log(`[useChatStreaming] Received chunk: ${rawChunk.length} bytes, buffer now: ${buffer.length} chars`);

      let lineEndPos;
      while ((lineEndPos = buffer.indexOf("\n")) !== -1) {
        const line = buffer.substring(0, lineEndPos);
        buffer = buffer.substring(lineEndPos + 1);

        if (line === "") {
          // Empty line: event boundary
          if (currentSSEDataLines.length > 0) {
            console.log(`[useChatStreaming] Processing complete SSE event: ${currentSSEEventType}, data lines: ${currentSSEDataLines.length}`);
            console.log(`[useChatStreaming] Combined data length: ${currentSSEDataLines.join('').length} chars`);
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
          console.log(`[useChatStreaming] New SSE event type: ${currentSSEEventType}`);
        } else if (line.startsWith("data:")) {
          const dataLine = line.substring(5); // Don't trim - preserve spaces
          currentSSEDataLines.push(dataLine);
          console.log(`[useChatStreaming] Added data line (${dataLine.length} chars): ${dataLine.substring(0, 100)}...`);
        } else if (line.startsWith(":")) {
          // Comment, ignore
          console.log(`[useChatStreaming] Received comment: ${line}`);
        } else if (currentSSEDataLines.length > 0) {
          // If we're in the middle of collecting data lines and encounter a non-SSE line,
          // it might be part of multi-line JSON content - add it as a continuation
          currentSSEDataLines.push(line);
          console.log(`[useChatStreaming] Added continuation line (${line.length} chars): ${line.substring(0, 50)}...`);
        } else {
          // Ignore other non-empty lines for robustness
          console.log(`[useChatStreaming] Ignoring unrecognized line: ${line.substring(0, 50)}...`);
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