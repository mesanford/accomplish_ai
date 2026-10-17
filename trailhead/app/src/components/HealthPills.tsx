import { type HealthForm, partStatus, STATUS_TEXT, STATUS_TONE } from '../lib/healthForm';
import { todayIso } from './ui';

/** Two small badges for the roster: Parts A and B, and Part C. */
export function HealthPills({ form }: { form: HealthForm | undefined }) {
  const today = todayIso();
  const ab = partStatus(form?.partsAB, today);
  const c = partStatus(form?.partC, today);
  return (
    <>
      <span className={`pill ${STATUS_TONE[ab]}`}>Health A and B: {STATUS_TEXT[ab]}</span>
      <span className={`pill ${STATUS_TONE[c]}`}>Part C: {STATUS_TEXT[c]}</span>
    </>
  );
}
