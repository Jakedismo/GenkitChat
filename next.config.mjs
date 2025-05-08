// next.config.mjs
import path from "node:path";

const empty = "./stubs/empty.js";

/** @type {import('next').NextConfig} */
export default {
  output: "standalone",

  // Turbopack-only part ──────────────────────────────────────────
  turbopack: {
    resolveAlias: {
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
      "@opentelemetry/exporter-jaeger": { browser: empty },
    },
  },

  // -- Optional: keep Webpack tweaks for prod if you *don’t* ship
  //    Turbopack builds yet. Turbopack simply ignores this block.
  webpack: (config, { isServer }) => {
    if (!isServer) {
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
    return config;
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
