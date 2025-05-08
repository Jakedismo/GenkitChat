import React from "react";
// Import Options type for component prop typing
import ReactMarkdown, { Options as ReactMarkdownOptions } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight"; // Assuming consistency

interface ChatMessageContentProps {
  text: string;
  onCitationClick: (chunkIndexInSources: number) => void;
  // Add components prop to accept renderers from parent
  components?: ReactMarkdownOptions["components"];
}

// Regex to find citations like [Source: annual_report.pdf, Chunk: 0]
const citationRegex = /\[Source: (.*?), Chunk: (\d+)]/g;

const ChatMessageContent: React.FC<ChatMessageContentProps> = ({
  text,
  onCitationClick,
  components, // Receive components prop
}) => {
  const parts: JSX.Element[] = [];
  let lastIndex = 0;
  let match;
  let partKey = 0; // For generating unique keys

  citationRegex.lastIndex = 0; // Reset regex state

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
          rehypePlugins={[rehypeHighlight]}
          components={components} // Pass received components here
        >
          {textSegment}
        </ReactMarkdown>,
      );
    }

    // Add the clickable citation element
    parts.push(
      <button
        key={`citation-${partKey++}-${fileName}-${chunkIndex}`}
        onClick={() => onCitationClick(chunkIndex)}
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-sm mx-1" // Added margin for spacing
        title={`View source: ${fileName}, referenced content segment ${chunkIndex + 1}`}
      >
        {fullMatch}
      </button>,
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
        components={components} // Pass received components here
      >
        {remainingText}
      </ReactMarkdown>,
    );
  }

  // Render the parts. Each part is a ReactMarkdown component or a button.
  return (
    <span className="inline leading-relaxed">
      {" "}
      {/* Use span or div depending on desired flow */}
      {parts.map((part) => part)}
    </span>
  );
};

export default ChatMessageContent;
