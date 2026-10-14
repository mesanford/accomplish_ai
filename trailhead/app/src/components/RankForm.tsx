import { doc, updateDoc } from 'firebase/firestore';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '../lib/api';
import { RANKS, rank } from '../lib/catalog';
import { db } from '../lib/firebase';
import type { ScoutRecord } from '../lib/types';
import { Field, Notice, todayIso } from './ui';

/** Leaders record a rank earned at a board of review. Rank dates drive the time-in-rank checks. */
export function RankForm({ troopId, scoutId, record }: { troopId: string; scoutId: string; record: ScoutRecord }) {
  const current = rank(record.currentRankId);
  const next = RANKS.find((r) => r.order === (current?.order ?? -1) + 1);
  const [rankId, setRankId] = useState(next?.id ?? record.currentRankId);
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone('');
    const isNewest = (rank(rankId)?.order ?? 0) >= (current?.order ?? 0);
    try {
      await updateDoc(doc(db, 'troops', troopId, 'scoutRecords', scoutId), {
        [`rankDates.${rankId}`]: date,
        ...(isNewest ? { currentRankId: rankId } : {}),
      });
      setDone(`Recorded ${rank(rankId)?.name} on ${date}.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="row">
        <Field label="Rank" htmlFor="rank-id">
          <select id="rank-id" value={rankId} onChange={(e) => setRankId(e.target.value)}>
            {RANKS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date earned" htmlFor="rank-date">
          <input id="rank-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      <div>
        <button className="btn secondary" type="submit">
          Record rank
        </button>
      </div>
    </form>
  );
}
