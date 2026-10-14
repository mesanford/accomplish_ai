import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { type EditDraft, LIMITS, type SiteDraft } from '../../lib/site';
import { draftSiteAbout } from '../../lib/siteApi';
import { Field, Notice } from '../ui';

interface Props {
  troopId: string;
  draft: SiteDraft;
  onChange: EditDraft;
}

/** About us text, with an optional AI first draft written from the leader's notes. */
export function AboutSection({ troopId, draft, onChange }: Props) {
  const [helping, setHelping] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function write() {
    setBusy(true);
    setError('');
    try {
      const { about } = await draftSiteAbout(troopId, notes);
      onChange({ about });
      setHelping(false);
      setNotes('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="row spread">
        <h2>About us</h2>
        {helping ? null : (
          <button type="button" className="btn secondary small" onClick={() => setHelping(true)}>
            Draft with AI
          </button>
        )}
      </div>
      {helping ? (
        <div className="stack" style={{ padding: 12, border: '1px dashed var(--line)', borderRadius: 8 }}>
          <Field
            label="Notes for the AI"
            htmlFor="about-notes"
            hint="A few facts: what you do, how often you camp, what makes your troop special. Don't include Scouts' names."
          >
            <textarea id="about-notes" maxLength={1500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <p className="muted small">The draft replaces the text below. Read it and edit it before you publish.</p>
          <div className="row">
            <button type="button" className="btn small" disabled={busy || !notes.trim()} onClick={write}>
              {busy ? 'Writing…' : 'Write a draft'}
            </button>
            <button type="button" className="btn quiet small" onClick={() => setHelping(false)}>
              Cancel
            </button>
          </div>
          <Notice kind="error">{error}</Notice>
        </div>
      ) : null}
      <Field label="About your troop" htmlFor="site-about" hint="Leave a blank line between paragraphs.">
        <textarea
          id="site-about"
          rows={8}
          maxLength={LIMITS.about}
          value={draft.about}
          onChange={(e) => onChange({ about: e.target.value })}
        />
      </Field>
    </section>
  );
}
