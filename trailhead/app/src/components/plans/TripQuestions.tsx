import { useState } from 'react';
import type { EventPlan } from '../../lib/plans';
import { updateBrief } from '../../lib/plansApi';
import { answersFrom, type Answers, briefFrom, stepsFor } from '../../lib/tripQuestions';
import { Notice } from '../ui';
import { ChoiceStep } from './ChoiceStep';
import { useAction } from './useAction';

/** The questions a plan starts with, one at a time. Saving them shows ideas that fit. */
export function TripQuestions({ troopId, plan, onDone }: { troopId: string; plan: EventPlan; onDone: () => void }) {
  const [answers, setAnswers] = useState<Answers>(() => answersFrom(plan.brief));
  const [at, setAt] = useState(0);
  const act = useAction();
  const steps = stepsFor(plan.kind, answers);
  const index = Math.min(at, steps.length - 1);
  const step = steps[index];
  const last = index === steps.length - 1;

  async function finish() {
    if (await act.run(() => updateBrief(troopId, plan.id, briefFrom(answers, plan.brief)))) {
      onDone();
    }
  }

  return (
    <section className="card stack" aria-label="Plan questions">
      <p className="eyebrow">
        Question {index + 1} of {steps.length}
      </p>
      <ChoiceStep
        key={step.key}
        name={`q-${step.key}`}
        question={step.question}
        hint={step.hint}
        choices={step.choices}
        multi={step.multi}
        value={answers[step.key] ?? []}
        onChange={(next) => setAnswers((a) => ({ ...a, [step.key]: next }))}
      />
      <Notice kind="error">{act.error}</Notice>
      <div className="row">
        {index > 0 ? (
          <button className="btn secondary" type="button" onClick={() => setAt(index - 1)}>
            Back
          </button>
        ) : null}
        {last ? (
          <button className="btn" type="button" disabled={act.busy} onClick={finish}>
            Show us ideas
          </button>
        ) : (
          <button className="btn" type="button" onClick={() => setAt(index + 1)}>
            {(answers[step.key] ?? []).length ? 'Next' : 'Skip'}
          </button>
        )}
      </div>
    </section>
  );
}
