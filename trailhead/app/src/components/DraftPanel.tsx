import { useState } from 'react';
import { draftPath, errorMessage, type DraftResult } from '../lib/api';
import { awardName } from '../lib/catalog';
import { draftItems, MAX_REQUEST_CHARS } from '../lib/draft';
import type { PathItemDoc } from '../lib/types';
import { FeasibilityView } from './PathSummary';
import { Field, formatDate, Notice } from './ui';

interface Props {
  troopId: string;
  scoutId: string;
  goal: string;
  target: string;
  /** `replace` swaps the whole plan (and its goal and target); otherwise the badges are added. */
  onUse: (draft: { goal: string; target: string; items: PathItemDoc[] }, replace: boolean) => void;
}

interface Drafted {
  result: DraftResult;
  goal: string;
  target: string;
}

export function DraftPanel({ troopId, scoutId, goal, target, onUse }: Props) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drafted, setDrafted] = useState<Drafted | null>(null);

  async function draft() {
    setBusy(true);
    setError('');
    setDrafted(null);
    try {
      const result = await draftPath({
        troopId,
        scoutId,
        goalAwardId: goal,
        targetDate: target || undefined,
        request,
      });
      setDrafted({ result, goal, target });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function use(replace: boolean) {
    if (drafted) {
      onUse({ goal: drafted.goal, target: drafted.target, items: draftItems(drafted.result) }, replace);
      setDrafted(null);
      setRequest('');
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
          Draft with AI
        </button>
      </div>
    );
  }
  return (
    <section className="card" aria-label="Draft with AI">
      <h2>Draft a plan for me</h2>
      <Field label="What do you want to work toward?" htmlFor="draft-request" hint={`Up to ${MAX_REQUEST_CHARS} characters.`}>
        <textarea
          id="draft-request"
          value={request}
          maxLength={MAX_REQUEST_CHARS}
          placeholder="Get me to Life by spring. I want water badges at summer camp and no hiking in winter."
          onChange={(e) => setRequest(e.target.value)}
        />
      </Field>
      <div className="row">
        <button type="button" className="btn" disabled={busy || !request.trim()} onClick={draft}>
          {busy ? 'Drafting…' : 'Draft a plan'}
        </button>
        <button type="button" className="btn quiet" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <Notice kind="error">{error}</Notice>
      {drafted ? <DraftPreview drafted={drafted} onUse={use} onDiscard={() => setDrafted(null)} /> : null}
      <p className="muted small">
        AI drafts are checked against the advancement rules, but review them with a leader before relying on them.
      </p>
    </section>
  );
}

interface PreviewProps {
  drafted: Drafted;
  onUse: (replace: boolean) => void;
  onDiscard: () => void;
}

function DraftPreview({ drafted, onUse, onDiscard }: PreviewProps) {
  const { result } = drafted;
  return (
    <div className="stack" aria-live="polite">
      <h3>Your draft</h3>
      {result.explanation ? <p>{result.explanation}</p> : null}
      {result.repaired ? <p className="muted small">The first try broke a rule, so it was adjusted once.</p> : null}
      {result.items.length === 0 ? (
        <p className="muted">No badges came back. Try describing what you want a little differently.</p>
      ) : (
        <ul>
          {result.items.map((i) => (
            <li key={i.awardId}>
              <strong>{awardName(i.awardId)}</strong>
              {i.plannedStart && i.plannedEnd
                ? `: ${formatDate(i.plannedStart)} to ${formatDate(i.plannedEnd)}`
                : ': no dates'}
            </li>
          ))}
        </ul>
      )}
      <FeasibilityView result={result.feasibility} />
      <div className="row">
        <button type="button" className="btn" disabled={result.items.length === 0} onClick={() => onUse(true)}>
          Use this plan
        </button>
        <button type="button" className="btn secondary" disabled={result.items.length === 0} onClick={() => onUse(false)}>
          Add to my plan
        </button>
        <button type="button" className="btn quiet" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}
