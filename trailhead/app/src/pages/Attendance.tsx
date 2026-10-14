import { collection, doc, setDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Empty, formatDate, Notice, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/api';
import { db } from '../lib/firebase';
import { useDoc, useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { TroopEvent } from '../lib/types';

interface Attendance {
  id: string;
  present: boolean;
}

export function AttendancePage() {
  const { eventId = '' } = useParams();
  const { troopId, members, isLeader } = useTroop();
  const base = `troops/${troopId}/events/${eventId}`;
  const eventRef = useMemo(() => doc(db, base), [base]);
  const attendanceQ = useMemo(() => collection(db, `${base}/attendance`), [base]);
  const event = useDoc<TroopEvent>(eventRef);
  const attendance = useQuery<Attendance>(attendanceQ, `${base}/attendance`);
  const [error, setError] = useState('');
  // Show a tick the moment it's clicked, before the write reaches the database.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const saved = new Set(attendance.data.filter((a) => a.present).map((a) => a.id));
  const isPresent = (id: string) => local[id] ?? saved.has(id);
  const scouts = members.filter((m) => m.kind === 'scout').sort((a, b) => a.displayName.localeCompare(b.displayName));

  async function mark(memberId: string, value: boolean) {
    setError('');
    setLocal((l) => ({ ...l, [memberId]: value }));
    try {
      await setDoc(doc(db, `${base}/attendance/${memberId}`), { present: value });
    } catch (err) {
      setLocal((l) => ({ ...l, [memberId]: !value }));
      setError(errorMessage(err));
    }
  }

  if (!isLeader) {
    return <Empty>Only leaders take attendance.</Empty>;
  }
  return (
    <>
      <PageHeader eyebrow={event.data ? formatDate(event.data.start) : 'Event'} title={event.data?.title ?? 'Attendance'} />
      <p className="muted">
        Checking a Scout in logs this event's nights, miles and service hours for them and marks any linked requirement
        ready for sign-off. {scouts.filter((sc) => isPresent(sc.id)).length} of {scouts.length} Scouts present.
      </p>
      <Notice kind="error">{error}</Notice>
      {scouts.length === 0 ? (
        <Empty>No Scouts on the roster yet.</Empty>
      ) : (
        <ul className="list">
          {scouts.map((s) => (
            <li key={s.id}>
              <label className="check">
                <input type="checkbox" checked={isPresent(s.id)} onChange={(e) => mark(s.id, e.target.checked)} />
                {s.displayName}
              </label>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
