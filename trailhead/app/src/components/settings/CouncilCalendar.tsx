import { doc } from 'firebase/firestore';
import { type FormEvent, useMemo, useState } from 'react';
import { councilKey, setCouncilCalendar } from '../../lib/councilEvents';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/hooks';
import { safeLink } from '../../lib/plans';
import { useTroop } from '../../lib/troop';
import { useAction } from '../plans/useAction';
import { Field, Notice } from '../ui';

interface SharedFeed {
  url: string;
  council: string;
}

/** The council's calendar feed: pasted once by a leader in any troop of the council, then offered to the others. */
export function CouncilCalendar() {
  const { troopId, troop } = useTroop();
  const saved = troop?.councilCalendar;
  const key = councilKey(troop?.council);
  const ref = useMemo(() => (key ? doc(db, `councilFeeds/${key}`) : null), [key]);
  const shared = useDoc<SharedFeed>(ref).data;
  const [url, setUrl] = useState('');
  const act = useAction();

  async function save(link: string) {
    await act.run(async () => {
      const out = await setCouncilCalendar(troopId, link);
      setUrl('');
      return out;
    }, link ? 'Saved. Council events now show on the year at a glance.' : 'Removed.');
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void save(url.trim());
  }

  if (!key) {
    return <p className="muted">Add your council's name in Troop details first.</p>;
  }
  const offer = !saved && shared?.url ? shared.url : null;
  return (
    <div className="stack">
      <p className="muted small">
        Paste the link from your council calendar's Subscribe or iCal button. Council events show beside your own on
        the year at a glance, read-only. Other troops in your council are offered the same link.
      </p>
      {saved ? (
        <p className="small">
          Using{' '}
          {safeLink(saved.url) ? (
            <a href={safeLink(saved.url) as string} target="_blank" rel="noopener noreferrer">
              your council's calendar
            </a>
          ) : (
            "your council's calendar"
          )}
          .{' '}
          <button className="btn secondary small" type="button" disabled={act.busy} onClick={() => save('')}>
            Stop using it
          </button>
        </p>
      ) : null}
      {offer ? (
        <Notice kind="info">
          <span>Another troop in {shared?.council || 'your council'} added your council's calendar. </span>
          <button className="btn secondary small" type="button" disabled={act.busy} onClick={() => save(offer)}>
            Use it
          </button>
        </Notice>
      ) : null}
      <form className="form" onSubmit={submit} noValidate>
        <Field label={saved ? 'Use a different feed link' : 'Council calendar feed link'} htmlFor="cc-url">
          <input id="cc-url" type="url" value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <div>
          <button className="btn" type="submit" disabled={act.busy || !url.trim()}>
            {act.busy ? 'Checking the calendar…' : 'Save'}
          </button>
        </div>
      </form>
      <Notice kind="ok">{act.message}</Notice>
      <Notice kind="error">{act.error}</Notice>
    </div>
  );
}
