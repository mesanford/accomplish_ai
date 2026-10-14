import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { signOutUser, useAuth } from '../lib/auth';
import { CustomAwardsProvider } from '../lib/customAwardsContext';
import { useNewLeadCount } from '../lib/leads';
import { TroopProvider, useTroop } from '../lib/troop';

function TroopNav() {
  const { troopId, troop, has, isLeader } = useTroop();
  const newLeads = useNewLeadCount();
  const base = `/t/${troopId}`;
  const links: [string, string, boolean][] = [
    [base, 'Home', true],
    [`${base}/roster`, 'Roster', isLeader],
    [`${base}/blue-cards`, 'Blue cards', isLeader],
    [`${base}/scoutbook`, 'Scoutbook', isLeader],
    [`${base}/counseling`, 'Counseling', has('counselor')],
    [`${base}/events`, 'Events', true],
    [`${base}/badges`, 'Badges', true],
    [`${base}/templates`, 'Path templates', isLeader],
    [`${base}/awards`, 'Troop awards', isLeader],
    [`${base}/recruiting`, newLeads > 0 ? `Recruiting (${newLeads})` : 'Recruiting', isLeader],
    [`${base}/messages`, 'Messages', true],
    [`${base}/website`, 'Website', isLeader],
  ];
  return (
    <>
      <span className="troop-name">{troop ? `${troop.name} · Unit ${troop.unitNumber}` : ''}</span>
      <nav className="nav" aria-label="Troop">
        {links
          .filter(([, , show]) => show)
          .map(([to, label]) => (
            <NavLink key={to} to={to} end={to === base}>
              {label}
            </NavLink>
          ))}
      </nav>
    </>
  );
}

function Shell({ troopNav }: { troopNav: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/">
            Trailhead
          </a>
          {troopNav ? <TroopNav /> : <span className="nav" />}
          {user ? (
            <button
              type="button"
              className="btn quiet small"
              onClick={() => signOutUser().then(() => navigate('/'))}
            >
              Sign out
            </button>
          ) : null}
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </>
  );
}

export function AppLayout() {
  return <Shell troopNav={false} />;
}

export function TroopLayout() {
  const { troopId = '' } = useParams();
  return (
    <TroopProvider troopId={troopId}>
      <CustomAwardsProvider>
        <Shell troopNav />
      </CustomAwardsProvider>
    </TroopProvider>
  );
}
