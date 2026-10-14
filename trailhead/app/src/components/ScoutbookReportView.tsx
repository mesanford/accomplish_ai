import { useState } from 'react';
import { errorMessage, setScoutbookEntered } from '../lib/api';
import { downloadCsv, groupByScout, KIND_LABELS, reportToCsv } from '../lib/scoutbook';
import { useTroop } from '../lib/troop';
import type { ScoutbookReport } from '../lib/types';
import { RequirementRef } from './RequirementRef';
import { formatDate, Notice } from './ui';

export function reportRange(report: ScoutbookReport): string {
  const iso = (t: { toDate: () => Date }) => t.toDate().toISOString();
  const until = formatDate(iso(report.until));
  return report.since ? `${formatDate(iso(report.since))} to ${until}` : `Everything through ${until}`;
}

export function ScoutbookReportView({ report }: { report: ScoutbookReport }) {
  const { troopId } = useTroop();
  const [error, setError] = useState('');
  const groups = groupByScout(report.rows);
  const entered = new Set(report.enteredScoutIds);

  async function toggle(scoutId: string, value: boolean) {
    setError('');
    try {
      await setScoutbookEntered({ troopId, reportId: report.id, scoutId, entered: value });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const stamp = report.until.toDate().toISOString().slice(0, 10);
  return (
    <section className="stack">
      <div className="row spread">
        <h2>Report: {reportRange(report)}</h2>
        <div className="row no-print">
          <button type="button" className="btn small" onClick={() => downloadCsv(`scoutbook-${stamp}.csv`, reportToCsv(report.rows))}>
            Download CSV
          </button>
          <button type="button" className="btn quiet small" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>
      <Notice kind="error">{error}</Notice>
      {groups.map((g) => (
        <div key={g.scoutId} className="stack print-group">
          <div className="row spread">
            <h3>{g.scoutName}</h3>
            <label className="row small no-print">
              <input
                type="checkbox"
                checked={entered.has(g.scoutId)}
                onChange={(e) => toggle(g.scoutId, e.target.checked)}
                style={{ width: 'auto' }}
              />
              Entered in Scoutbook
            </label>
          </div>
          <div className="table-box">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Award</th>
                  <th>Requirement</th>
                  <th>Signed by</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={`${r.kind}-${r.awardId}-${r.requirement ?? ''}-${i}`}>
                    <td>{formatDate(r.date)}</td>
                    <td>{KIND_LABELS[r.kind]}</td>
                    <td>{r.awardName}</td>
                    <td>{r.requirement ? <RequirementRef awardId={r.awardId} reqId={r.requirement} /> : null}</td>
                    <td>{r.signedBy ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
