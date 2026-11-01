import { doc } from 'firebase/firestore';
import { useMemo } from 'react';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/hooks';
import type { PlanSummary } from '../../lib/plans';

/** What families see about a planned event: notes and the packing list. Shown only once the summary exists. */
export function FamilyPanel({ troopId, planId }: { troopId: string; planId: string }) {
  const ref = useMemo(() => doc(db, `troops/${troopId}/planSummaries/${planId}`), [troopId, planId]);
  const summary = useDoc<PlanSummary>(ref).data;
  if (!summary || (!summary.familyNotes && !summary.packingList)) {
    return null;
  }
  return (
    <section className="card stack" aria-label="For families">
      <h2>For families</h2>
      {summary.familyNotes ? (
        <div>
          <h3>Notes</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{summary.familyNotes}</p>
        </div>
      ) : null}
      {summary.packingList ? (
        <div>
          <h3>Packing list</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{summary.packingList}</p>
        </div>
      ) : null}
    </section>
  );
}
