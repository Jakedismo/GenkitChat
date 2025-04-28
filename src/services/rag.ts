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
 *
 * @returns A promise that resolves to an array of RagEndpoint objects.
 */
export async function getRagEndpoints(): Promise<RagEndpoint[]> {
  // TODO: Implement this by calling an API.

  return [
    {
      endpointId: 'endpoint1',
      endpointName: 'Endpoint 1'
    },
    {
      endpointId: 'endpoint2',
      endpointName: 'Endpoint 2'
    }
  ];
}
