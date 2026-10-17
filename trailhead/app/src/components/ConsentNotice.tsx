import { Link } from 'react-router-dom';
import { PRIVACY_EMAIL } from '../lib/privacy';

/** The notice a parent reads before agreeing. If its substance changes, bump CONSENT_NOTICE_VERSION in both places. */
export function ConsentNotice({ troopName }: { troopName: string }) {
  return (
    <div className="card stack" aria-label="Notice to parents and guardians">
      <h2>Notice to parents and guardians</h2>
      <p>
        {troopName} uses Forthright, run by MM Sanford, to track your Scout's advancement. We need
        your permission to keep your Scout's information in Forthright. If your Scout is under 13,
        only a parent or guardian can give this permission, and the troop's leader cannot give it
        for you. Until a parent agrees, the troop keeps only your Scout's name and birth month and
        year in Forthright, and nothing else. If nobody answers within 30 days, we delete your
        Scout's record and the email addresses the troop gave us. If you don't agree, you won't be
        linked to your Scout here; ask your leader how the troop will keep their records instead.
      </p>
      <p>
        What we keep: your Scout's name, birth month and year, rank and advancement, sign-offs, blue
        cards and photos of paper blue cards, plans, patrol, camping nights, service hours and
        hiking miles, gear they borrow, event sign-ups and attendance, any health or emergency note
        you add to a sign-up, the dates of their BSA health form (never medical details), Scout
        account entries the treasurer records (fundraiser credit, charges and payments), and troop
        messages. We also keep the parent and guardian names and email addresses the troop enters so
        we can ask for permission, until a parent answers or for at most 30 days. If your Scout is
        13 or older and signs in, also their email address and what they type.
      </p>
      <p>
        Who sees it: everyone in the troop sees the roster (names, roles and family links) and
        events. Only leaders, you, your Scout if 13 or older, and their assigned counselors see
        their records. Only leaders see health notes; leaders, you and your Scout see health form
        dates. Only the treasurer, Scoutmaster, advancement chair, you and your Scout if 13 or older
        see their account. We use it only to run Forthright for your troop. We do not sell it or use
        it for ads.
      </p>
      <p>
        Who helps us: Google hosts Forthright. When someone uses Draft with AI, Anthropic's Claude
        receives your Scout's birth month and year, rank and badges, and the request text, with
        names removed. Photos of your Scout appear on the troop's public website only with media
        consent, which is a separate choice you or the troop's signed media release form make.
      </p>
      <p>
        Your choices: you can see your Scout's information at any time, ask a leader or us to
        correct or delete it, or withdraw this consent from your Scout's page. When this notice
        changes, we email you, then remind you weekly, up to four times for each version, until you
        agree or withdraw. We send these even if you turned off notification emails. Until you agree
        to a new version, the troop cannot add the new kinds of information it covers; what is
        already kept stays. Read the <Link to="/privacy">privacy policy</Link>
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
