import { NextResponse } from "next/server";
import { formatSSE } from "./sse-utils";

export function handleGenkitError(genkitError: unknown) {
  console.error("SERVER_ERROR_CALLING_GENKIT_FLOW:", genkitError);
  const errorMessage =
    genkitError instanceof Error
      ? genkitError.message
      : "Genkit flow failed";

  // Check for specific tool-related errors
  const errorStr = String(genkitError);
  if (
    errorStr.includes("Unable to determine type of of tool:") ||
    errorStr.includes("tavilySearch") ||
    errorStr.includes("tavily")
  ) {
    const toolError =
      "The Tavily Search tool is not properly configured. Please make sure TAVILY_API_KEY is set in your environment variables.";
    console.error("TOOL_CONFIGURATION_ERROR:", toolError);
    const safeToolError = toolError
      .replace(/\\/g, "\\\\") // Must come first to avoid double-escaping
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/"/g, '\\"');
    const errorPayload = JSON.stringify({ error: safeToolError });
    const sseError = formatSSE("error", errorPayload);
    return new NextResponse(sseError, {
      status: 500,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } else if (
    errorStr.includes("perplexitySearch") ||
    errorStr.includes("perplexityDeepResearch") ||
    errorStr.includes("Perplexity")
  ) {
    const toolError =
      "The Perplexity tool is not properly configured. Please make sure PERPLEXITY_API_KEY is set in your environment variables.";
    console.error("TOOL_CONFIGURATION_ERROR:", toolError);
    const safeToolError = toolError
      .replace(/\\/g, "\\\\") // Must come first to avoid double-escaping
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/"/g, '\\"');
    const errorPayload = JSON.stringify({ error: safeToolError });
    const sseError = formatSSE("error", errorPayload);
    return new NextResponse(sseError, {
      status: 500,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Send an SSE-formatted error back to the client.
  const safeErrorMessage = errorMessage
    .replace(/\\/g, "\\\\") // Must come first to avoid double-escaping
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/"/g, '\\"');
  const errorPayload = JSON.stringify({
    error: `Genkit Flow Error: ${safeErrorMessage}`,
  });
  // Use the formatSSE helper for consistency
  const sseError = formatSSE("error", errorPayload);
  return new NextResponse(sseError, {
    status: 500, // Or an appropriate error status
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export function handleStreamError(
  controller: ReadableStreamDefaultController<Uint8Array>,
  streamError: unknown
) {
  console.error("Error during stream processing:", streamError);

  // Check for tool-related errors
  const errorStr = String(streamError);
  let errorMessage =
    streamError instanceof Error
      ? streamError.message
      : "An error occurred during streaming.";

  if (
    errorStr.includes("Unable to determine type of of tool:") ||
    errorStr.includes("tavilySearch") ||
    errorStr.includes("tavily")
  ) {
    errorMessage =
      "The Tavily Search tool is not properly configured. Please make sure TAVILY_API_KEY is set in your environment variables.";
  } else if (
    errorStr.includes("perplexitySearch") ||
    errorStr.includes("perplexityDeepResearch") ||
    errorStr.includes("Perplexity")
  ) {
    errorMessage =
      "The Perplexity tool is not properly configured. Please make sure PERPLEXITY_API_KEY is set in your environment variables.";
  }

  // Process error message for safe JSON encoding with comprehensive character escaping
  const safeErrorMessage = errorMessage
    .replace(/\\/g, "\\\\") // Must come first to avoid double-escaping
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/"/g, '\\"');
  controller.enqueue(
    new TextEncoder().encode(
      formatSSE(
        "error",
        JSON.stringify({
          error: safeErrorMessage,
        })
      )
    )
  );
}