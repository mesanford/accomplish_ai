import { minutesText } from '../../lib/planForms';
import { safeLink } from '../../lib/plans';
import { CAMPING_TEXT, FACT_LABELS, PLACE_KIND_LABELS, type PlaceRow } from '../../lib/placesApi';
import { formatDate } from '../ui';

function distance(p: PlaceRow): string {
  if (typeof p.driveMinutes === 'number') {
    return `About ${minutesText(p.driveMinutes)} drive`;
  }
  return p.miles === null ? '' : `About ${p.miles} miles away`;
}

/** One place from the catalog: what it is, how far, what its source says, and links to its own pages. */
export function PlaceResult({ place, onAdd, busy }: { place: PlaceRow; onAdd: () => void; busy: boolean }) {
  const page = place.url ? safeLink(place.url) : null;
  const booking = place.bookingUrl ? safeLink(place.bookingUrl) : null;
  const facts = place.facts ?? [];
  return (
    <li className="card stack">
      <div className="row spread">
        <h3>{place.name}</h3>
        <span className="muted small">
          {PLACE_KIND_LABELS[place.kind]} · {place.state}
        </span>
      </div>
      <p className="small">
        {[distance(place), place.kind === 'highAdventure' ? '' : CAMPING_TEXT[place.camping]].filter(Boolean).join(' · ')}
      </p>
      {place.description ? <p className="small">{place.description}</p> : null}
      {facts.length ? (
        <ul className="small">
          {facts.map((f) => (
            <li key={f.label}>
              {FACT_LABELS[f.label]}: {f.value}
            </li>
          ))}
        </ul>
      ) : null}
      {place.kind === 'highAdventure' ? (
        <p className="muted small">
          {place.checkedOn ? `From the program's page on ${formatDate(place.checkedOn)}. ` : ''}
          Dates, ages and costs change each year: confirm on the program's site.
        </p>
      ) : null}
      <div className="row small">
        {page ? (
          <a href={page} target="_blank" rel="noopener noreferrer">
            Official page
          </a>
        ) : null}
        {booking && booking !== page ? (
          <a href={booking} target="_blank" rel="noopener noreferrer">
            Check availability
          </a>
        ) : null}
        <span className="muted">Source: {place.credit}</span>
      </div>
      <div>
        <button className="btn secondary small" type="button" disabled={busy} onClick={onAdd}>
          Add as an option
        </button>
      </div>
    </li>
  );
}
