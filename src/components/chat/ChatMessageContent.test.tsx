import { render, screen, fireEvent } from '@testing-library/react';
import ChatMessageContent from './ChatMessageContent';

describe('ChatMessageContent', () => {
  const mockOnCitationClick = jest.fn();

  beforeEach(() => {
    mockOnCitationClick.mockClear();
  });

  test('renders simple text without citations', () => {
    render(
      <ChatMessageContent
        text="This is a simple message without citations."
        onCitationClick={mockOnCitationClick}
      />
    );

    expect(screen.getByText('This is a simple message without citations.')).toBeInTheDocument();
  });

  test('renders citations as clickable buttons', () => {
    const textWithCitation = 'This is a message with a citation [Source: document.pdf, Chunk: 0] and more text.';
    
    render(
      <ChatMessageContent
        text={textWithCitation}
        onCitationClick={mockOnCitationClick}
      />
    );

    // Check that the citation is rendered as a button
    const citationButton = screen.getByRole('button', { name: /Source: document\.pdf, Chunk: 0/ });
    expect(citationButton).toBeInTheDocument();
    expect(citationButton).toHaveClass('text-blue-600');

    // Check that clicking the citation calls the callback
    fireEvent.click(citationButton);
    expect(mockOnCitationClick).toHaveBeenCalledWith(0);
  });

  test('renders multiple citations correctly', () => {
    const textWithMultipleCitations = 'First citation [Source: doc1.pdf, Chunk: 0] and second [Source: doc2.pdf, Chunk: 1] citation.';
    
    render(
      <ChatMessageContent
        text={textWithMultipleCitations}
        onCitationClick={mockOnCitationClick}
      />
    );

    // Check that both citations are rendered as buttons
    const citation1 = screen.getByRole('button', { name: /Source: doc1\.pdf, Chunk: 0/ });
    const citation2 = screen.getByRole('button', { name: /Source: doc2\.pdf, Chunk: 1/ });
    
    expect(citation1).toBeInTheDocument();
    expect(citation2).toBeInTheDocument();

    // Test clicking both citations
    fireEvent.click(citation1);
    expect(mockOnCitationClick).toHaveBeenCalledWith(0);

    fireEvent.click(citation2);
    expect(mockOnCitationClick).toHaveBeenCalledWith(1);
  });

  test('handles citations with "Chunks" (plural) format', () => {
    const textWithChunks = 'This has multiple chunks [Source: document.pdf, Chunks: 0-2] referenced.';
    
    render(
      <ChatMessageContent
        text={textWithChunks}
        onCitationClick={mockOnCitationClick}
      />
    );

    const citationButton = screen.getByRole('button', { name: /Source: document\.pdf, Chunks: 0-2/ });
    expect(citationButton).toBeInTheDocument();

    fireEvent.click(citationButton);
    expect(mockOnCitationClick).toHaveBeenCalledWith(0); // Should extract the first chunk number
  });

  test('filters out truncation fix markers', () => {
    const textWithMarker = 'This is a message with truncation marker.\n<!-- __TRUNCATION_FIXED__ -->';
    
    render(
      <ChatMessageContent
        text={textWithMarker}
        onCitationClick={mockOnCitationClick}
      />
    );

    // The marker should not be visible in the rendered content
    expect(screen.queryByText('__TRUNCATION_FIXED__')).not.toBeInTheDocument();
    expect(screen.getByText('This is a message with truncation marker.')).toBeInTheDocument();
  });

  test('renders markdown links correctly', () => {
    const textWithLink = 'Check out [this link](https://example.com) for more info.';
    
    render(
      <ChatMessageContent
        text={textWithLink}
        onCitationClick={mockOnCitationClick}
      />
    );

    const link = screen.getByRole('link', { name: 'this link' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('handles complex text with both citations and markdown', () => {
    const complexText = `
# Heading

This is a paragraph with a [markdown link](https://example.com) and a citation [Source: research.pdf, Chunk: 5].

## Another heading

More text with **bold** and *italic* formatting.
    `;
    
    render(
      <ChatMessageContent
        text={complexText}
        onCitationClick={mockOnCitationClick}
      />
    );

    // Check that markdown is rendered
    expect(screen.getByRole('heading', { level: 1, name: 'Heading' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Another heading' })).toBeInTheDocument();
    
    // Check that the link is rendered
    expect(screen.getByRole('link', { name: 'markdown link' })).toBeInTheDocument();
    
    // Check that the citation is rendered as a button
    const citationButton = screen.getByRole('button', { name: /Source: research\.pdf, Chunk: 5/ });
    expect(citationButton).toBeInTheDocument();
    
    fireEvent.click(citationButton);
    expect(mockOnCitationClick).toHaveBeenCalledWith(5);
  });

  test('handles array text input', () => {
    const arrayText = ['First part ', 'with citation [Source: doc.pdf, Chunk: 0]'];

    render(
      <ChatMessageContent
        text={arrayText}
        onCitationClick={mockOnCitationClick}
      />
    );

    // The array text gets combined, so we check for the combined text
    expect(screen.getByText('First part with citation')).toBeInTheDocument();
    const citationButton = screen.getByRole('button', { name: /Source: doc\.pdf, Chunk: 0/ });
    expect(citationButton).toBeInTheDocument();
  });

  test('handles object text input with text property', () => {
    const objectText = { text: 'Object text with citation [Source: file.pdf, Chunk: 2]' };
    
    render(
      <ChatMessageContent
        text={objectText}
        onCitationClick={mockOnCitationClick}
      />
    );

    expect(screen.getByText('Object text with citation')).toBeInTheDocument();
    const citationButton = screen.getByRole('button', { name: /Source: file\.pdf, Chunk: 2/ });
    expect(citationButton).toBeInTheDocument();
    
    fireEvent.click(citationButton);
    expect(mockOnCitationClick).toHaveBeenCalledWith(2);
  });
});
