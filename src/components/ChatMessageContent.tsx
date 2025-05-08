import React from 'react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight'; // Assuming consistency with page.tsx

interface ChatMessageContentProps {
  text: string;
  // Callback when a citation is clicked.
  // `chunkIndexInSources` is the index within the message's `sources` array.
  onCitationClick: (chunkIndexInSources: number) => void;
}

// Regex to find citations like [Source: annual_report.pdf, Chunk: 0]
// It captures:
// 1. The original file name (e.g., "annual_report.pdf")
// 2. The chunk index (e.g., "0")
const citationRegex = /\[Source: (.*?), Chunk: (\d+)]/g;

const ChatMessageContent: React.FC<ChatMessageContentProps> = ({
  text,
  onCitationClick,
}) => {
  const parts: JSX.Element[] = [];
  let lastIndex = 0;
  let match;
  let partKey = 0; // For generating unique keys for ReactMarkdown components

  // Reset regex state for global regex
  citationRegex.lastIndex = 0;

  while ((match = citationRegex.exec(text)) !== null) {
    const [fullMatch, fileName, chunkIndexStr] = match;
    const chunkIndex = parseInt(chunkIndexStr, 10);

    // Add text segment before the current citation match, rendered with ReactMarkdown
    if (match.index > lastIndex) {
      const textSegment = text.substring(lastIndex, match.index);
      parts.push(
        <ReactMarkdown
          key={`text-${partKey++}`}
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]} // Consistent with page.tsx
          // Pass only essential components if any are needed for these small segments.
          // Often, code block handling might not be necessary here or could be simplified.
          components={{
            // Example: disable headings if they shouldn't appear in segments
            // h1: 'p', h2: 'p', h3: 'p', h4: 'p', h5: 'p', h6: 'p',
          }}
        >
          {textSegment}
        </ReactMarkdown>
      );
    }

    // Add the clickable citation element
    parts.push(
      <button
        key={`citation-${partKey++}-${fileName}-${chunkIndex}`}
        onClick={() => onCitationClick(chunkIndex)}
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-sm mx-1" // Added margin for spacing
        title={`View source: ${fileName}, referenced content segment ${chunkIndex + 1}`} // chunkIndex is 0-based
      >
        {fullMatch}
      </button>
    );

    lastIndex = citationRegex.lastIndex;
  }

  // Add any remaining text after the last citation, rendered with ReactMarkdown
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    parts.push(
      <ReactMarkdown
        key={`text-${partKey++}`}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
            // Example: disable headings if they shouldn't appear in segments
            // h1: 'p', h2: 'p', h3: 'p', h4: 'p', h5: 'p', h6: 'p',
        }}
      >
        {remainingText}
      </ReactMarkdown>
    );
  }

  // Render the parts. Each part is a ReactMarkdown component or a button.
  // Using a span to allow these to flow inline if used within a larger text block.
  // If block behavior is desired, a <div> could be used.
  return (
    <span className="inline leading-relaxed"> {/* `leading-relaxed` or similar for better line height with mixed content */}
      {parts.map((part) => part)}
    </span>
  );
};

export default ChatMessageContent;