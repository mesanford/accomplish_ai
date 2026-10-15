import type { CSSProperties, ReactNode } from 'react';
import { safeUrl, siteColors } from '../../lib/siteTheme';
import type { PublicSite } from '../../lib/types';
import '../../site.css';

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
          Made with <a href="/">Forthright</a> · <a href="/privacy">Privacy</a>
        </p>
      </footer>
    </div>
  );
}

export function SiteHeader({ site }: { site: PublicSite }) {
  const logo = safeUrl(site.theme?.logoUrl);
  const links: [string, string, boolean][] = [
    ['#about', 'About', Boolean(site.about)],
    ['#meetings', 'Meetings', Boolean(site.meeting?.schedule || site.meeting?.place)],
    ['#events', 'Events', Boolean(site.events?.length)],
    ['#faq', 'FAQ', Boolean(site.faq?.length)],
    ['#join', 'Join us', Boolean(site.recruiting?.open)],
  ];
  return (
    <header className="site-header">
      <div className="site-wrap site-header-row">
        <div className="site-id">
          {logo ? <img src={logo} alt="" className="site-logo" /> : null}
          <span className="site-name">
            {site.troopName}
            <span className="site-muted small"> · Unit {site.unitNumber}</span>
          </span>
        </div>
        <nav aria-label="Page sections" className="site-nav">
          {links
            .filter(([, , show]) => show)
            .map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteCover({ site }: { site: PublicSite }) {
  const photo = safeUrl(site.cover?.photoUrl);
  const style: CSSProperties | undefined = photo ? { backgroundImage: `url("${photo}")` } : undefined;
  return (
    <div className={photo ? 'site-cover has-photo' : 'site-cover'} style={style}>
      <div className="site-wrap site-cover-inner">
        <h1>{site.cover?.heading || site.troopName}</h1>
        {site.cover?.tagline ? <p className="site-tagline">{site.cover.tagline}</p> : null}
        {site.recruiting?.open ? (
          <a className="site-btn light" href="#join">
            Join us
          </a>
        ) : null}
      </div>
    </div>
  );
}
