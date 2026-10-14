import { RANKS } from '../lib/catalog';

interface Props {
  dates: Record<string, string>;
  onChange: (dates: Record<string, string>) => void;
}

/** One date per rank. Leave a rank blank if the Scout hasn't earned it. */
export function PriorRanks({ dates, onChange }: Props) {
  return (
    <div className="table-box">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Date earned</th>
          </tr>
        </thead>
        <tbody>
          {RANKS.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>
                <input
                  type="date"
                  aria-label={`${r.name} date earned`}
                  value={dates[r.id] ?? ''}
                  onChange={(e) => onChange({ ...dates, [r.id]: e.target.value })}
                  style={{ maxWidth: 200 }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
