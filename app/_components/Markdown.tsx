// Markdown for the archive prose (italic case names, bold refs, inline code, links).
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/** the `cite:<note>/<seq>` href a reviewed book's import writes over each
    citation unit (scripts/import-review-links.mjs) */
export const CITE_SCHEME = 'cite:';
// react-markdown drops hrefs whose scheme it does not know before the `a`
// renderer sees them; `cite:` passes, everything else takes the default guard
const urlTransform = (url: string) => (url.startsWith(CITE_SCHEME) ? url : defaultUrlTransform(url));

interface MdProps {
  children: string;
  inline?: boolean;
  /** render $…$ and $$…$$ with KaTeX (the caller imports katex's stylesheet) */
  math?: boolean;
  /** where a `cite:` link points: the review page's path (the plain reader) or
      '' for the review page itself, where the hash alone selects the cited
      page. The anchor carries data-cite for the review pane's click handler. */
  citeBase?: string;
}

export function Md({ children, inline = false, math = false, citeBase }: MdProps) {
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
      urlTransform={urlTransform}
      components={{
        a: ({ href, children, ...rest }) => {
          if (href?.startsWith(CITE_SCHEME)) {
            const id = href.slice(CITE_SCHEME.length);
            return (
              <a href={`${citeBase ?? ''}#cite=${id}`} data-cite={id} className="cite-link" title="Open the cited page">
                {children}
              </a>
            );
          }
          // footnote refs/backrefs keep their ids and data-* (remark-gfm)
          return <a href={href} {...rest} className="underline text-accent-ink">{children}</a>;
        },
        code: ({ children }) => <code className="font-mono text-[0.9em] bg-well px-1 rounded">{children}</code>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
