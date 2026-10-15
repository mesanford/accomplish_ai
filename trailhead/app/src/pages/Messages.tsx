import { collection, orderBy, query, where } from 'firebase/firestore';
import { type FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GuideBlock } from '../components/GuideBlock';
import { HelpTip } from '../components/HelpTip';
import { NextStep } from '../components/NextStep';
import { Field, Notice, PageHeader } from '../components/ui';
import { errorMessage, sendMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { Thread } from '../lib/types';

function NewMessage() {
  const { troopId, members, access } = useTroop();
  const navigate = useNavigate();
  const [to, setTo] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isScout = access?.roles.includes('scout') ?? false;
  const others = members.filter((m) => m.id !== access?.memberId && (!isScout || m.kind === 'adult')).sort((a, b) => a.displayName.localeCompare(b.displayName));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { threadId } = await sendMessage({ troopId, body, recipientMemberIds: to });
      navigate(`/t/${troopId}/messages/${threadId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, fontSize: 14 }}>To</legend>
        <div className="row">
          {others.map((m) => (
            <label key={m.id} className="check">
              <input
                type="checkbox"
                checked={to.includes(m.id)}
                onChange={() => setTo((ids) => (ids.includes(m.id) ? ids.filter((x) => x !== m.id) : [...ids, m.id]))}
              />
              {m.displayName}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Message" htmlFor="msg-body" hint="When a Scout is included, a parent or a second trained adult is added automatically.">
        <textarea id="msg-body" required value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <p className="small muted">
        Why is a parent copied?
        <HelpTip topic="yptMessages" />
      </p>
      <Notice kind="error">{error}</Notice>
      <div>
        <button className="btn" type="submit" disabled={busy || to.length === 0}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}

export function Messages() {
  const { user } = useAuth();
  const { troopId, memberName } = useTroop();
  const [composing, setComposing] = useState(false);
  const q = useMemo(
    () =>
      user
        ? query(
            collection(db, `troops/${troopId}/threads`),
            where('participantUids', 'array-contains', user.uid),
            orderBy('updatedAt', 'desc'),
          )
        : null,
    [troopId, user],
  );
  const threads = useQuery<Thread>(q, `${troopId}/threads/${user?.uid}`);
  return (
    <>
      <PageHeader eyebrow="Troop" title="Messages">
        <button type="button" className="btn" onClick={() => setComposing((c) => !c)}>
          {composing ? 'Close' : 'New message'}
        </button>
      </PageHeader>
      <GuideBlock
        id="messages"
        purpose="Send messages to other people in your troop. Everyone in a conversation sees every message."
        steps={[
          'Press New message and tick who it is for.',
          'Write your message and press Send.',
          'Replies show up in the same conversation.',
        ]}
      />
      <p className="muted small">
        Scouts can message adult leaders, not other Scouts. A leader can start a group conversation with several Scouts.
      </p>
      {composing ? (
        <section className="card">
          <NewMessage />
        </section>
      ) : null}
      {threads.data.length === 0 ? (
        <NextStep action="Write a message" onClick={() => setComposing(true)}>
          No conversations yet. Start one with the New message button.
        </NextStep>
      ) : (
        <ul className="list">
          {threads.data.map((t) => (
            <li key={t.id}>
              <Link to={`/t/${troopId}/messages/${t.id}`} className="stack" style={{ gap: 2, textDecoration: 'none', color: 'inherit' }}>
                <strong>{t.memberIds.map(memberName).join(', ')}</strong>
                <span className="muted small">{t.lastMessage}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
