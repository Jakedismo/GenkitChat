import { ragAugmentedChatFlow } from "@/lib/genkit-instance";
import { expressHandler } from "@genkit-ai/express";

// Remove manually added schema, expressHandler infers it
// import { z } from 'zod';
// const InputSchema = z.object({ ... });

// Define the POST handler using expressHandler
export const { POST } = expressHandler(ragAugmentedChatFlow);
