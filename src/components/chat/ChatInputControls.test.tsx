import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatInputControls from './ChatInputControls'; // Path to the component
import { TooltipProvider } from '@/components/ui/tooltip'; // Import TooltipProvider

// Mock lucide-react icons used in ChatInputControls
jest.mock('lucide-react', () => ({
  Search: () => <div data-testid="mock-lucide-search-icon" />,
  ExternalLink: () => <div data-testid="mock-lucide-externallink-icon" />,
  Sparkles: () => <div data-testid="mock-lucide-sparkles-icon" />,
  BrainCircuit: () => <div data-testid="mock-lucide-braincircuit-icon" />,
  Paperclip: () => <div data-testid="mock-lucide-paperclip-icon" />,
}));

describe('ChatInputControls Component', () => {
  const mockOnUserInputChanges = jest.fn();
  const mockOnSendMessage = jest.fn();
  const mockOnTavilySearchToggle = jest.fn();
  const mockOnTavilyExtractToggle = jest.fn();
  const mockOnPerplexitySearchToggle = jest.fn();
  const mockOnPerplexityDeepResearchToggle = jest.fn();
  const mockOnFileUploadTrigger = jest.fn();

  const defaultProps = {
    userInput: '',
    onUserInputChanges: mockOnUserInputChanges,
    onSendMessage: mockOnSendMessage,
    isLoading: false,
    isUploading: false,
    tavilySearchEnabled: false,
    onTavilySearchToggle: mockOnTavilySearchToggle,
    tavilyExtractEnabled: false,
    onTavilyExtractToggle: mockOnTavilyExtractToggle,
    perplexitySearchEnabled: false,
    onPerplexitySearchToggle: mockOnPerplexitySearchToggle,
    perplexityDeepResearchEnabled: false,
    onPerplexityDeepResearchToggle: mockOnPerplexityDeepResearchToggle,
    onFileUploadTrigger: mockOnFileUploadTrigger,
  };

  beforeEach(() => {
     // Reset mocks before each test
     jest.clearAllMocks();
  });

  test('renders input field and send button', () => {
    render(
      <TooltipProvider>
        <ChatInputControls {...defaultProps} />
      </TooltipProvider>
    );
    expect(screen.getByPlaceholderText('Enter your message...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  test('calls onUserInputChanges when input value changes', () => {
    render(
      <TooltipProvider>
        <ChatInputControls {...defaultProps} />
      </TooltipProvider>
    );
    const input = screen.getByPlaceholderText('Enter your message...');
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(mockOnUserInputChanges).toHaveBeenCalledWith('hello');
  });

  test('calls onSendMessage when send button is clicked and userInput is not empty', () => {
    render(
      <TooltipProvider>
        <ChatInputControls {...defaultProps} userInput="hello" />
      </TooltipProvider>
    );
    const sendButton = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(sendButton);
    expect(mockOnSendMessage).toHaveBeenCalled();
  });

  test('send button is disabled if userInput is empty', () => {
    render(
      <TooltipProvider>
        <ChatInputControls {...defaultProps} userInput="" />
      </TooltipProvider>
    );
    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton).toBeDisabled();
  });

  test('send button text changes to "Sending..." and is disabled when isLoading is true', () => {
    render(
      <TooltipProvider>
        <ChatInputControls {...defaultProps} isLoading={true} userInput="hello" />
      </TooltipProvider>
    );
    const sendButton = screen.getByRole('button', { name: 'Sending...' });
    expect(sendButton).toBeInTheDocument();
    expect(sendButton).toBeDisabled();
  });

  test('all toolbar buttons and input are disabled when isLoading is true', () => {
    render(
      <TooltipProvider>
        <ChatInputControls {...defaultProps} isLoading={true} />
      </TooltipProvider>
    );
    expect(screen.getByPlaceholderText('Enter your message...')).toBeDisabled();
    expect(screen.getByTestId("mock-lucide-search-icon").closest('button')).toBeDisabled();
    expect(screen.getByTestId("mock-lucide-externallink-icon").closest('button')).toBeDisabled();
    expect(screen.getByTestId("mock-lucide-sparkles-icon").closest('button')).toBeDisabled();
    expect(screen.getByTestId("mock-lucide-braincircuit-icon").closest('button')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Attach Files/i })).toBeDisabled(); // This one has text
  });

  test('all toolbar buttons and input are disabled when isUploading is true', () => {
    render(
      <TooltipProvider>
        <ChatInputControls {...defaultProps} isUploading={true} />
      </TooltipProvider>
    );
    expect(screen.getByPlaceholderText('Enter your message...')).toBeDisabled();
    expect(screen.getByTestId("mock-lucide-search-icon").closest('button')).toBeDisabled();
    // Checking one more icon button and the text button for this case
    expect(screen.getByTestId("mock-lucide-sparkles-icon").closest('button')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Attach Files/i })).toBeDisabled();
  });

  test('toggles Tavily search', () => {
    render(
      <TooltipProvider>
        <ChatInputControls {...defaultProps} />
      </TooltipProvider>
    );
    const tavilyButton = screen.getByTestId("mock-lucide-search-icon").closest('button');
    expect(tavilyButton).not.toBeNull(); // Ensure the button is found
    if (tavilyButton) fireEvent.click(tavilyButton);
    expect(mockOnTavilySearchToggle).toHaveBeenCalledTimes(1);
  });

});
