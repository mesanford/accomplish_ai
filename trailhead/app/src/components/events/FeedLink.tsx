import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { calendarUrls } from '../../lib/eventSignups';
import { type FeedPaths, getCalendarFeed, resetCalendarFeed } from '../../lib/eventsApi';
import { useTroop } from '../../lib/troop';
import { Notice } from '../ui';
import { HelpTip } from '../HelpTip';

/** A private calendar address for Google, Apple and Outlook calendars, with a copy button and a reset. */
export function FeedLink() {
  const { troopId, isLeader } = useTroop();
  const [paths, setPaths] = useState<FeedPaths | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load(task: () => Promise<FeedPaths>, done: string) {
    setError('');
    setMessage('');
    try {
      setPaths(await task());
      setMessage(done);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Copied.');
    } catch {
      setMessage('Select the address and copy it.');
    }
  }
  if (!paths) {
    return (
      <div className="row">
        <button type="button" className="btn secondary small" onClick={() => load(() => getCalendarFeed(troopId), '')}>
          Add to your calendar
        </button>
        <Notice kind="error">{error}</Notice>
      </div>
    );
  }
  const mine = calendarUrls(window.location.origin, paths.path);
  const open = paths.publicPath ? calendarUrls(window.location.origin, paths.publicPath) : null;
  return (
    <section className="card stack" aria-label="Calendar link">
      <h2>
        Your troop calendar
        <HelpTip topic="calendarFeed" />
      </h2>
      <p className="small">
        Copy this address and add it to your calendar once: in Google Calendar choose Other calendars, then From URL; in
        Apple Calendar choose File, then New Calendar Subscription; in Outlook choose Add calendar, then Subscribe from
        web. New events then show up on their own. It lists event names, dates, places and links. It has no names of
        Scouts. Keep it private: anyone with it can see the troop's events.
      </p>
      <input readOnly aria-label="Calendar address" value={mine.https} onFocus={(e) => e.currentTarget.select()} />
      <div className="row">
        <button type="button" className="btn secondary small" onClick={() => copy(mine.https)}>
          Copy link
        </button>
        <a className="btn secondary small" href={mine.webcal}>
          Open in calendar app
        </a>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => load(() => resetCalendarFeed(troopId), 'New link made. The old one no longer works.')}
        >
          Make a new link
        </button>
      </div>
      <p className="small muted">
        Make a new link only if this one was shared by mistake. The old link stops working for everyone using it,
        including you, so add the new one to your calendar again.
      </p>
      {isLeader && open ? (
        <p className="small">
          Public calendar for your website (public events only): <a href={open.webcal}>{open.https}</a>
        </p>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{message}</Notice>
    </section>
  );
}
