import { AMENITIES, AMENITY_LABELS, type Amenity } from '../../lib/planBrief';

/** Checkboxes for amenities: a brief's must-haves, or what a research card's place has. */
export function AmenityPicker({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: Amenity[];
  onChange: (next: Amenity[]) => void;
}) {
  function toggle(a: Amenity) {
    const has = value.includes(a);
    onChange(AMENITIES.filter((x) => (x === a ? !has : value.includes(x))));
  }
  return (
    <fieldset className="stack">
      <legend>{legend}</legend>
      <div className="grid">
        {AMENITIES.map((a) => (
          <label key={a} className="check">
            <input type="checkbox" checked={value.includes(a)} onChange={() => toggle(a)} />
            {AMENITY_LABELS[a]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
