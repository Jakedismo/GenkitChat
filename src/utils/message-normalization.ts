export function normalizeText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (content === null || content === undefined) {
    return '';
  }

  if (Array.isArray(content)) {
    return content.map(normalizeText).join('');
  }

  if (typeof content === 'object') {
    if ('text' in content && typeof (content as { text: unknown }).text === 'string') {
      return (content as { text: string }).text;
    }
    if ('content' in content && (content as { content: unknown }).content) {
      return normalizeText((content as { content: unknown }).content);
    }
    if ('parts' in content && Array.isArray((content as { parts: unknown }).parts)) {
      return (content as { parts: unknown[] }).parts.map(normalizeText).join('');
    }
    // Add other common AI response structures as needed
    if ('message' in content && (content as { message: unknown }).message) {
        return normalizeText((content as {message: unknown}).message)
    }
    if ('candidates' in content && Array.isArray((content as {candidates: unknown[]}).candidates) && (content as {candidates: unknown[]}).candidates.length > 0) {
        return normalizeText((content as {candidates: any[]}).candidates[0])
    }
  }

  // Fallback for other types or unhandled object structures
  try {
    const stringified = JSON.stringify(content);
    // Avoid returning "{}" for empty objects
    return stringified === '{}' ? '' : stringified;
  } catch {
    return ''; // Should not happen with typical data, but as a safeguard
  }
}