import { useTroop } from '../lib/troop';
import { Empty, Loading } from './ui';

/** Who can give the role that opens the page. Roles are changed on the Roster ("Change roles for …"). */
const NEXT_STEP = {
  leader:
    'If you help run the troop and should see this, ask your Scoutmaster or another leader to give you a leader role. They do it on the Roster page.',
  treasurer:
    'If you look after the troop’s money, ask your Scoutmaster or another leader to give you the treasurer role. They do it on the Roster page.',
} as const;

/**
 * Shown instead of a page this person's roles don't open. It says who the page is for and how to get access, so it
 * isn't a dead end. While their access is still loading they see a loading state, not a refusal.
 */
export function NoAccess({ message, ask }: { message: string; ask: keyof typeof NEXT_STEP }) {
  const { loading } = useTroop();
  if (loading) {
    return <Loading />;
  }
  return (
    <Empty>
      <p>{message}</p>
      <p className="small">{NEXT_STEP[ask]}</p>
    </Empty>
  );
}
