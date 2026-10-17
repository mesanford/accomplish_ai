import { doc } from 'firebase/firestore';
import { type FormEvent, useMemo, useState } from 'react';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/hooks';
import type { Access } from '../lib/types';
import { setMyYpt } from '../lib/yptApi';
import { Field, formatDate, Notice, todayIso } from './ui';

function TroopRow({ troopId, name }: { troopId: string; name: string }) {
  const { user } = useAuth();
  const ref = useMemo(() => (user ? doc(db, 'troops', troopId, 'access', user.uid) : null), [user, troopId]);
  const access = useDoc<Access>(ref).data;
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const current = access?.yptExpiresAt?.toDate?.().toISOString().slice(0, 10);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone('');
    if (!date || date < todayIso()) {
      setError('Enter an expiry date that has not passed.');
      return;
    }
    try {
      await setMyYpt(troopId, date);
      setDate('');
      setDone('Saved.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  if (!access) {
    return null;
  }
  return (
    <form className="stack" onSubmit={save} noValidate aria-label={`Youth Protection date for ${name}`}>
      <h3>{name}</h3>
      <p className="small muted">{current ? `Your date on file: ${formatDate(current)}.` : 'No date on file.'}</p>
      <Field label={`Youth Protection expiry date for ${name}`} htmlFor={`ypt-${troopId}`} hint="The expiry date on your certificate at my.scouting.org.">
        <input id={`ypt-${troopId}`} type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      <div>
        <button type="submit" className="btn secondary small">
          Save date for {name}
        </button>
      </div>
    </form>
  );
}

/** On the Account page: an adult enters their own new Youth Protection expiry date for each troop. */
export function MyYpt() {
  const { profile } = useAuth();
  const troops = Object.entries(profile?.troops ?? {}).filter(([, t]) => !t.roles.includes('scout'));
  if (troops.length === 0) {
    return null;
  }
  return (
    <section className="card stack" aria-label="Youth Protection training">
      <h2>Youth Protection training</h2>
      <p className="small muted">After you renew, enter your new expiry date here. Leaders can also change it.</p>
      {troops.map(([id, t]) => (
        <TroopRow key={id} troopId={id} name={t.name} />
      ))}
    </section>
  );
}
