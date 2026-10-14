import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DraftPanel } from '../components/DraftPanel';
import { PathItems } from '../components/PathItems';
import { FeasibilityView } from '../components/PathSummary';
import { Field, Loading, Notice, PageHeader } from '../components/ui';
import { errorMessage, previewPath } from '../lib/api';
import { RANKS } from '../lib/catalog';
import { addDraftItems } from '../lib/draft';
import { db } from '../lib/firebase';
import { useTroop } from '../lib/troop';
import type { Feasibility, PathDoc, PathItemDoc } from '../lib/types';

export function PathEditor() {
  const { scoutId = '' } = useParams();
  const navigate = useNavigate();
  const { troopId, memberName } = useTroop();
  const [loaded, setLoaded] = useState(false);
  const [goal, setGoal] = useState('eagle');
  const [target, setTarget] = useState('');
  const [items, setItems] = useState<PathItemDoc[]>([]);
  const [preview, setPreview] = useState<Feasibility | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestToken = useRef(0);
  const ref = doc(db, `troops/${troopId}/paths/${scoutId}`);

  useEffect(() => {
    getDoc(ref)
      .then((snap) => {
        const data = snap.data() as PathDoc | undefined;
        if (data) {
          setGoal(data.goalAwardId);
          setTarget(data.targetDate ?? '');
          setItems(data.items ?? []);
        }
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoaded(true));
  }, [troopId, scoutId]);

  // Live check while editing. A token drops answers to older edits that arrive late.
  useEffect(() => {
    if (!loaded) {
      return undefined;
    }
    const token = ++requestToken.current;
    const timer = window.setTimeout(() => {
      previewPath({ troopId, path: { scoutId, goalAwardId: goal, targetDate: target || undefined, items } })
        .then((result) => token === requestToken.current && setPreview(result))
        .catch((err) => token === requestToken.current && setError(errorMessage(err)));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [loaded, troopId, scoutId, goal, target, items]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Merge keeps the server-written feasibility field, which the app may not overwrite.
      const data = { scoutId, goalAwardId: goal, targetDate: target || null, items, updatedAt: serverTimestamp() };
      await setDoc(ref, data, { merge: true });
      navigate(`/t/${troopId}/scouts/${scoutId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!loaded) {
    return <Loading />;
  }
  return (
    <>
      <PageHeader eyebrow={memberName(scoutId)} title="Plan a path" />
      <form className="stack" onSubmit={save}>
        <div className="row">
          <Field label="Goal" htmlFor="goal">
            <select id="goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
              {RANKS.filter((r) => r.order > 0).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target date (optional)" htmlFor="target">
            <input id="target" type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
        </div>
        <DraftPanel
          troopId={troopId}
          scoutId={scoutId}
          goal={goal}
          target={target}
          onUse={(draft, replace) => {
            setGoal(draft.goal);
            setTarget(draft.target);
            setItems((current) => (replace ? draft.items : addDraftItems(current, draft.items)));
          }}
        />
        <PathItems items={items} onChange={setItems} />
        <section className="card">
          <h2>Will this plan work?</h2>
          {preview ? <FeasibilityView result={preview} /> : <p className="muted">Checking…</p>}
        </section>
        <Notice kind="error">{error}</Notice>
        <div className="row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save plan'}
          </button>
          <button type="button" className="btn quiet" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
