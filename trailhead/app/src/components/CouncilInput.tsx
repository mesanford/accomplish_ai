import { COUNCILS } from '../lib/councils';

/** A text box that suggests Scouting America's councils as you type. A council not on the list can still be typed. */
export function CouncilInput({
  id,
  value,
  onChange,
  onBlur,
  required,
}: {
  id: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  onBlur?: () => void;
  required?: boolean;
}) {
  const list = `${id}-choices`;
  return (
    <>
      <input
        id={id}
        list={list}
        required={required}
        maxLength={80}
        autoComplete="off"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
      />
      <datalist id={list}>
        {COUNCILS.map(([name, place]) => (
          <option key={`${name}|${place}`} value={name}>
            {place}
          </option>
        ))}
      </datalist>
    </>
  );
}
