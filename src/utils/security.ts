/**
 * Security utilities for input validation and XSS prevention
 * Fixes BUG-020: Potential XSS vulnerabilities in markdown rendering
 */

/**
 * Sanitizes user input to prevent XSS attacks
 */
export function sanitizeUserInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    // Remove potentially dangerous HTML tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
    // Remove javascript: and data: URLs
    .replace(/javascript:[^"'\s]*/gi, '')
    .replace(/data:[^"'\s]*/gi, '')
    // Remove event handlers
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^"'\s]+/gi, '')
    // Limit length to prevent DoS
    .slice(0, 10000);
}

/**
 * Validates that a string is a safe filename
 */
export function validateFilename(filename: string): boolean {
  if (typeof filename !== 'string' || filename.length === 0) {
    return false;
  }

  // Check for path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  // Check for reserved names (Windows)
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  const nameWithoutExt = filename.split('.')[0].toUpperCase();
  if (reservedNames.includes(nameWithoutExt)) {
    return false;
  }

  // Check for invalid characters
  const invalidChars = /[<>:"|?*\x00-\x1f]/;
  if (invalidChars.test(filename)) {
    return false;
  }

  // Check length
  if (filename.length > 255) {
    return false;
  }

  return true;
}

/**
 * Validates that a session ID is safe
 */
export function validateSessionId(sessionId: string): boolean {
  if (typeof sessionId !== 'string') {
    return false;
  }

  // Session IDs should be alphanumeric with hyphens only
  const validPattern = /^[a-zA-Z0-9-]+$/;
  return validPattern.test(sessionId) && sessionId.length >= 8 && sessionId.length <= 128;
}

/**
 * Validates that a model ID is from an allowed list
 */
export function validateModelId(modelId: string): boolean {
  if (typeof modelId !== 'string') {
    return false;
  }

  // Allow only specific model patterns
  const allowedPatterns = [
    /^googleai\/gemini-/,
    /^openai\/gpt-/,
    /^openai\/o1-/,
    /^anthropic\/claude-/,
  ];

  return allowedPatterns.some(pattern => pattern.test(modelId));
}

/**
 * Validates temperature preset values
 */
export function validateTemperaturePreset(preset: string): preset is 'precise' | 'normal' | 'creative' {
  return ['precise', 'normal', 'creative'].includes(preset);
}

/**
 * Validates max tokens value
 */
export function validateMaxTokens(maxTokens: number): boolean {
  return typeof maxTokens === 'number' && 
         Number.isInteger(maxTokens) && 
         maxTokens > 0 && 
         maxTokens <= 32768; // Reasonable upper limit
}

/**
 * Sanitizes markdown content to prevent XSS while preserving formatting
 */
export function sanitizeMarkdown(markdown: string): string {
  if (typeof markdown !== 'string') {
    return '';
  }

  return markdown
    // Remove HTML script tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove HTML iframe tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Remove HTML object/embed tags
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    // Remove javascript: URLs in links
    .replace(/\[([^\]]*)\]\(javascript:[^)]*\)/gi, '[$1](#)')
    // Remove data: URLs in images (except safe ones)
    .replace(/!\[([^\]]*)\]\(data:(?!image\/(png|jpg|jpeg|gif|svg\+xml))[^)]*\)/gi, '![$1](#)')
    // Remove HTML event handlers
    .replace(/on\w+\s*=/gi, '')
    // Limit total length
    .slice(0, 50000);
}

/**
 * Rate limiting helper
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    
    return true;
  }

  reset(identifier: string): void {
    this.requests.delete(identifier);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [identifier, requests] of this.requests.entries()) {
      const validRequests = requests.filter(time => now - time < this.windowMs);
      if (validRequests.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, validRequests);
      }
    }
  }
}

/**
 * Content Security Policy helpers
 */
export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Note: unsafe-eval needed for some dependencies
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", "data:", "https:"],
  'font-src': ["'self'", "https:"],
  'connect-src': ["'self'", "https:"],
  'media-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [],
} as const;

/**
 * Generate CSP header value
 */
export function generateCSPHeader(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

/**
 * Escape HTML entities
 */
export function escapeHtml(text: string): string {
  // Check if we're in a browser environment
  if (typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Fallback for SSR environments
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validate URL is safe for redirects
 * @param url - The URL to validate
 * @param allowedOrigins - Optional array of allowed origins (for SSR environments)
 */
export function validateRedirectUrl(url: string, allowedOrigins?: string[]): boolean {
  try {
    const parsed = new URL(url);

    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      // In SSR environment, be more restrictive
      if (allowedOrigins && allowedOrigins.length > 0) {
        return allowedOrigins.includes(parsed.origin);
      }
      // If no allowed origins specified, only allow relative URLs
      return parsed.pathname.startsWith('/') && !parsed.host;
    }

    // In browser environment, only allow same origin or specific trusted domains
    if (allowedOrigins && allowedOrigins.length > 0) {
      return allowedOrigins.includes(parsed.origin) || parsed.origin === window.location.origin;
    }

    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}
