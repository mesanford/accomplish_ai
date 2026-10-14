import { Link, Navigate } from 'react-router-dom';
import { Empty, PageHeader } from '../components/ui';
import { useAuth } from '../lib/auth';

/** Lists the person's troops. With exactly one, goes straight to it. */
export function Home() {
  const { profile } = useAuth();
  const troops = Object.entries(profile?.troops ?? {});
  if (troops.length === 1) {
    return <Navigate to={`/t/${troops[0][0]}`} replace />;
  }
  return (
    <>
      <PageHeader eyebrow="Trailhead" title="Your troops">
        <Link className="btn" to="/create">
          Create a troop
        </Link>
      </PageHeader>
      {troops.length === 0 ? (
        <Empty>
          You're not in a troop yet. Open the invite link your leader sent you, or create a troop if you're its
          leader.
        </Empty>
      ) : (
        <div className="grid">
          {troops.map(([id, t]) => (
            <Link key={id} className="card link" to={`/t/${id}`}>
              <h2>{t.name}</h2>
              <p className="muted small">
                Unit {t.unitNumber} · {t.roles.join(', ')}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
