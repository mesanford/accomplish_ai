import { safeHref, type PublicBlock, type Span } from '../../lib/sitePages';
import { safeUrl } from '../../lib/siteTheme';

/** Plain text, with links only for http, https and mailto addresses. Nothing here is ever parsed as HTML. */
export function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, i) => {
        const href = safeHref(span.href);
        if (!href) {
          return <span key={i}>{span.text}</span>;
        }
        const external = href.startsWith('http');
        return (
          <a key={i} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {span.text}
            {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
          </a>
        );
      })}
    </>
  );
}

/** A custom page's content. Headings are level 2 because the page title is the level 1. */
export function PageBlocks({ blocks }: { blocks: PublicBlock[] }) {
  return (
    <div className="site-prose">
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return <h2 key={i}>{block.text}</h2>;
        }
        if (block.type === 'paragraph') {
          return (
            <p key={i} style={{ whiteSpace: 'pre-line' }}>
              <Spans spans={block.inline} />
            </p>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={i}>
              {block.items.map((item, n) => (
                <li key={n}>
                  <Spans spans={item} />
                </li>
              ))}
            </ul>
          );
        }
        const src = safeUrl(block.url);
        return src ? (
          <figure key={i} className="site-figure">
            <img src={src} alt={block.alt || ''} loading="lazy" />
          </figure>
        ) : null;
      })}
    </div>
  );
}
