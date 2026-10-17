import { Link } from 'react-router-dom';
import { CALENDAR_FEED_READY, calendarFeedPath, groupByMonth, monthLabel } from '../../lib/siteCalendar';
import { categoryLabel, fileKind, formatSize } from '../../lib/siteDocs';
import type { PublicSite } from '../../lib/types';
import { safeUrl } from '../../lib/siteTheme';
import { formatDate } from '../ui';
import { PageBlocks } from './PageBlocks';
import { Section } from './SiteSections';

function BackLink({ site }: { site: PublicSite }) {
  return (
    <p>
      <Link to={`/s/${site.slug}`}>Back to {site.troopName}</Link>
    </p>
  );
}

/** One custom page: its title as the level 1 heading, then its blocks. */
export function CustomPage({ site, slug }: { site: PublicSite; slug: string }) {
  const page = site.pages?.find((p) => p.slug === slug);
  if (!page) {
    return null;
  }
  return (
    <div className="site-wrap site-body">
      <BackLink site={site} />
      <article className="site-section">
        <h1 className="site-page-title">{page.title}</h1>
        <PageBlocks blocks={page.blocks} />
      </article>
    </div>
  );
}

/** Upcoming public events by month: title, date and place. */
export function CalendarPage({ site }: { site: PublicSite }) {
  const months = groupByMonth(site.calendar ?? []);
  return (
    <div className="site-wrap site-body">
      <BackLink site={site} />
      <div className="site-section">
        <h1 className="site-page-title">Calendar</h1>
        {CALENDAR_FEED_READY ? (
          <p>
            <a href={calendarFeedPath(site.slug)}>Subscribe in your calendar app</a>
          </p>
        ) : null}
        {months.length === 0 ? <p className="site-muted">No events are listed right now. Check back soon.</p> : null}
      </div>
      {months.map(([key, events]) => (
        <section key={key} className="site-section" aria-labelledby={`month-${key}`}>
          <h2 id={`month-${key}`}>{monthLabel(key)}</h2>
          <ul className="site-events">
            {events.map((e) => (
              <li key={`${e.start}-${e.title}`} className="site-card">
                <span className="site-date">{formatDate(e.start)}</span>
                <span className="site-strong">{e.title}</span>
                {e.place ? <span className="site-muted">{e.place}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The "Documents" section on the home page: public documents grouped by category. */
export function PublicDocuments({ documents }: { documents?: PublicSite['documents'] }) {
  const usable = (documents ?? []).map((d) => ({ ...d, href: safeUrl(d.url) })).filter((d) => d.href);
  if (usable.length === 0) {
    return null;
  }
  return (
    <Section id="documents" title="Documents">
      <ul className="site-docs">
        {usable.map((d) => (
          <li key={d.id} className="site-card">
            <a href={d.href ?? ''} target="_blank" rel="noopener noreferrer" className="site-strong">
              {d.title}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <span className="site-muted small">
              {[categoryLabel(d.category), fileKind(d.contentType), formatSize(d.size)].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
