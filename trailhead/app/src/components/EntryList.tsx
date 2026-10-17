import { formatDate } from './ui';
import { type AccountState, canReverse, entryLabel, type LedgerEntry, newestFirst, shownCents } from '../lib/ledger';
import { Money } from './Money';
import { ReverseEntry } from './ReverseEntry';

interface Props {
  entries: LedgerEntry[];
  state: AccountState;
  /** The treasurer may reverse entries. */
  canChange: boolean;
}

/** Every entry on one account, newest first. */
export function EntryList({ entries, state, canChange }: Props) {
  return (
    <div className="table-box">
      <table>
        <caption className="sr-only">Account entries, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Entry</th>
            <th scope="col" className="num">
              Amount
            </th>
            {canChange ? <th scope="col">Fix</th> : null}
          </tr>
        </thead>
        <tbody>
          {newestFirst(entries).map((e) => (
            <tr key={e.id}>
              <td className="money">{formatDate(e.date)}</td>
              <td>
                <div>{e.description}</div>
                <div className="small muted">
                  {entryLabel(e, state)} · Recorded by {e.createdByName}
                  {e.reason ? ` · Reason: ${e.reason}` : ''}
                </div>
              </td>
              <td className="num">
                <Money cents={shownCents(e)} />
              </td>
              {canChange ? <td>{canReverse(e, state) ? <ReverseEntry entry={e} /> : null}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
