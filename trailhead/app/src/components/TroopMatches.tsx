import { Link } from 'react-router-dom';
import type { TroopMatch } from '../lib/api';

function where(t: TroopMatch): string {
  return [`Unit ${t.unitNumber}`, t.council, t.district ? `${t.district} District` : ''].filter(Boolean).join(' · ');
}

/** Troops already on Forthright with the unit number and council being created. Each offers "Ask to join". */
export function TroopMatches({
  matches,
  notMine,
  onNotMine,
  onAsk,
}: {
  matches: TroopMatch[];
  notMine: boolean;
  onNotMine: (notMine: boolean) => void;
  onAsk: (troop: TroopMatch) => void;
}) {
  const one = matches.length === 1;
  return (
    <section className="card stack" aria-label="Already on Forthright">
      <h2>{one ? 'This troop is already on Forthright' : 'These troops are already on Forthright'}</h2>
      <p className="muted">
        If {one ? 'it is' : 'one of them is'} your troop, ask to join instead of creating a second copy. One of its
        leaders approves you, and then you see everything the troop has set up.
      </p>
      <ul className="list">
        {matches.map((t) => (
          <li key={t.troopId} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              <strong>{t.name}</strong>
              <br />
              <span className="small muted">{where(t)}</span>
            </span>
            {t.member ? (
              <Link className="btn secondary small" to={`/t/${t.troopId}`}>
                Open (you're in it)
              </Link>
            ) : null}
            {!t.member && t.requested ? <span className="small muted">Request sent</span> : null}
            {!t.member && !t.requested ? (
              <button type="button" className="btn small" onClick={() => onAsk(t)}>
                Ask to join
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <label className="check">
        <input type="checkbox" checked={notMine} onChange={(e) => onNotMine(e.target.checked)} />
        {one ? 'This is not my troop. Create mine.' : 'None of these is my troop. Create mine.'}
      </label>
    </section>
  );
}
