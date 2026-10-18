import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import lockupDark from '../assets/forthright-lockup-dark.svg';
import lockup from '../assets/forthright-lockup.svg';
import { signOutUser, useAuth } from '../lib/auth';
import { CustomAwardsProvider } from '../lib/customAwardsContext';
import { useNewLeadCount } from '../lib/leads';
import { NAV_TIPS } from '../lib/navTips';
import { TroopProvider, useTroop } from '../lib/troop';
import { useUnreadBadge } from '../lib/useUnreadBadge';
import { ConsentGate } from './ConsentGate';

function TroopNav() {
  const { troopId, troop, has, isLeader, canManageBadges } = useTroop();
  const newLeads = useNewLeadCount();
  useUnreadBadge(); // the installed app's icon shows the unread announcements
  const base = `/t/${troopId}`;
  const links: [string, string, boolean][] = [
    [base, 'Home', true],
    [`${base}/roster`, 'Roster', isLeader],
    [`${base}/patrols`, 'Patrols', isLeader],
    [`${base}/blue-cards`, 'Blue cards', isLeader],
    [`${base}/scoutbook`, 'Scoutbook', isLeader],
    [`${base}/recharter`, 'Recharter', isLeader],
    [`${base}/activity-report`, 'Activity report', isLeader],
    [`${base}/counseling`, 'Merit badge counseling', has('counselor') || canManageBadges],
    [`${base}/events`, 'Events', true],
    [`${base}/badges`, 'Badges', true],
    [`${base}/templates`, 'Path templates', isLeader],
    [`${base}/awards`, 'Troop awards', isLeader],
    [`${base}/recruiting`, newLeads > 0 ? `Recruiting (${newLeads})` : 'Recruiting', isLeader],
    [`${base}/announcements`, 'Announcements', true],
    [`${base}/messages`, 'Messages', true],
    [`${base}/health`, 'Health forms', true],
    [`${base}/documents`, 'Documents', true],
    [`${base}/equipment`, 'Equipment', true],
    [`${base}/website`, 'Website', isLeader],
    [`${base}/accounts`, 'Accounts', has('treasurer', 'scoutmaster', 'advancement')],
    [`${base}/help`, 'Help', true],
  ];
  return (
    <>
      <span className="troop-name">{troop ? `${troop.name} · Unit ${troop.unitNumber}` : ''}</span>
      <nav className="nav" aria-label="Troop">
        {links
          .filter(([, , show]) => show)
          .map(([to, label]) => (
            <NavLink key={to} to={to} end={to === base} title={NAV_TIPS[label]}>
              {label}
            </NavLink>
          ))}
      </nav>
    </>
  );
}

/** A parent a leader linked to Scouts must agree to the parent notice (or decline) before any troop page opens. */
function TroopOutlet() {
  const { access } = useTroop();
  const waiting = access?.consentPendingScoutIds ?? [];
  return waiting.length > 0 ? <ConsentGate scoutIds={waiting} /> : <Outlet />;
}

function Shell({ troopNav, children }: { troopNav: boolean; children?: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/">
            <picture>
              <source srcSet={lockupDark} media="(prefers-color-scheme: dark)" />
              <img src={lockup} alt="Forthright" width={128} height={28} />
            </picture>
          </a>
          {troopNav ? <TroopNav /> : <span className="nav" />}
          {user ? (
            <div className="row" style={{ marginLeft: 'auto' }}>
              <NavLink className="btn quiet small" to="/account">
                Account
              </NavLink>
              <button
                type="button"
                className="btn quiet small"
                onClick={() => signOutUser().then(() => navigate('/'))}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="main">
        {troopNav ? <TroopOutlet /> : (children ?? <Outlet />)}
      </main>
    </>
  );
}

/** The app shell. Routes outside the layout route can pass their page as `children`. */
export function AppLayout({ children }: { children?: ReactNode }) {
  return <Shell troopNav={false}>{children}</Shell>;
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
