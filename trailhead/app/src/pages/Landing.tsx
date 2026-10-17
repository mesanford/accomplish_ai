import { useEffect } from 'react';
import { Hero } from '../components/landing/Hero';
import { PilotSection } from '../components/landing/PilotSection';
import { Faq, LandingFooter, Safety, WhoItHelps } from '../components/landing/Sections';
import { PRIVACY_EMAIL } from '../lib/privacy';
import '../landing.css';

const TITLE = 'Forthright: advancement planning for Scouts BSA troops';

/** The public page at `/` for signed-out visitors. */
export function Landing() {
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
