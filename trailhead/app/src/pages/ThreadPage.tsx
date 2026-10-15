import { collection, doc, orderBy, query } from 'firebase/firestore';
import { type FormEvent, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Empty, Notice, PageHeader } from '../components/ui';
import { errorMessage, sendMessage } from '../lib/api';
import { db } from '../lib/firebase';
import { useDoc, useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { Message, Thread } from '../lib/types';

export function ThreadPage() {
  const { threadId = '' } = useParams();
  const { troopId, memberName, access, members } = useTroop();
  const base = `troops/${troopId}/threads/${threadId}`;
  const threadRef = useMemo(() => doc(db, base), [base]);
  const messagesQ = useMemo(() => query(collection(db, `${base}/messages`), orderBy('createdAt', 'asc')), [base]);
  const thread = useDoc<Thread>(threadRef);
  const messages = useQuery<Message>(messagesQ, `${base}/messages`);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function reply(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await sendMessage({ troopId, threadId, body });
      setBody('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Older conversations with only Scouts in them can still be read, but nothing new can be sent.
  const ids = thread.data?.memberIds ?? [];
  const kinds = ids.map((id) => members.find((m) => m.id === id)?.kind);
  const youthOnly = kinds.length > 0 && kinds.includes('scout') && !kinds.includes('adult');

  if (thread.error) {
    return <Empty>This conversation isn't available.</Empty>;
  }
  return (
    <>
      <PageHeader eyebrow="Conversation" title={(thread.data?.memberIds ?? []).map(memberName).join(', ')} />
      <p className="muted small">
        Everyone listed sees every message. Youth Protection rules keep a parent or second adult in any conversation
        with a Scout.
      </p>
      <div className="stack">
        {messages.data.length === 0 ? <Empty>No messages yet.</Empty> : null}
        {messages.data.map((m) => (
          <div key={m.id} className={m.senderMemberId === access?.memberId ? 'bubble mine' : 'bubble'}>
            <div className="small muted">{memberName(m.senderMemberId)}</div>
            <p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p>
          </div>
        ))}
      </div>
      {youthOnly ? (
        <Notice kind="error">
          This conversation has no adult in it, so it is read-only. Scouts can message adult leaders, not other Scouts.
          Ask a leader to start a group conversation.
        </Notice>
      ) : (
        <form className="form" onSubmit={reply} style={{ maxWidth: 'none' }}>
          <textarea aria-label="Reply" required value={body} onChange={(e) => setBody(e.target.value)} />
          <Notice kind="error">{error}</Notice>
          <div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Reply'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
