import React from 'react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight'; // Assuming consistency with page.tsx

interface ChatMessageContentProps {
  text: string | string[] | { text?: string; content?: string } | any;
  // Callback when a citation is clicked.
  // `chunkIndexInSources` is the index within the message's `sources` array.
  onCitationClick: (chunkIndexInSources: number) => void;
  components?: Record<string, React.ComponentType<any>>;
}

// Helper function to normalize different text formats into a single string
const normalizeText = (text: ChatMessageContentProps['text']): string => {
  if (typeof text === 'string') {
    return text;
  }
  
  if (Array.isArray(text)) {
    return text.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        if (typeof item.text === 'string') return item.text;
        if (typeof item.content === 'string') return item.content;
        if (typeof item.value === 'string') return item.value;
        if (typeof item.data === 'string') return item.data;
      }
      return JSON.stringify(item);
    }).join('');
  }
  
  if (text && typeof text === 'object') {
    // Order of preference: .text, .content, .value, .data
    if ('text' in text && typeof text.text === 'string') {
      return text.text;
    }
    if ('content' in text && typeof text.content === 'string') {
      return text.content;
    }
    if ('value' in text && typeof text.value === 'string') {
      return text.value;
    }
    if ('data' in text && typeof text.data === 'string') {
      return text.data;
    }

    // Handle 'parts' array within objects, applying the same logic
    if ('parts' in text && Array.isArray(text.parts)) {
      return text.parts.map((part: any) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          if (typeof part.text === 'string') return part.text;
          if (typeof part.content === 'string') return part.content;
          if (typeof part.value === 'string') return part.value;
          if (typeof part.data === 'string') return part.data;
        }
        return JSON.stringify(part);
      }).join('');
    }
    // Last resort for objects not matching known structures
    return JSON.stringify(text);
  }
  
  // Fallback for null, undefined, boolean, number, etc.
  return String(text == null ? '' : text); // Ensure null/undefined become empty string
};

// Regex to find citations like [Source: annual_report.pdf, Chunk: 0]
// It captures:
// 1. The original file name (e.g., "annual_report.pdf")
// 2. The chunk index (e.g., "0")
const citationRegex = /\[Source: (.*?), Chunk: (\d+)]/g;

const ChatMessageContent: React.FC<ChatMessageContentProps> = ({
  text,
  onCitationClick,
  components: pageComponents = {}, // Renamed to avoid conflict with internal components variable
}) => {
  // Normalize the text into a string format
  const normalizedText = normalizeText(text);

  const customComponents = {
    ...pageComponents, // Spread existing components from props (e.g., for tables, code blocks)
    p: (paragraphProps: any) => {
      // paragraphProps.children contains the direct children of the <p> tag as React nodes.
      // These can be strings, or other React elements (e.g., <a>, <strong> from markdown).
      const { node, ...rest } = paragraphProps; // node is the mdast node, not needed here.
      let keyCounter = 0;
      const finalChildren: React.ReactNode[] = [];

      React.Children.forEach(paragraphProps.children, (reactChild) => {
        if (typeof reactChild === 'string') {
          let lastIndex = 0;
          let match;
          citationRegex.lastIndex = 0; // Reset regex for each string segment

          while ((match = citationRegex.exec(reactChild)) !== null) {
            const [fullMatch, fileName, chunkIndexStr] = match;
            const chunkIndex = parseInt(chunkIndexStr, 10);

            if (match.index > lastIndex) {
              finalChildren.push(reactChild.substring(lastIndex, match.index));
            }
            finalChildren.push(
              <button
                key={`citation-${fileName}-${chunkIndex}-${keyCounter++}`}
                onClick={() => onCitationClick(chunkIndex)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-sm mx-1"
                title={`View source: ${fileName}, referenced content segment ${chunkIndex + 1}`}
              >
                {fullMatch}
              </button>
            );
            lastIndex = citationRegex.lastIndex;
          }
          if (lastIndex < reactChild.length) {
            finalChildren.push(reactChild.substring(lastIndex));
          }
        } else {
          finalChildren.push(reactChild); // Keep other React elements like <a>, <strong> etc.
        }
      });

      return <p {...rest}>{finalChildren}</p>;
    },
    // Potentially add other custom renderers for other text-containing elements if needed.
    // For example, list items (`li`) might also contain text that needs citation processing.
    // li: (listItemProps: any) => { /* similar logic for listItemProps.children */ }
  };

  console.log(`[ChatMessageContent] Rendering with ReactMarkdown, text length: ${normalizedText.length}`);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]} // Consistent with page.tsx
      components={customComponents} // Use the merged components
    >
      {normalizedText}
    </ReactMarkdown>
  );
};

export default ChatMessageContent;