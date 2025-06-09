import { safeDestr } from "destr";
import { DocumentData, ToolInvocation, ParsedJsonData } from "@/types/chat";
import { StreamEventCallbacks } from "../useChatStreaming";
import { extractTextContent } from "../parsers/textParsers";
import {
  sanitizeJsonPayload,
  extractContext7Response,
  manualExtractResponse,
  characterByCharacterExtraction,
  extractFromContentArray,
  extractTextChunksWithRegex,
  processNestedJson,
  validateFinalResponse
} from "../parsers/jsonRecovery";

// Removed multi-part response storage since we're using single response events

/**
 * Process text or chunk events
 */
export function handleTextEvent(
  eventType: string,
  dataPayload: string,
  callbacks: StreamEventCallbacks
): void {
  const textContent = extractTextContent(dataPayload, eventType);
  
  if (textContent) {
    console.log(`[sseEventHandlers] Sending text chunk of length: ${textContent.length}`);
    callbacks.onText(textContent);
  } else if (dataPayload) {
    // If extraction completely failed but payload wasn't empty
    callbacks.onText("");
    console.warn(
      `[sseEventHandlers] ${eventType} event processing resulted in empty textContent from non-empty payload of length: ${dataPayload.length}`,
    );
  }
}

/**
 * Process sources event
 */
export function handleSourcesEvent(
  dataPayload: string,
  callbacks: StreamEventCallbacks
): void {
  try {
    const jsonData = safeDestr<any>(dataPayload);
    
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
        `[sseEventHandlers] 'sources' event missing or malformed 'sources' array. Payload:`,
        dataPayload,
      );
    }
  } catch (e) {
    console.error(
      `[sseEventHandlers] Error parsing sources event: ${(e as Error).message}`,
    );
    callbacks.onStreamError(
      `Failed to parse sources event: ${(e as Error).message}`,
    );
  }
}

/**
 * Process tool invocation event
 */
export function handleToolInvocationEvent(
  dataPayload: string,
  callbacks: StreamEventCallbacks
): void {
  try {
    const toolData = safeDestr<{
      name?: string;
      input?: unknown;
      output?: unknown;
    }>(dataPayload);
    
    if (toolData != null) {
      const newToolInvocation: ToolInvocation = {
        toolName: toolData?.name || "unknown_tool",
        input:
          typeof toolData?.input === "object" && toolData.input !== null
            ? (toolData.input as Record<string, unknown>)
            : undefined,
        output:
          typeof toolData?.output === "object" && toolData.output !== null
            ? (toolData.output as Record<string, unknown>)
            : undefined,
      };
      callbacks.onToolInvocation(newToolInvocation);
    } else {
      console.warn("[sseEventHandlers] Received null/undefined tool invocation data");
    }
  } catch (e) {
    console.error(
      `[sseEventHandlers] Error parsing tool_invocation event: ${(e as Error).message}`,
    );
    callbacks.onStreamError(
      `Failed to parse tool_invocation event: ${(e as Error).message}`,
    );
  }
}

/**
 * Process multiple tool invocations event
 */
export function handleToolInvocationsEvent(
  dataPayload: string,
  callbacks: StreamEventCallbacks
): void {
  try {
    const incomingInvocations = safeDestr<Array<{
      name?: string;
      input?: unknown;
      output?: unknown;
    }>>(dataPayload) || [];
    
    const mappedToolInvocations: ToolInvocation[] = incomingInvocations
      .filter((inv) => inv != null)
      .map((inv) => ({
        toolName: inv?.name || "unknown_tool",
        input:
          typeof inv?.input === "object" && inv.input !== null
            ? (inv.input as Record<string, unknown>)
            : undefined,
        output:
          typeof inv?.output === "object" && inv.output !== null
            ? (inv.output as Record<string, unknown>)
            : undefined,
      }));
    callbacks.onMultipleToolInvocations(mappedToolInvocations);
  } catch (e) {
    console.error(
      `[sseEventHandlers] Error parsing tool_invocations event: ${(e as Error).message}`,
    );
    callbacks.onStreamError(
      `Failed to parse tool_invocations event: ${(e as Error).message}`,
    );
  }
}

/**
 * Process error event
 */
export function handleErrorEvent(
  dataPayload: string,
  callbacks: StreamEventCallbacks
): void {
  try {
    const jsonData = safeDestr<ParsedJsonData>(dataPayload);
    const errorMsg = jsonData?.error || "Unknown server error event";
    callbacks.onStreamError(errorMsg);
  } catch (e) {
    console.error(
      `[sseEventHandlers] Error parsing error event: ${(e as Error).message}`,
    );
    callbacks.onStreamError(
      `Failed to parse error event: ${(e as Error).message}`,
    );
  }
}

/**
 * Process final response event with comprehensive error recovery
 */
export function handleFinalResponseEvent(
  dataPayload: string,
  callbacks: StreamEventCallbacks
): void {
  try {
    console.log(`[sseEventHandlers] Processing final_response with payload length: ${dataPayload.length}`);
    console.log(`[sseEventHandlers] Full payload:`, dataPayload);
    console.log(`[sseEventHandlers] Payload preview: ${dataPayload.substring(0, 200)}...`);
    console.log(`[sseEventHandlers] Payload end: ...${dataPayload.substring(Math.max(0, dataPayload.length - 50))}`);

    let jsonData: any;
    
    // Check if JSON appears to be truncated
    const isTruncated = !dataPayload.trim().endsWith('}') && !dataPayload.trim().endsWith('"}');
    if (isTruncated) {
      console.warn(`[sseEventHandlers] JSON appears truncated - doesn't end with } or "}. Last 20 chars: "${dataPayload.slice(-20)}"`);
    }
    
    // Try direct parsing first
    try {
      jsonData = safeDestr<any>(dataPayload);
      console.log(`[sseEventHandlers] Direct parsing successful`);
      console.log(`[sseEventHandlers] Parsed JSON structure:`, {
        hasResponse: !!jsonData?.response,
        responseType: typeof jsonData?.response,
        responseLength: typeof jsonData?.response === 'string' ? jsonData.response.length : 'N/A',
        responsePreview: typeof jsonData?.response === 'string' ? jsonData.response.substring(0, 100) + '...' : jsonData?.response,
        hasSessionId: !!jsonData?.sessionId,
        hasToolInvocations: !!jsonData?.toolInvocations,
        allKeys: Object.keys(jsonData || {})
      });
    } catch (parseError) {
      console.warn(`[sseEventHandlers] Direct JSON parse failed: ${parseError}`);
      
      // If JSON is truncated, try to recover using manual extraction
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      if (isTruncated || errorMessage.includes('Unterminated')) {
        console.log(`[sseEventHandlers] Attempting manual extraction for truncated JSON`);
        
        // Try manual extraction methods for incomplete JSON
        const manualExtracted = manualExtractResponse(dataPayload);
        if (manualExtracted) {
          console.log(`[sseEventHandlers] Manual extraction successful, response length: ${manualExtracted.response.length}`);
          callbacks.onFinalResponse(manualExtracted, manualExtracted.sessionId);
          return;
        }
        
        const charExtracted = characterByCharacterExtraction(dataPayload);
        if (charExtracted) {
          console.log(`[sseEventHandlers] Character extraction successful, response length: ${charExtracted.response.length}`);
          callbacks.onFinalResponse(charExtracted, charExtracted.sessionId);
          return;
        }
      }
      
      // Try sanitization as fallback
      const sanitizedPayload = sanitizeJsonPayload(dataPayload, 'final_response');
      console.log(`[sseEventHandlers] Trying sanitized payload, length: ${sanitizedPayload.length}`);
      
      try {
        jsonData = safeDestr<any>(sanitizedPayload);
        console.log(`[sseEventHandlers] Sanitized parsing successful, response length: ${typeof jsonData?.response === 'string' ? jsonData.response.length : 'unknown'}`);
      } catch (sanitizedError) {
        console.error(`[sseEventHandlers] Sanitized parsing also failed: ${sanitizedError}`);
        
        // Final fallback - try to extract whatever we can
        const finalExtracted = manualExtractResponse(dataPayload) || characterByCharacterExtraction(dataPayload);
        if (finalExtracted) {
          console.log(`[sseEventHandlers] Final extraction successful, response length: ${finalExtracted.response.length}`);
          callbacks.onFinalResponse(finalExtracted, finalExtracted.sessionId || "");
          return;
        }
        
        jsonData = undefined;
      }
    }
    
    // Special handling for Context7 responses
    if (dataPayload.includes('Context7')) {
      const context7Data = extractContext7Response(dataPayload);
      if (context7Data) {
        callbacks.onFinalResponse(context7Data);
        return;
      }
    }
    
    if (jsonData === undefined && dataPayload.trim().length > 0) {
      console.error(
        `[sseEventHandlers] JSON parsing failed for final_response event`
      );
      
      // Try manual extraction methods
      const manualExtracted = manualExtractResponse(dataPayload);
      if (manualExtracted) {
        callbacks.onFinalResponse(manualExtracted, manualExtracted.sessionId);
        return;
      }
      
      const charExtracted = characterByCharacterExtraction(dataPayload);
      if (charExtracted) {
        callbacks.onFinalResponse(charExtracted, charExtracted.sessionId);
        return;
      }
      
      // Try to construct minimal valid response
      const errorResponse: ParsedJsonData = {
        response: "Error: Could not parse complete response. Please try again.",
        sessionId: "",
        toolInvocations: []
      };
      callbacks.onFinalResponse(errorResponse, "");
      return;
    }
    
    // Process nested JSON structures
    processNestedJson(jsonData);
    
    // Validate and ensure all required fields
    validateFinalResponse(jsonData);
    
    console.log(
      `[sseEventHandlers] Final response processing complete, text length: ${
        typeof jsonData.response === 'string' ? jsonData.response.length : 'unknown'
      }`
    );
    
    callbacks.onFinalResponse(
      jsonData as ParsedJsonData,
      (jsonData as ParsedJsonData).sessionId,
    );
  } catch (finalResponseError) {
    console.error(
      `[sseEventHandlers] Error processing final_response data: ${finalResponseError}`,
      { payload: dataPayload.substring(0, 200) + '...' }
    );
    
    // Advanced error recovery attempts
    try {
      // Try to extract from content array structure
      const contentArrayExtracted = extractFromContentArray(dataPayload);
      if (contentArrayExtracted) {
        callbacks.onFinalResponse(contentArrayExtracted, "");
        return;
      }
      
      // Try regex extraction for text chunks
      const regexExtracted = extractTextChunksWithRegex(dataPayload);
      if (regexExtracted) {
        callbacks.onFinalResponse(regexExtracted, "");
        return;
      }
    } catch (recoveryError) {
      console.error(`[sseEventHandlers] All recovery methods failed: ${recoveryError}`);
    }
    
    callbacks.onStreamError(`Error processing final response: ${finalResponseError}`);
  }
}

// Removed multi-part response handling functions since we're using single response events

/**
 * Main SSE event processing function
 */
export function processSseEvent(
  eventType: string | null,
  dataLines: string[],
  callbacks: StreamEventCallbacks
): void {
  const eventTypeToProcess = eventType || "message"; // Default event type
  const joinedDataPayload = dataLines.join(""); // Data lines are already trimmed

  if (!joinedDataPayload.trim()) {
    return; // Skip empty data payloads
  }

  console.log(
    `[sseEventHandlers] Processing SSE Event: Type='${eventTypeToProcess}', Payload='${joinedDataPayload}'`,
  );
      
  // For debugging problematic payloads
  if (eventTypeToProcess === 'final_response') {
    console.log(
      `[sseEventHandlers] Final response payload (char by char): ${
        Array.from(joinedDataPayload).map(c => 
          c === '\\' ? '\\\\' : 
          c === '\n' ? '\\n' : 
          c === '\r' ? '\\r' : 
          c === '\t' ? '\\t' : c
        ).join('')
      }`
    );
  }

  // Route to appropriate handler based on event type
  switch (eventTypeToProcess) {
    case "text":
    case "chunk":
      handleTextEvent(eventTypeToProcess, joinedDataPayload, callbacks);
      break;
    case "sources":
      handleSourcesEvent(joinedDataPayload, callbacks);
      break;
    case "tool_invocation":
      handleToolInvocationEvent(joinedDataPayload, callbacks);
      break;
    case "tool_invocations":
      handleToolInvocationsEvent(joinedDataPayload, callbacks);
      break;
    case "error":
      handleErrorEvent(joinedDataPayload, callbacks);
      break;
    case "final_response":
      handleFinalResponseEvent(joinedDataPayload, callbacks);
      break;
    // Removed response_part and response_complete handlers since we're using single response events
    default:
      console.warn(
        `[sseEventHandlers] Unhandled SSE event type: '${eventTypeToProcess}'. Payload:`,
        joinedDataPayload,
      );
  }
}