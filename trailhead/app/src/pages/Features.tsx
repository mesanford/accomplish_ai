import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FEATURE_CATEGORIES, type FeatureCategory } from '../components/landing/features';
import { LandingFooter } from '../components/landing/Sections';
import { SiteBar } from '../components/landing/SiteBar';
import { PRIVACY_EMAIL } from '../lib/privacy';
import '../landing.css';

const TITLE = 'Features: Forthright for Scouts BSA troops';
const CANONICAL = 'https://forthrightapp.com/features';

/** Sets the tab title and canonical address while the page is open, and puts them back after. */
function usePageHead() {
  useEffect(() => {
    const before = document.title;
    document.title = TITLE;
    const link = document.createElement('link');
    link.rel = 'canonical';
    link.href = CANONICAL;
    document.head.appendChild(link);
    return () => {
      document.title = before;
      link.remove();
    };
  }, []);
}

function Category({ category }: { category: FeatureCategory }) {
  return (
    <section className="l-section l-cat" id={category.id} aria-labelledby={`${category.id}-title`}>
      <div className="l-wrap l-split">
        <div className="l-cat-head">
          <h2 id={`${category.id}-title`}>{category.name}</h2>
          <p className="l-lede">{category.summary}</p>
        </div>
        <ul className="l-features">
          {category.features.map((f) => (
            <li key={f.title}>
              <h3>
                {f.title}
                {f.soon ? <span className="l-soon">Coming soon</span> : null}
              </h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The public features page at `/features`: every feature, grouped by category. */
export function Features() {
  usePageHead();
  return (
    <div className="landing">
      <header className="l-hero l-features-hero">
        <div className="l-wrap">
          <SiteBar />
          <div className="l-hero-copy">
            <p className="l-label">Features</p>
            <h1>Everything your troop runs, in one place</h1>
            <p className="l-lede">
              Advancement, merit badges, events, money, gear, communication and your public website,
              built around Youth Protection and family privacy.
            </p>
            <nav className="l-jump" aria-label="Feature categories">
              {FEATURE_CATEGORIES.map((c) => (
                <a key={c.id} href={`#${c.id}`}>
                  {c.name}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main>
        {FEATURE_CATEGORIES.map((c) => (
          <Category key={c.id} category={c} />
        ))}
        <section className="l-section l-pilot" aria-labelledby="cta-title">
          <div className="l-wrap l-cta">
            <h2 id="cta-title">Try Forthright with your troop</h2>
            <p className="l-lede">
              Forthright is free during the pilot, then $20 a month or $199 a year for the whole
              troop.
            </p>
            <div className="l-actions">
              <Link className="l-btn" to="/#pilot">
                Ask to join the pilot
              </Link>
              <Link className="l-btn l-btn-outline" to="/signin">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter email={PRIVACY_EMAIL ?? 'privacy@msanford.com'} />
    </div>
  );
}
