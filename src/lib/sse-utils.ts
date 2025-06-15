// Helper to format Server-Sent Events (SSE)
export function formatSSE(event: string, data: string): string {
  // Verify data is a valid string to prevent serialization issues
  const safeData =
    typeof data === "string"
      ? data
      : JSON.stringify({ error: "Invalid data format" });

  try {
    // Validate JSON by parsing and re-stringifying to catch any serialization issues
    JSON.parse(safeData);
  } catch (e) {
    console.error(`Invalid JSON in formatSSE for event '${event}':`, e);

    // For final_response events, try a series of recovery methods
    if (event === "final_response" && typeof data === "string") {
      try {
        // 1. Try to sanitize the JSON data
        const sanitizedData = data
          .replace(/\\"/g, '"') // Replace escaped quotes
          .replace(/\\n/g, "\n") // Replace escaped newlines
          .replace(/\\r/g, "\r") // Replace escaped carriage returns
          .replace(/\\t/g, "\t") // Replace escaped tabs
          .replace(/\\\\/g, "\\") // Replace double backslashes
          .replace(/\\+$/, ""); // Remove trailing backslashes

        try {
          // 2. Try to parse the sanitized data
          const parsedData = JSON.parse(sanitizedData);
          return `event: ${event}\ndata: ${JSON.stringify(parsedData)}\n\n`;
        } catch {
          // 3. Try extracting just the response field with regex if it exists
          const responseMatch = sanitizedData.match(
            /"response"\s*:\s*"([^"]+)"/
          );
          if (responseMatch && responseMatch[1]) {
            const extractedResponse = {
              response: responseMatch[1],
              toolInvocations: [],
              sessionId: "",
            };
            return `event: ${event}\ndata: ${JSON.stringify(
              extractedResponse
            )}\n\n`;
          }
        }

        // 4. Create a simpler valid JSON with just the essential data
        const fallbackData = JSON.stringify({
          response:
            "Response could not be properly formatted. Please try again.",
          toolInvocations: [],
          sessionId: "",
        });
        return `event: ${event}\ndata: ${fallbackData}\n\n`;
      } catch (fallbackError) {
        console.error("All JSON recovery methods failed:", fallbackError);
      }
    }

    // If all else fails, return a generic error message
    return `event: ${event}\ndata: ${JSON.stringify({
      error: `Invalid JSON data for ${event} event`,
    })}\n\n`;
  }

  // Ensure SSE format is correct with actual newlines, not escaped ones
  return `event: ${event}\ndata: ${safeData}\n\n`;
}