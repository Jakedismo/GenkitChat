import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatBubbleProps {
  content: string;
  role: 'user' | 'model';
}

/**
 * Renders a single chat bubble with GitHub-flavoured markdown support.
 * Uses remark-gfm for tables, strikethrough, task-lists, etc.
 */
const ChatBubble: React.FC<ChatBubbleProps> = ({ role, content }) => {
  return (
    <div
      className={`chat-bubble rounded-lg px-4 py-3 mb-3 whitespace-pre-wrap prose prose-slate dark:prose-invert max-w-full ${
        role === 'user'
          ? 'self-end bg-blue-600 text-white'
          : 'self-start bg-gray-100 dark:bg-gray-800'
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({href, children, ...props}) {
            return (
              <a href={href} target="_blank" rel="noreferrer" {...props} className="text-blue-600 underline">
                {children}
              </a>
            );
          },
          code({ inline, children, className, ...props }: any) {
            return inline ? (
              <code
                className={
                  'inline-code bg-gray-200 dark:bg-gray-700 rounded px-1 py-0.5' +
                  (className ? ` ${className}` : '')
                }
                {...props}
              >
                {children}
              </code>
            ) : (
              <pre
                className={
                  'code-block overflow-x-auto rounded bg-gray-200 dark:bg-gray-800 p-3 text-sm' +
                  (className ? ` ${className}` : '')
                }
                {...props}
              >
                <code>{children}</code>
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default ChatBubble;
