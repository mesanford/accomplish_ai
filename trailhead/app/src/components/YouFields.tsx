import { CREATOR_CHOICES, creatorHint, DEFAULT_CREATOR_ROLE } from '../lib/creatorRole';
import { HelpTip } from './HelpTip';
import { Field } from './ui';

export interface You {
  displayName: string;
  creatorRole?: string;
  yptExpiresAt: string;
}

/** Your name, your role in the troop and your Youth Protection training date: asked when creating a troop and when
 * asking to join one. */
export function YouFields({ you, onChange }: { you: You; onChange: (you: You) => void }) {
  const set = (key: keyof You) => (e: { target: { value: string } }) => onChange({ ...you, [key]: e.target.value });
  const role = you.creatorRole ?? DEFAULT_CREATOR_ROLE;
  return (
    <>
      <Field label="Your name" htmlFor="you">
        <input id="you" required value={you.displayName} onChange={set('displayName')} autoComplete="name" />
      </Field>
      <Field label="Your role in the troop" htmlFor="creator-role" hint={creatorHint(role)}>
        <select id="creator-role" value={role} onChange={set('creatorRole')}>
          {CREATOR_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Youth Protection training expires"
        htmlFor="ypt"
        hint="Leaders need current training to sign off requirements and message Scouts."
      >
        <input id="ypt" type="date" required value={you.yptExpiresAt} onChange={set('yptExpiresAt')} />
      </Field>
      <p className="small muted">
        Not sure what this is?
        <HelpTip topic="ypt" />
      </p>
    </>
  );
}
