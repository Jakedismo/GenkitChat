import { 
  sanitizeUserInput, 
  validateFilename, 
  validateSessionId, 
  validateModelId, 
  validateTemperaturePreset, 
  validateMaxTokens, 
  sanitizeMarkdown, 
  escapeHtml, 
  validateRedirectUrl,
  RateLimiter 
} from './security';

describe('Security Utilities', () => {
  describe('sanitizeUserInput', () => {
    test('removes dangerous script tags', () => {
      const input = 'Hello <script>alert("xss")</script> world';
      expect(sanitizeUserInput(input)).toBe('Hello  world');
    });

    test('removes javascript: URLs', () => {
      const input = 'Click <a href="javascript:alert(1)">here</a>';
      const result = sanitizeUserInput(input);
      expect(result).not.toContain('javascript:');
      expect(result).toContain('href=');
    });

    test('removes event handlers', () => {
      const input = '<div onclick="alert(1)">Click me</div>';
      const result = sanitizeUserInput(input);
      expect(result).not.toContain('onclick=');
      expect(result).toContain('Click me');
    });

    test('limits input length', () => {
      const longInput = 'a'.repeat(20000);
      const result = sanitizeUserInput(longInput);
      expect(result.length).toBe(10000);
    });
  });

  describe('validateFilename', () => {
    test('accepts valid filenames', () => {
      expect(validateFilename('document.pdf')).toBe(true);
      expect(validateFilename('my-file_123.txt')).toBe(true);
    });

    test('rejects path traversal attempts', () => {
      expect(validateFilename('../../../etc/passwd')).toBe(false);
      expect(validateFilename('folder/file.txt')).toBe(false);
    });

    test('rejects reserved Windows names', () => {
      expect(validateFilename('CON.txt')).toBe(false);
      expect(validateFilename('PRN.pdf')).toBe(false);
    });

    test('rejects invalid characters', () => {
      expect(validateFilename('file<name>.txt')).toBe(false);
      expect(validateFilename('file|name.txt')).toBe(false);
    });
  });

  describe('validateSessionId', () => {
    test('accepts valid session IDs', () => {
      expect(validateSessionId('abc123-def456-ghi789')).toBe(true);
      expect(validateSessionId('session-12345678')).toBe(true);
    });

    test('rejects invalid session IDs', () => {
      expect(validateSessionId('short')).toBe(false);
      expect(validateSessionId('invalid@session')).toBe(false);
      expect(validateSessionId('a'.repeat(200))).toBe(false);
    });
  });

  describe('validateModelId', () => {
    test('accepts valid model IDs', () => {
      expect(validateModelId('googleai/gemini-pro')).toBe(true);
      expect(validateModelId('openai/gpt-4')).toBe(true);
      expect(validateModelId('openai/o1-preview')).toBe(true);
      expect(validateModelId('anthropic/claude-3')).toBe(true);
    });

    test('rejects invalid model IDs', () => {
      expect(validateModelId('invalid/model')).toBe(false);
      expect(validateModelId('malicious-model')).toBe(false);
    });
  });

  describe('validateTemperaturePreset', () => {
    test('accepts valid presets', () => {
      expect(validateTemperaturePreset('precise')).toBe(true);
      expect(validateTemperaturePreset('normal')).toBe(true);
      expect(validateTemperaturePreset('creative')).toBe(true);
    });

    test('rejects invalid presets', () => {
      expect(validateTemperaturePreset('invalid')).toBe(false);
      expect(validateTemperaturePreset('extreme')).toBe(false);
    });
  });

  describe('validateMaxTokens', () => {
    test('accepts valid token counts', () => {
      expect(validateMaxTokens(1024)).toBe(true);
      expect(validateMaxTokens(4096)).toBe(true);
      expect(validateMaxTokens(32768)).toBe(true);
    });

    test('rejects invalid token counts', () => {
      expect(validateMaxTokens(0)).toBe(false);
      expect(validateMaxTokens(-100)).toBe(false);
      expect(validateMaxTokens(100000)).toBe(false);
      expect(validateMaxTokens(1.5)).toBe(false);
    });
  });

  describe('sanitizeMarkdown', () => {
    test('removes dangerous script tags', () => {
      const markdown = '# Title\n<script>alert("xss")</script>\nContent';
      const result = sanitizeMarkdown(markdown);
      expect(result).not.toContain('<script>');
      expect(result).toContain('# Title');
      expect(result).toContain('Content');
    });

    test('removes javascript: URLs in links', () => {
      const markdown = '[Click here](javascript:alert(1))';
      const result = sanitizeMarkdown(markdown);
      expect(result).not.toContain('javascript:');
      expect(result).toContain('[Click here]');
      expect(result).toContain('#');
    });

    test('preserves safe markdown', () => {
      const markdown = '# Title\n\n**Bold** and *italic* text\n\n[Safe link](https://example.com)';
      const result = sanitizeMarkdown(markdown);
      expect(result).toBe(markdown);
    });
  });

  describe('escapeHtml', () => {
    test('escapes HTML entities correctly', () => {
      // Test basic HTML escaping
      const result1 = escapeHtml('<script>alert("xss")</script>');
      expect(result1).toContain('&lt;script&gt;');
      expect(result1).toContain('&lt;/script&gt;');

      const result2 = escapeHtml('&');
      expect(result2).toBe('&amp;');

      const result3 = escapeHtml('<div class="test">Hello & goodbye</div>');
      expect(result3).toContain('&lt;div');
      expect(result3).toContain('&amp;');
      expect(result3).toContain('&gt;');
    });

    test('handles empty and special strings', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml('normal text')).toBe('normal text');
    });
  });

  describe('validateRedirectUrl', () => {
    test('BUG-028: validates relative URLs correctly in SSR environment', () => {
      // Mock SSR environment by temporarily removing window
      const originalWindow = global.window;
      delete (global as any).window;

      try {
        // Relative URLs should be allowed when no allowed origins specified
        expect(validateRedirectUrl('/relative/path')).toBe(true);
        expect(validateRedirectUrl('/another/path')).toBe(true);
        expect(validateRedirectUrl('/')).toBe(true);

        // Protocol-relative URLs should be rejected (security risk)
        expect(validateRedirectUrl('//malicious.com')).toBe(false);

        // Relative URLs should be rejected when allowed origins are specified
        expect(validateRedirectUrl('/relative/path', ['https://example.com'])).toBe(false);

        // Absolute URLs should work with allowed origins
        expect(validateRedirectUrl('https://example.com', ['https://example.com'])).toBe(true);
        expect(validateRedirectUrl('https://malicious.com', ['https://example.com'])).toBe(false);

        // Absolute URLs should be rejected when no allowed origins specified
        expect(validateRedirectUrl('https://example.com')).toBe(false);
      } finally {
        // Restore window
        global.window = originalWindow;
      }
    });

    test('validates URLs with allowed origins in SSR', () => {
      // Mock SSR environment
      const originalWindow = global.window;
      delete (global as any).window;

      try {
        expect(validateRedirectUrl('https://example.com', ['https://example.com'])).toBe(true);
        expect(validateRedirectUrl('https://malicious.com', ['https://example.com'])).toBe(false);
        expect(validateRedirectUrl('https://trusted.com', ['https://example.com', 'https://trusted.com'])).toBe(true);
      } finally {
        global.window = originalWindow;
      }
    });

    test('handles invalid URLs gracefully', () => {
      expect(validateRedirectUrl('not-a-url')).toBe(false);
      expect(validateRedirectUrl('')).toBe(false);
      expect(validateRedirectUrl('javascript:alert(1)')).toBe(false);
    });

    test('BUG-030: validates relative URLs correctly in browser environment', () => {
      // Mock window.location
      Object.defineProperty(window, 'location', {
        value: { origin: 'https://example.com' },
        writable: true,
      });

      // Relative URLs should be allowed when no allowed origins specified
      expect(validateRedirectUrl('/relative/path')).toBe(true);
      expect(validateRedirectUrl('/another/path')).toBe(true);
      expect(validateRedirectUrl('/')).toBe(true);

      // Protocol-relative URLs should be rejected
      expect(validateRedirectUrl('//malicious.com')).toBe(false);

      // Relative URLs with allowed origins - should check if current origin is in allowed list
      expect(validateRedirectUrl('/relative/path', ['https://example.com'])).toBe(true);
      expect(validateRedirectUrl('/relative/path', ['https://other.com'])).toBe(false);
    });

    test('BUG-030: validates absolute URLs correctly in browser environment', () => {
      // Mock window.location
      Object.defineProperty(window, 'location', {
        value: { origin: 'https://example.com' },
        writable: true,
      });

      // Without allowed origins, only same origin should be allowed
      expect(validateRedirectUrl('https://example.com/path')).toBe(true);
      expect(validateRedirectUrl('https://malicious.com')).toBe(false);

      // With allowed origins, should be strict (not automatically include current origin)
      expect(validateRedirectUrl('https://trusted.com', ['https://trusted.com'])).toBe(true);
      expect(validateRedirectUrl('https://example.com', ['https://trusted.com'])).toBe(false); // Current origin not in allowed list
      expect(validateRedirectUrl('https://malicious.com', ['https://trusted.com'])).toBe(false);

      // Current origin should only be allowed if explicitly in the allowed list
      expect(validateRedirectUrl('https://example.com', ['https://example.com', 'https://trusted.com'])).toBe(true);
    });

    test('handles edge cases correctly', () => {
      const originalWindow = global.window;
      delete (global as any).window;

      try {
        // Empty allowed origins array should behave like no allowed origins
        expect(validateRedirectUrl('/relative/path', [])).toBe(true);
        expect(validateRedirectUrl('https://example.com', [])).toBe(false);

        // Test various relative path formats
        expect(validateRedirectUrl('/path/to/resource')).toBe(true);
        expect(validateRedirectUrl('/path?query=value')).toBe(true);
        expect(validateRedirectUrl('/path#fragment')).toBe(true);

        // Test malformed URLs
        expect(validateRedirectUrl('http://')).toBe(false);
        expect(validateRedirectUrl('https://')).toBe(false);
      } finally {
        global.window = originalWindow;
      }
    });
  });

  describe('RateLimiter', () => {
    test('allows requests within limit', () => {
      const limiter = new RateLimiter(3, 1000); // 3 requests per second

      expect(limiter.isAllowed('user1')).toBe(true);
      expect(limiter.isAllowed('user1')).toBe(true);
      expect(limiter.isAllowed('user1')).toBe(true);
    });

    test('blocks requests over limit', () => {
      const limiter = new RateLimiter(2, 1000); // 2 requests per second

      expect(limiter.isAllowed('user1')).toBe(true);
      expect(limiter.isAllowed('user1')).toBe(true);
      expect(limiter.isAllowed('user1')).toBe(false); // Should be blocked
    });

    test('resets user limits', () => {
      const limiter = new RateLimiter(1, 1000);

      expect(limiter.isAllowed('user1')).toBe(true);
      expect(limiter.isAllowed('user1')).toBe(false);

      limiter.reset('user1');
      expect(limiter.isAllowed('user1')).toBe(true);
    });

    test('cleans up old requests', () => {
      const limiter = new RateLimiter(1, 100); // Very short window

      expect(limiter.isAllowed('user1')).toBe(true);
      
      // Wait for window to expire
      setTimeout(() => {
        limiter.cleanup();
        expect(limiter.isAllowed('user1')).toBe(true);
      }, 150);
    });
  });
});
