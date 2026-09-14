// Long-form article text in the site's type: serif body at reading measure,
// navy headings over brass rules, brass links. Used where an article exists as
// text rather than PDF (app/work/[slug]). TeX math ($…$, $$…$$) renders through
// KaTeX; its stylesheet and fonts ship with the site (CSP: self only).
import 'katex/dist/katex.min.css';
import { Md } from './Markdown';

interface Props {
  children: string;
  /** where a book's `cite:` links point (see Md) */
  citeBase?: string;
  /** no card chrome — the caller supplies the card (the review pane) */
  bare?: boolean;
}

export function ArticleBody({ children, citeBase, bare = false }: Props) {
  return (
    <article
      className={[
        bare ? 'px-6 py-6 sm:px-8' : 'rounded-lg border border-rule bg-card shadow-card px-6 py-8 sm:px-10 sm:py-10',
        'font-serif text-[1.05rem] leading-relaxed text-ink/90 max-w-none',
        '[&>*:first-child]:mt-0',
        '[&_h1]:font-serif [&_h1]:text-3xl [&_h1]:leading-tight [&_h1]:mt-10 [&_h1]:mb-4 [&_h1]:text-ink',
        '[&_h2]:font-serif [&_h2]:text-2xl [&_h2]:leading-snug [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-rule [&_h2]:text-ink',
        '[&_h3]:font-serif [&_h3]:text-xl [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-ink',
        '[&_h4]:font-sans [&_h4]:text-xs [&_h4]:uppercase [&_h4]:tracking-[0.12em] [&_h4]:text-accent-ink [&_h4]:mt-6 [&_h4]:mb-2',
        '[&_p]:my-4 [&_ul]:my-4 [&_ol]:my-4 [&_ul]:pl-6 [&_ol]:pl-6 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:my-1.5',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-5 [&_blockquote]:my-6 [&_blockquote]:text-muted [&_blockquote]:italic',
        '[&_hr]:my-10 [&_hr]:border-rule',
        '[&_table]:w-full [&_table]:text-sm [&_table]:my-6 [&_th]:text-left [&_th]:font-sans [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted [&_th]:pb-2 [&_th]:border-b [&_th]:border-rule [&_td]:py-2 [&_td]:pr-4 [&_td]:border-b [&_td]:border-rule [&_td]:align-top',
        '[&_pre]:font-mono [&_pre]:text-sm [&_pre]:bg-well [&_pre]:rounded-md [&_pre]:p-4 [&_pre]:my-6 [&_pre]:overflow-x-auto',
        '[&_strong]:text-ink',
        // footnotes (remark-gfm): a rule above, smaller type, room for the citation links
        '[&_section.footnotes]:mt-12 [&_section.footnotes]:pt-6 [&_section.footnotes]:border-t [&_section.footnotes]:border-rule [&_section.footnotes]:text-[0.92rem] [&_section.footnotes]:leading-relaxed',
        '[&_sup]:text-[0.72em] [&_sup_a]:no-underline [&_sup_a]:text-accent-ink [&_sup_a]:px-0.5',
      ].join(' ')}
    >
      <Md math citeBase={citeBase}>{children}</Md>
    </article>
  );
}
