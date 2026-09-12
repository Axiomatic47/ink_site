// Markdown for the archive prose (italic case names, bold refs, inline code, links).
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/** `math`: render $…$ and $$…$$ with KaTeX (the caller imports katex's stylesheet). */
export function Md({ children, inline = false, math = false }: { children: string; inline?: boolean; math?: boolean }) {
  if (inline) {
    return (
      <span className="[&_p]:inline">
        <ReactMarkdown allowedElements={['p', 'em', 'strong', 'code']} unwrapDisallowed>{children}</ReactMarkdown>
      </span>
    );
  }
  return (
    <ReactMarkdown
      remarkPlugins={math ? [remarkGfm, remarkMath] : [remarkGfm]}
      rehypePlugins={math ? [rehypeKatex] : []}
      components={{
        a: ({ href, children }) => <a href={href} className="underline text-accent-ink">{children}</a>,
        code: ({ children }) => <code className="font-mono text-[0.9em] bg-well px-1 rounded">{children}</code>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
