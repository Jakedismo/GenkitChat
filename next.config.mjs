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

  // WEBPACK CONFIGURATION - COMMENTED OUT FOR TURBOPACK MIGRATION
  // ──────────────────────────────────────────────────────────────────
  // The following webpack configuration has been disabled as part of the
  // webpack-to-turbopack migration. It is preserved for potential rollback
  // if turbopack compatibility issues arise.
  //
  // Original webpack optimizations handled:
  // - Canvas module replacement for react-pdf compatibility
  // - Server-side pdfjs-dist legacy build aliasing
  // - Node.js core module fallbacks for browser builds
  // - Optimization settings to prevent variable hoisting issues
  //
  /*
  webpack: (config, { isServer, webpack }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: path.resolve(__dirname, 'src/stubs/empty.js'),
    };

    if (isServer) {
      // Use legacy build of pdfjs-dist for SSR to avoid browser-specific API errors
      // Ensure the path to pdf.js is correct based on your project structure
      config.resolve.alias['pdfjs-dist/build/pdf.mjs'] = path.resolve(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.js');
    }

    if (!isServer) {
      // For react-pdf to prevent issues with canvas module resolution on client-side
      // Using NormalModuleReplacementPlugin for 'canvas'
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /canvas/,
          path.resolve(process.cwd(), 'src/stubs/empty.js') // Use absolute path to stub
        )
      );
      
      // Remove the direct alias for canvas as the plugin handles it more robustly
      // if (config.resolve.alias && config.resolve.alias.canvas) {
      //   delete config.resolve.alias.canvas;
      // }

      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
        async_hooks: false,
        dgram: false,
        http2: false,
        "fs/promises": false,
        http: false,
        https: false,
        os: false,
        path: false,
        stream: false,
        crypto: false,
        zlib: false,
        util: false,
        assert: false,
        events: false,
        url: false,
        buffer: false,
        querystring: false,
        "@opentelemetry/exporter-jaeger": false,
      };
    }
    
    // Adjust optimization settings to help with initialization order issues
    if (!config.optimization) {
      config.optimization = {};
    }
    
    // Prevent variable hoisting issues
    if (!config.optimization.minimizer) {
      config.optimization.minimizer = [];
    }
    
    // Update terser options to preserve variable initialization order
    config.optimization.usedExports = false;
    config.optimization.sideEffects = false;
    
    return config;
  },
  */

  // Ignore ESLint errors and type checking during build
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
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
