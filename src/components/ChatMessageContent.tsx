import React from 'react';

import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight'; // Assuming consistency with page.tsx
import remarkGfm from 'remark-gfm';

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

  // Helper function to process a string and replace citations with buttons
  // Uses a local regex instance to avoid global state issues (lastIndex race condition)
  const processStringWithCitations = (
    text: string,
    keyPrefix: string // Added for unique key generation
  ): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const localCitationRegex = /\[Source: (.*?), Chunk: (\d+)]/g; // Local instance
    let lastIndex = 0;
    let match;
    let partKeyCounter = 0; // Counter for keys within this specific string processing

    while ((match = localCitationRegex.exec(text)) !== null) {
      const [fullMatch, fileName, chunkIndexStr] = match;
      const chunkIndex = parseInt(chunkIndexStr, 10);

      // Add text part before the citation
      if (match.index > lastIndex) {
        parts.push(
          <React.Fragment key={`${keyPrefix}-text-${partKeyCounter++}`}>
            {text.substring(lastIndex, match.index)}
          </React.Fragment>
        );
      }
      // Add citation button
      parts.push(
        <button
          key={`${keyPrefix}-citation-${fileName}-${chunkIndex}-${partKeyCounter++}`}
          onClick={() => onCitationClick(chunkIndex)}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-sm mx-1"
          title={`View source: ${fileName}, referenced content segment ${chunkIndex + 1}`}
        >
          {fullMatch}
        </button>
      );
      lastIndex = localCitationRegex.lastIndex;
    }
    // Add remaining text part after the last citation
    if (lastIndex < text.length) {
      parts.push(
        <React.Fragment key={`${keyPrefix}-text-${partKeyCounter++}`}>
          {text.substring(lastIndex)}
        </React.Fragment>
      );
    }
    return parts;
  };

  // Factory for creating element renderers that process citations in their string children
  const createElementRenderer = (ElementComponent: React.ElementType, elementTypePrefix: string) => {
    return (props: any) => {
      const { node, children, ...rest } = props; // `node` is from react-markdown, not always needed here
      const finalChildren: React.ReactNode[] = [];
      let childRenderKeyCounter = 0;

      React.Children.forEach(children, (child) => {
        const key = `${elementTypePrefix}-child-${childRenderKeyCounter++}`;
        if (typeof child === 'string') {
          // Pass a unique key prefix for processing this specific string child
          finalChildren.push(...processStringWithCitations(child, key));
        } else if (React.isValidElement(child)) {
          // Clone element to ensure it has a key if it's part of a list
          // Also, recursively process children of this element if it's a simple wrapper (e.g. <em> or <strong>)
          // For more complex elements, this might need adjustment or they might be passed via pageComponents.
          const childProps = child.props as any; // Type assertion to access props safely
          if (childProps && 'children' in childProps) {
            if (typeof childProps.children === 'string') {
              const grandChildren = processStringWithCitations(childProps.children, `${key}-grandchild`);
              finalChildren.push(React.cloneElement(child, { key }, grandChildren));
            } else if (Array.isArray(childProps.children)) {
              // If children is an array, recursively process them - this is a deeper dive
              const processedGrandchildren: React.ReactNode[] = [];
              React.Children.forEach(childProps.children, (grandChild: any, index: number) => {
                const grandChildKey = `${key}-grandchild-${index}`;
                if (typeof grandChild === 'string') {
                  processedGrandchildren.push(...processStringWithCitations(grandChild, grandChildKey));
                } else if (React.isValidElement(grandChild)) {
                  // This recursive step could be made more robust or limited in depth
                  processedGrandchildren.push(React.cloneElement(grandChild, { key: grandChildKey }));
                } else if (grandChild !== null && grandChild !== undefined) {
                  processedGrandchildren.push(<React.Fragment key={grandChildKey}>{String(grandChild)}</React.Fragment>);
                }
              });
              finalChildren.push(React.cloneElement(child, { key }, ...processedGrandchildren));
            } else {
              // Element has children but they're not processable (neither string nor array)
              // Just clone the element as-is
              finalChildren.push(React.cloneElement(child, { key }));
            }
          } else {
            // Element has no children property, just clone it
            finalChildren.push(React.cloneElement(child, { key }));
          }
        } else if (child !== null && child !== undefined) {
          // Handle other primitive types if necessary (e.g., numbers)
          finalChildren.push(<React.Fragment key={key}>{String(child)}</React.Fragment>);
        }
      });
      return <ElementComponent {...rest}>{finalChildren}</ElementComponent>;
    };
  };

  const customComponents: any = {
    ...pageComponents, // Spread existing components from props
    p: createElementRenderer('p', 'p'),
    li: createElementRenderer('li', 'li'),
    blockquote: createElementRenderer('blockquote', 'bq'),
    h1: createElementRenderer('h1', 'h1'),
    h2: createElementRenderer('h2', 'h2'),
    h3: createElementRenderer('h3', 'h3'),
    h4: createElementRenderer('h4', 'h4'),
    h5: createElementRenderer('h5', 'h5'),
    h6: createElementRenderer('h6', 'h6'),
    // Note: The global `citationRegex` (line 74) is no longer directly used by this rendering logic.
    // `processStringWithCitations` uses its own local regex instance.
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