import { MERMAID_CHART_TYPES, MERMAID_KEYWORDS } from "@/utils/mermaidUtils";
import React from "react";
import MermaidDiagram from "./MermaidDiagram";

// Base components for styling that are shared between user and bot messages
export const baseMarkdownComponents = {
  table: ({ children, ...props }: React.PropsWithChildren<React.TableHTMLAttributes<HTMLTableElement>>) => (
    <div className="overflow-x-auto">
      <table className="my-4 w-full border-collapse border border text-sm" {...props}>{children}</table>
    </div>
  ),
  thead: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLTableSectionElement>>) => (
    <thead className="bg-muted" {...props}>{children}</thead>
  ),
  tbody: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLTableSectionElement>>) => (
    <tbody {...props}>{children}</tbody>
  ),
  tr: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLTableRowElement>>) => (
    <tr className="border-b border" {...props}>{children}</tr>
  ),
  th: ({ children, ...props }: React.PropsWithChildren<React.ThHTMLAttributes<HTMLTableCellElement>>) => (
    <th className="border-r border px-4 py-2 text-left font-medium text-muted-foreground last:border-r-0" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: React.PropsWithChildren<React.TdHTMLAttributes<HTMLTableCellElement>>) => (
    <td className="border-r border px-4 py-2 last:border-r-0" {...props}>{children}</td>
  ),
  h1: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
    <h1 className="text-2xl font-bold mt-6 mb-4" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
    <h2 className="text-xl font-bold mt-5 mb-3" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
    <h3 className="text-lg font-semibold mt-4 mb-2" {...props}>{children}</h3>
  ),
  h4: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
    <h4 className="font-semibold mt-3 mb-2" {...props}>{children}</h4>
  ),
  h5: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
    <h5 className="font-semibold mt-3 mb-2" {...props}>{children}</h5>
  ),
  h6: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
    <h6 className="font-semibold mt-3 mb-2" {...props}>{children}</h6>
  ),
  a: ({ children, href, ...props }: React.PropsWithChildren<{ href?: string }>) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline" {...props}>{children}</a>
  ),
  ul: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLUListElement>>) => (
    <ul className="list-disc pl-6 my-3 space-y-1" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLOListElement>>) => (
    <ol className="list-decimal pl-6 my-3 space-y-1" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.PropsWithChildren<React.LiHTMLAttributes<HTMLLIElement>>) => (
    <li {...props}>{children}</li>
  ),
  blockquote: ({ children, ...props }: React.PropsWithChildren<React.BlockquoteHTMLAttributes<HTMLQuoteElement>>) => (
    <blockquote className="border-l-4 border-muted-foreground pl-4 py-1 my-3 italic" {...props}>{children}</blockquote>
  ),
  hr: ({ ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHRElement>>) => (
    <hr className="my-6 border" {...props} />
  ),
  em: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>) => (
    <em {...props}>{children}</em>
  ),
  strong: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>) => (
    <strong className="font-semibold" {...props}>{children}</strong>
  ),
};

// Components for rendering user messages (no special diagram logic)
export const userMarkdownComponents = {
  ...baseMarkdownComponents,
  p: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLParagraphElement>>) => <p {...props}>{children}</p>,
  code: ({ className, children, inline }: React.PropsWithChildren<{ className?: string; inline?: boolean }>) => {
    if (inline) {
      return <code className={`${className || ''} bg-muted px-1.5 py-0.5 rounded text-sm font-mono`}>{children}</code>;
    }
    return (
      <pre className={`${className || ""} bg-muted text-foreground p-3 rounded-md my-4 overflow-x-auto`} style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
        <code className={`${className || ''} bg-transparent p-0 text-sm font-mono`}>{children}</code>
      </pre>
    );
  },
};

// Components for rendering bot messages (with diagram detection)
export const botMarkdownComponents = {
  ...baseMarkdownComponents,
  p: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLParagraphElement>>) => {
    const childrenArray = React.Children.toArray(children);
    // This logic prevents paragraphs from wrapping a lone code block, which helps with styling.
    if (childrenArray.length === 1 && React.isValidElement(childrenArray[0]) && (childrenArray[0].type === 'pre' || (childrenArray[0].type as any).name === 'MermaidDiagram')) {
      return <>{childrenArray[0]}</>;
    }
    if (childrenArray.length === 1 && typeof childrenArray[0] === "string") {
      const text = childrenArray[0];
      const allMermaidKeywords = [
        ...MERMAID_KEYWORDS,
        ...MERMAID_CHART_TYPES,
      ];
      const mermaidRegex = new RegExp(
        `(^|\\s)(${allMermaidKeywords.join("|")})\\s+[\\s\\S]+`,
        "i",
      );
      if (mermaidRegex.test(text)) {
        return <MermaidDiagram chart={text} />;
      }
    }
    return <p {...props}>{children}</p>;
  },
  code: ({ className, children, inline }: React.PropsWithChildren<{ className?: string; inline?: boolean }>) => {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";
    if (inline) {
      return <code className={`${className || ''} bg-muted px-1.5 py-0.5 rounded text-sm font-mono`}>{children}</code>;
    }
    if (MERMAID_KEYWORDS.some((keyword) => language.startsWith(keyword))) {
      const chartContent = String(children).replace(/\n$/, "");
      return (
        <MermaidDiagram
          chart={chartContent}
          id={`mermaid-${btoa(chartContent)
            .replace(/[^a-zA-Z0-9]/g, "")
            .substring(0, 10)}`}
        />
      );
    }
    return (
      <pre className={`${className || ""} bg-muted text-foreground p-3 rounded-md my-4 overflow-x-auto`} style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
        <code className={`${className || ''} bg-transparent p-0 text-sm font-mono`}>{children}</code>
      </pre>
    );
  },
};