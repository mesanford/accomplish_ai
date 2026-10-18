import { useState } from 'react';
import { errorMessage } from '../lib/api';
import { PHOTO_TIP } from '../lib/moreStatusTips';
import { CONSENT_LABELS, consentState } from '../lib/site';
import { setMediaConsent } from '../lib/siteApi';
import { useTroop } from '../lib/troop';
import type { Member } from '../lib/types';
import { HelpTip } from './HelpTip';
import { TipPill } from './TipPill';
import { formatDate, Notice } from './ui';

/** A parent (or a leader recording a paper form) allows or withdraws photos of a Scout on the public website. */
export function MediaConsent({ scout }: { scout: Member }) {
  const { troopId, parentOf, isLeader, memberName } = useTroop();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const isParent = parentOf(scout.id);
  if (!isParent && !isLeader) {
    return null;
  }
  const state = consentState(scout);
  const [label, tone] = CONSENT_LABELS[state];
  const consent = scout.mediaConsent;
  const first = scout.displayName.split(' ')[0] || 'this Scout';

  async function choose(granted: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const out = await setMediaConsent({ troopId, scoutId: scout.id, granted });
      let text = granted ? 'Saved. Photos of this Scout may now be published.' : 'Saved. Photos of this Scout will not be published.';
      if (out.photosRemoved > 0) {
        text += ` ${out.photosRemoved === 1 ? '1 photo was' : `${out.photosRemoved} photos were`} taken off the website.`;
      }
      setMessage({ kind: 'ok', text });
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="row spread">
        <h2>
          Photos on the troop website
          <HelpTip topic="mediaConsent" />
        </h2>
        <TipPill tone={tone} tip={PHOTO_TIP[state]}>
          {label}
        </TipPill>
      </div>
      <p className="small">
        Allowing this lets troop leaders put photos that show {first} on the troop's public website. {first}'s name is
        never shown on the website. You can change your answer at any time. If you stop allowing it, photos showing{' '}
        {first} come off the website right away.
      </p>
      {consent ? (
        <p className="muted small">
          Recorded by {memberName(consent.byMemberId)}
          {consent.at ? ` on ${formatDate(consent.at.toDate().toISOString())}` : ''}.
        </p>
      ) : null}
      {isLeader && !isParent ? (
        <p className="muted small">As a leader, record the family's answer from their signed media release form.</p>
      ) : null}
      <div className="row">
        <button type="button" className="btn small" disabled={busy || state === 'granted'} onClick={() => choose(true)}>
          Allow photos
        </button>
        <button
          type="button"
          className="btn quiet small"
          disabled={busy || state === 'withdrawn'}
          onClick={() => choose(false)}
        >
          Don't allow photos
        </button>
      </div>
      <Notice kind={message?.kind ?? 'ok'}>{message?.text}</Notice>
    </section>
  );
}
