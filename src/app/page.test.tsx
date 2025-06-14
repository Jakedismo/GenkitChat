import { useChatMessages } from '@/hooks/chat/useChatMessages';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReadableStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'util';
import GenkitChat from './page';

global.ReadableStream = ReadableStream as any;
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

// Mock scrollIntoView for JSDOM
window.HTMLElement.prototype.scrollIntoView = jest.fn();

// Mock hooks and components
jest.mock('@/hooks/chat/useChatMessages');
jest.mock('@/components/PdfWorkerSetup');

// Mock mermaid to avoid errors in test environment
jest.mock('mermaid', () => ({
  initialize: jest.fn(),
  contentLoaded: jest.fn(),
  run: jest.fn(),
}));

// Mock fetch to control API responses
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.Mock;

describe('GenkitChat Page - Integration Tests', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  test('sends a message and displays the response', async () => {
    const messages: { id: string; sender: 'user' | 'bot'; text: string }[] = [
      { id: '1', sender: 'user', text: 'Test message' },
      { id: '2', sender: 'bot', text: 'You said: Test message' },
    ];
    (useChatMessages as jest.Mock).mockReturnValue({
      messages,
      addUserMessage: jest.fn(),
      addBotPlaceholder: jest.fn(),
      updateBotMessageText: jest.fn(),
      updateBotMessageSources: jest.fn(),
      addToolInvocationToBotMessage: jest.fn(),
      addMultipleToolInvocationsToBotMessage: jest.fn(),
      updateBotMessageFromFinalResponse: jest.fn(),
      injectErrorIntoBotMessage: jest.fn(),
      fixTruncatedBotMessage: jest.fn(),
      clearMessages: jest.fn(),
    });
    
    // Mock the sequence of fetch calls
    mockFetch
      // 1. Session Load/Create
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: 'test-session-id' }),
      })
      // 2. Services Config
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: { gemini: [], openai: [] },
          tools: { tavily: false, perplexity: false, context7: false },
        }),
      })
      // 3. Tools Config
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      // 4. Chat Message (Streaming)
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            const chunk = `data: ${JSON.stringify({
              role: 'model',
              content: [{ text: 'You said: Test message' }],
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(chunk));
            controller.close();
          },
        }),
        headers: new Headers({
          'Content-Type': 'text/event-stream',
        }),
      } as unknown as Response);

    await act(async () => {
      render(<GenkitChat />);
    });

    const input = screen.getByPlaceholderText('Enter your message...');
    const sendButton = screen.getByRole('button', { name: /send/i });

    // Simulate user typing and sending a message
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test message' } });
    });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    // Verify the user's message and the bot's response are displayed
    expect(await screen.findByText('Test message')).toBeInTheDocument();
    expect(
      await screen.findByText('You said: Test message'),
    ).toBeInTheDocument();
  });
});
