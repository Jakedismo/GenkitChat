import { handleGenkitError } from "@/lib/chat-error-handler";
import { processChatStream } from "@/lib/chat-stream-processor";
import {
  ChatInput,
  initiateChatStream,
} from "@/lib/chat-utils"; // Use streaming version, import types
import { withGenkitServer } from "@/lib/server"; // Import server initialization wrapper
import {
  sanitizeUserInput,
  validateSessionId,
  validateModelId,
  validateTemperaturePreset,
  validateMaxTokens
} from "@/utils/security";
import { NextResponse } from "next/server";
import { z } from "zod";

const InputSchema = z.object({
  userMessage: z.string(),
  modelId: z.string(),
  temperaturePreset: z.enum(["precise", "normal", "creative"]),
  maxTokens: z.number().int().positive(),
  sessionId: z.string().optional(),
  tavilySearchEnabled: z.boolean().optional().default(false),
  tavilyExtractEnabled: z.boolean().optional().default(false),
  perplexitySearchEnabled: z.boolean().optional().default(false),
  perplexityDeepResearchEnabled: z.boolean().optional().default(false),
  context7ResolveLibraryIdEnabled: z.boolean().optional().default(false),
  context7GetLibraryDocsEnabled: z.boolean().optional().default(false),
});

// Restore manual POST handler
export async function POST(request: Request) {
  return withGenkitServer(async () => {
    try {
      const json = await request.json();
      const validatedInput = InputSchema.safeParse(json);

      if (!validatedInput.success) {
        console.error(
          "SERVER_ZOD_VALIDATION_ERROR:",
          validatedInput.error.errors
        ); // Log Zod's specific errors
        return NextResponse.json(
          { error: "Invalid input", details: validatedInput.error.errors },
          { status: 400 }
        );
      }

      // Additional security validation
      const data = validatedInput.data;
      const sanitizedMessage = sanitizeUserInput(data.userMessage);
      if (!sanitizedMessage.trim()) {
        return NextResponse.json(
          { error: "Invalid or empty message" },
          { status: 400 }
        );
      }

      if (data.sessionId && !validateSessionId(data.sessionId)) {
        return NextResponse.json(
          { error: "Invalid session ID format" },
          { status: 400 }
        );
      }

      if (!validateModelId(data.modelId)) {
        return NextResponse.json(
          { error: "Invalid model ID" },
          { status: 400 }
        );
      }

      if (!validateTemperaturePreset(data.temperaturePreset)) {
        return NextResponse.json(
          { error: "Invalid temperature preset" },
          { status: 400 }
        );
      }

      if (!validateMaxTokens(data.maxTokens)) {
        return NextResponse.json(
          { error: "Invalid max tokens value" },
          { status: 400 }
        );
      }

      // Use sanitized message
      const sanitizedData = { ...data, userMessage: sanitizedMessage };

      // Pass the full validated data (including sessionId) to the stream function
      try {
        const {
          stream,
          responsePromise,
          sessionId: usedSessionId,
        } = await initiateChatStream(sanitizedData as ChatInput);

        const readableStream = processChatStream(
          stream,
          responsePromise,
          usedSessionId
        );

        return new NextResponse(readableStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      } catch (genkitError) {
        return handleGenkitError(genkitError);
      }
    } catch (error) {
      // This top-level catch handles errors outside the Genkit flow call,
      // e.g., issues with request.json() or initial Zod parsing if not caught more specifically.
      console.error(
        "Error in basic-chat API route (initial setup or other unexpected error):",
        error
      );
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      return NextResponse.json(
        { error: "Failed to process chat request", details: errorMessage },
        { status: 500 }
      );
    }
  });
}
