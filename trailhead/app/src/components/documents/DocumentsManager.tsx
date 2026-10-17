import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { db } from '../../lib/firebase';
import { useQuery } from '../../lib/hooks';
import { groupByCategory, type TroopDocument } from '../../lib/siteDocs';
import { useTroop } from '../../lib/troop';
import { Empty, Loading } from '../ui';
import { DocumentRow } from './DocumentRow';
import { DocumentUpload } from './DocumentUpload';

/** The troop's documents grouped by category. Leaders see every document and can add, change and delete them;
 * other members see the ones shared with members or made public. The query matches the security rules. */
export function DocumentsManager({ troopId }: { troopId: string }) {
  const { isLeader } = useTroop();
  const q = useMemo(() => {
    const all = collection(db, 'troops', troopId, 'documents');
    return isLeader ? all : query(all, where('visibility', 'in', ['members', 'public']));
  }, [troopId, isLeader]);
  const docs = useQuery<TroopDocument>(q, `${troopId}/documents/${isLeader}`);
  const groups = groupByCategory(docs.data);
  return (
    <>
      {isLeader ? <DocumentUpload troopId={troopId} /> : null}
      {docs.loading ? <Loading /> : null}
      {!docs.loading && groups.length === 0 ? (
        <Empty>{isLeader ? 'No documents yet. Add permission slips, gear lists or the troop handbook.' : 'No documents have been shared yet.'}</Empty>
      ) : null}
      {groups.map(([label, list]) => (
        <section key={label} className="stack" aria-label={label}>
          <h3>{label}</h3>
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {list.map((d) => (
              <DocumentRow key={d.id} d={d} troopId={troopId} manage={isLeader} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
