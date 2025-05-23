import { aiInstance, ragIndexerRef, ragRetrieverRef } from '@/genkit-server';
import { Document } from 'genkit/retriever';
import { logger } from 'genkit/logging';
import {
  ToolRequestPart,
  ToolResponsePart,
  MessageData,
  RankedDocument,
  DocumentData,
} from '@genkit-ai/ai';
import { z } from 'zod';

// Define the structure for events yielded by generateRagResponseStream
export type RagStreamEvent =
  | { type: 'sources'; sources: Document[] }
  | { type: 'text'; text: string }
  | {
      type: 'tool_invocation';
      name: string;
      input: unknown;
      output: unknown;
      error?: string;
    }
  | {
      type: 'tool_invocations';
      invocations: Array<{
        name: string;
        input: unknown;
        output: unknown;
        error?: string;
      }>;
    }
  | { type: 'error'; error: string };

export const RagStreamEventSchemaZod = z.union([
  z.object({ type: z.literal('sources'), sources: z.array(z.custom<Document>()) }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('tool_invocation'),
    name: z.string(),
    input: z.unknown(),
    output: z.unknown(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal('tool_invocations'),
    invocations: z.array(
      z.object({
        name: z.string(),
        input: z.unknown(),
        output: z.unknown(),
        error: z.string().optional(),
      })
    ),
  }),
  z.object({ type: z.literal('error'), error: z.string() }),
]);

// Define the input schema for the RAG flow
export const RagFlowInputSchema = z.object({
  query: z.string(),
  sessionId: z.string().optional(),
  tools: z.array(z.string()).optional(),
  modelId: z.string().optional(),
  temperaturePreset: z.enum(['precise', 'normal', 'creative']).optional(),
  maxTokens: z.number().optional(),
});

export type RagFlowInput = z.infer<typeof RagFlowInputSchema>;

// Constants for RAG
const INITIAL_RETRIEVAL_COUNT = 20;
const FINAL_DOCUMENT_COUNT = 5;
const RERANKER_ID = 'vertexai/reranker';

// Helper function to create a model key string
export const createModelKey = (
  modelId?: string
  // toolsToUse?: string[] // Parameter removed
): string => {
  const baseModel = modelId || 'googleAI/gemini-2.5-pro';
  // Tool-specific logic removed from model key generation
  return baseModel;
};

export const documentQaStreamFlow = aiInstance.defineFlow(
  {
    name: 'documentQaStreamFlow',
    inputSchema: RagFlowInputSchema,
    outputSchema: z.string(),
    streamSchema: RagStreamEventSchemaZod,
  },
  async (
    { query, sessionId, tools: toolNamesToUse, modelId, temperaturePreset, maxTokens }: RagFlowInput,
    sideChannel: (chunk: RagStreamEvent) => void
  ) => {
    let filteredDocs: Document[] = [];
    let topDocs: DocumentData[] = []; 
    const pendingToolRequests = new Map<string, ToolRequestPart>();
    const toolResponseBuffer = new Map<string, ToolResponsePart>();
    let accumulatedLlmText = '';

    // Helper to send chunks to the stream
    const sendChunk = (data: RagStreamEvent) => {
      if (sideChannel) {
        sideChannel(data);
      }
    };

    // Helper to flush tool responses
    const flushToolBuffer = async () => {
      if (toolResponseBuffer.size > 0) {
        const invocations = Array.from(toolResponseBuffer.values()).map(
          (responsePart) => {
            let requestPart: ToolRequestPart | undefined;
            if (responsePart?.toolResponse?.ref) {
              requestPart = pendingToolRequests.get(responsePart.toolResponse.ref);
            }
            const output = responsePart?.toolResponse?.output;
            
            // FIXED: Enhanced defensive checks for tool request/response handling
            const toolName = requestPart?.toolRequest?.name ?? 'unknown_tool_ref_not_found';
            const toolInput = requestPart?.toolRequest?.input;

            return {
              name: toolName,
              input: toolInput,
              output: output,
              error: output instanceof Error ? output.message : undefined,
            };
          }
        );
        sendChunk({ type: 'tool_invocations', invocations });
        toolResponseBuffer.clear();
        pendingToolRequests.clear();
      }
    };

    if (!ragRetrieverRef) {
      logger.error('RAG retriever reference is not configured.');
      sendChunk({ type: 'error', error: 'RAG retriever not configured.' });
      return "Error: RAG retriever not configured.";
    }


    try {
      logger.info(`RAG query: \"${query}\" for session: ${sessionId}`);
      const queryDocumentForRetrieval = Document.fromText(query || '');
      const docs = await aiInstance.retrieve({
        retriever: ragRetrieverRef,
        query: queryDocumentForRetrieval,
        options: {
          k: INITIAL_RETRIEVAL_COUNT,
        },
      });

      // Try to filter by session first, but fall back to all docs if no matches
      filteredDocs = sessionId
        ? docs.filter((doc) => doc.metadata?.sessionId === sessionId)
        : docs;
      
      // If session filtering yielded no results but we have docs, fall back to all docs
      if (sessionId && filteredDocs.length === 0 && docs.length > 0) {
        logger.warn(`[SESSION-FALLBACK] No documents found for session ${sessionId}, falling back to all ${docs.length} documents`);
        filteredDocs = docs;
      }

      // Enhanced debug document metadata to understand filtering issue
      if (sessionId && docs.length > 0 && filteredDocs.length === 0) {
        logger.warn(`[SESSION-FILTER-DEBUG] Looking for sessionId "${sessionId}"`);
        logger.warn(`[SESSION-FILTER-DEBUG] Retrieved ${docs.length} documents, but 0 matched after filtering`);
        
        // Check the sessionIds present in the retrieved documents
        const uniqueSessionIds = new Set(docs.map(doc => doc.metadata?.sessionId).filter(Boolean));
        logger.warn(`[SESSION-FILTER-DEBUG] Unique sessionIds found in documents:`, Array.from(uniqueSessionIds));
        
        docs.slice(0, 5).forEach((doc, idx) => {
          logger.warn(`[SESSION-FILTER-DEBUG] Doc ${idx}:`, {
            sessionId: doc.metadata?.sessionId,
            documentId: doc.metadata?.documentId,
            fileName: doc.metadata?.originalFileName,
            timestamp: doc.metadata?.timestamp
          });
        });
      }

      logger.info(
        `Retrieved ${docs.length} documents initially, ${filteredDocs.length} after filtering for session ${sessionId}.`
      );

      if (filteredDocs.length === 0) {
        logger.warn(
          `No documents found for query: "${query}" and session: ${sessionId}`
        );
        sendChunk({ type: 'sources', sources: [] });
        topDocs = [];
      } else {
        if (filteredDocs.length > FINAL_DOCUMENT_COUNT) {
          try {
            const rerankedDocsOutput: RankedDocument[] = await aiInstance.rerank({
              reranker: RERANKER_ID,
              query: Document.fromText(query),
              documents: filteredDocs,
              options: { k: FINAL_DOCUMENT_COUNT },
            });
            topDocs = rerankedDocsOutput;
            logger.info(
              `Reranked ${filteredDocs.length} documents to ${topDocs.length} for session ${sessionId}.`
            );
          } catch (rerankerError: any) {
            logger.error(`Error in RAG reranker: ${rerankerError.message || String(rerankerError)}. Falling back.`);
            // Fallback: use simple selection of top documents
            topDocs = filteredDocs.slice(0, FINAL_DOCUMENT_COUNT);
            logger.info(
              `Fallback: Selected first ${topDocs.length} documents from ${filteredDocs.length} for session ${sessionId}.`
            );
          }
        } else {
          topDocs = filteredDocs;
        }
        sendChunk({ type: 'sources', sources: topDocs as Document[] });
      }

      // const modelToUseKey = createModelKey(modelId, toolNamesToUse); // OLD
      const modelToUseKey = createModelKey(modelId); // NEW: toolsToUse argument removed
      // logger.info(`Using model for RAG: ${modelToUseKey} with tools: ${toolNamesToUse?.join(', ') || 'none'}`); // MOVED DOWN
      
      const history: MessageData[] = [{ role: 'user', content: [{ text: query }] }];
      // Note: For a full chat experience, actual session history should be loaded if sessionId is present.

      // Render the prompt to MessageData[] with defensive checks
      let currentPromptMessages: MessageData[];
      try {
        const ragAssistantPromptObject = await aiInstance.prompt('rag_assistant');
        if (typeof ragAssistantPromptObject === 'function') {
          // Ensure docs have proper structure before passing to prompt
          const safeDocs = topDocs.map(doc => ({
            ...doc,
            content: doc.content || [{ text: 'No content available' }],
            metadata: doc.metadata || {}
          }));
          
          const result = await ragAssistantPromptObject({ query, docs: safeDocs });
          // Assuming result is { messages: MessageData[] } or MessageData[]
          currentPromptMessages = Array.isArray(result) ? result : result?.messages || [];
          if (currentPromptMessages.length === 0 && !Array.isArray(result)) {
              logger.warn('Prompt function did not return messages in expected structure, using query as prompt.');
              // Fallback if prompt structure is not as expected
              currentPromptMessages = [{role: 'user', content: [{text: `Query: ${query}\nDocuments: ${topDocs.map(d => d.content?.[0]?.text || 'No content available').join('\n')}`}]}];
          }
        } else {
          logger.error('RAG assistant prompt object is not a function. Using query as prompt.');
          currentPromptMessages = [{role: 'user', content: [{text: `Query: ${query}\nDocuments: ${topDocs.map(d => d.content?.[0]?.text || 'No content available').join('\n')}`}]}];
        }
      } catch (promptError: any) {
        logger.error(`Error in prompt function: ${promptError.message || String(promptError)}. Using fallback prompt.`);
        currentPromptMessages = [{role: 'user', content: [{text: `Query: ${query}\nDocuments: ${topDocs.map(d => d.content?.[0]?.text || 'No content available').join('\n')}`}]}];
      }

      const messagesForLlm = history.concat(currentPromptMessages);

      const generateOptions: Parameters<typeof aiInstance.generateStream>[0] = {
        model: modelToUseKey,
        messages: messagesForLlm,
        context: topDocs,
        config: {
          temperature: temperaturePreset === 'precise' ? 0.2 : temperaturePreset === 'creative' ? 0.9 : 0.7,
          maxOutputTokens: maxTokens,
        },
        streamingCallback: (chunk: any) => { // Using any for chunk type temporarily
          console.log('[RAG-STREAM-DEBUG] Received chunk:', {
            hasText: !!chunk?.text,
            textLength: chunk?.text?.length || 0,
            textPreview: chunk?.text?.substring(0, 100) || 'no text',
            chunkKeys: Object.keys(chunk || {}),
            chunkType: typeof chunk,
            chunkContent: chunk,
            accumulatedLength: accumulatedLlmText.length
          });
          
          if (chunk?.text) {
            console.log('[RAG-STREAM-DEBUG] Processing text chunk:', chunk.text);
            sendChunk({ type: 'text', text: chunk.text });
            accumulatedLlmText += chunk.text;
            console.log('[RAG-STREAM-DEBUG] Updated accumulated text length:', accumulatedLlmText.length);
          } else {
            console.log('[RAG-STREAM-DEBUG] Chunk has no text property, chunk structure:', JSON.stringify(chunk, null, 2));
          }
          // Enhanced defensive checks for tool requests
          chunk?.toolRequests?.forEach((requestPart: ToolRequestPart) => {
            if (requestPart?.toolRequest?.ref) {
              pendingToolRequests.set(requestPart.toolRequest.ref, requestPart);
            }
          });
          // Enhanced defensive checks for tool responses
          chunk?.toolResponses?.forEach((responsePart: ToolResponsePart) => {
            if (responsePart?.toolResponse?.ref) {
              toolResponseBuffer.set(responsePart.toolResponse.ref, responsePart);
            }
          });
        },
      };

      if (toolNamesToUse && toolNamesToUse.length > 0) {
        // This assumes that aiInstance.generateStream can handle string[] for tools
        // by looking up definitions, as implied if it works when tools are selected.
        (generateOptions as any).tools = toolNamesToUse;
      }

      // Moved logger.info here to accurately reflect the tools being passed
      logger.info(`Using model for RAG: ${modelToUseKey} with tools: ${(generateOptions as any).tools?.join(', ') || 'none'}`);

      console.log('[RAG-STREAM-DEBUG] Starting LLM stream generation');
      const llmStreamResult = aiInstance.generateStream(generateOptions);

      let streamItemCount = 0;
      for await (const _item of llmStreamResult.stream) {
        streamItemCount++;
        console.log(`[RAG-STREAM-DEBUG] Processed stream item ${streamItemCount}`);
        // The streamingCallback handles individual chunks/items.
        // This loop ensures the entire stream is processed.
      }
      
      console.log(`[RAG-STREAM-DEBUG] Stream completed after ${streamItemCount} items`);
      console.log('[RAG-STREAM-DEBUG] Accumulated text length before final response:', accumulatedLlmText.length);
      
      const finalLlmResponse = await llmStreamResult.response;
      console.log('[RAG-STREAM-DEBUG] Final LLM response received:', {
        hasText: !!finalLlmResponse.text,
        textLength: finalLlmResponse.text?.length || 0,
        textPreview: finalLlmResponse.text?.substring(0, 100) || 'no text'
      });
      
      await flushToolBuffer();
      
      const responseText = finalLlmResponse.text;
      if (accumulatedLlmText === '' && responseText) {
        console.log('[RAG-STREAM-DEBUG] Using final response text as fallback');
        sendChunk({ type: 'text', text: responseText });
        accumulatedLlmText = responseText;
      }
      
      console.log('[RAG-STREAM-DEBUG] Final accumulated text length:', accumulatedLlmText.length);
      console.log('[RAG-STREAM-DEBUG] Final accumulated text preview:', accumulatedLlmText.substring(0, 200) + '...');
      console.log('[RAG-STREAM-DEBUG] Final accumulated text ending:', '...' + accumulatedLlmText.substring(Math.max(0, accumulatedLlmText.length - 100)));
      
      return accumulatedLlmText;

    } catch (error: any) {
      logger.error(`Error in RAG flow: ${error.message || String(error)}. Falling back.`);
      sendChunk({ type: 'error', error: `Service error: ${error.message || 'Unknown error during RAG flow'}` });
      
      let fallbackAccumulatedText = '';
      try {
        const fallbackModelKey = createModelKey(modelId); // This will also use the simplified key
        logger.info(`Falling back to model: ${fallbackModelKey} without tools.`);
        
        // Fallback: Render prompt similarly with defensive checks
        let fallbackPromptMessages: MessageData[];
        try {
          const ragAssistantPromptObjectFallback = await aiInstance.prompt('rag_assistant');
          if (typeof ragAssistantPromptObjectFallback === 'function') {
              // Ensure docs have proper structure before passing to prompt
              const safeDocs = topDocs.map(doc => ({
                ...doc,
                content: doc.content || [{ text: 'No content available' }],
                metadata: doc.metadata || {}
              }));
              
              const result = await ragAssistantPromptObjectFallback({ query, docs: safeDocs });
              fallbackPromptMessages = Array.isArray(result) ? result : result?.messages || [];
              if (fallbackPromptMessages.length === 0 && !Array.isArray(result)) {
                   logger.warn('Fallback prompt function did not return messages, using query as prompt.');
                  fallbackPromptMessages = [{role: 'user', content: [{text: `Query: ${query}\nDocuments: ${topDocs.map(d => d.content?.[0]?.text || 'No content available').join('\n')}`}]}];
              }
          } else {
              logger.error('Fallback RAG assistant prompt object is not a function. Using query as prompt.');
              fallbackPromptMessages = [{role: 'user', content: [{text: `Query: ${query}\nDocuments: ${topDocs.map(d => d.content?.[0]?.text || 'No content available').join('\n')}`}]}];
          }
        } catch (fallbackPromptError: any) {
          logger.error(`Error in fallback prompt function: ${fallbackPromptError.message || String(fallbackPromptError)}. Using simple prompt.`);
          fallbackPromptMessages = [{role: 'user', content: [{text: `Query: ${query}\nDocuments: ${topDocs.map(d => d.content?.[0]?.text || 'No content available').join('\n')}`}]}];
        }
        const historyForFallback: MessageData[] = [{ role: 'user', content: [{ text: query }] }];
        const messagesForLlmFallback = historyForFallback.concat(fallbackPromptMessages);

        const llmStreamResultFallback = aiInstance.generateStream({
          model: fallbackModelKey, // Simplified key
          messages: messagesForLlmFallback,
          context: topDocs,
          // No tools in fallback
          config: {
            temperature: temperaturePreset === 'precise' ? 0.2 : temperaturePreset === 'creative' ? 0.9 : 0.7,
            maxOutputTokens: maxTokens,
          },
          streamingCallback: (chunk: any) => { // Using any for chunk type temporarily
            if (chunk?.text) {
              sendChunk({ type: 'text', text: chunk.text });
              fallbackAccumulatedText += chunk.text;
            }
          },
        });

        for await (const _ of llmStreamResultFallback.stream) { /* consume stream */ }
        const finalFallbackResponse = await llmStreamResultFallback.response;
        
        const fallbackResponseText = finalFallbackResponse.text;
        if (fallbackAccumulatedText === '' && fallbackResponseText) {
           sendChunk({ type: 'text', text: fallbackResponseText });
           fallbackAccumulatedText = fallbackResponseText;
        }
        return fallbackAccumulatedText;

      } catch (fallbackError: any) {
        logger.error(`Error in RAG fallback: ${fallbackError.message || String(fallbackError)}`);
        sendChunk({ type: 'error', error: `Service fallback error: ${fallbackError.message || 'Unknown error during fallback'}` });
        return `Error: RAG service encountered an issue. ${fallbackError.message || ''}`.trim();
      }
    }
  }
);
