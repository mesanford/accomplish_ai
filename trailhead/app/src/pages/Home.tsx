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
      <PageHeader eyebrow="Forthright" title="Your troops">
        <Link className="btn" to="/create">
          Create a troop
        </Link>
      </PageHeader>
      {troops.length === 0 ? (
        <Empty>
          You're not in a troop yet. If a leader sent you an invite link, open that link now. If you lead a troop that
          is not here yet, press the button above to create it.
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
