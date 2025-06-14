import {
  DocumentData,
  MessageData,
  RankedDocument,
  ToolRequestPart,
  ToolResponsePart,
} from '@genkit-ai/ai';
import { logger } from 'genkit/logging';
import { Document } from 'genkit/retriever';
import { z } from 'zod';
import { aiInstance, ragRetrieverRef } from '../../genkit-server';
import { CitationMeta, HighlightCoordinates } from '../../types/chat';
import { convertChunkPositionToHighlightCoordinates } from '../../utils/coordinateUtils'; // Added import
import { trimHistoryServer } from '../../utils/historyServer';
import { getCapabilities } from '../modelCapabilities';

/**
 * Enhanced citation metadata including coordinate information for PDF highlighting
 */
export interface EnhancedCitationMeta extends CitationMeta {
  /** Whether coordinate data is available for this citation */
  hasCoordinateData?: boolean;
  /** Method used for text extraction (server or client-side) */
  textExtractionMethod?: 'server' | 'client' | 'none';
  /** Total number of pages in the document */
  totalPages?: number;
  /** Precise coordinate data for highlighting text */
  highlightCoordinates?: HighlightCoordinates[];
  /** Processing statistics for debugging and performance analysis */
  processingStats?: {
    textExtractionTime?: number;
    coordinatesComputeTime?: number;
    chunksWithCoordinates?: number;
    totalChunks?: number;
  };
}

// Define the structure for events yielded by generateRagResponseStream
export type RagStreamEvent =
  | { type: 'sources'; sources: (Document & { metadata: EnhancedCitationMeta })[] }
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

// Define EnhancedCitationMeta properties for Zod validation
const EnhancedCitationMetaSchema = z.object({
  // Base CitationMeta fields
  documentId: z.string(),
  chunkId: z.union([z.string(), z.number()]),
  fileName: z.string(),
  pageNumber: z.union([z.number(), z.string(), z.undefined()]),
  textToHighlight: z.string().optional(),
  // Enhanced fields
  hasCoordinateData: z.boolean().optional(),
  textExtractionMethod: z.enum(['server', 'client', 'none']).optional(),
  totalPages: z.number().optional(),
  highlightCoordinates: z.array(z.any()).optional(),
  processingStats: z.object({
    textExtractionTime: z.number().optional(),
    coordinatesComputeTime: z.number().optional(),
    chunksWithCoordinates: z.number().optional(),
    totalChunks: z.number().optional()
  }).optional()
});

// Type guard to check if an object is a valid EnhancedCitationMeta
function isEnhancedCitationMeta(obj: any): obj is EnhancedCitationMeta {
  return obj &&
         typeof obj === 'object' &&
         (typeof obj.documentId === 'string' || obj.documentId === undefined) &&
         (typeof obj.chunkId === 'string' || typeof obj.chunkId === 'number' || obj.chunkId === undefined) &&
         (typeof obj.fileName === 'string' || obj.fileName === undefined);
}

// Define a type for Document with enhanced metadata
const DocumentWithEnhancedMetadataSchema = z.custom<Document>().and(
  z.object({
    metadata: EnhancedCitationMetaSchema
  })
);

export const RagStreamEventSchemaZod = z.union([
  z.object({
    type: z.literal('sources'),
    sources: z.array(DocumentWithEnhancedMetadataSchema)
  }),
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
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.array(z.object({
      text: z.string()
    }))
  })).optional(),
});

export type RagFlowInput = z.infer<typeof RagFlowInputSchema>;

// Constants for RAG
const INITIAL_RETRIEVAL_COUNT = 20;
const FINAL_DOCUMENT_COUNT = 5;
// Try different reranker IDs - the exact name may vary by Genkit version
const POSSIBLE_RERANKER_IDS = [
  'vertexai/semantic-ranker-512',
  'vertexai/reranker',
  'vertexai/text-bison-32k',
  'semantic-ranker-512'
];
// const RERANKER_ID = POSSIBLE_RERANKER_IDS[0]; // Start with the first one - Unused

// Helper function to create a model key string
export const createModelKey = (
  modelId?: string
  // toolsToUse?: string[] // Parameter removed
): string => {
  const baseModel = modelId || 'googleAI/gemini-2.5-pro';
  // Tool-specific logic removed from model key generation
  return baseModel;
};

// Helper to map temperature presets to numeric values (shared logic)
const mapTemp = (preset?: 'precise' | 'normal' | 'creative'): number => {
  switch (preset) {
    case 'precise':
      return 0.2;
    case 'creative':
      return 0.9;
    default:
      return 0.7;
  }
};

export const documentQaStreamFlow = aiInstance.defineFlow(
  {
    name: 'documentQaStreamFlow',
    inputSchema: RagFlowInputSchema,
    outputSchema: z.string(),
    streamSchema: RagStreamEventSchemaZod,
  },
  async (
    {
      query,
      sessionId,
      tools: toolNamesToUse,
      modelId,
      temperaturePreset,
      maxTokens,
      history: incomingHistory,
    }: RagFlowInput,
    sideChannel: (chunk: RagStreamEvent) => void
  ) => {

    // let filteredDocs: Document[] = []; // This was shadowed and its initial value unused
    let topDocs: DocumentData[] = [];
    const pendingToolRequests = new Map<string, ToolRequestPart>();
    const toolResponseBuffer = new Map<string, ToolResponsePart>();
    let accumulatedLlmText = '';

    // Helper function to construct the final messages array for the LLM
    const constructFinalLlmMessages = (
      historyMessages: MessageData[],
      promptGeneratedMessages: MessageData[],
      defaultSystemMessage: MessageData
    ): MessageData[] => {
      // 1. Determine the definitive system message
      let systemMsgToUse: MessageData | undefined = promptGeneratedMessages.find(m => m.role === 'system');
      if (!systemMsgToUse) {
        systemMsgToUse = defaultSystemMessage;
      }

      // 2. Filter history to exclude any system messages (should be none due to Zod schema, but defensive)
      const nonSystemHistory = historyMessages.filter(m => m.role !== 'system');

      // 3. Filter prompt-generated messages to exclude ALL system messages
      //    (because we've already selected one in step 1)
      const nonSystemPromptMessages = promptGeneratedMessages.filter(m => m.role !== 'system');

      // 4. Assemble: definitive system message first, then non-system history, then non-system prompt parts.
      return [systemMsgToUse, ...nonSystemHistory, ...nonSystemPromptMessages];
    };

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
      
      const retrieveOptions: Record<string, unknown> = {
        k: INITIAL_RETRIEVAL_COUNT,
      };
 
      if (sessionId) {
        retrieveOptions.where = { sessionId };
        logger.info(`Retriever configured with where clause for sessionId: ${sessionId}`);
      }
      
      const docs = await aiInstance.retrieve({
        retriever: ragRetrieverRef,
        query: queryDocumentForRetrieval,
        options: retrieveOptions,
      });

      // The filtering is now done at the retriever level, so docs are already filtered.
      const filteredDocs = docs;

      logger.info(
        `Retrieved ${docs.length} documents for session ${sessionId}.`
      );

      if (filteredDocs.length === 0) {
        logger.warn(
          `No documents found for query: "${query}" and session: ${sessionId}`
        );
        sendChunk({ type: 'sources', sources: [] });
        topDocs = [];
      } else {
        if (filteredDocs.length > FINAL_DOCUMENT_COUNT) {
          let rerankerSuccess = false;

          // Try different reranker IDs until one works
          for (const rerankerId of POSSIBLE_RERANKER_IDS) {
            try {
              logger.info(`Attempting to rerank ${filteredDocs.length} documents using ${rerankerId}`);
              const rerankedDocsOutput: RankedDocument[] = await aiInstance.rerank({
                reranker: rerankerId,
                query: Document.fromText(query),
                documents: filteredDocs,
                options: { k: FINAL_DOCUMENT_COUNT },
              });
              topDocs = rerankedDocsOutput.slice(0, FINAL_DOCUMENT_COUNT);
              logger.info(
                `Successfully reranked ${filteredDocs.length} documents to ${topDocs.length} using ${rerankerId} for session ${sessionId}.`
              );
              rerankerSuccess = true;
              break; // Exit the loop on success
            } catch (rerankerError: unknown) {
              const message = rerankerError instanceof Error ? rerankerError.message : String(rerankerError);
              logger.warn(`Reranker ${rerankerId} failed: ${message}`);
              if (rerankerError instanceof Error && rerankerError.stack) {
                logger.debug(`Reranker error stack: ${rerankerError.stack}`);
              }
              // Continue to try the next reranker ID
            }
          }

          // If all rerankers failed, fall back to simple selection
          if (!rerankerSuccess) {
            logger.error(`All reranker IDs failed. Falling back to simple document selection.`);
            topDocs = filteredDocs.slice(0, FINAL_DOCUMENT_COUNT);
            logger.info(
              `Fallback: Selected first ${topDocs.length} documents from ${filteredDocs.length} for session ${sessionId}.`
            );
          }
        } else {
          topDocs = filteredDocs;
          logger.info(`Using all ${topDocs.length} documents (no reranking needed) for session ${sessionId}.`);
        }
        // Enrich documents with enhanced metadata and send to the client.
        const enrichedDocs = topDocs.map((doc, index): Document & { metadata: EnhancedCitationMeta } => {
          const metadata = doc.metadata || {};
          const textContent = doc.content.map(part => ('text' in part ? part.text : '')).join('');
          
          // Use the new general 'position' field from metadata to generate highlightCoordinates for the citation.
          // The original, more precise 'highlightCoordinates' (if any) are still in metadata for other uses.
          const citationHighlightCoordinates = convertChunkPositionToHighlightCoordinates(
            metadata.position, // This is the new general chunk bounding box
            textContent
          );

          const hasGeneralPositionData = !!metadata.position;
          
          // Create citation metadata with enhanced PDF properties
          const citationBase: CitationMeta = {
            documentId: metadata.documentId || 'unknown-doc-id',
            chunkId: index, // Use the numerical index as the chunkId
            fileName: metadata.originalFileName || 'Unknown Source',
            pageNumber: metadata.pageNumber,
            textToHighlight: textContent, // Default to full chunk text for highlighting if using general position
          };
          
          // Add enhanced PDF properties
          const enhancedCitationMeta = {
            ...citationBase,
            hasCoordinateData: hasGeneralPositionData, // Based on the general position data
            textExtractionMethod: metadata.textExtractionMethod || 'none',
            totalPages: metadata.totalPages,
            highlightCoordinates: citationHighlightCoordinates, // Use coordinates derived from general position
            processingStats: metadata.processingStats
          } as EnhancedCitationMeta;
          
          // Re-create the document to ensure it's a clean instance with the new metadata.
          const newDoc = Document.fromText(textContent, enhancedCitationMeta);
          return newDoc as Document & { metadata: EnhancedCitationMeta };
        });

        sendChunk({ type: 'sources', sources: enrichedDocs });
      }

      // Create a version of the documents for the prompt, with enhanced citation markers.
      const docsForPrompt = topDocs.map((doc, index) => {
        const metadata = doc.metadata || {};
        const fileName = metadata.originalFileName || 'Unknown Source';
        const chunkId = index; // Use the numerical index
        const pageNumber = metadata.pageNumber || 'unknown';
        // For the prompt, indicate if general position data is available.
        const hasGeneralPositionData = !!metadata.position;
        
        // Enhanced citation marker includes page number and coordinate availability
        const citationMarker = `[Source: ${fileName}, Chunk: ${chunkId}, Page: ${pageNumber}${hasGeneralPositionData ? ', Has Coordinates: yes' : ''}]`;
        
        const textContent = doc.content.map(part => ('text' in part ? part.text : '')).join('');
        
        // Log citation details for debugging
        if (hasGeneralPositionData) {
          logger.debug(`Enhanced citation for prompt (chunk ${chunkId}): ${fileName} (page ${pageNumber}) with general position data.`);
        }
        
        return Document.fromText(
          `${citationMarker}\n${textContent}`,
          metadata
        );
      });

      const modelToUseKey = createModelKey(modelId);
      
      // Use centralised history trimming util for consistency
      // Ensure the history is properly typed before passing to trimHistoryServer
      let historyToUse: MessageData[];
      
      if (incomingHistory && incomingHistory.length > 0) {
        // Map the incoming history to ensure it matches the MessageData structure
        historyToUse = incomingHistory.map((msg): MessageData => {
          // msg is of type: { role: "user" | "model"; content: { text: string; }[] }
          return {
            role: msg.role, // msg.role is guaranteed to be 'user' or 'model'
            content: msg.content.map(c => { // c is of type: { text: string }
              return {
                text: c.text
                // 'custom' is optional in Part, and not present in source 'c', so omit.
              };
            }),
            metadata: {} // 'metadata' is optional in MessageData, provide default.
          };
        });
      } else {
        // Default history if none provided
        historyToUse = [{
          role: 'user' as const,
          content: [{ text: query }],
          metadata: {}
        }];
      }
      
      const history = trimHistoryServer(historyToUse, modelId);

      // Render the prompt to MessageData[] with defensive checks
      let currentPromptMessages: MessageData[];
      try {
        const ragAssistantPromptObject = await aiInstance.prompt('rag_assistant');
        if (typeof ragAssistantPromptObject === 'function') {
          const result = await ragAssistantPromptObject(
            { query, documents: docsForPrompt },
            { model: createModelKey(modelId) }
          );
          // Assuming result is { messages: MessageData[] } or MessageData[]
          currentPromptMessages = Array.isArray(result) ? result : result?.messages || [];
          if (currentPromptMessages.length === 0 && !Array.isArray(result)) {
              logger.warn('Prompt function did not return messages in expected structure, using query as prompt.');
              // Fallback if prompt structure is not as expected
              currentPromptMessages = [{role: 'user', content: [{text: `Query: ${query}\nDocuments: ${docsForPrompt.map(d => d.content?.[0]?.text || 'No content available').join('\n')}`}]}];
          }
        } else {
          logger.error('RAG assistant prompt object is not a function. Using query as prompt.');
          currentPromptMessages = [{role: 'user', content: [{text: `Query: ${query}\nDocuments: ${docsForPrompt.map(d => d.content?.[0]?.text || 'No content available').join('\n')}`}]}];
        }
      } catch (promptError: any) {
        logger.error(`Error in prompt function: ${promptError.message || String(promptError)}. Using fallback prompt.`);
        currentPromptMessages = [{role: 'user', content: [{text: `Query: ${query}\nDocuments: ${docsForPrompt.map(d => d.content?.[0]?.text || 'No content available').join('\n')}`}]}];
      }

      const markdownSystemMsg: MessageData = {
        role: 'system',
        content: [{ text: 'When you return your final answer, format it in GitHub-flavoured **Markdown**. Use headings, lists, tables and fenced code blocks.' }],
      } as unknown as MessageData;
 
      const messagesForLlm = constructFinalLlmMessages(history, currentPromptMessages, markdownSystemMsg);

      const caps = getCapabilities(modelId);
      const config: Record<string, unknown> = {};
      if (caps.supportsTemperature) {
        config.temperature = mapTemp(temperaturePreset);
      }
      config[caps.maxTokensParam] = maxTokens;

      const generateOptions: Parameters<typeof aiInstance.generateStream>[0] = {
        model: modelToUseKey,
        messages: messagesForLlm,
        context: topDocs,
        config,
        streamingCallback: (chunk) => {
          if (chunk?.text) {
            sendChunk({ type: 'text', text: chunk.text });
            accumulatedLlmText += chunk.text;
          }
        },
      };

      if (toolNamesToUse && toolNamesToUse.length > 0) {
        (generateOptions as Record<string, unknown>).tools = toolNamesToUse;
      }
 
      const toolsForLogging = (generateOptions as Record<string, unknown>).tools;
      logger.info(`Using model for RAG: ${modelToUseKey} with tools: ${Array.isArray(toolsForLogging) ? toolsForLogging.join(', ') : 'none'}`);
 
      const llmStream = aiInstance.generateStream(generateOptions);
 
      // Consume the stream to trigger the callbacks.
      for await (const _chunk of llmStream.stream) {
        // The streamingCallback handles text chunks.
        // This loop drives the stream and allows for future in-loop processing if needed.
      }

      await flushToolBuffer();

      // After the stream is fully processed, get the final response.
      const finalResponse = await llmStream.response;
      const responseText = finalResponse.text;
      logger.info(`[RAG_FLOW_DEBUG] Final LLM Response Text: ${responseText}`); // DEBUG LOG

      // If no text was streamed but the final response has text, send it now.
      if (accumulatedLlmText === '' && responseText) {
        sendChunk({ type: 'text', text: responseText });
        return responseText;
      }

      return accumulatedLlmText;

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error in RAG flow: ${message}. Falling back.`);
      sendChunk({ type: 'error', error: `Service error: ${message || 'Unknown error during RAG flow'}` });
      
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
              // and preserve any enhanced metadata for coordinate highlighting
              const safeDocs = topDocs.map(doc => {
                const metadata = doc.metadata || {};
                // Make sure all enhanced metadata fields are preserved
                const enhancedMetadata = {
                  ...metadata,
                  hasCoordinateData: metadata.hasCoordinateData || false,
                  textExtractionMethod: metadata.textExtractionMethod || 'none',
                  totalPages: metadata.totalPages,
                  highlightCoordinates: metadata.highlightCoordinates,
                  processingStats: metadata.processingStats
                };
                
                return {
                  ...doc,
                  content: doc.content || [{ text: 'No content available' }],
                  metadata: enhancedMetadata
                };
              });
              
              const result = await ragAssistantPromptObjectFallback(
                { query, documents: safeDocs },
                { model: createModelKey(modelId) }
              );
              fallbackPromptMessages = Array.isArray(result) ? result : result?.messages || [];
              if (fallbackPromptMessages.length === 0 && !Array.isArray(result)) {
                   logger.warn('Fallback prompt function did not return messages, using query as prompt.');
                  fallbackPromptMessages = [{role: 'user', content: [{text: `Query: ${query}\nDocuments: ${topDocs.map(d => d.content?.[0]?.text || 'No content available').join('\n')}`}]}];
              }
          } else {
              logger.error('Fallback RAG assistant prompt object is not a function. Using query as prompt.');
              fallbackPromptMessages = [{role: 'user', content: [{text: `Query: ${query}\nDocuments: ${topDocs.map(d => d.content?.[0]?.text || 'No content available').join('\n')}`}]}];
            }
          } catch (fallbackPromptError: unknown) {
            const message = fallbackPromptError instanceof Error ? fallbackPromptError.message : String(fallbackPromptError);
            logger.error(`Error in fallback prompt function: ${message}. Using simple prompt.`);
            fallbackPromptMessages = [{role: 'user', content: [{text: `Query: ${query}\nDocuments: ${topDocs.map(d => d.content?.[0]?.text || 'No content available').join('\n')}`}]}];
          }
          const historyForFallback: MessageData[] = [{ role: 'user', content: [{ text: query }] }];
          const markdownSystemMsgFallback: MessageData = {
            role: 'system',
            content: [{ text: 'When you return your final answer, format it in GitHub-flavoured **Markdown**. Use headings, lists, tables and fenced code blocks.' }],
          } as unknown as MessageData;
          const messagesForLlmFallback = constructFinalLlmMessages(historyForFallback, fallbackPromptMessages, markdownSystemMsgFallback);
   
          const capsFallback = getCapabilities(modelId);
        const fallbackConfig: Record<string, unknown> = {};
        if (capsFallback.supportsTemperature) {
          fallbackConfig.temperature = mapTemp(temperaturePreset);
        }
        fallbackConfig[capsFallback.maxTokensParam] = maxTokens;

        const llmStreamResultFallback = aiInstance.generateStream({
          model: fallbackModelKey,
          messages: messagesForLlmFallback,
          context: topDocs,
          config: fallbackConfig,
          streamingCallback: (chunk: unknown) => {
            if (typeof chunk === 'object' && chunk !== null && 'text' in chunk && typeof chunk.text === 'string') {
              sendChunk({ type: 'text', text: chunk.text });
              fallbackAccumulatedText += chunk.text;
            }
          },
        });

        for await (const _ of llmStreamResultFallback.stream) { /* consume stream */ }
        const finalFallbackResponse = await llmStreamResultFallback.response;
        
        const fallbackResponseText = finalFallbackResponse.text;
        logger.info(`[RAG_FLOW_DEBUG] Final LLM Fallback Response Text: ${fallbackResponseText}`); // DEBUG LOG
        if (fallbackAccumulatedText === '' && fallbackResponseText) {
           sendChunk({ type: 'text', text: fallbackResponseText });
           fallbackAccumulatedText = fallbackResponseText;
        }
        return fallbackAccumulatedText;
 
      } catch (fallbackError: unknown) {
        const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        logger.error(`Error in RAG fallback: ${message}`);
        sendChunk({ type: 'error', error: `Service fallback error: ${message || 'Unknown error during fallback'}` });
        return `Error: RAG service encountered an issue. ${message || ''}`.trim();
      }
    }
  }
);
