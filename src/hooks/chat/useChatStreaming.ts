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

  if (eventTypeToProcess === "text") {
    let textContent = "";
    try {
      const parsedAsJson = safeDestr<{ text?: string }>(joinedDataPayload);
      if (parsedAsJson && typeof parsedAsJson.text === "string") {
        textContent = parsedAsJson.text;
      } else {
        console.warn(
          `[useChatStreaming] Text event payload not valid JSON {"text":"..."}: '${joinedDataPayload}'. Attempting extraction.`,
        );
        if (
          joinedDataPayload.startsWith('{"text":"') &&
          joinedDataPayload.endsWith('"}')
        ) {
          textContent = joinedDataPayload.substring(
            '{"text":"'.length,
            joinedDataPayload.length - '"}'.length,
          );
        } else if (joinedDataPayload.startsWith('{"text":"')) {
          textContent = joinedDataPayload.substring('{"text":"'.length);
          if (textContent.endsWith('"')) textContent = textContent.slice(0, -1);
        } else {
          textContent = joinedDataPayload; // Assume raw text if not fitting the pattern
        }
      }
    } catch (e) {
      console.error(
        `[useChatStreaming] Error parsing text event payload: ${e}. Payload: '${joinedDataPayload}'`,
      );
      textContent = joinedDataPayload; // Fallback
    }
    if (textContent) callbacks.onText(textContent);
  } else {
    // Handle other event types that expect well-formed JSON
    try {
      const jsonData = safeDestr<any>(joinedDataPayload);
      if (jsonData === undefined && joinedDataPayload.trim().length > 0) {
        throw new Error(`Parsing failed: safeDestr returned undefined.`);
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
