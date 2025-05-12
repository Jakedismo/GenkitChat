// src/genkit-server.ts
// This file exports the aiInstance and server initialization functions

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
import { tavilyPlugin } from "./ai/plugins/tavily-plugin"; // Import custom Tavily plugin
import { startFlowServer } from "@genkit-ai/express"; // For serving flows
import { perplexityPlugin } from "./ai/plugins/perplexity-plugin"; // Import local Perplexity plugin

// Lazy-import flows to avoid circular dependencies
let documentQaStreamFlow: any;

// TODO: Replace with your actual Google Cloud Project ID and Location
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "your-gcp-project-id";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

// Only log in server context to avoid client-side errors
if (typeof window === 'undefined') {
  console.log("Initializing Genkit configuration...");
}

// API Key Check (ensure GEMINI_API_KEY or GOOGLE_API_KEY is set in the environment)
if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
  console.error(
    "FATAL: GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set. Genkit cannot start.",
  );
  // Throw an error to prevent Genkit from starting incorrectly
  // Note: The googleAI plugin itself might throw, but being explicit here is safer.
  throw new Error("Missing Google AI API Key environment variable.");
}

// Function to safely configure Context7 MCP client
function getContext7Client() {
  try {
    return mcpClient({
      name: "context7",
      serverProcess: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp@latest"],
      },
    });
  } catch (e) {
    console.warn("Failed to initialize Context7 MCP client, will continue without it:", e);
    return null;
  }
}

// Initialize plugins safely with fallbacks
function getPlugins() {
  const plugins = [];
  
  try {
    plugins.push(googleAI());
  } catch (e) {
    console.warn("Failed to initialize Google AI plugin:", e);
  }
  
  const context7 = getContext7Client();
  if (context7) plugins.push(context7);
  
  try {
    plugins.push(devLocalVectorstore([
      {
        indexName: "documentRagStore",
        embedder: textEmbedding004,
      },
    ]));
  } catch (e) {
    console.warn("Failed to initialize vectorstore plugin:", e);
  }
  
  try {
    plugins.push(vertexAIRerankers({
      projectId: PROJECT_ID,
      location: LOCATION,
      rerankers: ["vertexai/reranker"],
    }));
  } catch (e) {
    console.warn("Failed to initialize reranker plugin:", e);
  }
  
  // Tavily and Perplexity plugins will be initialized after the Genkit instance is created
  
  // Perplexity plugin will be initialized after the Genkit instance is created
  
  return plugins;
}

// Initialize Genkit with error handling
export const aiInstance = (function() {
  try {
    const instance = genkit({
      promptDir: "src/ai/prompts",
      plugins: getPlugins(),
    });
    
    // Initialize Tavily plugin with the aiInstance
    try {
      if (process.env.TAVILY_API_KEY) {
        tavilyPlugin(instance);
        console.log("Tavily plugin initialized successfully");
      } else {
        console.warn("TAVILY_API_KEY not found in environment variables. Tavily tools will not be available.");
      }
    } catch (e) {
      console.warn("Failed to initialize Tavily plugin:", e);
    }
    
    // Initialize Perplexity plugin with the aiInstance
    try {
      if (process.env.PERPLEXITY_API_KEY) {
        perplexityPlugin(instance);
        console.log("Perplexity plugin initialized successfully");
      } else {
        console.warn("PERPLEXITY_API_KEY not found in environment variables. Perplexity tools will not be available.");
      }
    } catch (e) {
      console.warn("Failed to initialize Perplexity plugin:", e);
    }
    
    return instance;
  } catch (e) {
    console.error("Failed to initialize Genkit instance:", e);
    // Return a stub object that won't break imports but logs errors when used
    return {
      generate: () => {
        console.error("Genkit instance failed to initialize. Operations will fail.");
        return Promise.reject(new Error("Genkit not initialized"));
      },
      generateStream: () => {
        console.error("Genkit instance failed to initialize. Operations will fail.");
        return {
          stream: [],
          response: Promise.reject(new Error("Genkit not initialized"))
        };
      }
    };
  }
})();

// Set log level in server context only
if (typeof window === 'undefined') {
  try {
    logger.setLogLevel("debug");
  } catch (e) {
    console.warn("Failed to set logger level:", e);
  }
}

// Define and export RAG references with error handling
export const ragIndexerRef = (function() {
  try {
    const RAG_INDEX_NAME = "documentRagStore";
    return devLocalIndexerRef(RAG_INDEX_NAME);
  } catch (e) {
    console.warn("Failed to initialize RAG indexer ref:", e);
    return null;
  }
})();

export const ragRetrieverRef = (function() {
  try {
    const RAG_INDEX_NAME = "documentRagStore";
    return devLocalRetrieverRef(RAG_INDEX_NAME);
  } catch (e) {
    console.warn("Failed to initialize RAG retriever ref:", e);
    return null;
  }
})();

// Function to start the flow server - NOT automatically executed
export async function startGenkitServer() {
  if (typeof window !== 'undefined') {
    console.warn("Cannot start Genkit server in browser context");
    return;
  }
  
  try {
    console.log("Starting Genkit server initialization...");
    
    // API Key Check
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      console.error("FATAL: GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set.");
      throw new Error("Missing Google AI API Key environment variable.");
    }
    
    console.log("Genkit instance initialized with plugins.");
    
    // Lazy-load flows to avoid circular dependencies
    const rag = await import("./services/rag");
    documentQaStreamFlow = rag.documentQaStreamFlow;
    
    // Register flows and start the server
    const flowsToRegister = [
      documentQaStreamFlow,
      // Add other imported flows here:
      // someOtherFlow,
    ];
    
    await startFlowServer({
      flows: flowsToRegister,
      port: 3400,
      cors: { origin: "*" },
    });
    
    console.log(
      `Genkit server started on port 3400 with ${flowsToRegister.length} flow(s) registered.`,
    );
    console.log("Genkit Developer UI should be available at http://localhost:4000");
  } catch (e) {
    console.error("Failed to start Genkit server:", e);
  }
}

// Don't auto-start the server - it will be started explicitly when needed
