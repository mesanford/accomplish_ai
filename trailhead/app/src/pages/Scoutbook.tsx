import { collection, orderBy, query } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { GuideBlock } from '../components/GuideBlock';
import { HelpTip } from '../components/HelpTip';
import { ScoutbookReportView, reportRange } from '../components/ScoutbookReportView';
import { Empty, Loading, Notice, PageHeader } from '../components/ui';
import { createScoutbookReport, errorMessage } from '../lib/api';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { ScoutbookReport } from '../lib/types';

export function Scoutbook() {
  const { troopId, isLeader } = useTroop();
  const reportsQuery = useMemo(
    () => (isLeader ? query(collection(db, 'troops', troopId, 'exports'), orderBy('until', 'desc')) : null),
    [troopId, isLeader],
  );
  const reports = useQuery<ScoutbookReport>(reportsQuery, `${troopId}/exports/${isLeader}`);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!isLeader) {
    return <Empty>Only leaders can see Scoutbook reports.</Empty>;
  }

  async function create() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await createScoutbookReport(troopId);
      if (result.created && result.reportId) {
        setSelectedId(result.reportId);
      } else {
        setMessage(result.message ?? 'Nothing new to report.');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const selected = reports.data.find((r) => r.id === selectedId) ?? null;
  return (
    <>
      <PageHeader eyebrow="Advancement" title="Scoutbook handoff">
        <button type="button" className="btn no-print" disabled={busy} onClick={create}>
          {busy ? 'Creating…' : 'Create handoff report'}
        </button>
      </PageHeader>
      <GuideBlock
        id="scoutbook"
        title="Why this page exists"
        purpose="Scoutbook is the official place where advancement is recorded. Trailhead cannot send records there for you yet, so this page gives you a list to type in."
        steps={[
          'Press "Create handoff report". It lists what was signed off since your last report.',
          'Open Scoutbook and enter each item, one Scout at a time.',
          'Tick "Entered in Scoutbook" for each Scout so you know what is left.',
        ]}
      />

      <Notice kind="ok">{message}</Notice>
      <Notice kind="error">{error || reports.error}</Notice>
      <section className="stack no-print">
        <h2>
          Past reports
          <HelpTip topic="scoutbookReport" />
        </h2>
        {reports.loading ? <Loading /> : null}
        {!reports.loading && reports.data.length === 0 ? <Empty>No reports yet. Create the first one above.</Empty> : null}
        <ul className="list">
          {reports.data.map((r) => {
            const done = r.enteredScoutIds.length;
            const total = new Set(r.rows.map((row) => row.scoutId)).size;
            return (
              <li key={r.id}>
                <span>
                  <strong>{reportRange(r)}</strong>
                  <span className="muted small">
                    {' '}
                    · {r.rowCount} {r.rowCount === 1 ? 'item' : 'items'} · {done} of {total} Scouts entered
                  </span>
                </span>
                <button type="button" className="btn quiet small" onClick={() => setSelectedId(r.id)}>
                  {r.id === selectedId ? 'Showing' : 'Open'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {selected ? <ScoutbookReportView report={selected} /> : null}
    </>
  );
}
