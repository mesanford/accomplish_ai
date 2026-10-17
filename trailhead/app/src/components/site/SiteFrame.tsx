import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { bannerShows } from '../../lib/siteCalendar';
import { forthrightUrl, siteBase } from '../../lib/troopDomain';
import { safeUrl, siteColors } from '../../lib/siteTheme';
import type { PublicSite } from '../../lib/types';
import '../../site.css';
import '../../sitePages.css';
import { todayIso } from '../ui';

export function SiteFrame({ site, children }: { site?: PublicSite; children: ReactNode }) {
  const colors = siteColors(site?.theme?.color);
  const style = {
    '--site-fill': colors.fill,
    '--site-ink': colors.ink,
    '--site-text-light': colors.textLight,
    '--site-text-dark': colors.textDark,
  } as CSSProperties;
  return (
    <div className="site" style={style}>
      <a className="site-skip" href="#site-main">
        Skip to content
      </a>
      {children}
      <footer className="site-footer">
        <p>
          Made with <a href={forthrightUrl('/')}>Forthright</a> · <a href={forthrightUrl('/privacy')}>Privacy</a>
        </p>
      </footer>
    </div>
  );
}

interface NavProps {
  site: PublicSite;
  /** The page being shown: undefined on the home page, otherwise "calendar" or a custom page's address. */
  page?: string;
}

export function SiteHeader({ site, page }: NavProps) {
  const logo = safeUrl(site.theme?.logoUrl);
  const home = siteBase(site.slug);
  const anchor = (id: string) => (page ? `${home || '/'}#${id}` : `#${id}`);
  const sections: [string, string, boolean][] = [
    ['about', 'About', Boolean(site.about)],
    ['meetings', 'Meetings', Boolean(site.meeting?.schedule || site.meeting?.place)],
    ['events', 'Events', Boolean(site.events?.length)],
    ['documents', 'Documents', Boolean(site.documents?.length)],
    ['faq', 'FAQ', Boolean(site.faq?.length)],
  ];
  return (
    <header className="site-header">
      <div className="site-wrap site-header-row">
        <Link className="site-id" to={home || '/'}>
          {logo ? <img src={logo} alt="" className="site-logo" /> : null}
          <span className="site-name">
            {site.troopName}
            <span className="site-muted small"> · Unit {site.unitNumber}</span>
          </span>
        </Link>
        <nav aria-label="Site menu" className="site-nav">
          {sections
            .filter(([, , show]) => show)
            .map(([id, label]) => (
              <a key={id} href={anchor(id)}>
                {label}
              </a>
            ))}
          {(site.pages ?? []).map((p) => (
            <Link key={p.id} to={`${home}/${p.slug}`} aria-current={page === p.slug ? 'page' : undefined}>
              {p.title}
            </Link>
          ))}
          {site.calendar?.length ? (
            <Link to={`${home}/calendar`} aria-current={page === 'calendar' ? 'page' : undefined}>
              Calendar
            </Link>
          ) : null}
          {site.recruiting?.open ? <a href={anchor('join')}>Join us</a> : null}
        </nav>
      </div>
    </header>
  );
}

/** The home page banner, shown until its end date has passed. */
export function Announcement({ site }: { site: PublicSite }) {
  if (!bannerShows(site.announcement, todayIso())) {
    return null;
  }
  return (
    <aside className="site-banner" aria-label="Announcement">
      <p className="site-wrap">{site.announcement?.text}</p>
    </aside>
  );
}

export function SiteCover({ site }: { site: PublicSite }) {
  const photo = safeUrl(site.cover?.photoUrl);
  const layout = site.cover?.layout ?? 'band';
  const style: CSSProperties | undefined = photo ? { backgroundImage: `url("${photo}")` } : undefined;
  const text = (
    <>
      <h1>{site.cover?.heading || site.troopName}</h1>
      {site.cover?.tagline ? <p className="site-tagline">{site.cover.tagline}</p> : null}
      {site.recruiting?.open ? (
        <a className="site-btn light" href="#join">
          Join us
        </a>
      ) : null}
    </>
  );
  if (layout === 'split' && photo) {
    return (
      <div className="site-cover split">
        <div className="site-split-text">{text}</div>
        <div className="site-split-photo" style={style} aria-hidden="true" />
      </div>
    );
  }
  const classes = ['site-cover', photo ? 'has-photo' : '', layout === 'centered' ? 'centered' : ''];
  return (
    <div className={classes.filter(Boolean).join(' ')} style={style}>
      <div className="site-wrap site-cover-inner">{text}</div>
    </div>
  );
}
