import { useState } from 'react';
import { errorMessage, linkSelfAsParent } from '../lib/api';
import { CONSENT_NOTICE_VERSION } from '../lib/consent';
import { useTroop } from '../lib/troop';
import type { Member } from '../lib/types';
import { ConsentNotice } from './ConsentNotice';
import { Notice } from './ui';

/** A leader who is also this Scout's parent links themselves to the Scout and agrees to the parent notice. */
export function LinkAsParent({ scout }: { scout: Member }) {
  const { troopId, troop, isLeader, access } = useTroop();
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const linked = Boolean(access && (access.scoutIds.includes(scout.id) || (scout.guardianIds ?? []).includes(access.memberId)));
  if (!isLeader || scout.kind !== 'scout' || linked) {
    return null;
  }

  async function link() {
    if (!agreed) {
      setError('Tick the box to agree before you link yourself.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await linkSelfAsParent(troopId, scout.id, { consent: true, consentVersion: CONSENT_NOTICE_VERSION });
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Is {scout.displayName} your child?</h2>
      {open ? (
        <>
          <p className="small">
            Link yourself as a parent. You keep your other roles. You agree to the same notice any parent agrees to.
          </p>
          <ConsentNotice troopName={troop?.name ?? 'Your troop'} />
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            I am this Scout's parent or guardian, and I agree.
          </label>
          <Notice kind="error">{error}</Notice>
          <div className="row">
            <button type="button" className="btn small" disabled={busy} onClick={link}>
              {busy ? 'Linking…' : "Link me as this Scout's parent"}
            </button>
            <button type="button" className="btn quiet small" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div>
          <button type="button" className="btn secondary small" onClick={() => setOpen(true)}>
            I'm this Scout's parent
          </button>
        </div>
      )}
    </section>
  );
}
