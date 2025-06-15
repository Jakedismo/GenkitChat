/**
 * Lightweight RAG endpoints configuration
 * This module contains only static configuration data with no heavy dependencies
 */

/**
 * Represents a RAG endpoint.
 */
export interface RagEndpoint {
  /**
   * The ID of the endpoint.
   */
  endpointId: string;
  /**
   * The name of the endpoint.
   */
  endpointName: string;
}

/**
 * Asynchronously retrieves a list of RAG endpoints.
 * This function returns static configuration data and has no dependencies on Genkit or other heavy modules.
 *
 * @returns A promise that resolves to an array of RagEndpoint objects.
 */
export async function getRagEndpoints(): Promise<RagEndpoint[]> {
  // Static configuration - no heavy imports or server initialization required
  return [
    {
      endpointId: "pdf-rag",
      endpointName: "PDF Document RAG with Two-Stage Retrieval",
    },
  ];
}