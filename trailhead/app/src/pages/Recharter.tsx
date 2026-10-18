import { collection } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Empty, formatDate, Loading, Notice, PageHeader, todayIso } from '../components/ui';
import { downloadCsv } from '../lib/activityCsv';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { rechartCsv, rechartFileName, type RechartRow, rechartRows } from '../lib/recharter';
import { useTroop } from '../lib/troop';
import type { ScoutRecord } from '../lib/types';
import { YPT_TONE } from '../lib/ypt';
import { TipPill } from '../components/TipPill';
import { yptTip } from '../lib/statusTips';
import { NoAccess } from '../components/NoAccess';
import { HelpTip } from '../components/HelpTip';
import { SPREADSHEET_TIP } from '../lib/moreStatusTips';

function Line({ row }: { row: RechartRow }) {
  const { troopId } = useTroop();
  const facts =
    row.kind === 'scout'
      ? [row.rank, row.birthMonth && row.birthYear ? `Born ${row.birthMonth}/${row.birthYear}` : ''].filter(Boolean).join(' · ')
      : row.roles;
  return (
    <li>
      <span>
        {row.kind === 'scout' ? <Link to={`/t/${troopId}/scouts/${row.id}`}>{row.name}</Link> : row.name}
        <span className="muted small"> · {facts || 'No details'}</span>
      </span>
      {row.yptTone && row.yptTone !== 'notRequired' ? (
        <TipPill tone={YPT_TONE[row.yptTone]} tip={yptTip(row.yptTone)}>
          YPT {row.yptStatus}
          {row.yptExpires ? `: ${formatDate(row.yptExpires)}` : ''}
        </TipPill>
      ) : null}
      {row.problems.map((p) => (
        <span key={p} className="small">
          {p}
        </span>
      ))}
    </li>
  );
}

/** Leaders only: the current roster as the council asks for it at recharter, with problems to fix and a CSV. */
export function Recharter() {
  const { troopId, members, isLeader, loading } = useTroop();
  const recordsQ = useMemo(() => (isLeader ? collection(db, `troops/${troopId}/scoutRecords`) : null), [isLeader, troopId]);
  const records = useQuery<ScoutRecord & { id: string }>(recordsQ, `${troopId}/recharter-records/${isLeader}`);
  const today = todayIso();
  const rows = useMemo(
    () => rechartRows(members, Object.fromEntries(records.data.map((r) => [r.id, r])), today),
    [members, records.data, today],
  );
  if (!isLeader) {
    return <NoAccess message="Only leaders can open the recharter roster." ask="leader" />;
  }
  if (loading || records.loading) {
    return <Loading />;
  }
  const flagged = rows.filter((r) => r.problems.length > 0);
  return (
    <>
      <PageHeader eyebrow="Troop" title="Recharter">
        <HelpTip topic="recharter" />
        <button type="button" className="btn" disabled={rows.length === 0} title={SPREADSHEET_TIP} onClick={() => downloadCsv(rechartFileName(today), rechartCsv(rows))}>
          Download spreadsheet
        </button>
      </PageHeader>
      <p className="muted">
        Everyone on the roster now, with Youth Protection dates for adults and birth month, birth year and rank for Scouts. The
        file is made on your device. Nothing is sent anywhere else.
      </p>
      <Notice kind={flagged.length > 0 ? 'warn' : 'ok'}>
        {flagged.length > 0
          ? `${flagged.length} of ${rows.length} people need a fix before you recharter.`
          : 'No problems found.'}
      </Notice>
      {flagged.length > 0 ? (
        <p className="small muted">
          To fix Youth Protection dates and roles, use Change roles on the Roster. To fix a Scout’s rank, use Record earlier
          ranks on the Scout’s page.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <Empty>No one is on the roster yet.</Empty>
      ) : (
        <ul className="list">
          {[...flagged, ...rows.filter((r) => r.problems.length === 0)].map((r) => (
            <Line key={r.id} row={r} />
          ))}
        </ul>
      )}
    </>
  );
}
