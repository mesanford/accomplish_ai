import { doc } from 'firebase/firestore';
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { JoinForm } from '../components/site/JoinForm';
import { SiteCover, SiteFrame, SiteHeader } from '../components/site/SiteFrame';
import { About, Contacts, Events, Faq, Gallery, Meeting } from '../components/site/SiteSections';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/hooks';
import { paragraphs } from '../lib/siteTheme';
import type { PublicSite as Site } from '../lib/types';

/** Sets the tab title and search description while the page is open. */
function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title;
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !tag;
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'description';
      document.head.appendChild(tag);
    }
    const previous = tag.content;
    document.title = title;
    tag.content = description;
    return () => {
      document.title = previousTitle;
      if (created) {
        tag.remove();
      } else {
        tag.content = previous;
      }
    };
  }, [title, description]);
}

function describe(site: Site): string {
  const first = paragraphs(site.about)[0] ?? '';
  const base = site.cover?.tagline || first || `Scouts BSA Troop ${site.unitNumber}.`;
  return base.replace(/\s+/g, ' ').slice(0, 160);
}

function Missing() {
  return (
    <main className="site-wrap site-missing" id="site-main">
      <h1>We couldn't find that page</h1>
      <p>The link may be mistyped, or the troop may have taken its page down. Check the address and try again.</p>
    </main>
  );
}

export function PublicSite() {
  const { slug = '' } = useParams();
  const ref = useMemo(() => doc(db, 'publicSites', slug.toLowerCase()), [slug]);
  const { data: site, loading } = useDoc<Site>(ref);
  usePageMeta(
    site ? `${site.troopName} · Scouts BSA Troop ${site.unitNumber}` : 'Troop page not found',
    site ? describe(site) : 'This troop page could not be found.',
  );

  if (loading) {
    return (
      <SiteFrame>
        <p className="site-wrap site-muted" role="status">
          Loading…
        </p>
      </SiteFrame>
    );
  }
  if (!site) {
    return (
      <SiteFrame>
        <Missing />
      </SiteFrame>
    );
  }
  return (
    <SiteFrame site={site}>
      <SiteHeader site={site} />
      <main id="site-main">
        <SiteCover site={site} />
        <div className="site-wrap site-body">
          <About text={site.about} />
          <Meeting meeting={site.meeting} />
          <Events events={site.events} />
          <Gallery photos={site.gallery} />
          <Faq items={site.faq} />
          <Contacts contacts={site.contacts} />
          {site.recruiting?.open ? (
            <JoinForm slug={site.slug || slug} intro={site.recruiting.intro} troopName={site.troopName} />
          ) : null}
        </div>
      </main>
    </SiteFrame>
  );
}
