/**
 * Represents a Bedrock model.
 */
export interface BedrockModel {
  /**
   * The ID of the model.
   */
  modelId: string;
  /**
   * The name of the model.
   */
  modelName: string;
}

/**
 * Asynchronously retrieves a list of Bedrock models.
 *
 * @returns A promise that resolves to an array of BedrockModel objects.
 */
export async function getBedrockModels(): Promise<BedrockModel[]> {
  // TODO: Implement this by calling the Bedrock API.

  return [
    {
      modelId: 'anthropic.claude-v2',
      modelName: 'Claude V2'
    },
    {
      modelId: 'ai21labs.j2-grande-instruct',
      modelName: 'AI21 Labs Grande Instruct'
    }
  ];
}
