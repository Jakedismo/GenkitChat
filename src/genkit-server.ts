// src/genkit-server.ts
// This file exports the aiInstance and server initialization functions

import {
  devLocalIndexerRef,
  devLocalRetrieverRef,
  devLocalVectorstore,
} from "@genkit-ai/dev-local-vectorstore";
import { startFlowServer } from "@genkit-ai/express"; // For serving flows
import { googleAI } from "@genkit-ai/googleai";
import { vertexAI } from "@genkit-ai/vertexai"; // Import Vertex AI for reranking
import { vertexAIRerankers } from "@genkit-ai/vertexai/rerankers"; // Added for Vertex AI Reranker
import fs from 'fs'; // Add fs import for file system operations
import { Flow, genkit } from "genkit"; // Use stable import for genkit
import { logger } from "genkit/logging"; // Added for log level
import { mcpClient } from "genkitx-mcp"; // Import MCP client for Context7
import { openAI } from "genkitx-openai";
import path from "path"; // Add path import for absolute path resolution
import { availableGeminiModels, availableOpenAIModels } from "./ai/available-models"; // Import available models for validation
import { perplexityPlugin } from "./ai/plugins/perplexity-plugin"; // Import local Perplexity plugin
import { tavilyPlugin } from "./ai/plugins/tavily-plugin"; // Import custom Tavily plugin
import { validatePromptDirectory } from "./ai/validatePrompts"; // Import prompt validation functions

// We'll define flow instances below after aiInstance is initialized

// TODO: Replace with your actual Google Cloud Project ID and Location
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "mlops-dev-330107";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

// Only log in server context to avoid client-side errors
// Enhanced build-time detection with comprehensive guards
const isBuildTime = process.env.NEXT_BUILD === "true" ||
                   process.env.NODE_ENV === "production" && process.env.NEXT_PHASE === "phase-production-build" ||
                   typeof process.cwd !== 'function' ||
                   process.env.TURBOPACK === "1";

const isServerRuntime = typeof window === "undefined" &&
                       typeof process !== "undefined" &&
                       process.env.NODE_ENV !== undefined &&
                       !isBuildTime &&
                       typeof require !== "undefined";

// Add comprehensive logging for debugging build vs runtime context
if (typeof process !== "undefined") {
  console.log(`[Genkit Context] Build-time: ${isBuildTime}, Server runtime: ${isServerRuntime}`);
  console.log(`[Genkit Context] NEXT_BUILD: ${process.env.NEXT_BUILD}, NODE_ENV: ${process.env.NODE_ENV}, TURBOPACK: ${process.env.TURBOPACK}`);
}

if (isServerRuntime) {
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

  // Only run vector store in a non-production environment to avoid build errors
  if (process.env.NODE_ENV !== "production") {
    try {
      plugins.push(
        devLocalVectorstore([
          {
            indexName: "documentRagStore",
            embedder: vertexAI.embedder("text-embedding-005"),
          },
        ])
      );
    } catch (e) {
      console.warn("Failed to initialize vectorstore plugin:", e);
    }
  }

  try {
    // Try to initialize rerankers with multiple possible configurations
    const possibleRerankers = [
      "vertexai/semantic-ranker-512",
      "vertexai/reranker",
      "vertexai/text-bison-32k",
      "semantic-ranker-512"
    ];

    plugins.push(
      vertexAIRerankers({
        projectId: PROJECT_ID,
        location: LOCATION,
        rerankers: possibleRerankers,
      })
    );
    console.log("Vertex AI rerankers initialized with models:", possibleRerankers);
  } catch (e) {
    console.warn("Failed to initialize reranker plugin:", e);
    console.warn("RAG will fall back to simple document selection without reranking");
  }

  // Note: Tavily and Perplexity plugins will be initialized after the Genkit instance is created
  return plugins;
}

// Initialize Genkit with error handling
export const aiInstance = (function () {
  try {
    // Guard against build-time execution - only run filesystem operations at runtime
    if (!isServerRuntime || typeof process.cwd !== 'function') {
      console.log(`[Genkit Init] Skipping filesystem operations during build analysis`);
      // Return a minimal configuration for build-time analysis
      const instance = genkit({
        promptDir: "./src/ai/prompts", // Use relative path for build analysis
        plugins: [] // No plugins during build analysis
      });
      return instance;
    }

    // Only perform file system operations in true server runtime
    let promptDirPath = "./src/ai/prompts"; // Default relative path for build analysis
    
    if (isServerRuntime && typeof process.cwd === 'function') {
      try {
        promptDirPath = path.join(process.cwd(), "src/ai/prompts");
        console.log(`[Genkit Init] Prompt directory resolved to: ${promptDirPath}`);
        console.log(`[Genkit Init] Current working directory: ${process.cwd()}`);
        
        if (fs.existsSync(promptDirPath)) {
          console.log(`[Genkit Init] ✓ Prompt directory exists at: ${promptDirPath}`);
          const files = fs.readdirSync(promptDirPath);
          console.log(`[Genkit Init] Found ${files.length} files in prompt directory:`, files.filter(f => f.endsWith('.prompt')).join(', '));
        } else {
          console.error(`[Genkit Init] ✗ Prompt directory NOT found at: ${promptDirPath}`);
        }
        
        // Only validate prompts during true runtime, not build time
        if (!isBuildTime) {
          validatePromptDirectory(promptDirPath);
        } else {
          console.log(`[Genkit Init] Skipping prompt validation during build analysis`);
        }
      } catch (error) {
        console.warn(`[Genkit Init] File system operations failed during initialization:`, error);
        // Fall back to relative path for build compatibility
        promptDirPath = "./src/ai/prompts";
      }
    } else {
      console.log(`[Genkit Init] Skipping file system validation - using relative path for build compatibility`);
    }
    // validateAssistantIntroPartial(promptDirPath); // Partials are no longer used

    const instance = genkit({
      promptDir: promptDirPath,
      plugins: isServerRuntime ? getPlugins() : [] // Only load plugins at runtime
    });

    // Register custom helper using the correct syntax
    instance.defineHelper('selectModel', (modelId: string | undefined): string => {
      console.log(`[selectModelHelper] Invoked with modelId: '${modelId}' (type: ${typeof modelId})`);
      
      if (!modelId || modelId.trim() === '' || modelId.trim().toLowerCase() === 'undefined') {
        const defaultModel = 'googleai/gemini-2.5-flash-preview-04-17';
        console.log(`[selectModelHelper] modelId is effectively falsy or 'undefined'. Using default model: ${defaultModel}`);
        return defaultModel;
      }
      
      const allAvailableModels = [
        ...availableGeminiModels.map(m => m.id),
        ...availableOpenAIModels.map(m => m.id)
      ];
      
      if (allAvailableModels.includes(modelId)) {
        console.log(`[selectModelHelper] Model '${modelId}' is valid and available. Using selected model.`);
        return modelId;
      } else {
        console.warn(`[selectModelHelper] Model '${modelId}' is not in the available list. Falling back to default: googleai/gemini-2.5-flash-preview-04-17`);
        return 'googleai/gemini-2.5-flash-preview-04-17'; // Explicitly return default
      }
    });

    console.log("[Genkit Init] ✓ Genkit custom helper 'selectModel' registered via instance.defineHelper().");
    
    // Initialize Tavily plugin with the aiInstance
    try {
      if (process.env.TAVILY_API_KEY) {
        tavilyPlugin(instance);
        console.log("[Genkit Init] Tavily plugin initialized successfully");
      } else {
        console.warn(
          "[Genkit Init] TAVILY_API_KEY not found. Tavily tools will not be available."
        );
      }
    } catch (e) {
      console.warn("[Genkit Init] Failed to initialize Tavily plugin:", e);
    }

    // Initialize Perplexity plugin with the aiInstance
    try {
      if (process.env.PERPLEXITY_API_KEY) {
        perplexityPlugin(instance);
        console.log("[Genkit Init] Perplexity plugin initialized successfully");
      } else {
        console.warn(
          "[Genkit Init] PERPLEXITY_API_KEY not found. Perplexity tools will not be available."
        );
      }
    } catch (e) {
      console.warn("[Genkit Init] Failed to initialize Perplexity plugin:", e);
    }

    console.log("[Genkit Init] ✓ Genkit instance configured successfully.");
    return instance;
  } catch (error) {
    console.error("[Genkit Init] ✗ Failed to initialize Genkit instance:", error);
    throw error; // Rethrow to ensure failure is visible and server doesn't start in a broken state
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
export let documentQaStreamFlow: unknown;

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
      "[Genkit Server] Checking imported flow:",
      {
        isDocumentQaStreamFlowDefined: !!documentQaStreamFlow,
        typeOfFlow: typeof documentQaStreamFlow,
        flowKeys: typeof documentQaStreamFlow === 'object' && documentQaStreamFlow !== null ? Object.keys(documentQaStreamFlow) : 'N/A'
      }
    );

    // Define the flows to register with the server
    const flowsToRegister: (Flow<any, any, any>)[] = [
      documentQaStreamFlow,
      // Add other imported flows here as needed
    ].filter(Boolean) as (Flow<any, any, any>)[];

    console.log(`[Genkit Server] Found ${flowsToRegister.length} valid flows to register.`);
    flowsToRegister.forEach((flow, index) => {
      console.log(`[Genkit Server] Flow ${index + 1}: ${flow.name}`);
    });

    // Start a single flow server instance with all registered flows
    const SERVER_PORT = 3400; // Define port as a constant

    if (flowsToRegister.length > 0) {
      startFlowServer({
        flows: flowsToRegister,
        port: SERVER_PORT,
        cors: { origin: "*" },
      });
    } else {
      console.error("[Genkit Server] FATAL: No valid flows were found to register. Server will not start.");
      // We might want to throw an error here to halt execution if no flows are a critical issue
      throw new Error("No valid flows found to register with the Genkit server.");
    }

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
