import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom';
import { AppLayout, TroopLayout } from './components/Layout';
import { Loading } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import { AttendancePage } from './pages/Attendance';
import { Badges } from './pages/Badges';
import { BlueCards } from './pages/BlueCards';
import { Counseling } from './pages/Counseling';
import { CustomAwardPage } from './pages/CustomAwardPage';
import { CustomAwards } from './pages/CustomAwards';
import { CreateTroop } from './pages/CreateTroop';
import { Events } from './pages/Events';
import { FinishSignIn } from './pages/FinishSignIn';
import { Home } from './pages/Home';
import { Join } from './pages/Join';
import { Messages } from './pages/Messages';
import { PathEditor } from './pages/PathEditor';
import { Roster } from './pages/Roster';
import { ScoutPage } from './pages/ScoutPage';
import { SignIn } from './pages/SignIn';
import { ThreadPage } from './pages/ThreadPage';
import { TroopHome } from './pages/TroopHome';

/** Sends signed-out visitors to sign in, then back to where they were going (such as an invite link). */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return <Loading />;
  }
  if (!user) {
    return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return children;
}

const authed = (page: ReactNode) => <RequireAuth>{page}</RequireAuth>;

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: authed(<Home />) },
      { path: '/signin', element: <SignIn /> },
      { path: '/signin/finish', element: <FinishSignIn /> },
      { path: '/create', element: authed(<CreateTroop />) },
      { path: '/join/:troopId/:code', element: authed(<Join />) },
    ],
  },
  {
    path: '/t/:troopId',
    element: authed(<TroopLayout />),
    children: [
      { index: true, element: <TroopHome /> },
      { path: 'roster', element: <Roster /> },
      { path: 'scouts/:scoutId', element: <ScoutPage /> },
      { path: 'scouts/:scoutId/path', element: <PathEditor /> },
      { path: 'badges', element: <Badges /> },
      { path: 'awards', element: <CustomAwards /> },
      { path: 'awards/:awardId', element: <CustomAwardPage /> },
      { path: 'blue-cards', element: <BlueCards /> },
      { path: 'counseling', element: <Counseling /> },
      { path: 'events', element: <Events /> },
      { path: 'events/:eventId', element: <AttendancePage /> },
      { path: 'messages', element: <Messages /> },
      { path: 'messages/:threadId', element: <ThreadPage /> },
    ],
  },
]);

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
