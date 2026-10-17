import { newQuestionId, parseChoices, type SignupQuestion } from '../../lib/eventSignups';

interface Props {
  questions: SignupQuestion[];
  onChange: (next: SignupQuestion[]) => void;
}

const MAX_QUESTIONS = 6;

/** Leaders add short questions for families, such as dietary needs or a T-shirt size. */
export function QuestionEditor({ questions, onChange }: Props) {
  function update(index: number, patch: Partial<SignupQuestion>) {
    onChange(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }
  return (
    <div className="stack">
      {questions.map((q, i) => (
        <div className="card stack" key={q.id}>
          <div className="field">
            <label htmlFor={`q-label-${q.id}`}>Question {i + 1}</label>
            <input
              id={`q-label-${q.id}`}
              maxLength={80}
              value={q.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Dietary needs"
            />
          </div>
          <div className="row">
            <select
              aria-label={`Answer type for question ${i + 1}`}
              value={q.type}
              onChange={(e) => update(i, { type: e.target.value as SignupQuestion['type'] })}
              style={{ width: 'auto' }}
            >
              <option value="text">Free text</option>
              <option value="choice">Pick from a list</option>
            </select>
            <label className="check">
              <input type="checkbox" checked={Boolean(q.required)} onChange={(e) => update(i, { required: e.target.checked })} />
              Required
            </label>
            <button type="button" className="btn secondary small" onClick={() => onChange(questions.filter((_, n) => n !== i))}>
              Remove question {i + 1}
            </button>
          </div>
          {q.type === 'choice' ? (
            <div className="field">
              <label htmlFor={`q-choices-${q.id}`}>Choices, separated by commas</label>
              <input
                id={`q-choices-${q.id}`}
                defaultValue={(q.choices ?? []).join(', ')}
                onChange={(e) => update(i, { choices: parseChoices(e.target.value) })}
                placeholder="S, M, L, XL"
              />
            </div>
          ) : null}
        </div>
      ))}
      {questions.length < MAX_QUESTIONS ? (
        <div>
          <button
            type="button"
            className="btn secondary small"
            onClick={() => onChange([...questions, { id: newQuestionId(questions.map((q) => q.id)), label: '', type: 'text' }])}
          >
            Add a question
          </button>
        </div>
      ) : null}
    </div>
  );
}
