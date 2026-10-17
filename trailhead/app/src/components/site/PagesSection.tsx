import { type EditDraft, type SiteDraft } from '../../lib/site';
import { move, newPage, PAGE_LIMITS } from '../../lib/sitePages';
import { Empty } from '../ui';
import { PageCard } from './PageCard';

interface Props {
  troopId: string;
  draft: SiteDraft;
  onChange: EditDraft;
}

/** Up to 10 extra pages with their own addresses. They appear in the site menu in this order. */
export function PagesSection({ troopId, draft, onChange }: Props) {
  const { pages } = draft;
  const set = (next: SiteDraft['pages']) => onChange({ pages: next });
  return (
    <section className="card">
      <h2>Pages</h2>
      <p className="muted small">
        Add pages such as "High adventure" or "New families". Each one gets its own address and a place in the site
        menu, in the order shown here. Use headings, text, bullet lists, links and images.
      </p>
      {pages.length === 0 ? <Empty>No extra pages yet.</Empty> : null}
      {pages.map((page, i) => (
        <PageCard
          key={page.id}
          troopId={troopId}
          siteSlug={draft.slug}
          page={page}
          all={pages}
          index={i}
          onChange={(next) => set(pages.map((p, k) => (k === i ? next : p)))}
          onMove={(by) => set(move(pages, i, i + by))}
          onRemove={() => set(pages.filter((_, k) => k !== i))}
        />
      ))}
      <div>
        <button
          type="button"
          className="btn secondary small"
          disabled={pages.length >= PAGE_LIMITS.pages}
          onClick={() => set([...pages, newPage(pages)])}
        >
          Add a page
        </button>
        {pages.length >= PAGE_LIMITS.pages ? (
          <span className="muted small"> Your site can have up to {PAGE_LIMITS.pages} extra pages.</span>
        ) : null}
      </div>
    </section>
  );
}
