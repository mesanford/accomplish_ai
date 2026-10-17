import { Link } from 'react-router-dom';
import { PRIVACY_EMAIL } from '../lib/privacy';

/** The notice a parent reads before agreeing. If its substance changes, bump CONSENT_NOTICE_VERSION in both places. */
export function ConsentNotice({ troopName }: { troopName: string }) {
  return (
    <div className="card stack" aria-label="Notice to parents and guardians">
      <h2>Notice to parents and guardians</h2>
      <p>
        {troopName} uses Forthright, run by MM Sanford, to track your Scout's advancement. We need
        your permission to keep your Scout's information in Forthright. If you don't agree, you
        won't be linked to your Scout here; ask your leader how the troop will keep their records
        instead.
      </p>
      <p>
        What we keep: your Scout's name, birth month and year, rank and advancement, sign-offs, blue
        cards and photos of paper blue cards, plans, event sign-ups and attendance, any health or
        emergency note you add to a sign-up, Scout account entries the treasurer records (fundraiser
        credit, charges and payments), and troop messages. If your Scout is 13 or older and signs
        in, also their email address and what they type.
      </p>
      <p>
        Who sees it: everyone in the troop sees the roster (names, roles and family links) and
        events. Only leaders, you, your Scout if 13 or older, and their assigned counselors see
        their records. Only leaders see health notes. Only the treasurer, Scoutmaster, advancement
        chair, you and your Scout if 13 or older see their account. We use it only to run Forthright
        for your troop. We do not sell it or use it for ads.
      </p>
      <p>
        Who helps us: Google hosts Forthright. When someone uses Draft with AI, Anthropic's Claude
        receives your Scout's birth month and year, rank and badges, and the request text, with
        names removed. Photos of your Scout appear on the troop's public website only with media
        consent, which is a separate choice you or the troop's signed media release form make.
      </p>
      <p>
        Your choices: you can see your Scout's information at any time, ask a leader or us to
        correct or delete it, or withdraw this consent from your Scout's page. Read the{' '}
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
