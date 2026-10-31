import { AVAILABILITY_LABELS, type Availability, CHECK_LABELS, type CheckStatus, type PlanStatus, STATUS_LABELS } from '../../lib/plans';

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

/** Every chip has an icon and a word, so colour is never the only signal. */
function Chip({ tone, icon, label }: { tone: Tone; icon: string; label: string }) {
  return (
    <span className={`pill ${tone}`}>
      <span aria-hidden="true">{icon} </span>
      {label}
    </span>
  );
}

const CHECK: Record<CheckStatus, [Tone, string]> = {
  pass: ['good', '✓'],
  fail: ['bad', '✕'],
  unknown: ['warn', '?'],
  acknowledged: ['neutral', '☑'],
};

export function CheckChip({ status }: { status: CheckStatus }) {
  const [tone, icon] = CHECK[status];
  return <Chip tone={tone} icon={icon} label={CHECK_LABELS[status]} />;
}

const PLAN: Record<PlanStatus, [Tone, string]> = {
  draft: ['neutral', '✎'],
  decided: ['good', '✓'],
  published: ['good', '▣'],
  cancelled: ['bad', '✕'],
  closed: ['neutral', '■'],
};

export function PlanStatusChip({ status }: { status: PlanStatus }) {
  const [tone, icon] = PLAN[status];
  return <Chip tone={tone} icon={icon} label={STATUS_LABELS[status]} />;
}

const AVAIL: Record<Availability, [Tone, string]> = {
  unknown: ['neutral', '?'],
  contacted: ['neutral', '✉'],
  available: ['good', '✓'],
  held: ['good', '◆'],
  booked: ['good', '★'],
  unavailable: ['bad', '✕'],
};

export function AvailabilityChip({ state }: { state: Availability }) {
  const [tone, icon] = AVAIL[state];
  return <Chip tone={tone} icon={icon} label={AVAILABILITY_LABELS[state]} />;
}
