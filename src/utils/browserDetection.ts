// src/utils/browserDetection.ts

export interface BrowserCapabilities {
  supportsWebWorkers: boolean;
  supportsPdfJS: boolean; // Assuming pdfjs-dist is used and pdfjsLib is global or imported
  supportsCanvas: boolean;
  supportsTextSelection: boolean;
  isMobile: boolean;
  browser: {
    name: 'chrome' | 'firefox' | 'safari' | 'edge' | 'ie' | 'opera' | 'unknown';
    version: number; // Major version number
  };
}

export type RenderingStrategy = 'full' | 'basic' | 'minimal';

/**
 * Detects various capabilities of the user's browser.
 * @returns {BrowserCapabilities} An object containing detected browser capabilities.
 */
export function detectBrowserCapabilities(): BrowserCapabilities {
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
  let browserName: BrowserCapabilities['browser']['name'] = 'unknown';
  let browserVersion = 0;

  // Detect browser name and version (simplified)
  let match;
  if ((match = ua.match(/(edge|edg)\/([\d.]+)/i))) { // Edge
    browserName = 'edge';
    browserVersion = parseInt(match[2], 10);
  } else if ((match = ua.match(/firefox\/([\d.]+)/i))) { // Firefox
    browserName = 'firefox';
    browserVersion = parseInt(match[1], 10);
  } else if ((match = ua.match(/opr\/([\d.]+)/i)) || (match = ua.match(/opera\/([\d.]+)/i))) { // Opera
    browserName = 'opera';
    browserVersion = parseInt(match[1], 10);
  } else if ((match = ua.match(/chrome\/([\d.]+)/i)) && !ua.match(/edg/i)) { // Chrome (ensure not Edge)
    browserName = 'chrome';
    browserVersion = parseInt(match[1], 10);
  } else if ((match = ua.match(/safari\/([\d.]+)/i)) && !ua.match(/chrome/i) && !ua.match(/edg/i)) { // Safari (ensure not Chrome/Edge)
    browserName = 'safari';
    if ((match = ua.match(/version\/([\d.]+)/i))) {
      browserVersion = parseInt(match[1], 10);
    }
  } else if (ua.indexOf('MSIE ') > 0 || ua.indexOf('Trident/') > 0) { // IE
    browserName = 'ie';
    match = ua.match(/(msie\s|rv:)([\d.]+)/i);
    if (match) {
      browserVersion = parseInt(match[2], 10);
    }
  }


  const capabilities: BrowserCapabilities = {
    supportsWebWorkers: typeof Worker !== 'undefined',
    // For pdfJS, we assume if the library is loaded, it's supported.
    // A more robust check might involve checking for `window.pdfjsLib`.
    supportsPdfJS: typeof (window as any).pdfjsLib !== 'undefined',
    supportsCanvas: !!window.document.createElement('canvas').getContext,
    supportsTextSelection: typeof window.getSelection === 'function',
    isMobile: /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua.toLowerCase()) ||
              (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
              (window.matchMedia && window.matchMedia('(pointer:coarse)').matches),
    browser: {
      name: browserName,
      version: browserVersion,
    },
  };

  return capabilities;
}

/**
 * Determines a safe rendering strategy based on detected browser capabilities.
 * @param {BrowserCapabilities} capabilities - The detected browser capabilities.
 * @returns {RenderingStrategy} The recommended rendering strategy.
 */
export function getSafeRenderingStrategy(capabilities: BrowserCapabilities): RenderingStrategy {
  if (capabilities.browser.name === 'ie' && capabilities.browser.version < 11) {
    // IE 10 and below get minimal support
    return 'minimal';
  }

  if (
    capabilities.supportsPdfJS &&
    capabilities.supportsWebWorkers &&
    capabilities.supportsCanvas &&
    capabilities.supportsTextSelection
  ) {
    // Prefer full features if primary capabilities are present
    // Further checks for specific PDF.js features might be needed for 'full'
    if (capabilities.browser.name === 'safari' && capabilities.browser.version < 15) {
        // Older Safari might have issues with complex canvas/worker tasks
        return 'basic';
    }
    return 'full';
  } else if (capabilities.supportsPdfJS && capabilities.supportsCanvas) {
    // Basic support if PDF.js and Canvas are available, but maybe not workers or full text selection
    return 'basic';
  } else {
    // Minimal support if core requirements are missing
    return 'minimal';
  }
}

// Example usage (can be removed or kept for testing):
// const caps = detectBrowserCapabilities();
// console.log('Detected Capabilities:', caps);
// console.log('Recommended Strategy:', getSafeRenderingStrategy(caps));