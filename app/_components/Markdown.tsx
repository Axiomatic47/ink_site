// Markdown for the archive prose (italic case names, bold refs, inline code, links).
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Md({ children, inline = false }: { children: string; inline?: boolean }) {
  if (inline) {
    return (
      <span className="[&_p]:inline">
        <ReactMarkdown allowedElements={['p', 'em', 'strong', 'code']} unwrapDisallowed>{children}</ReactMarkdown>
      </span>
    );
  }
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => <a href={href} className="underline text-accent-ink">{children}</a>,
        code: ({ children }) => <code className="font-mono text-[0.9em] bg-well px-1 rounded">{children}</code>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
