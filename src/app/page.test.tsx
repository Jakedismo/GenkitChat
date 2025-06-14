import { useChatManager } from '@/hooks/useChatManager'; // Mock this hook
import { useChatSettings } from '@/hooks/useChatSettings'; // Mock this hook
import { useFileUploads } from '@/hooks/useFileUploads'; // Mock this hook
import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import GenkitChat from './page'; // Assuming GenkitChat is the default export from page.tsx

// Mock child components that are not directly relevant to these tests or might cause issues
jest.mock('@/components/chat/ChatConfigSidebar', () => () => <div data-testid="mock-chat-config-sidebar"></div>);
jest.mock('@/components/chat/ServerStatusDisplay', () => () => <div data-testid="mock-server-status-display"></div>);
jest.mock('@/components/chat/ChatInputControls', () => () => <div data-testid="mock-chat-input-controls"></div>);
jest.mock('@/components/chat/FileUploadManager', () => () => <div data-testid="mock-file-upload-manager"></div>);
jest.mock('@/components/CitationPreviewSidebar', () => () => <div data-testid="mock-citation-preview-sidebar"></div>);
jest.mock('@/components/PdfWorkerSetup', () => () => <div data-testid="mock-pdf-worker-setup"></div>);

// Mock custom hooks
jest.mock('@/hooks/useChatManager');
jest.mock('@/hooks/useChatSettings');
jest.mock('@/hooks/useFileUploads');

// Mock mermaid
jest.mock('mermaid', () => ({
  initialize: jest.fn(),
  contentLoaded: jest.fn(),
  run: jest.fn(),
}));

// Mock lucide-react (specifically the Code icon used in page.tsx)
jest.mock('lucide-react', () => ({
  // Retain other exports if any, though for 'Code' this should be enough
  // If other specific icons from lucide-react were used directly in page.tsx,
  // they would need to be added here too.
  Code: () => <div data-testid="mock-lucide-code-icon"></div>,
}));

jest.mock('react-markdown', () => (props: any) => <div data-testid="mock-react-markdown">{props.children}</div>);
jest.mock('remark-gfm', () => jest.fn());
jest.mock('rehype-highlight', () => jest.fn());

describe('GenkitChat Page', () => {
  const mockUseChatManager = useChatManager as jest.Mock;
  const mockUseChatSettings = useChatSettings as jest.Mock;
  const mockUseFileUploads = useFileUploads as jest.Mock;

  beforeEach(() => {
    // Provide default mock implementations for the hooks
    mockUseChatManager.mockReturnValue({
      messages: [],
      userInput: '',
      setUserInput: jest.fn(),
      isLoading: false,
      currentSessionId: 'test-session',
      handleSendMessage: jest.fn(),
      clearChat: jest.fn(),
      fixTruncatedMessage: jest.fn(),
      messagesEndRef: { current: null },
      scrollAreaRef: { current: null },
    });
    mockUseChatSettings.mockReturnValue({
      chatMode: 'basic',
      setChatMode: jest.fn(),
      // Add other settings with default mock values
      selectedGeminiModelId: '',
      setSelectedGeminiModelId: jest.fn(),
      availableGeminiModels: [],
      selectedOpenAIModelId: '',
      setSelectedOpenAIModelId: jest.fn(),
      availableOpenAIModels: [],
      temperaturePreset: 'normal',
      setTemperaturePreset: jest.fn(),
      maxTokens: 1000,
      setMaxTokens: jest.fn(),
      tavilySearchEnabled: false,
      setTavilySearchEnabled: jest.fn(),
      tavilyExtractEnabled: false,
      setTavilyExtractEnabled: jest.fn(),
      perplexitySearchEnabled: false,
      setPerplexitySearchEnabled: jest.fn(),
      perplexityDeepResearchEnabled: false,
      setPerplexityDeepResearchEnabled: jest.fn(),
      context7ResolveLibraryIdEnabled: false,
      setContext7ResolveLibraryIdEnabled: jest.fn(),
      context7GetLibraryDocsEnabled: false,
      setContext7GetLibraryDocsEnabled: jest.fn(),
    });
    mockUseFileUploads.mockReturnValue({
      uploadedFiles: [],
      isUploading: false,
      fileInputRef: { current: null },
      handleFileChange: jest.fn(),
      removeFile: jest.fn(),
      triggerFileUpload: jest.fn(),
      resetUploadedFiles: jest.fn(),
    });

    // Mock fetch for /api/tools
     global.fetch = jest.fn(() =>
       Promise.resolve({
         ok: true,
         json: () => Promise.resolve([]), // Default to no tools
       })
     ) as jest.Mock;
  });

  test('renders loading indicator when isLoading is true', async () => {
    const specificMockValues = {
      messages: [],
      userInput: '',
      setUserInput: jest.fn(),
      isLoading: true, // Key change for this test
      currentSessionId: 'test-session',
      handleSendMessage: jest.fn(),
      clearChat: jest.fn(),
      fixTruncatedMessage: jest.fn(),
      messagesEndRef: { current: null },
      scrollAreaRef: { current: null },
    };
    mockUseChatManager.mockReturnValue(specificMockValues);

    await act(async () => {
      render(<GenkitChat />);
      await Promise.resolve(); // Allow useEffects to run
    });
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
  });

  test('does not render loading indicator when isLoading is false', async () => {
    const specificMockValues = {
      messages: [],
      userInput: '',
      setUserInput: jest.fn(),
      isLoading: false, // Key change for this test
      currentSessionId: 'test-session',
      handleSendMessage: jest.fn(),
      clearChat: jest.fn(),
      fixTruncatedMessage: jest.fn(),
      messagesEndRef: { current: null },
      scrollAreaRef: { current: null },
    };
    mockUseChatManager.mockReturnValue(specificMockValues);

    await act(async () => {
      render(<GenkitChat />);
      await Promise.resolve(); // Allow useEffects to run
    });
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
  });

  test('newly added user message has animation class', async () => { // Ensure test function is async
     const initialMessages: any[] = [];
     const newMessages = [
         { id: '1', text: 'Hello', sender: 'user', timestamp: new Date() },
     ];

     mockUseChatManager.mockReturnValue({
         ...mockUseChatManager(),
         messages: initialMessages, // Start with no messages
         isLoading: false,
     });

     const { rerender } = render(<GenkitChat />);

     // Simulate receiving a new message
     mockUseChatManager.mockReturnValue({
         ...mockUseChatManager(),
         messages: newMessages, // Now with one message
         isLoading: false,
     });

     // Rerender the component with the new messages
     // Use act to ensure updates are processed
     await act(async () => {
         rerender(<GenkitChat />);
         await Promise.resolve(); // Allow useEffects to run
     });

     const messageDiv = screen.getByText('Hello').closest('div[data-message-id="1"]');
     expect(messageDiv).toHaveClass('animate-fade-in-slide-up');
  });

  test('newly added bot message has animation class', async () => { // Ensure test function is async
     const initialMessages: any[] = [];
     const newMessages = [
         { id: '1', text: 'Hi there', sender: 'bot', timestamp: new Date() },
     ];

     mockUseChatManager.mockReturnValue({
         ...mockUseChatManager(),
         messages: initialMessages,
         isLoading: false,
     });

     const { rerender } = render(<GenkitChat />);

     mockUseChatManager.mockReturnValue({
         ...mockUseChatManager(),
         messages: newMessages,
         isLoading: false,
     });

     await act(async () => {
         rerender(<GenkitChat />);
         await Promise.resolve(); // Allow useEffects to run
     });

     const messageContentDiv = screen.getByText('Hi there').closest('div[data-message-id="1"]');
     expect(messageContentDiv).toHaveClass('animate-fade-in-slide-up');
  });

});
