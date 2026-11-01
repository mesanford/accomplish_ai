import { describeField } from '../../lib/planForms';
import { type DiffRow, FIELD_LABELS } from '../../lib/plans';

/** Differences between the plan and its event. Nothing is ticked until the leader chooses it. */
export function PublishDiff({ rows, ticked, onToggle }: { rows: DiffRow[]; ticked: string[]; onToggle: (field: string) => void }) {
  if (rows.length === 0) {
    return <p className="muted">The event already matches the plan.</p>;
  }
  return (
    <div className="table-box">
      <table className="stack-table">
        <thead>
          <tr>
            <th scope="col">Update</th>
            <th scope="col">Field</th>
            <th scope="col">Plan says</th>
            <th scope="col">Event says</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.field}>
              <td data-label="Update">
                <input
                  type="checkbox"
                  aria-label={`Update ${FIELD_LABELS[r.field]} on the event`}
                  checked={ticked.includes(r.field)}
                  onChange={() => onToggle(r.field)}
                />
              </td>
              <th scope="row" data-label="Field">
                {FIELD_LABELS[r.field]}
                {r.editedOnEvent ? (
                  <span className="small">
                    <br />
                    <span aria-hidden="true">⚠ </span>
                    Changed on the event page since you last published; publishing this undoes that change.
                  </span>
                ) : null}
              </th>
              <td data-label="Plan says">{describeField(r.field, r.plan)}</td>
              <td data-label="Event says">{describeField(r.field, r.event)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
