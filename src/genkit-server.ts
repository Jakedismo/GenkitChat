// src/genkit-server.ts
// This file exports the aiInstance and server initialization functions

import { genkit } from "genkit"; // Use stable import for genkit
import { logger } from "genkit/logging"; // Added for log level
import { googleAI } from "@genkit-ai/googleai";
import { openAI } from "genkitx-openai";
import { vertexAI } from "@genkit-ai/vertexai"; // Import Vertex AI for reranking
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

// We'll define flow instances below after aiInstance is initialized

// TODO: Replace with your actual Google Cloud Project ID and Location
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "mlops-dev-330107";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

// Only log in server context to avoid client-side errors
if (typeof window === "undefined") {
  console.log("Initializing Genkit configuration...");
  
  // API Key Check (ensure GEMINI_API_KEY or GOOGLE_API_KEY is set in the environment)
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error(
      "FATAL: GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set. Genkit cannot start."
    );
    // Throw an error to prevent Genkit from starting incorrectly
    // Note: The googleAI plugin itself might throw, but being explicit here is safer.
    throw new Error("Missing Google AI API Key environment variable.");
  }
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
    console.warn(
      "Failed to initialize Context7 MCP client, will continue without it:",
      e
    );
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

  try {
    plugins.push(openAI());
  } catch (e) {
    console.warn("Failed to initialize OpenAI plugin:", e);
  }
  try {
    plugins.push(vertexAI({
      projectId: PROJECT_ID,
      location: LOCATION,
    }));
  } catch (e) {
    console.warn("Failed to initialize Vertex AI plugin:", e);
  }
  const context7 = getContext7Client();
  if (context7) plugins.push(context7);

  try {
    plugins.push(
      devLocalVectorstore([
        {
          indexName: "documentRagStore",
          embedder: vertexAI.embedder('text-embedding-005'),
        },
      ])
    );
  } catch (e) {
    console.warn("Failed to initialize vectorstore plugin:", e);
  }

  try {
    plugins.push(
      vertexAIRerankers({
        projectId: PROJECT_ID,
        location: LOCATION,
        rerankers: ["vertexai/reranker"],
      })
    );
  } catch (e) {
    console.warn("Failed to initialize reranker plugin:", e);
  }

  // Note: Tavily and Perplexity plugins will be initialized after the Genkit instance is created
  return plugins;
}

// Initialize Genkit with error handling
export const aiInstance = (function () {
  try {
    const instance = genkit({
      promptDir: "src/ai/prompts",
      plugins: getPlugins(),
      // Note: mapAsMap option is not supported in GenkitOptions type
    });

    // Initialize Tavily plugin with the aiInstance
    try {
      if (process.env.TAVILY_API_KEY) {
        tavilyPlugin(instance);
        console.log("Tavily plugin initialized successfully");
      } else {
        console.warn(
          "TAVILY_API_KEY not found in environment variables. Tavily tools will not be available."
        );
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
        console.warn(
          "PERPLEXITY_API_KEY not found in environment variables. Perplexity tools will not be available."
        );
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
        console.error(
          "Genkit instance failed to initialize. Operations will fail."
        );
        return Promise.reject(new Error("Genkit not initialized"));
      },
      generateStream: () => {
        console.error(
          "Genkit instance failed to initialize. Operations will fail."
        );
        return {
          stream: [],
          response: Promise.reject(new Error("Genkit not initialized")),
        };
      },
      prompt: (promptNameOrConfig: string | any) => {
        console.error(
          "Genkit instance failed to initialize. Operations will fail."
        );
        return Promise.reject(new Error("Genkit not initialized"));
      },
      defineFlow: () => {
        console.error(
          "Genkit instance failed to initialize. Operations will fail."
        );
        return function () {
          return Promise.reject(new Error("Genkit not initialized"));
        };
      },
      retrieve: () => {
        console.error(
          "Genkit instance failed to initialize. Operations will fail."
        );
        return Promise.reject(new Error("Genkit not initialized"));
      },
      index: () => {
        console.error(
          "Genkit instance failed to initialize. Operations will fail."
        );
        return Promise.reject(new Error("Genkit not initialized"));
      },
      rerank: () => {
        console.error(
          "Genkit instance failed to initialize. Operations will fail."
        );
        return Promise.reject(new Error("Genkit not initialized"));
      },
    };
  }
})();

// Set log level in server context only
if (typeof window === "undefined") {
  try {
    logger.setLogLevel("debug");
  } catch (e) {
    console.warn("Failed to set logger level:", e);
  }
}

// Define and export RAG references with error handling
export const ragIndexerRef = (function () {
  try {
    const RAG_INDEX_NAME = "documentRagStore";
    return devLocalIndexerRef(RAG_INDEX_NAME);
  } catch (e) {
    console.warn("Failed to initialize RAG indexer ref:", e);
    return null;
  }
})();

export const ragRetrieverRef = (function () {
  try {
    const RAG_INDEX_NAME = "documentRagStore";
    return devLocalRetrieverRef(RAG_INDEX_NAME);
  } catch (e) {
    console.warn("Failed to initialize RAG retriever ref:", e);
    return null;
  }
})();

// Define and export document QA stream flow
// This will be populated dynamically to avoid circular dependencies
export let documentQaStreamFlow: any; 

// Track server initialization state
let isServerInitialized = false;
let serverInitializationPromise: Promise<void> | null = null;

// Function to start the flow server - implements singleton pattern
export async function startGenkitServer() {
  // Return immediately if we're in the browser
  if (typeof window !== "undefined") {
    console.warn("Cannot start Genkit server in browser context");
    return;
  }

  // If server is already initialized, return immediately
  if (isServerInitialized) {
    console.log("Genkit server already initialized, skipping initialization");
    return;
  }

  // If initialization is in progress, wait for it to complete
  if (serverInitializationPromise) {
    console.log("Genkit server initialization already in progress, waiting...");
    return serverInitializationPromise;
  }

  // Start initialization and save the promise
  serverInitializationPromise = initializeServer();
  return serverInitializationPromise;
}

// Actual initialization logic in a separate function
async function initializeServer(): Promise<void> {
  try {
    console.log("Starting Genkit server initialization...");

    // API Key Check
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      console.error(
        "FATAL: GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set."
      );
      throw new Error("Missing Google AI API Key environment variable.");
    }

    console.log("Genkit instance initialized with plugins.");

    // Lazy-load the flow to avoid circular dependencies
    const ragFlowModule = await import("./ai/flows/ragFlow");
    documentQaStreamFlow = ragFlowModule.documentQaStreamFlow;

    // Log flow availability
    console.log(
      "documentQaStreamFlow loaded dynamically from ragFlow.ts:",
      !!documentQaStreamFlow
    );

    // Define the flows to register with the server
    const flowsToRegister = [
      documentQaStreamFlow,
      // Add other imported flows here as needed
    ];

    // Start a single flow server instance with all registered flows
    const SERVER_PORT = 3400; // Define port as a constant

    startFlowServer({
      flows: flowsToRegister,
      port: SERVER_PORT,
      cors: { origin: "*" },
    });

    // Mark initialization as complete
    isServerInitialized = true;

    console.log(`Genkit flow server started on port ${SERVER_PORT}`);
    console.log(
      `Genkit server started on port ${SERVER_PORT} with ${flowsToRegister.length} flow(s) registered.`
    );
    console.log(
      "Genkit Developer UI should be available at http://localhost:4000"
    );
    console.log(`Genkit server successfully initialized`);
  } catch (error) {
    console.error("Failed to initialize Genkit server:", error);
    // Reset the initialization promise so it can be retried
    serverInitializationPromise = null;
    throw error;
  }
}
