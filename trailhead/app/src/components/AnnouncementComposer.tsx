import { collection, orderBy, query } from 'firebase/firestore';
import { type FormEvent, useMemo, useState } from 'react';
import { AudiencePicker, audienceReady } from './AudiencePicker';
import { NewsletterFields } from './NewsletterFields';
import { Field, Notice, todayIso } from './ui';
import { editAnnouncement, errorMessage, postAnnouncement, scheduleAnnouncement } from '../lib/api';
import { defaultSendAt, sendTimeText } from '../lib/scheduledPosts';
import { type Announcement, type AudienceSpec, reachesScouts, YPT_NOTE } from '../lib/announcements';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { TroopEvent } from '../lib/types';

interface Props {
  /** Set to edit a post. The audience and email cannot change then. */
  editing?: Announcement;
  onDone: (message: string) => void;
}

export function AnnouncementComposer({ editing, onDone }: Props) {
  const { troopId, members } = useTroop();
  const [kind, setKind] = useState<'announcement' | 'newsletter'>(editing?.kind ?? 'announcement');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [sections, setSections] = useState(editing?.sections ?? [{ heading: '', text: '' }]);
  const [eventIds, setEventIds] = useState((editing?.events ?? []).map((e) => e.id));
  const [audience, setAudience] = useState<AudienceSpec>({ type: 'troop' });
  const [email, setEmail] = useState(false);
  const [pinned, setPinned] = useState(editing?.pinned ?? false);
  const [later, setLater] = useState(false);
  const [sendAt, setSendAt] = useState(defaultSendAt());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const q = useMemo(() => query(collection(db, `troops/${troopId}/events`), orderBy('start', 'desc')), [troopId]);
  const events = useQuery<TroopEvent>(q, `${troopId}/events`).data;
  const upcoming = events.filter((e) => e.start >= todayIso()).reverse();
  const scouts = members.filter((m) => m.kind === 'scout').sort((a, b) => a.displayName.localeCompare(b.displayName));
  const isNewsletter = kind === 'newsletter';
  const ready =
    title.trim().length > 0 &&
    (editing || audienceReady(audience)) &&
    (isNewsletter ? body.trim() || sections.some((s) => s.heading.trim() || s.text.trim()) || eventIds.length > 0 : body.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) {
      return;
    }
    setBusy(true);
    setError('');
    const content = {
      kind,
      title: title.trim(),
      body: body.trim(),
      sections: isNewsletter ? sections : [],
      eventIds: isNewsletter ? eventIds : [],
      pinned,
    };
    try {
      if (editing) {
        await editAnnouncement(troopId, editing.id, content);
        onDone('Saved. Nobody was emailed again.');
      } else if (later) {
        const when = new Date(sendAt);
        await scheduleAnnouncement({ troopId, ...content, audience, email, sendAt: when.toISOString() });
        onDone(`Scheduled for ${sendTimeText(when)}.`);
      } else {
        const sent = await postAnnouncement({ troopId, ...content, audience, email });
        const note = sent.emailed > 0 ? ` Emailed ${sent.emailed}.` : '';
        const skipped = sent.emailSkipped > 0 ? ` ${sent.emailSkipped} more were left out by the 200 email limit.` : '';
        onDone(`Posted.${note}${skipped}`);
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      {editing ? null : (
        <Field label="Type" htmlFor="ann-kind">
          <select id="ann-kind" value={kind} onChange={(e) => setKind(e.target.value as 'announcement' | 'newsletter')}>
            <option value="announcement">Announcement</option>
            <option value="newsletter">Newsletter</option>
          </select>
        </Field>
      )}
      <Field label="Title" htmlFor="ann-title">
        <input id="ann-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {editing ? null : <AudiencePicker value={audience} onChange={setAudience} scouts={scouts} events={events} />}
      <Field label={isNewsletter ? 'Introduction (optional)' : 'Message'} htmlFor="ann-body">
        <textarea id="ann-body" value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
      </Field>
      {isNewsletter ? (
        <NewsletterFields sections={sections} onSections={setSections} events={upcoming} eventIds={eventIds} onEventIds={setEventIds} />
      ) : null}
      <label className="check">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        Pin to the top
      </label>
      {editing ? null : (
        <label className="check">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          Also email the parents and adults in this audience (Scouts are never emailed)
        </label>
      )}
      {editing ? null : (
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} />
            Send later
          </label>
          {later ? (
            <Field label="Send at (your time)" htmlFor="ann-send-at">
              <input id="ann-send-at" type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} />
            </Field>
          ) : null}
        </div>
      )}
      <p className="small muted">
        {YPT_NOTE}
        {!editing && reachesScouts(audience.type) ? ' This audience includes Scouts.' : ''}
        {editing ? ' Editing does not send another email.' : ' A troop can email 5 announcements a day, to up to 200 people each.'}
      </p>
      <Notice kind="error">{error}</Notice>
      <div className="row">
        <button className="btn" type="submit" disabled={busy || !ready}>
          {busy ? 'Saving…' : editing ? 'Save changes' : later ? 'Schedule' : 'Post'}
        </button>
        <button className="btn quiet" type="button" disabled={busy} onClick={() => onDone('')}>
          Cancel
        </button>
      </div>
    </form>
  );
}
