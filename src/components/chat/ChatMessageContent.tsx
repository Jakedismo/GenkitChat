import React, { useState, useEffect } from "react";
// Import Options type for component prop typing
import ReactMarkdown, { Options as ReactMarkdownOptions } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface ChatMessageContentProps {
  text: string | string[] | { text?: string; [key: string]: any } | any; // Support various text formats
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
  const [error, setError] = useState<Error | null>(null);
  const [renderedParts, setRenderedParts] = useState<JSX.Element[]>([]);
  
  // Enhanced markdown components with better link handling
  const enhancedComponents = {
    ...components,
    a: ({ node, href, children, ...props }) => {
      // Open links in new tab and add proper security attributes
      return (
        <a 
          href={href} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-blue-600 dark:text-blue-400 hover:underline" 
          {...props}
        >
          {children}
        </a>
      );
    },
  };
  
  useEffect(() => {
    try {
      // Immediately return empty array for empty/null text to avoid "No content" message
      if (!text || (typeof text === 'string' && text.trim() === '')) {
        setRenderedParts([]);
        return;
      }
      
      // Process text to handle any possible format
      let processedText = '';
      
      // Handle different text format types
      if (Array.isArray(text)) {
        // Handle array of chunks (most common case for streaming responses)
        processedText = text.map(chunk => {
          if (typeof chunk === 'string') return chunk;
          if (chunk && typeof chunk === 'object') {
            // Extract text property if available
            return chunk.text || chunk.content || JSON.stringify(chunk);
          }
          return String(chunk || '');
        }).join('');
      } else if (text && typeof text === 'object') {
        // Handle object with text/content property
        if ('text' in text && text.text) {
          processedText = typeof text.text === 'string' ? text.text : String(text.text);
        } else if ('content' in text && text.content) {
          // Handle nested content array
          if (Array.isArray(text.content)) {
            processedText = text.content.map((item: any) => 
              typeof item === 'string' ? item : 
              (item && typeof item === 'object' && item.text) ? item.text : 
              JSON.stringify(item)
            ).join('');
          } else {
            processedText = String(text.content);
          }
        } else if ('message' in text && text.message) {
          // Handle message object structure
          if (typeof text.message === 'string') {
            processedText = text.message;
          } else if (typeof text.message === 'object') {
            if (Array.isArray(text.message.content)) {
              processedText = text.message.content.map((item: any) => 
                typeof item === 'string' ? item : 
                (item && typeof item === 'object' && item.text) ? item.text : 
                JSON.stringify(item)
              ).join('');
            } else {
              processedText = String(text.message);
            }
          } else {
            processedText = JSON.stringify(text);
          }
        } else {
          // If no recognizable properties, stringify the whole object
          processedText = JSON.stringify(text);
        }
      } else if (typeof text === 'string') {
        // Simple string case
        processedText = text;
      } else {
        // Handle primitives
        processedText = String(text || '');
      }
      
      // Fix potential formatting issues before rendering
      processedText = processedText
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
        .replace(/\\+$/, '')
        // Make sure markdown links are properly spaced
        .replace(/\]\(/g, '] (')
        .replace(/\] \((?!http)/g, '](') // Only add space between markdown links if they're not already URLs
        .replace(/\n\*(.*?)\*/g, '\n* $1') // Fix bullet points
        .replace(/\n\*\*(.*?)\*\*/g, '\n* **$1**'); // Fix bold bullet points
        
      const parts: JSX.Element[] = [];
      let lastIndex = 0;
      let match;
      let partKey = 0; // For generating unique keys

      citationRegex.lastIndex = 0; // Reset regex state

      while ((match = citationRegex.exec(processedText)) !== null) {
        const [fullMatch, fileName, chunkIndexStr] = match;
        const chunkIndex = parseInt(chunkIndexStr, 10);

        // Add text segment before the current citation match, rendered with ReactMarkdown
        if (match.index > lastIndex) {
          const textSegment = processedText.substring(lastIndex, match.index);
          parts.push(
            <ReactMarkdown
              key={`text-${partKey++}`}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={enhancedComponents} // Use enhanced components for better link handling
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
      if (lastIndex < processedText.length) {
        const remainingText = processedText.substring(lastIndex);
        parts.push(
          <ReactMarkdown
            key={`text-${partKey++}`}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={enhancedComponents} // Use enhanced components for better link handling
          >
            {remainingText}
          </ReactMarkdown>,
        );
      }
      
      setRenderedParts(parts);
      setError(null);
    } catch (err) {
      console.error("Error rendering markdown content:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [text, onCitationClick, components]);

  // If there was an error rendering, show fallback content
  if (error) {
    return (
      <div className="text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded p-2 my-1">
        <p className="font-semibold">Error rendering content:</p>
        <p>{error.message}</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm">View raw content</summary>
          <pre className="text-xs mt-1 bg-slate-100 dark:bg-slate-900 p-2 rounded overflow-auto max-h-[200px]">
            {typeof text === 'string' ? text : JSON.stringify(text, null, 2)}
          </pre>
        </details>
        {/* Fallback rendering as plain text to ensure content is visible */}
        <div className="mt-3 p-3 border-t border-red-300 dark:border-red-800">
          <p className="text-sm font-medium mb-1">Fallback content:</p>
          <div className="whitespace-pre-wrap text-secondary-foreground">
            {Array.isArray(text) 
              ? text.map((chunk, i) => <span key={i}>{typeof chunk === 'string' ? chunk : JSON.stringify(chunk)}</span>) 
              : typeof text === 'string' 
                ? text 
                : typeof text === 'object' && text !== null
                  ? JSON.stringify(text, null, 2)
                  : String(text || '')}
          </div>
        </div>
      </div>
    );
  }

  // Render the parts. Each part is a ReactMarkdown component or a button.
  // If no parts were rendered, return empty space to avoid showing empty messages
  if (renderedParts.length === 0) {
    return <></>;
  }
  
  return (
    <span className="inline leading-relaxed">
      {/* Use span or div depending on desired flow */}
      {renderedParts.map((part) => part)}
    </span>
  );
};

export default ChatMessageContent;
