export function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item) {
          return item.text;
        }
        return JSON.stringify(item);
      })
      .join("");
  }
  if (content && typeof content === "object" && "text" in content) {
    return String(content.text);
  }
  return JSON.stringify(content);
}

/**
 * Enhanced text normalization function that handles various text formats
 * Used by chat components to normalize message content
 */
export function normalizeText(text: unknown): string {
  if (typeof text === 'string') {
    return text;
  }

  if (Array.isArray(text)) {
    return text.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        if (typeof item.text === 'string') return item.text;
        if (typeof item.content === 'string') return item.content;
        if (typeof item.value === 'string') return item.value;
        if (typeof item.data === 'string') return item.data;
      }
      return JSON.stringify(item);
    }).join('');
  }

  if (text && typeof text === 'object') {
    // Order of preference: .text, .content, .value, .data
    if ('text' in text && typeof text.text === 'string') {
      return text.text;
    }
    if ('content' in text && typeof text.content === 'string') {
      return text.content;
    }
    if ('value' in text && typeof text.value === 'string') {
      return text.value;
    }
    if ('data' in text && typeof text.data === 'string') {
      return text.data;
    }

    // Handle 'parts' array within objects, applying the same logic
    if ('parts' in text && Array.isArray(text.parts)) {
      return text.parts.map((part: { text?: string; content?: string; value?: string; data?: string }) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          if (typeof part.text === 'string') return part.text;
          if (typeof part.content === 'string') return part.content;
          if (typeof part.value === 'string') return part.value;
          if (typeof part.data === 'string') return part.data;
        }
        return JSON.stringify(part);
      }).join('');
    }
    // Last resort for objects not matching known structures
    return JSON.stringify(text);
  }

  // Fallback for null, undefined, boolean, number, etc.
  return String(text == null ? '' : text); // Ensure null/undefined become empty string
}