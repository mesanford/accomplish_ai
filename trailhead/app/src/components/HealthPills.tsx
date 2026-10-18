import { type HealthForm, partStatus, STATUS_TEXT, STATUS_TONE } from '../lib/healthForm';
import { todayIso } from './ui';
import { healthTip } from '../lib/statusTips';
import { TipPill } from './TipPill';

/** Two small badges for the roster: Parts A and B, and Part C. */
export function HealthPills({ form }: { form: HealthForm | undefined }) {
  const today = todayIso();
  const ab = partStatus(form?.partsAB, today);
  const c = partStatus(form?.partC, today);
  return (
    <>
      <TipPill tone={STATUS_TONE[ab]} tip={healthTip('partsAB', ab)}>
        Health A and B: {STATUS_TEXT[ab]}
      </TipPill>
      <TipPill tone={STATUS_TONE[c]} tip={healthTip('partC', c)}>
        Part C: {STATUS_TEXT[c]}
      </TipPill>
    </>
  );
}
