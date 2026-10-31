/** One question with big choices: radio buttons when `multi` is false, checkboxes when it is true. */
export function ChoiceStep<K extends string>({
  name,
  question,
  hint,
  choices,
  value,
  multi,
  onChange,
}: {
  name: string;
  question: string;
  hint?: string;
  choices: [K, string][];
  value: K[];
  multi: boolean;
  onChange: (next: K[]) => void;
}) {
  function pick(key: K) {
    if (!multi) {
      onChange([key]);
      return;
    }
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  }
  return (
    <fieldset className="stack">
      <legend>
        <h3>{question}</h3>
      </legend>
      {hint ? <p className="muted small">{hint}</p> : null}
      <div className="choices">
        {choices.map(([key, label]) => (
          <label key={key} className="choice">
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={name}
              checked={value.includes(key)}
              onChange={() => pick(key)}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
