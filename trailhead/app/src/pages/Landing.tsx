import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Hero } from '../components/landing/Hero';
import { PilotSection } from '../components/landing/PilotSection';
import { Faq, LandingFooter, Safety, WhoItHelps } from '../components/landing/Sections';
import { PRIVACY_EMAIL } from '../lib/privacy';
import '../landing.css';

const TITLE = 'Forthright: advancement planning for Scouts BSA troops';

/** The public page at `/` for signed-out visitors. */
export function Landing() {
  const { hash } = useLocation();
  // Arriving from another page at "/#pilot" lands on the form, since the router doesn't scroll to anchors itself.
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    }
  }, [hash]);
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
