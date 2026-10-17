import { Link } from 'react-router-dom';
import { useAnnouncementFeed } from '../lib/announcementFeed';
import { newestUnread, preview } from '../lib/announcements';
import { useTroop } from '../lib/troop';

/** The newest announcement the person has not read yet. Shows nothing when they are caught up. */
export function HomeAnnouncement() {
  const { troopId } = useTroop();
  const { posts, lastSeenMs, uid, loading } = useAnnouncementFeed();
  const post = loading ? null : newestUnread(posts, lastSeenMs, uid);
  if (!post) {
    return null;
  }
  return (
    <Link className="card link" to={`/t/${troopId}/announcements#${post.id}`}>
      <span className="pill good">New announcement</span>
      <h3 style={{ margin: '8px 0 2px' }}>{post.title}</h3>
      <span className="muted small">
        From {post.postedByName}. {preview(post)}
      </span>
    </Link>
  );
}
