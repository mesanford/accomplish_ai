import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Hero } from '../components/landing/Hero';
import { PilotSection } from '../components/landing/PilotSection';
import { Faq, LandingFooter, Safety, WhoItHelps } from '../components/landing/Sections';
import { PRIVACY_EMAIL } from '../lib/privacy';
import '../landing.css';
import { useMarketingAnalytics } from '../lib/analytics';

const TITLE = 'Forthright: advancement planning for Scouts BSA troops';

/** The public page: at `/` for signed-out visitors, and at `/pilot` for everyone, opened at the pilot form. */
export function Landing({ section }: { section?: string }) {
  useMarketingAnalytics();
  const { hash, key } = useLocation();
  const target = section ?? hash.slice(1);
  // The router doesn't scroll to anchors itself. `key` changes on every click, so pressing "Join the pilot" again
  // after scrolling away still goes back to the form.
  useEffect(() => {
    if (target) {
      document.getElementById(target)?.scrollIntoView();
    }
  }, [target, key]);
  useEffect(() => {
    const before = document.title;
    document.title = TITLE;
    return () => {
      document.title = before;
    };
  }, []);
  return (
    <div className="landing">
      <Hero />
      <main>
        <WhoItHelps />
        <Safety />
        <PilotSection />
        <Faq />
      </main>
      <LandingFooter email={PRIVACY_EMAIL ?? 'privacy@msanford.com'} />
    </div>
  );
}
