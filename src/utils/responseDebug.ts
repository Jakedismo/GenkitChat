/**
 * Response Debug Utilities
 * 
 * A collection of utilities to help debug and diagnose issues with
 * truncated or malformed responses in the chat application.
 */

import { ParsedJsonData } from "@/types/chat";

interface ResponseAnalysis {
  totalLength: number;
  isTruncated: boolean;
  truncationDetails?: {
    position: number;
    context: string;
  };
  structureInfo: {
    isArray: boolean;
    isObject: boolean;
    hasNestedContent: boolean;
    contentPartCount?: number;
  };
}

/**
 * Analyzes a response object to identify potential truncation or formatting issues
 */
export function analyzeResponse(response: any): ResponseAnalysis {
  // Default result structure
  const result: ResponseAnalysis = {
    totalLength: 0,
    isTruncated: false,
    structureInfo: {
      isArray: false,
      isObject: false,
      hasNestedContent: false
    }
  };
  
  // Handle null/undefined response
  if (!response) {
    return {
      ...result,
      isTruncated: true,
      truncationDetails: {
        position: 0,
        context: "Response is null or undefined"
      }
    };
  }
  
  // Check if response is an array
  if (Array.isArray(response)) {
    result.structureInfo.isArray = true;
    result.structureInfo.contentPartCount = response.length;
    
    // Count total length of all array items
    let totalTextLength = 0;
    response.forEach(item => {
      const itemText = typeof item === 'string' ? item : 
                     (item?.text || JSON.stringify(item));
      totalTextLength += itemText.length;
    });
    
    result.totalLength = totalTextLength;
    
    // Check for truncation indicators in array items
    const lastItem = response[response.length - 1];
    const lastItemText = typeof lastItem === 'string' ? lastItem : 
                        (lastItem?.text || JSON.stringify(lastItem));
    
    // Check for common truncation patterns
    if (lastItemText.endsWith('\\') || lastItemText.endsWith('"')) {
      result.isTruncated = true;
      result.truncationDetails = {
        position: totalTextLength,
        context: `Ends with truncation marker: ${lastItemText.slice(-10)}`
      };
    }
  } 
  // Check if response is an object
  else if (typeof response === 'object') {
    result.structureInfo.isObject = true;
    
    // Check for nested content structure
    if (response.content && Array.isArray(response.content)) {
      result.structureInfo.hasNestedContent = true;
      result.structureInfo.contentPartCount = response.content.length;
      
      // Join all content parts to check total length
      let totalTextLength = 0;
      response.content.forEach((part: any) => {
        const partText = typeof part === 'string' ? part : 
                       (part?.text || JSON.stringify(part));
        totalTextLength += partText.length;
      });
      
      result.totalLength = totalTextLength;
    } else {
      // Regular object, stringify to check length
      const stringified = JSON.stringify(response);
      result.totalLength = stringified.length;
      
      // Check if JSON appears truncated
      if (stringified.endsWith('}') && !stringified.includes('"}')) {
        result.isTruncated = true;
        result.truncationDetails = {
          position: stringified.length,
          context: `Possible JSON truncation: ${stringified.slice(-20)}`
        };
      }
    }
  } 
  // Handle string response
  else if (typeof response === 'string') {
    result.totalLength = response.length;
    
    // Check for incomplete JSON or markdown
    if ((response.includes('{') && !response.includes('}')) || 
        (response.includes('[') && !response.includes(']')) ||
        (response.includes('```') && (response.match(/```/g) || []).length % 2 !== 0)) {
      result.isTruncated = true;
      result.truncationDetails = {
        position: response.length,
        context: `Unbalanced delimiters in text: ${response.slice(-30)}`
      };
    }
  }
  
  return result;
}

/**
 * Attempts to repair common truncation issues in responses
 */
export function repairTruncatedResponse(response: any): any {
  if (!response) return response;
  
  // Handle string responses
  if (typeof response === 'string') {
    let repaired = response;
    
    // Balance code blocks
    const codeBlockCount = (repaired.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      repaired += '\n```';
    }
    
    // Balance parentheses/brackets/braces if needed
    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    if (openBraces > closeBraces) {
      repaired += '}'.repeat(openBraces - closeBraces);
    }
    
    // Remove trailing backslashes that might cause parsing issues
    repaired = repaired.replace(/\\+$/, '');
    
    return repaired;
  }
  
  // Handle array of text chunks
  if (Array.isArray(response)) {
    // Join chunks, repair the joined text, then return as single entry
    const joined = response.map(chunk => 
      typeof chunk === 'string' ? chunk : 
      (chunk?.text || JSON.stringify(chunk))
    ).join('');
    
    return repairTruncatedResponse(joined);
  }
  
  // Handle structured object with nested content
  if (typeof response === 'object' && response.content && Array.isArray(response.content)) {
    const joined = response.content.map((part: any) => 
      typeof part === 'string' ? part : 
      (part?.text || JSON.stringify(part))
    ).join('');
    
    return repairTruncatedResponse(joined);
  }
  
  return response;
}

/**
 * Logs detailed debug information about a response
 */
export function logResponseDebugInfo(label: string, response: any): void {
  console.group(`Response Debug [${label}]`);
  
  const analysis = analyzeResponse(response);
  console.log('Analysis:', analysis);
  
  if (analysis.isTruncated) {
    console.warn('⚠️ Truncation detected', analysis.truncationDetails);
  }
  
  if (typeof response === 'string') {
    console.log('Content (first 100 chars):', response.substring(0, 100));
    console.log('Content (last 100 chars):', response.substring(response.length - 100));
  } else if (Array.isArray(response)) {
    console.log('Array entries:', response.length);
    if (response.length > 0) {
      console.log('First entry type:', typeof response[0]);
      console.log('Last entry type:', typeof response[response.length - 1]);
    }
  } else if (typeof response === 'object' && response !== null) {
    console.log('Object keys:', Object.keys(response));
  }
  
  console.log('Raw value:', response);
  console.groupEnd();
}

/**
 * Custom hook to debug a parsed response in local storage for developer analysis
 */
export function storeDebugResponse(key: string, response: ParsedJsonData): void {
  try {
    const debugStore = JSON.parse(localStorage.getItem('debug_responses') || '{}');
    debugStore[key] = {
      timestamp: new Date().toISOString(),
      response,
      analysis: analyzeResponse(response)
    };
    localStorage.setItem('debug_responses', JSON.stringify(debugStore));
    console.log(`Stored debug response with key: ${key}`);
  } catch (error) {
    console.error('Failed to store debug response:', error);
  }
}

export default {
  analyzeResponse,
  repairTruncatedResponse,
  logResponseDebugInfo,
  storeDebugResponse
};