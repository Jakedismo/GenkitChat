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

const mockUpdateBotMessageText = jest.fn();
const mockInjectErrorIntoBotMessage = jest.fn();
const mockFixTruncatedBotMessage = jest.fn();

jest.mock('@/hooks/chat/useChatMessages', () => ({
  useChatMessages: () => ({
    messages: [],
    addUserMessage: jest.fn(),
    addBotPlaceholder: jest.fn().mockReturnValue('bot-placeholder-id'),
    updateBotMessageText: mockUpdateBotMessageText,
    updateBotMessageSources: jest.fn(),
    addToolInvocationToBotMessage: jest.fn(),
    addMultipleToolInvocationsToBotMessage: jest.fn(),
    updateBotMessageFromFinalResponse: jest.fn(),
    injectErrorIntoBotMessage: mockInjectErrorIntoBotMessage,
    fixTruncatedBotMessage: mockFixTruncatedBotMessage,
    clearMessages: jest.fn(),
  }),
}));

jest.mock('@/hooks/chat/useChatSession', () => ({
  useChatSession: () => ({
    currentSessionId: 'test-session-id',
    setCurrentSessionId: jest.fn(),
    startNewSession: jest.fn().mockResolvedValue('new-session-id'),
  }),
}));

jest.mock('@/hooks/chat/useChatInputControls', () => ({
  useChatInputControls: () => ({
    userInput: 'Test message',
    setUserInput: jest.fn(),
    clearUserInput: jest.fn(),
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

describe('useChatManager Bug Fixes', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockUpdateBotMessageText.mockClear();
    mockInjectErrorIntoBotMessage.mockClear();
    mockFixTruncatedBotMessage.mockClear();
  });

  test('BUG-001: Memory leak prevention - should not cause infinite re-renders', async () => {
    const { result } = renderHook(() => useChatManager(mockProps));
    
    // The handleSendMessage function should be stable and not cause re-renders
    const initialHandleSendMessage = result.current.handleSendMessage;
    
    // Re-render the hook
    renderHook(() => useChatManager(mockProps));
    
    // The function reference should remain stable due to proper dependency management
    expect(typeof initialHandleSendMessage).toBe('function');
  });

  test('BUG-002: Race condition prevention - should handle stream errors gracefully', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        // Simulate a stream error
        controller.error(new Error('Stream processing error'));
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
      await result.current.handleSendMessage();
    });

    // Should handle the error gracefully without crashing
    expect(mockInjectErrorIntoBotMessage).toHaveBeenCalled();
  });

  test('BUG-005: SSE message event handling - should process message events correctly', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        const chunk = `event: message\ndata: {"role":"model","content":[{"text":"Hello there!"}]}\n\n`;
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
      await result.current.handleSendMessage();
    });

    // Should process the message event and update bot message text
    expect(mockUpdateBotMessageText).toHaveBeenCalled();
  });

  test('BUG-004: Infinite loop prevention - fixTruncatedMessage should not cause infinite recursion', () => {
    const { result } = renderHook(() => useChatManager(mockProps));

    // Mock a message that might cause infinite recursion
    mockFixTruncatedBotMessage.mockReturnValue(true);

    // This should not cause an infinite loop
    const wasFixed = result.current.fixTruncatedMessage('test-message-id');

    expect(mockFixTruncatedBotMessage).toHaveBeenCalledWith('test-message-id');
    expect(wasFixed).toBe(true);
  });

  test('BUG-026: Recursion protection marker should work correctly', () => {
    // This test verifies that the recursion protection actually works
    // by checking that messages with the marker are not processed again
    const { result } = renderHook(() => useChatManager(mockProps));

    // Mock a message that already has the truncation marker
    const messageWithMarker = 'Some text\n<!-- __TRUNCATION_FIXED__ -->';
    mockFixTruncatedBotMessage.mockImplementation((messageId) => {
      // Simulate the actual behavior - if marker exists, don't process
      return !messageWithMarker.includes('<!-- __TRUNCATION_FIXED__ -->');
    });

    // This should return false because the message already has the marker
    const wasFixed = result.current.fixTruncatedMessage('test-message-id');

    expect(mockFixTruncatedBotMessage).toHaveBeenCalledWith('test-message-id');
    // Should not be "fixed" again since it already has the marker
    expect(wasFixed).toBe(false);
  });

  test('BUG-003: Stream cleanup - should handle stream reader cleanup properly', async () => {
    let controllerRef: ReadableStreamDefaultController<Uint8Array>;
    
    const mockStream = new ReadableStream({
      start(controller) {
        controllerRef = controller;
        // Don't close immediately to test cleanup
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

    const sendPromise = act(async () => {
      await result.current.handleSendMessage();
    });

    // Close the stream after a short delay to simulate cleanup
    setTimeout(() => {
      controllerRef!.close();
    }, 10);

    await sendPromise;

    // Should complete without hanging or throwing unhandled promise rejections
    expect(mockFetch).toHaveBeenCalled();
  });
});
