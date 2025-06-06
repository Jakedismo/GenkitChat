import { safeDestr } from "destr";
import { ParsedJsonData } from "@/types/chat";

/**
 * Sanitizes JSON payload by handling special characters and common structure issues
 */
export function sanitizeJsonPayload(payload: string, eventType: string): string {
  let sanitizedPayload = payload;
  
  // Log raw payload for debugging serious issues
  if (eventType === 'final_response') {
    console.log(`[jsonRecovery] Raw ${eventType} payload: `, 
      payload.slice(0, 100) + (payload.length > 100 ? '...' : ''));
  }
  
  // Handle trailing backslashes which often cause JSON parsing errors
  const trailingBackslashMatch = sanitizedPayload.match(/\\+$/);
  if (trailingBackslashMatch) {
    console.warn(
      `[jsonRecovery] Detected ${trailingBackslashMatch[0].length} trailing backslash(es) in ${eventType} event`
    );
    
    // For odd number of trailing backslashes, add one more to properly escape
    if (trailingBackslashMatch[0].length % 2 !== 0) {
      sanitizedPayload = sanitizedPayload + '\\';
    }
  }
  
  // Check for and fix common JSON structure issues
  if (sanitizedPayload.includes('"response":"')) {
    // Check for unterminated response string
    if (!sanitizedPayload.includes('"}') && !sanitizedPayload.match(/"response":".*?(?<!\\)"/)) {
      console.warn(
        `[jsonRecovery] Detected unterminated response string in ${eventType} event, attempting repair`
      );
      
      // Proper termination based on context
      if (sanitizedPayload.includes('","toolInvocations":')) {
        const partialMatch = sanitizedPayload.match(/(.*?"response":"[^"]*)/);
        if (partialMatch) {
          const partial = partialMatch[1];
          sanitizedPayload = partial + '","toolInvocations":[],"sessionId":""}';
        } else {
          sanitizedPayload = sanitizedPayload + '"}';
        }
      } else {
        sanitizedPayload = sanitizedPayload + '","toolInvocations":[],"sessionId":""}';  
      }
    }
  }
  
  return sanitizedPayload;
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
  let inString = true;
  let escaped = false;
  
  // Process the entire string character by character
  for (let i = startIdx; i < payload.length; i++) {
    const char = payload[i];
    
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
export function processNestedJson(jsonData: any): void {
  // Check for raw message structure with content array
  if (jsonData.message && jsonData.message.content && Array.isArray(jsonData.message.content)) {
    console.log(`[jsonRecovery] Found message.content array with ${jsonData.message.content.length} items`);
    try {
      const contentParts = jsonData.message.content.map((part: any) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && part.text) return part.text;
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
  else if (jsonData.custom && jsonData.custom.candidates && Array.isArray(jsonData.custom.candidates) && jsonData.custom.candidates.length > 0) {
    const candidate = jsonData.custom.candidates[0];
    if (candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts)) {
      console.log(`[jsonRecovery] Found candidate content parts array with ${candidate.content.parts.length} items`);
      try {
        const contentParts = candidate.content.parts.map((part: any) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && part.text) return part.text;
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
        const contentParts = nestedJson.message.content.map((part: any) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && part.text) return part.text;
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
export function validateFinalResponse(jsonData: any): void {
  // Ensure response is a string
  if (jsonData.response !== undefined) {
    if (typeof jsonData.response !== 'string') {
      jsonData.response = String(jsonData.response);
    }
    
    // Check if the response appears truncated
    const responseText = jsonData.response;
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
    if (!jsonData.response && jsonData.message && typeof jsonData.message.text === 'function') {
      try {
        const extractedText = jsonData.message.text();
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