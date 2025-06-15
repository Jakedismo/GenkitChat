import { ParsedJsonData } from "@/types/chat";

function fixJsonStructure(payload: string): string {
  let sanitizedPayload = payload.trim();
  if (!sanitizedPayload.startsWith("{")) {
    const jsonStart = sanitizedPayload.indexOf("{");
    if (jsonStart > -1) {
      sanitizedPayload = sanitizedPayload.slice(jsonStart);
    } else {
      return `{"response":"${sanitizedPayload}","toolInvocations":[],"sessionId":""}`;
    }
  }

  if (!sanitizedPayload.endsWith("}")) {
    const openBraces = (sanitizedPayload.match(/{/g) || []).length;
    const closeBraces = (sanitizedPayload.match(/}/g) || []).length;
    const bracesToAdd = openBraces - closeBraces;
    if (bracesToAdd > 0) {
      sanitizedPayload += "}".repeat(bracesToAdd);
    }
  }
  return sanitizedPayload;
}

function escapeJsonContent(payload: string): string {
  const responseFieldMatch = payload.match(/"response":"([\s\S]*?)"/);
  if (responseFieldMatch && responseFieldMatch[1]) {
    const rawResponse = responseFieldMatch[1];
    const escapedResponse = rawResponse
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/\f/g, "\\f")
      .replace(/\b/g, "\\b")
      .replace(/[\u0000-\u001F]/g, (match) => {
        return "\\u" + ("0000" + match.charCodeAt(0).toString(16)).slice(-4);
      });

    const toolIdx = payload.lastIndexOf(',"toolInvocations"');
    if (toolIdx > -1) {
      const head = payload.slice(0, responseFieldMatch.index!);
      const tail = payload.slice(toolIdx);
      return `${head}"response":"${escapedResponse}"${tail}`;
    } else {
      return payload.replace(
        /"response":"([\s\S]*?)"/,
        `"response":"${escapedResponse}"`,
      );
    }
  }
  return payload;
}

function reconstructJson(payload: string): string {
  const responseMatch = payload.match(
    /"response":"([\s\S]*?)"(?:,"toolInvocations"|}$)/,
  );
  const toolInvocationsMatch = payload.match(
    /"toolInvocations"\s*:\s*(\[[^\]]*\])/,
  );
  const sessionIdMatch = payload.match(/"sessionId"\s*:\s*"([^"]*)"/);

  const reconstructed = {
    response: responseMatch
      ? responseMatch[1]
      : "Error: Could not parse response content",
    toolInvocations: (() => {
      if (!toolInvocationsMatch) return [];
      try {
        return JSON.parse(toolInvocationsMatch[1]);
      } catch {
        return [];
      }
    })(),
    sessionId: sessionIdMatch ? sessionIdMatch[1] : "",
  };

  return JSON.stringify(reconstructed);
}

export function recoverJson(payload: string): string {
  const strategies = [
    (p: string) => p,
    fixJsonStructure,
    escapeJsonContent,
    reconstructJson,
  ];

  let lastResult = payload;
  for (const strategy of strategies) {
    try {
      const result = strategy(lastResult);
      JSON.parse(result);
      return result;
    } catch (e) {
      lastResult = strategy(lastResult);
    }
  }

  const safeContent = payload
    .replace(/\\+/g, "")
    .replace(/[^\x20-\x7E\n\r\t]/g, "")
    .slice(0, 1000);

  return JSON.stringify({
    response: `Content parsing error. Raw content: ${safeContent}`,
    toolInvocations: [],
    sessionId: "",
  });
}

export function sanitizeJsonPayload(payload: string, eventType: string): string {
  return recoverJson(payload);
}

/**
 * Extracts response content for Context7 responses with complex escape sequences
 */
export function extractContext7Response(payload: string): ParsedJsonData | null {
  if (!payload.includes('Context7')) {
    return null;
  }
  
  console.log('[jsonRecovery] Detected Context7 response, using specialized parsing logic');
  
  try {
    // Use a compatible regex without the 's' flag by using [\s\S]* instead
    const responseMatch = payload.match(/"response":"([\s\S]*?[^\\])(?:\\\\)*"/);  
    if (responseMatch && responseMatch[1]) {
      const extractedContent = responseMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
        
      // Create a sanitized JSON object directly
      return {
        response: extractedContent,
        toolInvocations: [],
        sessionId: ""
      };
    }
  } catch (context7Error) {
    console.error(`[jsonRecovery] Context7 specialized parsing failed: ${context7Error}`);
  }
  
  return null;
}

/**
 * Manual extraction of response content using regex patterns
 */
export function manualExtractResponse(payload: string): ParsedJsonData | null {
  if (!payload.includes('"response":"')) {
    return null;
  }
  
  try {
    // More robust pattern matching for complete response content
    const responsePattern = /"response":"((?:\\.|[^"\\])*[^\\])"/;
    const responseMatch = payload.match(responsePattern);
    const sessionIdMatch = payload.match(/"sessionId":"([^"]+)"/);
    
    if (responseMatch && responseMatch[1]) {
      // Properly unescape the extracted content
      const extractedText = responseMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
        
      return {
        response: extractedText,
        sessionId: sessionIdMatch ? sessionIdMatch[1] : "",
        toolInvocations: []
      };
    }
  } catch (error) {
    console.error(`[jsonRecovery] Manual response extraction failed: ${error}`);
  }
  
  return null;
}

/**
 * Character-by-character extraction for malformed JSON
 */
export function characterByCharacterExtraction(payload: string): ParsedJsonData | null {
  let startIdx = payload.indexOf('"response":"');
  
  if (startIdx < 0) {
    return null;
  }
  
  startIdx += '"response":"'.length;
  let extractedContent = "";
  let escaped = false;
  
  // Process the entire string character by character
  for (let i = startIdx; i < payload.length; i++) {
    const char = payload[i];
    
    if (char === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (char === '"' && !escaped) {
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
    console.log(`[jsonRecovery] Character extraction recovered ${extractedContent.length} chars`);
    
    // Try to find session ID
    const sessionIdMatch = payload.match(/"sessionId":"([^"]+)"/);
    
    return {
      response: extractedContent,
      toolInvocations: [],
      sessionId: sessionIdMatch ? sessionIdMatch[1] : ""
    };
  }
  
  return null;
}

/**
 * Extract text chunks from content array structures
 */
export function extractFromContentArray(payload: string): ParsedJsonData | null {
  if (!payload.includes('"content":[{') && !payload.includes('"parts":[{')) {
    return null;
  }
  
  try {
    // Look for all text properties in content/parts arrays
    const textMatches = payload.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/g) || [];
    if (textMatches.length > 0) {
      const textParts = textMatches.map(match => {
        const extracted = match.replace(/"text"\s*:\s*"/, '').replace(/"$/, '');
        return extracted
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\');
      });
      
      const joinedContent = textParts.join('');
      
      if (joinedContent) {
        console.log(`[jsonRecovery] Array structure recovery extracted ${textParts.length} parts (${joinedContent.length} chars)`);
        
        return {
          response: joinedContent,
          toolInvocations: [],
          sessionId: ""
        };
      }
    }
  } catch (error) {
    console.error(`[jsonRecovery] Error in array content extraction:`, error);
  }
  
  return null;
}

/**
 * Extract all text chunks using regex pattern matching
 */
export function extractTextChunksWithRegex(payload: string): ParsedJsonData | null {
  if (!payload.includes('"message"') || !payload.includes('"content"') || !payload.includes('"text"')) {
    return null;
  }
  
  try {
    const textChunks: string[] = [];
    // Find all text chunks using regex
    const textChunkPattern = /"text"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let match;
    
    while ((match = textChunkPattern.exec(payload)) !== null) {
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
      console.log(`[jsonRecovery] Recovered ${textChunks.length} text chunks via regex`);
      return {
        response: textChunks.join(''),
        toolInvocations: [],
        sessionId: ""
      };
    }
  } catch (error) {
    console.warn(`[jsonRecovery] Failed to extract from content structure:`, error);
  }
  
  return null;
}

/**
 * Process nested JSON structures in the response
 */
export function processNestedJson(jsonData: Record<string, unknown>): void {
  const message = jsonData.message as Record<string, unknown> | undefined;
  // Check for raw message structure with content array
  if (message && typeof message === 'object' && message.content && Array.isArray(message.content)) {
    console.log(`[jsonRecovery] Found message.content array with ${message.content.length} items`);
    try {
      const contentParts = message.content.map((part: unknown) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') return part.text;
        return JSON.stringify(part);
      });
      const joinedContent = contentParts.join('');
      
      if (joinedContent && joinedContent.trim().length > 0) {
        jsonData.response = joinedContent;
        console.log(`[jsonRecovery] Joined message.content array parts into response (${joinedContent.length} chars)`);
      }
    } catch (error) {
      console.error(`[jsonRecovery] Error joining content array:`, error);
    }
  }
  // Check for candidates array structure
  else if (jsonData.custom && typeof jsonData.custom === 'object' && Array.isArray((jsonData.custom as Record<string, unknown>).candidates) && ((jsonData.custom as Record<string, unknown>).candidates as unknown[]).length > 0) {
    const customData = jsonData.custom as Record<string, unknown>;
    const candidate = (customData.candidates as Record<string, unknown>[])[0];
    if (candidate.content && (candidate.content as Record<string, unknown>).parts && Array.isArray((candidate.content as Record<string, unknown>).parts)) {
      const parts = (candidate.content as Record<string, unknown>).parts as unknown[];
      console.log(`[jsonRecovery] Found candidate content parts array with ${parts.length} items`);
      try {
        const contentParts = parts.map((part: unknown) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') return part.text;
          return JSON.stringify(part);
        });
        const joinedContent = contentParts.join('');
        
        if (joinedContent && joinedContent.trim().length > 0) {
          jsonData.response = joinedContent;
          console.log(`[jsonRecovery] Joined candidate content parts into response (${joinedContent.length} chars)`);
        }
      } catch (error) {
        console.error(`[jsonRecovery] Error joining candidate parts:`, error);
      }
    }
  }
  // Check if the response itself is stringified JSON
  else if (typeof jsonData.response === 'string' && jsonData.response.startsWith('{') && jsonData.response.endsWith('}')) {
    try {
      const nestedJson = JSON.parse(jsonData.response);
      // Check for known tool response structures
      if (nestedJson.perplexityDeepResearch_response?.content?.response && typeof nestedJson.perplexityDeepResearch_response.content.response === 'string') {
        jsonData.response = nestedJson.perplexityDeepResearch_response.content.response;
        console.log("[jsonRecovery] Extracted content from nested Perplexity response.");
      } else if (nestedJson.tavilySearch_response?.result && typeof nestedJson.tavilySearch_response.result === 'string') {
        jsonData.response = nestedJson.tavilySearch_response.result;
        console.log("[jsonRecovery] Extracted content from nested Tavily response.");
      } else if (nestedJson.message && nestedJson.message.content && Array.isArray(nestedJson.message.content)) {
        // Handle nested message structure
        const contentParts = nestedJson.message.content.map((part: unknown) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') return part.text;
          return JSON.stringify(part);
        });
        jsonData.response = contentParts.join('');
        console.log(`[jsonRecovery] Extracted and joined content from nested message structure`);
      }
    } catch (error) {
      console.warn("[jsonRecovery] Failed to parse potential nested JSON in response.", error);
    }
  }
}

/**
 * Validates and ensures all required fields exist in the final response
 */
export function validateFinalResponse(jsonData: Record<string, unknown>): void {
  // Ensure response is a string
  if (jsonData.response !== undefined) {
    if (typeof jsonData.response !== 'string') {
      jsonData.response = String(jsonData.response);
    }
    
    // Check if the response appears truncated
    const responseText = jsonData.response as string;
    const isSuspiciousTruncation =
      responseText.endsWith('\\') ||
      responseText.endsWith('"') ||
      responseText.endsWith('{') ||
      responseText.endsWith('[') ||
      (responseText.match(/```/g)?.length || 0) % 2 !== 0; // Unclosed code block
      
    if (isSuspiciousTruncation) {
      console.warn(`[jsonRecovery] Response appears to be truncated, ending with suspicious character`);
    }
    
    // Try text() function extraction if response is empty
    const message = jsonData.message as Record<string, unknown> | undefined;
    if (!jsonData.response && message && typeof message.text === 'function') {
      try {
        const extractedText = message.text();
        if (extractedText && typeof extractedText === 'string') {
          jsonData.response = extractedText;
          console.log(`[jsonRecovery] Extracted text from message.text() function`);
        }
      } catch (error) {
        console.warn(`[jsonRecovery] Error calling message.text() function:`, error);
      }
    }
  } else {
    jsonData.response = "";
  }
  
  // Ensure other required fields exist
  if (!jsonData.toolInvocations) {
    jsonData.toolInvocations = [];
  }
  
  if (!jsonData.sessionId) {
    jsonData.sessionId = "";
  }
  
  // Remove trailing backslash if present
  if (typeof jsonData.response === 'string') {
    jsonData.response = jsonData.response.replace(/\\$/, '');
  }
}