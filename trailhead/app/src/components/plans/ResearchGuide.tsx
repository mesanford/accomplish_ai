import { GUIDES } from '../../lib/planGuides';
import type { PlanKind } from '../../lib/plans';

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="stack">
      <h3>{title}</h3>
      <ul className="small">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

/** Where to look, what makes a good option and what to ask, for this kind of trip. Open until research starts. */
export function ResearchGuide({ kind, open }: { kind: PlanKind; open: boolean }) {
  const guide = GUIDES[kind];
  return (
    <details className="card" open={open}>
      <summary>Where to look and what to ask</summary>
      <div className="grid">
        <List title="Where to look" items={guide.lookIn} />
        <List title="Signs of a good option" items={guide.goodSigns} />
        <List title="Ask the place" items={guide.ask} />
      </div>
    </details>
  );
}
