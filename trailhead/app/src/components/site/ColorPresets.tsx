import { COLOR_PRESETS } from '../../lib/siteTheme';

interface Props {
  value: string;
  onPick: (color: string) => void;
}

/** One-tap troop colors from the Forthright palette, beside the full color picker. */
export function ColorPresets({ value, onPick }: Props) {
  const current = value.toLowerCase();
  return (
    <div className="color-presets" role="group" aria-label="Suggested colors">
      {COLOR_PRESETS.map((p) => (
        <button
          key={p.color}
          type="button"
          className="color-preset"
          aria-pressed={current === p.color}
          onClick={() => onPick(p.color)}
        >
          <span className="color-chip" style={{ background: p.color }} aria-hidden="true" />
          {p.name}
        </button>
      ))}
    </div>
  );
}
