import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom';
import { AppLayout, TroopLayout } from './components/Layout';
import { Loading } from './components/ui';
import { UpdateBanner } from './components/UpdateBanner';
import { AuthProvider, useAuth } from './lib/auth';
import { Account } from './pages/Account';
import { AccountSettings } from './pages/AccountSettings';
import { Accounts } from './pages/Accounts';
import { AttendancePage } from './pages/Attendance';
import { Badges } from './pages/Badges';
import { BlueCards } from './pages/BlueCards';
import { CampaignPage } from './pages/CampaignPage';
import { Counseling } from './pages/Counseling';
import { CustomAwardPage } from './pages/CustomAwardPage';
import { CustomAwards } from './pages/CustomAwards';
import { CreateTroop } from './pages/CreateTroop';
import { EventPage } from './pages/EventPage';
import { Events } from './pages/Events';
import { FinishSignIn } from './pages/FinishSignIn';
import { HealthForms } from './pages/HealthForms';
import { HelpPage } from './pages/Help';
import { Home } from './pages/Home';
import { Join } from './pages/Join';
import { Features } from './pages/Features';
import { Landing } from './pages/Landing';
import { Announcements } from './pages/Announcements';
import { Messages } from './pages/Messages';
import { NotFound, RouteError } from './pages/NotFound';
import { PathEditor } from './pages/PathEditor';
import { Patrols } from './pages/Patrols';
import { PathTemplates } from './pages/PathTemplates';
import { PostCharge } from './pages/PostCharge';
import { PublicSite } from './pages/PublicSite';
import { PaperCard } from './pages/PaperCard';
import { Payments } from './pages/Payments';
import { PriorAdvancement } from './pages/PriorAdvancement';
import { PrivacyPage } from './pages/Privacy';
import { Recharter } from './pages/Recharter';
import { Recruiting } from './pages/Recruiting';
import { RecordPayment } from './pages/RecordPayment';
import { Roster } from './pages/Roster';
import { ScoutPage } from './pages/ScoutPage';
import { Scoutbook } from './pages/Scoutbook';
import { ScoutStatement } from './pages/ScoutStatement';
import { SignIn } from './pages/SignIn';
import { ThreadPage } from './pages/ThreadPage';
import { TroopReportPage } from './pages/TroopReport';
import { TroopHome } from './pages/TroopHome';
import { Documents } from './pages/Documents';
import { Equipment } from './pages/Equipment';
import { EquipmentItem } from './pages/EquipmentItem';
import { Website } from './pages/Website';

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

/** At "/": signed-in people see their troops in the app; signed-out visitors see the marketing page. */
function Root() {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <AppLayout>
        <Loading />
      </AppLayout>
    );
  }
  return user ? (
    <AppLayout>
      <Home />
    </AppLayout>
  ) : (
    <Landing />
  );
}

const router = createBrowserRouter([
  // Any failure or unknown address shows a plain page, never the router's developer error screen.
  // The public troop website has its own look and needs no sign-in, so it sits outside the app layout.
  { path: '/s/:slug', element: <PublicSite />, errorElement: <RouteError /> },
  { path: '/s/:slug/:page', element: <PublicSite />, errorElement: <RouteError /> },
  // The marketing page is full width, so "/" sits outside the app layout too and wraps Home in it when signed in.
  { path: '/', element: <Root />, errorElement: <RouteError /> },
  { path: '/features', element: <Features />, errorElement: <RouteError /> },
  // The pilot form, for signed-in visitors too ("/" shows them their troops instead of the marketing page).
  { path: '/pilot', element: <Landing section="pilot" />, errorElement: <RouteError /> },
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/signin', element: <SignIn /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/account', element: authed(<Account />) },
      { path: '/signin/finish', element: <FinishSignIn /> },
      { path: '/create', element: authed(<CreateTroop />) },
      { path: '/join/:troopId/:code', element: authed(<Join />) },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/t/:troopId',
    element: authed(<TroopLayout />),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <TroopHome /> },
      { path: 'roster', element: <Roster /> },
      { path: 'patrols', element: <Patrols /> },
      { path: 'activity-report', element: <TroopReportPage /> },
      { path: 'scouts/:scoutId', element: <ScoutPage /> },
      { path: 'scouts/:scoutId/path', element: <PathEditor /> },
      { path: 'scouts/:scoutId/earlier', element: <PriorAdvancement /> },
      { path: 'scouts/:scoutId/paper-card', element: <PaperCard /> },
      { path: 'templates', element: <PathTemplates /> },
      { path: 'badges', element: <Badges /> },
      { path: 'awards', element: <CustomAwards /> },
      { path: 'awards/:awardId', element: <CustomAwardPage /> },
      { path: 'blue-cards', element: <BlueCards /> },
      { path: 'scoutbook', element: <Scoutbook /> },
      { path: 'recharter', element: <Recharter /> },
      { path: 'health', element: <HealthForms /> },
      { path: 'counseling', element: <Counseling /> },
      { path: 'events', element: <Events /> },
      { path: 'events/:eventId', element: <EventPage /> },
      { path: 'events/:eventId/attendance', element: <AttendancePage /> },
      { path: 'recruiting', element: <Recruiting /> },
      { path: 'announcements', element: <Announcements /> },
      { path: 'messages', element: <Messages /> },
      { path: 'messages/:threadId', element: <ThreadPage /> },
      { path: 'documents', element: <Documents /> },
      { path: 'equipment', element: <Equipment /> },
      { path: 'equipment/:itemId', element: <EquipmentItem /> },
      { path: 'website', element: <Website /> },
      { path: 'accounts', element: <Accounts /> },
      { path: 'accounts/charge', element: <PostCharge /> },
      { path: 'accounts/payment', element: <RecordPayment /> },
      { path: 'accounts/settings', element: <AccountSettings /> },
      { path: 'accounts/payments', element: <Payments /> },
      { path: 'accounts/campaigns/:campaignId', element: <CampaignPage /> },
      { path: 'accounts/scouts/:scoutId', element: <ScoutStatement /> },
      { path: 'help', element: <HelpPage /> },
    ],
  },
]);

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <UpdateBanner />
    </AuthProvider>
  );
}
