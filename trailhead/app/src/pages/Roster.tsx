import { collection } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AddScoutForm } from '../components/AddScoutForm';
import { AdultRow } from '../components/AdultRow';
import { ConsentReminder } from '../components/ConsentReminder';
import { ConsentRequestPanel } from '../components/ConsentRequestPanel';
import { InviteForm } from '../components/InviteForm';
import { ScoutQuartermaster } from '../components/ScoutQuartermaster';
import { GuideBlock } from '../components/GuideBlock';
import { HealthPills } from '../components/HealthPills';
import { HelpTip } from '../components/HelpTip';
import { NextStep } from '../components/NextStep';
import { ColorSwatch } from '../components/patrols/PatrolCard';
import { Empty, Notice, PageHeader } from '../components/ui';
import { syncConsentHolds } from '../lib/api';
import { rank } from '../lib/catalog';
import { parentLine, pendingLinks } from '../lib/roles';
import { consentSummary } from '../lib/consent';
import { UPDATED_REASON } from '../lib/consentChangelog';
import { blockedKinds, staleByScout } from '../lib/consentReview';
import { db } from '../lib/firebase';
import { useHealthForms } from '../lib/healthHooks';
import { useQuery } from '../lib/hooks';
import { usePatrols } from '../lib/patrolHooks';
import { filterByPatrol, NO_PATROL, officeOf } from '../lib/patrols';
import { useTroop } from '../lib/troop';
import type { Access, ConsentDoc, ConsentRequest, Member, ScoutRecord } from '../lib/types';
import { TipPill } from '../components/TipPill';
import { PAUSED_TIP, REVIEW_TIP } from '../lib/statusTips';
import { NoAccess } from '../components/NoAccess';

export function Roster() {
  const { troopId, members, memberName, isLeader, canManageBadges } = useTroop();
  const [added, setAdded] = useState('');
  const [patrolFilter, setPatrolFilter] = useState('');
  const { forms: healthForms } = useHealthForms();
  const patrols = usePatrols().data;
  const consentsQuery = useMemo(
    () => (isLeader ? collection(db, `troops/${troopId}/consents`) : null),
    [isLeader, troopId],
  );
  const consents = useQuery<ConsentDoc>(consentsQuery, `${troopId}/consents/${isLeader}`);
  const requestsQuery = useMemo(
    () => (isLeader ? collection(db, `troops/${troopId}/consentRequests`) : null),
    [isLeader, troopId],
  );
  const requests = useQuery<ConsentRequest>(
    requestsQuery,
    `${troopId}/consentRequests/${isLeader}`,
  );
  useEffect(() => {
    // Mark Scouts who only a parent can consent for (older Scouts with just a leader's confirmation too).
    if (isLeader) {
      syncConsentHolds(troopId).catch(() => undefined);
    }
  }, [isLeader, troopId]);
  const recordsQuery = useMemo(
    () => (isLeader ? collection(db, `troops/${troopId}/scoutRecords`) : null),
    [isLeader, troopId],
  );
  const records = useQuery<ScoutRecord & { id: string }>(
    recordsQuery,
    `${troopId}/scoutRecords/${isLeader}`,
  );
  const accessQuery = useMemo(
    () => (isLeader ? collection(db, `troops/${troopId}/access`) : null),
    [isLeader, troopId],
  );
  const logins = useQuery<Access>(accessQuery, `${troopId}/access/${isLeader}`);
  // Parents a leader linked who have not yet agreed to the parent notice, and the Scouts they are waiting on.
  const pending = pendingLinks(logins.data);
  const waitingScouts = new Set([...pending.values()].flat());
  const waitingFor = (scoutId: string) =>
    [...pending].filter(([, ids]) => ids.includes(scoutId)).map(([memberId]) => memberId);
  const rankOf = (id: string) =>
    rank(records.data.find((r) => r.id === id)?.currentRankId ?? '')?.name;
  const scouts = members
    .filter((m) => m.kind === 'scout')
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const shownScouts = filterByPatrol(scouts, patrolFilter);
  const patrolOf = (id: string) => patrols.find((p) => p.id === id);
  const adults = members
    .filter((m) => m.kind === 'adult')
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (!isLeader) {
    return <NoAccess message="Only leaders can manage the roster." ask="leader" />;
  }
  const consentOf = (s: Member) =>
    consentSummary(
      consents.data.find((c) => c.id === s.id),
      (s.guardianIds ?? []).length > 0,
      waitingScouts.has(s.id),
    );
  const withdrawn = scouts.filter((s) => consentOf(s).withdrawn);
  // Scouts with a parent whose latest consent is for an older version of the notice.
  const stale = staleByScout(consents.data, members);
  return (
    <>
      <PageHeader eyebrow="Troop" title="Roster" />
      <GuideBlock
        id="roster"
        purpose="The roster is everyone in your troop. Start here when you set up."
        steps={[
          'Add each Scout with the form on this page.',
          'Make an invite link for each parent, counselor or other leader.',
          'Send the link by text or email. They open it and join.',
        ]}
      />
      <section className="stack">
        <h2 className="blazed">
          Scouts ({patrolFilter ? `${shownScouts.length} of ${scouts.length}` : scouts.length})
        </h2>
        {patrols.length > 0 ? (
          <div className="row">
            <label htmlFor="roster-patrol" className="small">
              Show
            </label>
            <select
              id="roster-patrol"
              value={patrolFilter}
              onChange={(e) => setPatrolFilter(e.target.value)}
              style={{ width: 'auto' }}
            >
              <option value="">All patrols</option>
              {patrols.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={NO_PATROL}>No patrol</option>
            </select>
            <Link className="small" to={`/t/${troopId}/patrols`}>
              Manage patrols
            </Link>
          </div>
        ) : (
          <Link className="small" to={`/t/${troopId}/patrols`}>
            Set up patrols
          </Link>
        )}
        {withdrawn.length > 0 ? (
          <Notice kind="warn">
            A parent withdrew consent. Remove these Scouts' records:{' '}
            {withdrawn.map((s, i) => (
              <span key={s.id}>
                {i > 0 ? ', ' : ''}
                <Link to={`/t/${troopId}/scouts/${s.id}`}>{s.displayName}</Link>
              </span>
            ))}
            .
          </Notice>
        ) : null}
        <ConsentReminder stale={stale} scouts={scouts} />
        {scouts.length === 0 ? (
          <NextStep
            action="Go to the form"
            onClick={() => document.getElementById('scout-name')?.focus()}
          >
            No Scouts yet. Add your first Scout with the form below.
          </NextStep>
        ) : shownScouts.length === 0 ? (
          <Empty>No Scouts in this patrol yet.</Empty>
        ) : (
          <ul className="list">
            {shownScouts.map((s) => {
              const consent = consentOf(s);
              if (s.consentHold) {
                // A Scout waiting for a parent shows only a name and the waiting status.
                return (
                  <li key={s.id}>
                    <span>
                      <Link to={`/t/${troopId}/scouts/${s.id}`}>{s.displayName}</Link>
                    </span>
                    <ConsentRequestPanel
                      scout={s}
                      request={requests.data.find((r) => r.id === s.id)}
                    />
                  </li>
                );
              }
              const paused = blockedKinds(consents.data.find((c) => c.id === s.id)).length > 0;
              return (
                <li key={s.id}>
                  <span>
                    <Link to={`/t/${troopId}/scouts/${s.id}`}>{s.displayName}</Link>
                    {rankOf(s.id) ? <span className="muted small"> · {rankOf(s.id)}</span> : null}
                    {patrolOf(s.patrolId ?? '') ? (
                      <span className="muted small">
                        {' · '}
                        <ColorSwatch color={patrolOf(s.patrolId ?? '')?.color} />{' '}
                        {patrolOf(s.patrolId ?? '')?.name}
                        {officeOf(s.id, patrolOf(s.patrolId ?? ''))
                          ? ` (${officeOf(s.id, patrolOf(s.patrolId ?? ''))})`
                          : ''}
                      </span>
                    ) : null}
                  </span>
                  <span className="muted small">
                    {parentLine(s.guardianIds ?? [], waitingFor(s.id), memberName)}
                  </span>
                  <TipPill tone={consent.tone} tip={consent.tip}>
                    {consent.text}
                  </TipPill>
                  <HealthPills form={healthForms.get(s.id)} />
                  {stale.has(s.id) ? (
                    <TipPill tone="warn" tip={paused ? PAUSED_TIP : REVIEW_TIP}>
                      {paused ? UPDATED_REASON : "Parent hasn't reviewed the new notice"}
                    </TipPill>
                  ) : null}
                  <ScoutQuartermaster scout={s} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="stack">
        <h2 className="blazed">
          Adults ({adults.length})
          <HelpTip topic="ypt" />
        </h2>
        <ul className="list">
          {adults.map((a) => (
            <AdultRow
              key={a.id}
              adult={a}
              scouts={scouts}
              pendingScoutIds={pending.get(a.id) ?? []}
              health={healthForms.get(a.id)}
            />
          ))}
        </ul>
      </section>
      <div
        className="grid"
        style={{ alignItems: 'start', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
      >
        <section className="card">
          <h2>Add a Scout</h2>
          <AddScoutForm troopId={troopId} onAdded={setAdded} />
          {/* A Scout waiting for a parent's consent can't have earlier advancement recorded yet. */}
          {added && !members.find((m) => m.id === added)?.consentHold ? (
            <Link className="small" to={`/t/${troopId}/scouts/${added}/earlier`}>
              Record {memberName(added)}'s earlier ranks{canManageBadges ? ' and badges' : ''}
            </Link>
          ) : null}
        </section>
        <section className="card">
          <h2>
            Invite someone
            <HelpTip topic="roles" />
          </h2>
          <InviteForm troopId={troopId} scouts={scouts} records={records.data} />
        </section>
      </div>
    </>
  );
}
