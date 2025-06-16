// next.config.mjs
import path from "node:path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const empty = "./stubs/empty.js";

/**
 * WEBPACK-TO-TURBOPACK MIGRATION NOTES:
 * =====================================
 *
 * This configuration has been updated for Turbopack compatibility as part of the
 * webpack-to-turbopack migration (Phase 2). Key changes:
 *
 * 1. Enhanced turbopack.resolveAlias with all necessary aliases including server-side pdfjs-dist
 * 2. Webpack function has been commented out but preserved for potential rollback
 * 3. Original webpack optimizations being tested without direct turbopack equivalents:
 *    - usedExports: false - Previously disabled to prevent variable hoisting issues
 *    - sideEffects: false - Previously disabled to preserve initialization order
 *
 * These optimizations addressed initialization order issues and variable hoisting problems.
 * We are testing whether turbopack handles these cases better by default before implementing
 * equivalent optimizations.
 */

/** @type {import('next').NextConfig} */
export default {
  output: "standalone",

  // Transpile specific packages that use ESM
  transpilePackages: [
    'bail',
    'ccount',
    'character-entities',
    'character-entities-legacy',
    'character-reference-invalid',
    'comma-separated-tokens',
    'decode-named-character-reference',
    'devlop',
    'escape-string-regexp',
    'estree-util-is-identifier-name',
    'hast-util-is-element',
    'hast-util-to-jsx-runtime',
    'hast-util-to-text',
    'hast-util-whitespace',
    'html-url-attributes',
    'is-alphanumerical',
    'is-decimal',
    'is-hexadecimal',
    'is-plain-obj',
    'longest-streak',
    'lowlight',
    'lucide-react',
    'markdown-table',
    'mdast-util-find-and-replace',
    'mdast-util-from-markdown',
    'mdast-util-gfm',
    'mdast-util-gfm-autolink-literal',
    'mdast-util-gfm-footnote',
    'mdast-util-gfm-strikethrough',
    'mdast-util-gfm-table',
    'mdast-util-gfm-task-list-item',
    'mdast-util-mdx-expression',
    'mdast-util-mdx-jsx',
    'mdast-util-mdxjs-esm',
    'mdast-util-phrasing',
    'mdast-util-to-hast',
    'mdast-util-to-markdown',
    'mdast-util-to-string',
    'micromark',
    'micromark-core-commonmark',
    'micromark-extension-gfm',
    'micromark-extension-gfm-autolink-literal',
    'micromark-extension-gfm-footnote',
    'micromark-extension-gfm-strikethrough',
    'micromark-extension-gfm-table',
    'micromark-extension-gfm-tagfilter',
    'micromark-extension-gfm-task-list-item',
    'micromark-factory-destination',
    'micromark-factory-label',
    'micromark-factory-space',
    'micromark-factory-title',
    'micromark-factory-whitespace',
    'micromark-util-character',
    'micromark-util-chunked',
    'micromark-util-classify-character',
    'micromark-util-combine-extensions',
    'micromark-util-decode-numeric-character-reference',
    'micromark-util-decode-string',
    'micromark-util-encode',
    'micromark-util-html-tag-name',
    'micromark-util-normalize-identifier',
    'micromark-util-resolve-all',
    'micromark-util-sanitize-uri',
    'micromark-util-subtokenize',
    'property-information',
    'react-markdown',
    'rehype-highlight',
    'remark-gfm',
    'remark-parse',
    'remark-rehype',
    'remark-stringify',
    'space-separated-tokens',
    'stringify-entities',
    'trim-lines',
    'trough',
    'unified',
    'unist-util-find-after',
    'unist-util-is',
    'unist-util-position',
    'unist-util-stringify-position',
    'unist-util-visit',
    'unist-util-visit-parents',
    'vfile',
    'vfile-message',
    'zwitch',
  ],

  // Turbopack configuration ──────────────────────────────────────────
  turbopack: {
    resolveAlias: {
      // React-pdf/canvas compatibility
      canvas: { browser: empty },
      
      // Server-side pdfjs-dist compatibility - use legacy build for SSR to avoid browser-specific API errors
      "pdfjs-dist/build/pdf.mjs": {
        server: path.resolve(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.js')
      },
      
      // Node.js core module stubs for browser compatibility
      fs: { browser: empty },
      net: { browser: empty },
      tls: { browser: empty },
      dns: { browser: empty },
      child_process: { browser: empty },
      async_hooks: { browser: empty },
      dgram: { browser: empty },
      http2: { browser: empty },
      "fs/promises": { browser: empty },
      http: { browser: empty },
      https: { browser: empty },
      os: { browser: empty },
      path: { browser: empty },
      stream: { browser: empty },
      crypto: { browser: empty },
      zlib: { browser: empty },
      util: { browser: empty },
      assert: { browser: empty },
      events: { browser: empty },
      url: { browser: empty },
      buffer: { browser: empty },
      querystring: { browser: empty },
      
      // OpenTelemetry compatibility
      "@opentelemetry/exporter-jaeger": { browser: empty },
    },
  },

  // Enable ESLint and TypeScript checking during build for better code quality
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  // Webpack optimizations for better bundle size and performance
  webpack: (config, { isServer }) => {
    // Optimize bundle splitting
    if (!isServer) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks.cacheGroups,
          // Separate vendor chunks for better caching
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10,
          },
          // Separate UI components
          ui: {
            test: /[\\/]node_modules[\\/](@radix-ui|lucide-react)[\\/]/,
            name: 'ui',
            chunks: 'all',
            priority: 20,
          },
          // Separate markdown processing
          markdown: {
            test: /[\\/]node_modules[\\/](react-markdown|remark-|rehype-|micromark|mdast-|hast-|unist-)[\\/]/,
            name: 'markdown',
            chunks: 'all',
            priority: 20,
          },
          // Separate AI/Genkit packages
          genkit: {
            test: /[\\/]node_modules[\\/](@genkit-ai|genkit)[\\/]/,
            name: 'genkit',
            chunks: 'all',
            priority: 20,
          },
        },
      };
    }

    // Optimize imports
    config.resolve.alias = {
      ...config.resolve.alias,
      // Use lighter alternatives where possible
      'react-markdown$': 'react-markdown/lib/react-markdown.js',
    };

    return config;
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:9002'], // Fixed: App runs on port 9002, not 3000
    },
  },

  // (unchanged) server-only deps
  serverExternalPackages: [
    "@genkit-ai/core",
    "@genkit-ai/express",
    "@genkit-ai/googleai",
    "@genkit-ai/next",
    "@genkit-ai/dev-local-vectorstore",
    "@genkit-ai/vertexai",
    "@opentelemetry/exporter-jaeger",
    "genkit",
    "genkitx-mcp",
    "genkitx-openai",
    "pdf-parse",
    "llm-chunk",
    "uuid",
  ],
};
