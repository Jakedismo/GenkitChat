// src/genkit-server.ts
// This file is the entry point for the 'genkit start' command.

import { genkit } from "genkit";
import { logger } from "genkit/logging";
import { googleAI } from "@genkit-ai/googleai";
import { mcpClient } from "genkitx-mcp";

console.log("Starting Genkit server initialization...");

// API Key Check (ensure GEMINI_API_KEY or GOOGLE_API_KEY is set in the environment)
if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
  console.error(
    "FATAL: GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set. Genkit cannot start."
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
  plugins: [googleAI(), context7Client],
});

// Set log level
logger.setLogLevel("debug");

// Note: We don't need to export models like gemini20FlashExp from here,
// as they are registered by the googleAI plugin and accessible via their string names.

console.log("Genkit instance initialized successfully by genkit-server.ts.");
console.log(
  "Reflection API should be available (check genkit start output for port)."
);

// Keep the process alive for 'genkit start'
// This might not be strictly necessary if genkit() keeps it alive,
// but adding an interval helps ensure it doesn't exit prematurely.
setInterval(() => {}, 1 << 30); // Keep alive indefinitely
