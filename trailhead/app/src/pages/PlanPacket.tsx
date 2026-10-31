import { doc } from 'firebase/firestore';
import { type ReactNode, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { OWNER_LABELS } from '../components/plans/MilestoneForm';
import { Empty, formatDate, Loading, PageHeader } from '../components/ui';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/hooks';
import { usePlan, usePlanAccess } from '../lib/planAccess';
import { money, minutesText, namesOf, segmentOf } from '../lib/planForms';
import { ADVISORY, type PlanPrivate, sortMilestones } from '../lib/plans';
import { useTroop } from '../lib/troop';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="print-group stack">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** A printable trip packet for the adults going. Nav and buttons are hidden when printing. */
export function PlanPacket() {
  const { planId = '' } = useParams();
  const { troopId, memberName } = useTroop();
  const { planner } = usePlanAccess();
  const { plan, milestones } = usePlan(planId);
  const privateRef = useMemo(() => (planner ? doc(db, `troops/${troopId}/eventPlans/${planId}/private/adult`) : null), [troopId, planId, planner]);
  const priv = useDoc<PlanPrivate>(privateRef).data;
  if (!planner) {
    return <Empty>The trip packet is for leaders and committee members.</Empty>;
  }
  if (plan.loading) {
    return <Loading />;
  }
  const p = plan.data;
  if (!p) {
    return <Empty>That plan was not found.</Empty>;
  }
  const seg = segmentOf(p);
  const st = p.staffing;
  const days = seg.endDate ? `${formatDate(seg.start)} to ${formatDate(seg.endDate)}` : formatDate(seg.start);
  const times = seg.startTime ? ` · ${seg.startTime}${seg.endTime ? ` to ${seg.endTime}` : ''}` : '';
  return (
    <div className="packet stack">
      <PageHeader eyebrow="Trip packet" title={p.title}>
        <Link className="btn secondary small no-print" to={`/t/${troopId}/events/plans/${p.id}`}>
          Back to the plan
        </Link>
        <button className="btn small no-print" type="button" onClick={() => window.print()}>
          Print
        </button>
      </PageHeader>
      <Block title="When and where">
        <p>
          {days}
          {times}
        </p>
        <p>{seg.place || 'Place not set'}</p>
        <p className="small">
          Fee per Scout: {money(seg.feeCents)} · {seg.logValues.nights} nights · {seg.logValues.miles} miles · Longest drive: {minutesText(st?.driveMinutes)}
        </p>
        {p.tripLeadMemberId ? <p>Trip lead: {memberName(p.tripLeadMemberId)}</p> : null}
      </Block>
      <Block title="Adults and drivers">
        <p>Adults: {st?.adultMemberIds?.length ? namesOf(st.adultMemberIds, memberName) : 'None chosen yet'}</p>
        {st?.adultsFromSignups ? <p className="small">More adults will come from sign-ups.</p> : null}
        <ul className="small">
          {(st?.drivers ?? []).map((d) => (
            <li key={d.memberId}>
              {memberName(d.memberId)}: {d.seats} seats
            </li>
          ))}
        </ul>
        {priv?.helpers?.length ? <p>Helpers who are not in the troop: {priv.helpers.join(', ')}</p> : null}
      </Block>
      <Block title="Milestones">
        <ul className="small">
          {sortMilestones(milestones).map((m) => (
            <li key={m.id}>
              {m.done ? '[done] ' : '[ ] '}
              {m.title} · {m.dueOn ? formatDate(m.dueOn) : 'no date'}
              {m.ownerRole ? ` · ${OWNER_LABELS[m.ownerRole]}` : ''}
            </li>
          ))}
        </ul>
      </Block>
      {p.familyNotes ? (
        <Block title="Notes for families">
          <p style={{ whiteSpace: 'pre-wrap' }}>{p.familyNotes}</p>
        </Block>
      ) : null}
      {p.packingList ? (
        <Block title="Packing list">
          <p style={{ whiteSpace: 'pre-wrap' }}>{p.packingList}</p>
        </Block>
      ) : null}
      <Block title="Contacts and confirmations (adults only)">
        <p style={{ whiteSpace: 'pre-wrap' }}>{priv?.contacts || 'None recorded'}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>Confirmation numbers: {priv?.confirmations || 'None recorded'}</p>
        {priv?.notes ? <p style={{ whiteSpace: 'pre-wrap' }}>{priv.notes}</p> : null}
      </Block>
      <p className="muted small">{ADVISORY}</p>
    </div>
  );
}
