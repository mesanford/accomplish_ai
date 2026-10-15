import { Link } from 'react-router-dom';
import { PRIVACY_EMAIL } from '../lib/privacy';

/** The notice a parent reads before agreeing. If its substance changes, bump CONSENT_NOTICE_VERSION in both places. */
export function ConsentNotice({ troopName }: { troopName: string }) {
  return (
    <div className="card stack" aria-label="Notice to parents and guardians">
      <h2>Notice to parents and guardians</h2>
      <p>
        {troopName} uses Trailhead, run by MM Sanford, to track your Scout's advancement. Leaders and you may enter your
        Scout's name, birth month and year, rank, advancement, sign-offs, photos of paper blue cards, attendance and troop
        messages. We use it only to run Trailhead for your troop.
      </p>
      <p>
        Google hosts it, and Anthropic's Claude drafts plans without your Scout's name. Photos of your Scout appear on the
        troop's public website only if you give media consent, which is a separate choice. We do not sell data or use it
        for ads.
      </p>
      <p>
        You can review, correct or delete your Scout's information, or withdraw consent, at any time. Read the{' '}
        <Link to="/privacy">privacy policy</Link>
        {PRIVACY_EMAIL ? (
          <>
            {' '}
            or email <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
