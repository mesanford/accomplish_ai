import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { db } from '../../lib/firebase';
import { useQuery } from '../../lib/hooks';
import { blueCardAction } from '../../lib/homeCopy';
import { leaderStats } from '../../lib/homeStats';
import { useNewLeadCount } from '../../lib/leads';
import { plural } from '../../lib/plural';
import { sendTimeText, useScheduledPosts } from '../../lib/scheduledPosts';
import { useTroop } from '../../lib/troop';
import type { BlueCard, TroopEvent } from '../../lib/types';

function Tile({ to, value, label, sub }: { to: string; value: number | string; label: string; sub?: string }) {
  return (
    <Link className="card link stack" style={{ gap: 2 }} to={to}>
      <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{value}</span>
      <strong>{label}</strong>
      {sub ? <span className="muted small">{sub}</span> : null}
    </Link>
  );
}

/** A leader's view of what is active: events, scheduled posts, paths, blue cards, permission slips, new families. */
export function LeaderStats({ events, today }: { events: TroopEvent[]; today: string }) {
  const { troopId, members, canManageBadges, isLeader } = useTroop();
  const base = `/t/${troopId}`;
  const cardsQ = useMemo(
    () => query(collection(db, 'troops', troopId, 'blueCards'), where('status', 'in', ['requested', 'approved'])),
    [troopId],
  );
  const cards = useQuery<BlueCard>(cardsQ, `${troopId}/pending-cards`);
  const pathsQ = useMemo(() => collection(db, `troops/${troopId}/paths`), [troopId]);
  const paths = useQuery<{ id: string }>(pathsQ, `${troopId}/home-paths`);
  const { user } = useAuth();
  const { posts } = useScheduledPosts(troopId, user?.uid, isLeader, true);
  const leads = useNewLeadCount();
  const scoutIds = members.filter((m) => m.kind === 'scout').map((m) => m.id);
  const stats = leaderStats(events, today, scoutIds, paths.data.map((p) => p.id));
  const waiting = posts.filter((p) => p.status === 'scheduled');
  const failed = posts.length - waiting.length;
  const card = blueCardAction(cards.data.length, canManageBadges);
  return (
    <div className="grid" aria-label="What's happening">
      <Tile to={`${base}/events`} value={stats.soonEvents} label="Events in the next two weeks" />
      <Tile
        to={`${base}/announcements`}
        value={waiting.length}
        label={waiting.length === 1 ? 'Scheduled message' : 'Scheduled messages'}
        sub={
          failed
            ? `${plural(failed, 'message')} could not send`
            : waiting[0]
              ? `Next: ${sendTimeText(waiting[0].sendAt.toDate())}`
              : 'Post now or schedule one'
        }
      />
      <Tile
        to={`${base}/roster`}
        value={`${stats.scoutsWithPath} of ${stats.scouts}`}
        label="Scouts with an advancement path"
      />
      <Tile to={`${base}/blue-cards`} value={cards.data.length} label="Blue cards waiting" sub={card.text} />
      <Tile to={`${base}/events`} value={stats.permissionWaiting} label="Permission slips waiting" sub="For upcoming events" />
      {leads > 0 ? <Tile to={`${base}/recruiting`} value={leads} label="New families asking to join" /> : null}
    </div>
  );
}
