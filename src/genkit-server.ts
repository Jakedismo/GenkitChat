// src/genkit-server.ts
// This file is the entry point for the 'genkit start' command.

import { genkit } from "genkit/beta"; // Align with lib/genkit-instance, removed Genkit type
import { logger } from "genkit/logging"; // Added for log level
import { googleAI, textEmbedding004 } from "@genkit-ai/googleai";
import {
  devLocalVectorstore,
  devLocalIndexerRef,
  devLocalRetrieverRef,
} from "@genkit-ai/dev-local-vectorstore";
import { vertexAIRerankers } from "@genkit-ai/vertexai/rerankers"; // Added for Vertex AI Reranker
import { mcpClient } from "genkitx-mcp";
import { startFlowServer } from "@genkit-ai/express"; // For serving flows

// Import your flows
import { multiAgentResearchFlow } from "./ai/research-agents/research.flow";
import { documentQaStreamFlow } from "./services/rag";
// Import other flows as needed:
// import { someOtherFlow } from './path/to/otherFlow';

// TODO: Replace with your actual Google Cloud Project ID and Location
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "your-gcp-project-id";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

console.log("Starting Genkit server initialization...");

// API Key Check (ensure GEMINI_API_KEY or GOOGLE_API_KEY is set in the environment)
if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
  console.error(
    "FATAL: GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set. Genkit cannot start.",
  );
  // Throw an error to prevent Genkit from starting incorrectly
  // Note: The googleAI plugin itself might throw, but being explicit here is safer.
  throw new Error("Missing Google AI API Key environment variable.");
}

// Configure the Context7 MCP client
const context7Client = mcpClient({
  name: "context7",
  serverProcess: {
    command: "npx",
    args: ["-y", "@upstash/context7-mcp@latest"],
  },
});

// Initialize Genkit
export const aiInstance = genkit({
  // Type for aiInstance will be inferred
  promptDir: "src/ai/prompts",
  plugins: [
    googleAI(),
    context7Client,
    devLocalVectorstore([
      {
        indexName: "documentRagStore", // Same name as used in lib/genkit-instance.ts
        embedder: textEmbedding004,
      },
    ]),
    vertexAIRerankers({
      // Added Vertex AI Reranker plugin
      projectId: PROJECT_ID,
      location: LOCATION,
      rerankers: ["vertexai/reranker"],
      // You can specify which reranker models to enable, e.g., ['vertexai/reranker']
      // If not specified, it might default or require explicit model names in ai.rerank() options.
      // For simplicity, leaving it to default or explicit call-site specification for now.
    }),
  ],
  // logLevel removed from here
  // enableTracingAndMetrics removed as it's not a direct GenkitOption in beta or is enabled by default
});

// Set log level using the imported logger
logger.setLogLevel("debug");

// Define and export RAG references
const RAG_INDEX_NAME = "documentRagStore";
export const ragIndexerRef = devLocalIndexerRef(RAG_INDEX_NAME);
export const ragRetrieverRef = devLocalRetrieverRef(RAG_INDEX_NAME);

// Note: We don't need to export models like gemini20FlashExp from here,
// as they are registered by the googleAI plugin and accessible via their string names.

console.log("Genkit instance initialized with plugins.");

// Register flows and start the server
const flowsToRegister = [
  multiAgentResearchFlow,
  documentQaStreamFlow,
  // Add other imported flows here:
  // someOtherFlow,
];

startFlowServer({
  flows: flowsToRegister,
  port: 3400, // Default Genkit port, adjust if needed
  cors: { origin: "*" }, // Adjust CORS for your needs
});

console.log(
  `Genkit server started on port 3400 with ${flowsToRegister.length} flow(s) registered.`,
);
console.log("Genkit Developer UI should be available at http://localhost:4000");
