import { ChatMode } from '@/types/chat';
import { act, renderHook } from '@testing-library/react';
import { ReadableStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'util';
import { useChatManager, UseChatManagerProps } from './useChatManager';

global.ReadableStream = ReadableStream as any;
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

global.fetch = jest.fn();
const mockFetch = global.fetch as jest.Mock;

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

jest.mock('@/hooks/chat/useChatMessages', () => ({
  useChatMessages: () => ({
    messages: [],
    addUserMessage: jest.fn(),
    addBotPlaceholder: jest.fn().mockReturnValue('bot-placeholder-id'),
    clearMessages: jest.fn(),
  }),
}));

jest.mock('@/hooks/chat/useChatSession', () => ({
  useChatSession: () => ({
    currentSessionId: 'test-session-id',
    startNewSession: jest.fn().mockResolvedValue('new-session-id'),
  }),
}));


const mockProps: UseChatManagerProps = {
  chatMode: ChatMode.DIRECT_GEMINI,
  selectedGeminiModelId: 'gemini-pro',
  selectedOpenAIModelId: null,
  temperaturePreset: 'precise',
  maxTokens: 1024,
  uploadedFiles: [],
  resetUploadedFiles: jest.fn(),
  tavilySearchEnabled: false,
  tavilyExtractEnabled: false,
  perplexitySearchEnabled: false,
  perplexityDeepResearchEnabled: false,
  context7ResolveLibraryIdEnabled: false,
  context7GetLibraryDocsEnabled: false,
};

describe('useChatManager', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  test('should send a message and receive a streaming response', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        const chunk = `data: ${JSON.stringify({
          role: 'model',
          content: [{ text: 'Hello there!' }],
        })}\n\n`;
        controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      body: mockStream,
      headers: new Headers({
        'Content-Type': 'text/event-stream',
      }),
    } as unknown as Response);

    const { result } = renderHook(() => useChatManager(mockProps));

    await act(async () => {
      result.current.setUserInput('Hello');
    });

    await act(async () => {
      await result.current.handleSendMessage();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/basic-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
    
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody).toMatchObject({
      userMessage: 'Hello',
      modelId: 'gemini-pro',
      sessionId: 'test-session-id',
    });
  });
});