import { safeDestr } from "destr";

/**
 * Interface for flexible JSON response structures that might contain text
 */
interface FlexibleJsonResponse {
  text?: string;
  parts?: Array<{text?: string} | string | unknown>;
  content?: {text?: string} | string;
  message?: {content?: unknown; text?: string};
  data?: {text?: string};
  response?: unknown;
  output?: unknown;
  value?: string;
}

/**
 * Checks if a payload is likely a JSON structure containing text content
 */
export function isPotentialJsonTextContainer(payload: string): boolean {
  return payload.startsWith("{") && 
    (payload.includes('"text"') || payload.includes('"content"'));
}

/**
 * Sanitizes payload for JSON parsing by handling special characters
 */
export function sanitizePayloadForJsonParsing(payload: string): string {
  return payload
    .replace(/\\/g, '\\\\')  // Double-escape backslashes first
    .replace(/\n/g, '\\n')   // Replace literal newlines with \n escape sequence
    .replace(/\r/g, '\\r')   // Replace literal carriage returns with \r escape sequence
    .replace(/\t/g, '\\t');  // Replace literal tabs with \t escape sequence
}

/**
 * Extracts text content from a JSON response using various structure patterns
 */
export function extractTextFromJsonResponse(jsonResponse: FlexibleJsonResponse): string | null {
  // Handle different JSON structures we might receive
  if (jsonResponse && typeof jsonResponse.text === "string") {
    // Direct text field
    return jsonResponse.text;
  } 
  
  if (jsonResponse && Array.isArray(jsonResponse.parts)) {
    // Parts array structure (from chunked responses)
    let combinedText = "";
    for (const part of jsonResponse.parts) {
      if (part && typeof (part as { text: string }).text === 'string') {
        combinedText += (part as { text: string }).text;
      } else if (part && typeof part === 'string') {
        // Handle case where part is directly a string
        combinedText += part;
      } else if (part && typeof part === 'object') {
        // Try to extract text from nested objects
        const p = part as Record<string, any>;
        const extractedText = p.content || p.value || p.data || JSON.stringify(p);
        combinedText += typeof extractedText === 'string' ? extractedText : JSON.stringify(extractedText);
      }
    }
    return combinedText || null;
  } 
  
  if (jsonResponse && typeof jsonResponse === 'object') {
    // Try other common response formats
    const textFromCommonPaths = 
      (jsonResponse.content && typeof jsonResponse.content === 'object' ? jsonResponse.content.text : undefined) || 
      (jsonResponse.message && typeof jsonResponse.message === 'object' ? jsonResponse.message.content : undefined) || 
      (jsonResponse.message && typeof jsonResponse.message === 'object' ? jsonResponse.message.text : undefined) ||
      (jsonResponse.data && typeof jsonResponse.data === 'object' ? jsonResponse.data.text : undefined) ||
      jsonResponse.response ||
      jsonResponse.output;
      
    if (textFromCommonPaths) {
      if (typeof textFromCommonPaths === 'string') {
        return textFromCommonPaths;
      } else if (Array.isArray(textFromCommonPaths)) {
        return textFromCommonPaths.map(part => 
          typeof part === 'string' ? part : 
          part && typeof part === 'object' && part.text ? part.text : 
          JSON.stringify(part)
        ).join('');
      }
    }
  }
  
  return null;
}

/**
 * Extracts text using regex patterns when JSON parsing fails
 */
export function extractTextUsingRegex(payload: string): string | null {
  try {
    // Using regular exec instead of matchAll for ES2015 compatibility
    const regex = /"(?:text|content)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    const matches = [];
    let match;
    while ((match = regex.exec(payload)) !== null) {
      matches.push(match);
    }
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
    
    return allMatches || null;
  } catch {
    return null;
  }
}

/**
 * Advanced text extraction for partially formed JSON
 */
export function extractTextAdvanced(payload: string): string | null {
  if (!payload.includes('"text":"')) {
    return null;
  }
  
  try {
    // Extract ALL content between text:" patterns
    let extractedText = "";
    // Simplified regex for ES2015 compatibility
    const regex = /"text":"([^"]*)"/g;
    let match;
    
    while ((match = regex.exec(payload)) !== null) {
      if (match[1]) {
        // Handle escaped quotes in the content
        const unescapedText = match[1]
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t');
        extractedText += unescapedText;
      }
    }
    
    return extractedText || null;
  } catch {
    return null;
  }
}

/**
 * Manual extraction for specific JSON patterns like {"text":"..."}
 */
export function extractTextManual(payload: string): string | null {
  if (!payload.startsWith('{"text":"')) {
    return null;
  }
  
  // Existing manual extraction for {"text":"..."}
  const extracted = payload.substring('{"text":"'.length);
  if (payload.endsWith('"}')) {
    return extracted.slice(0, -2); // Remove "}
  } else if (payload.endsWith('"')) {
    return extracted.slice(0, -1); // Remove "
  } else {
    // Likely an unterminated string, e.g. {"text":"foo
    return extracted;
  }
}

/**
 * Last resort extraction using simple regex
 */
export function extractTextLastResort(payload: string): string | null {
  try {
    const regex = /"text"\s*:\s*"([^"]*)"/g;
    let match;
    let extractedContent = "";
    
    while ((match = regex.exec(payload)) !== null) {
      if (match[1]) {
        extractedContent += match[1];
      }
    }
    
    return extractedContent || null;
  } catch {
    return null;
  }
}

/**
 * Final text cleanup to unescape sequences
 */
export function finalizeTextContent(textContent: string): string {
  return textContent
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * Reverses the JSON escaping applied in sanitizeJsonPayload so that markdown
 * renders correctly once it reaches the UI.
 */
export function unescapeMarkdown(str: string): string {
  if (!str) return str;
  return str
    .replace(/\\n/g, '\n')    // newline
    .replace(/\\r/g, '\r')    // carriage return
    .replace(/\\t/g, '\t')    // tab
    .replace(/\\\*/g, '*')    // asterisk
    .replace(/\\_/g, '_')     // underscore
    .replace(/\\`/g, '`')     // back-tick
    .replace(/\\\{/g, '{')   // braces (rare but possible)
    .replace(/\\\}/g, '}')
    .replace(/\\\[/g, '[')   // brackets
    .replace(/\\\]/g, ']')
    .replace(/\\\(/g, '(')   // parentheses
    .replace(/\\\)/g, ')')
    .replace(/\\>/g, '>')     // blockquote
    .replace(/\\#/g, '#')     // headings
    .replace(/\\!/g, '!')
    .replace(/\\\\/g, '\\'); // backslash (must be last)
}

/**
 * Main text extraction function that orchestrates all parsing attempts
 */
export function extractTextContent(payload: string, eventType: string): string {
  console.log(`[textParsers] Processing ${eventType} event, length: ${payload.length}`);
  
  // For very short text chunks, just pass them directly without complex parsing
  if (payload.length < 30 && !payload.includes('{') && !payload.includes('"text"')) {
    console.log(`[textParsers] Short, non-JSON chunk detected, passing through directly`);
    return payload;
  }
  
  let textContent = "";
  let parsedSuccessfully = false;
  const isPotentialJson = isPotentialJsonTextContainer(payload);
  
  if (isPotentialJson) {
    const safePayload = sanitizePayloadForJsonParsing(payload);
    
    try {
      // First attempt with sanitized payload
      const parsedAsJson = safeDestr<FlexibleJsonResponse>(safePayload);
      const extractedText = extractTextFromJsonResponse(parsedAsJson);
      
      if (extractedText) {
        textContent = extractedText;
        parsedSuccessfully = true;
        console.log(`[textParsers] Successfully parsed JSON text of length: ${textContent.length}`);
      }
    } catch {
      // JSON parsing failed with sanitized payload
      const regexExtracted = extractTextUsingRegex(safePayload);
      if (regexExtracted) {
        textContent = regexExtracted;
        parsedSuccessfully = true;
        console.log(`[textParsers] Extracted text via regex, length: ${textContent.length}`);
      }
    }
  }
  
  if (!parsedSuccessfully) {
    // More aggressive extraction for partially formed JSON
    const advancedExtracted = extractTextAdvanced(payload);
    if (advancedExtracted) {
      textContent = advancedExtracted;
      parsedSuccessfully = true;
      console.log(`[textParsers] Advanced extraction found text of length: ${textContent.length}`);
    }
  }
  
  // If still not successful, try manual extraction methods
  if (!parsedSuccessfully) {
    const manualExtracted = extractTextManual(payload);
    if (manualExtracted) {
      textContent = manualExtracted;
      console.warn(
        `[textParsers] ${eventType} event payload was not valid JSON or did not match expected structure. Manually extracted: '${textContent.length} chars'`,
      );
    } else if (eventType === "chunk" && !isPotentialJson) {
      // For 'chunk' events without JSON structure, treat as raw text
      textContent = payload;
      console.warn(
        `[textParsers] 'chunk' event payload not recognized as JSON text structure. Treating as raw text of length: ${textContent.length}`,
      );
    } else if (isPotentialJson) {
      // It was identified as potential JSON but parsing failed
      console.warn(
        `[textParsers] ${eventType} event was JSON-like but text extraction failed. Payload length: ${payload.length}`,
      );
      
      const lastResortExtracted = extractTextLastResort(payload);
      if (lastResortExtracted) {
        textContent = lastResortExtracted;
        console.log(`[textParsers] Last resort extraction succeeded, length: ${textContent.length}`);
      }
    } else {
      // Default fallback: use raw text
      textContent = payload;
      console.warn(
        `[textParsers] ${eventType} event payload not recognized as structured text. Using raw text of length: ${textContent.length}`,
      );
    }
  }
  
  // Always finalize the text content
  if (textContent) {
    return finalizeTextContent(textContent);
  }
  
  return "";
}