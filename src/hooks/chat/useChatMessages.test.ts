import { renderHook, act } from '@testing-library/react';
import { useChatMessages } from './useChatMessages';
import { ChatMessage } from '@/types/chat';

// Mock crypto.randomUUID for test environment
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
  },
});

describe('useChatMessages', () => {
  test('should add and retrieve messages correctly', () => {
    const { result } = renderHook(() => useChatMessages());

    act(() => {
      result.current.addUserMessage('Hello, world!');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Hello, world!');
    expect(result.current.messages[0].sender).toBe('user');
  });

  test('should add bot placeholder and update it', () => {
    const { result } = renderHook(() => useChatMessages());

    let botMessageId: string;

    act(() => {
      botMessageId = result.current.addBotPlaceholder();
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].sender).toBe('bot');
    expect(result.current.messages[0].text).toBe('');

    act(() => {
      result.current.updateBotMessageText(botMessageId, 'Bot response');
    });

    expect(result.current.messages[0].text).toBe('Bot response');
  });

  test('BUG-026: fixTruncatedBotMessage should prevent infinite recursion', () => {
    const { result } = renderHook(() => useChatMessages());

    let botMessageId: string;

    // Add a bot message that already has the marker (simulating already processed message)
    act(() => {
      botMessageId = result.current.addBotPlaceholder();
      result.current.updateBotMessageText(botMessageId, 'Some text\n<!-- __TRUNCATION_FIXED__ -->');
    });

    // This call should not process the message again (recursion protection)
    act(() => {
      const wasFixed = result.current.fixTruncatedBotMessage(botMessageId);
      expect(wasFixed).toBe(false); // Should not be "fixed" again
    });

    // The message should still only have one marker
    const finalMessage = result.current.messages.find(msg => msg.id === botMessageId);
    const markerCount = (finalMessage?.text as string).split('<!-- __TRUNCATION_FIXED__ -->').length - 1;
    expect(markerCount).toBe(1);
  });

  test('BUG-026: fixTruncatedBotMessage should handle trailing backslash', () => {
    const { result } = renderHook(() => useChatMessages());

    let botMessageId: string;

    // Add a bot message with trailing backslash that needs fixing
    act(() => {
      botMessageId = result.current.addBotPlaceholder();
      // Create a string that actually ends with a backslash
      const textWithBackslash = 'Some text\\';
      result.current.updateBotMessageText(botMessageId, textWithBackslash);
    });

    // The function should handle the message without error
    act(() => {
      const wasFixed = result.current.fixTruncatedBotMessage(botMessageId);
      expect(typeof wasFixed).toBe('boolean');
    });

    // The message should still exist and be processable
    const finalMessage = result.current.messages.find(msg => msg.id === botMessageId);
    expect(finalMessage).toBeDefined();
    expect(typeof finalMessage?.text).toBe('string');
  });

  test('BUG-026: fixTruncatedBotMessage should handle various text formats', () => {
    const { result } = renderHook(() => useChatMessages());

    let botMessageId: string;

    // Test with normal string text
    act(() => {
      botMessageId = result.current.addBotPlaceholder();
      result.current.updateBotMessageText(botMessageId, 'Some text with normal format');
    });

    // The function should handle normal text without error
    act(() => {
      const wasFixed = result.current.fixTruncatedBotMessage(botMessageId);
      expect(typeof wasFixed).toBe('boolean');
    });

    // The message should remain as string
    const fixedMessage = result.current.messages.find(msg => msg.id === botMessageId);
    expect(typeof fixedMessage?.text).toBe('string');
    expect(fixedMessage?.text).toContain('Some text');
  });

  test('should handle complex message structures without infinite loops', () => {
    const { result } = renderHook(() => useChatMessages());

    let botMessageId: string;

    // Add a message with complex nested structure
    act(() => {
      botMessageId = result.current.addBotPlaceholder();
      const message = result.current.messages.find(msg => msg.id === botMessageId);
      if (message) {
        // Use any to bypass type checking for test purposes
        (message as any).text = [
          { text: 'Complex object' },
          'Mixed with string',
          { text: 'Another object' }
        ];
      }
    });

    // This should not cause infinite recursion
    act(() => {
      const wasFixed = result.current.fixTruncatedBotMessage(botMessageId);
      expect(typeof wasFixed).toBe('boolean');
    });

    // The message should be processed without error
    const fixedMessage = result.current.messages.find(msg => msg.id === botMessageId);
    expect(fixedMessage).toBeDefined();
    expect(typeof fixedMessage?.text).toBe('string');
  });

  test('should clear messages correctly', () => {
    const { result } = renderHook(() => useChatMessages());

    act(() => {
      result.current.addUserMessage('User message');
      result.current.addBotPlaceholder();
    });

    expect(result.current.messages).toHaveLength(2);

    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.messages).toHaveLength(0);
  });

  test('should handle tool invocations correctly', () => {
    const { result } = renderHook(() => useChatMessages());

    let botMessageId: string;

    act(() => {
      botMessageId = result.current.addBotPlaceholder();
    });

    const toolInvocation = {
      toolName: 'test_tool',
      name: 'test_tool',
      input: { query: 'test' },
      output: { result: 'Tool result' }
    };

    act(() => {
      result.current.addToolInvocationToBotMessage(botMessageId, toolInvocation);
    });

    const message = result.current.messages.find(msg => msg.id === botMessageId);
    expect(message?.toolInvocations).toHaveLength(1);
    expect(message?.toolInvocations?.[0]).toEqual(toolInvocation);
  });

  test('should update bot message sources correctly', () => {
    const { result } = renderHook(() => useChatMessages());

    let botMessageId: string;

    act(() => {
      botMessageId = result.current.addBotPlaceholder();
    });

    const sources = [
      {
        documentId: 'doc1',
        chunkId: 1,
        fileName: 'doc1.pdf',
        originalFileName: 'doc1.pdf',
        content: 'Source content 1'
      },
      {
        documentId: 'doc2',
        chunkId: 2,
        fileName: 'doc2.pdf',
        originalFileName: 'doc2.pdf',
        content: 'Source content 2'
      }
    ];

    act(() => {
      result.current.updateBotMessageSources(botMessageId, sources);
    });

    const message = result.current.messages.find(msg => msg.id === botMessageId);
    expect(message?.sources).toEqual(sources);
  });

  test('should inject errors into bot messages correctly', () => {
    const { result } = renderHook(() => useChatMessages());

    let botMessageId: string;

    act(() => {
      botMessageId = result.current.addBotPlaceholder();
    });

    const errorMessage = 'Something went wrong';

    act(() => {
      result.current.injectErrorIntoBotMessage(botMessageId, errorMessage);
    });

    const message = result.current.messages.find(msg => msg.id === botMessageId);
    expect(message?.text).toContain('[ERROR:');
    expect(message?.text).toContain(errorMessage);
    expect(message?.hasError).toBe(true);
  });
});
