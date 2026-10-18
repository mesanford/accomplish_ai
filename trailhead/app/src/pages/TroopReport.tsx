import { collection } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, PageHeader } from '../components/ui';
import { type ActivityEntry, type DateRange, presetRange, type RangePreset, troopReport } from '../lib/activity';
import { downloadCsv, reportCsv, reportFileName } from '../lib/activityCsv';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { usePatrols } from '../lib/patrolHooks';
import { plural } from '../lib/plural';
import { useTroop } from '../lib/troop';
import { NoAccess } from '../components/NoAccess';

type Choice = RangePreset | 'custom';
const CHOICES: [Choice, string][] = [
  ['year', 'This year'],
  ['lastYear', 'Last year'],
  ['all', 'All time'],
  ['custom', 'Choose dates'],
];

/** Totals per Scout and per patrol for a date range, a spreadsheet export and the year's service hours. */
export function TroopReportPage() {
  const { troopId, members, isLeader } = useTroop();
  const patrols = usePatrols().data;
  const q = useMemo(() => (isLeader ? collection(db, `troops/${troopId}/logs`) : null), [isLeader, troopId]);
  const logs = useQuery<ActivityEntry>(q, `${troopId}/logs/all/${isLeader}`);
  const [choice, setChoice] = useState<Choice>('year');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const range: DateRange = choice === 'custom' ? { from: from || undefined, to: to || undefined } : presetRange(choice);
  const names = useMemo(() => Object.fromEntries(patrols.map((p) => [p.id, p.name])), [patrols]);
  const scouts = members.filter((m) => m.kind === 'scout').map((m) => ({ id: m.id, name: m.displayName, patrolId: m.patrolId }));
  const report = troopReport(logs.data, scouts, names, range);
  const year = new Date().getFullYear();
  const thisYear = troopReport(logs.data, scouts, names, presetRange('year'));
  const average = scouts.length ? Math.round((thisYear.total.serviceHours / scouts.length) * 10) / 10 : 0;

  if (!isLeader) {
    return <NoAccess message="Only leaders can see the troop report." ask="leader" />;
  }
  return (
    <>
      <PageHeader eyebrow="Troop" title="Activity report" />
      <section className="card stack" aria-label="Service hours for the year">
        <h2>Service hours in {year}</h2>
        <p>
          <strong>{plural(thisYear.total.serviceHours, 'hour')}</strong> by {plural(thisYear.scoutsServing, 'Scout')}, about {average} per Scout
          on the roster. Councils ask for this in Journey to Excellence.
        </p>
        <p className="muted small">Counts approved service hours for Scouts on the roster. Adult service hours are not tracked here.</p>
      </section>
      <section className="stack">
        <div className="row">
          <Field label="Dates" htmlFor="report-range">
            <select id="report-range" value={choice} onChange={(e) => setChoice(e.target.value as Choice)}>
              {CHOICES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {choice === 'custom' ? (
            <>
              <Field label="From" htmlFor="report-from">
                <input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To" htmlFor="report-to">
                <input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </>
          ) : null}
          <button type="button" className="btn secondary small" onClick={() => downloadCsv(reportFileName(range), reportCsv(report, names))}>
            Download CSV
          </button>
        </div>
        <h2>By patrol</h2>
        <div className="table-box">
          <table aria-label="Totals by patrol">
            <thead>
              <tr>
                <th>Patrol</th>
                <th>Scouts</th>
                <th>Nights</th>
                <th>Service hours</th>
                <th>Miles</th>
              </tr>
            </thead>
            <tbody>
              {report.patrols.map((p) => (
                <tr key={p.patrolId ?? 'none'}>
                  <td>{p.name}</td>
                  <td>{p.scouts}</td>
                  <td>{p.nights}</td>
                  <td>{p.serviceHours}</td>
                  <td>{p.miles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2>By Scout</h2>
        <div className="table-box">
          <table aria-label="Totals by Scout">
            <thead>
              <tr>
                <th>Scout</th>
                <th>Nights</th>
                <th>Service hours</th>
                <th>Miles</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.scoutId}>
                  <td>
                    <Link to={`/t/${troopId}/scouts/${r.scoutId}`}>{r.name}</Link>
                  </td>
                  <td>{r.nights}</td>
                  <td>{r.serviceHours}</td>
                  <td>{r.miles}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Troop total</th>
                <th>{report.total.nights}</th>
                <th>{report.total.serviceHours}</th>
                <th>{report.total.miles}</th>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
