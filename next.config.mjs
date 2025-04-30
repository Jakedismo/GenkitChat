/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable static generation for all pages
  output: 'standalone',
  
  // Webpack configuration to handle Node.js modules
  webpack: (config, { isServer }) => {
    // Properly handle Node.js specific modules for client-side code
    if (!isServer) {
      // List all modules that should be marked as empty for client builds
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
        'fs/promises': false,
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
        '@opentelemetry/exporter-jaeger': false,
      };
    }
    
    return config;
  },
  
  // Server-only packages (never bundle these for client)
  serverExternalPackages: [
    '@genkit-ai/core',
    '@genkit-ai/express',
    '@genkit-ai/googleai',
    '@genkit-ai/next',
    '@genkit-ai/dev-local-vectorstore',
    '@genkit-ai/vertexai',
    '@opentelemetry/exporter-jaeger',
    'genkit',
    'genkitx-mcp',
    'genkitx-openai',
    'pdf-parse',
    'llm-chunk',
    'uuid'
  ],
  
  // We removed transpilePackages since it conflicts with serverExternalPackages
};

export default nextConfig;
