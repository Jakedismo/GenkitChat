import { handleGenkitError } from "@/lib/chat-error-handler";
import { createErrorResponse, createValidationErrorResponse } from "@/lib/api-error-handler";
import { processChatStream } from "@/lib/chat-stream-processor";
import {
  ChatInput,
  initiateChatStream,
  ToolInvocation,
} from "@/lib/chat-utils"; // Use streaming version, import types
import { withGenkitServer } from "@/lib/server"; // Import server initialization wrapper
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

// Define type for the final_response event payload
interface FinalResponseData {
  chunks?: string[]; // Optional: used for streaming/debugging, deleted before sending to client
  response: string;
  toolInvocations: ToolInvocation[]; // Always include this array, even if empty
  sessionId: string;
  structuredResponse: undefined;
}

// Restore manual POST handler
export async function POST(request: Request) {
  return withGenkitServer(async () => {
    try {
      const json = await request.json();
      const validatedInput = InputSchema.safeParse(json);

      if (!validatedInput.success) {
        const validationErrors = validatedInput.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return createValidationErrorResponse(validationErrors, {
          path: '/api/basic-chat',
          method: 'POST',
        });
      }

      // Pass the full validated data (including sessionId) to the stream function
      try {
        const {
          stream,
          responsePromise,
          sessionId: usedSessionId,
        } = await initiateChatStream(validatedInput.data as ChatInput);

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
      return createErrorResponse(error, 500, {
        path: '/api/basic-chat',
        method: 'POST',
      });
    }
  });
}
