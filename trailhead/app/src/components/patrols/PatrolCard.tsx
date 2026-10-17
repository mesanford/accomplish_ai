import { type FormEvent, useEffect, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { assignPatrol, deletePatrol, savePatrol } from '../../lib/activityApi';
import { colorLabel, officeOf, PATROL_COLORS, type Patrol, patrolMembers } from '../../lib/patrols';
import { plural } from '../../lib/plural';
import { useTroop } from '../../lib/troop';
import { Field, Notice } from '../ui';

export function ColorSwatch({ color }: { color?: string | null }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        borderRadius: 7,
        background: color ?? 'var(--line, #bbb)',
      }}
    />
  );
}

/** One patrol: its name and color, who leads it, and who is in it. Leaders only. */
export function PatrolCard({ patrol }: { patrol: Patrol }) {
  const { troopId, members, memberName } = useTroop();
  const scouts = members
    .filter((m) => m.kind === 'scout')
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const inside = patrolMembers(patrol.id, members);
  const others = scouts.filter((s) => s.patrolId !== patrol.id);
  const [name, setName] = useState(patrol.name);
  const [color, setColor] = useState(patrol.color ?? '');
  const [leaderId, setLeaderId] = useState(patrol.leaderId ?? '');
  const [assistantId, setAssistantId] = useState(patrol.assistantId ?? '');
  const [adding, setAdding] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Follow saved changes (such as an office cleared when a Scout moves) without remounting, so "Saved." stays.
  useEffect(() => {
    setName(patrol.name);
    setColor(patrol.color ?? '');
    setLeaderId(patrol.leaderId ?? '');
    setAssistantId(patrol.assistantId ?? '');
  }, [patrol.name, patrol.color, patrol.leaderId, patrol.assistantId]);

  async function run(task: () => Promise<unknown>, done = '') {
    setError('');
    setMessage('');
    try {
      await task();
      setMessage(done);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    return run(
      () =>
        savePatrol({
          troopId,
          patrolId: patrol.id,
          name,
          color: color || null,
          leaderId: leaderId || null,
          assistantId: assistantId || null,
        }),
      'Saved.',
    );
  }

  const label = `${patrol.name} patrol`;
  return (
    <section className="card stack" aria-label={label}>
      <h2>
        <ColorSwatch color={patrol.color} /> {patrol.name}
      </h2>
      <p className="muted small">
        {plural(inside.length, 'Scout')}
        {inside.length > 0
          ? `: ${inside.map((s) => `${s.displayName}${officeOf(s.id, patrol) ? ` (${officeOf(s.id, patrol)})` : ''}`).join(', ')}`
          : ''}
      </p>
      <ul className="list">
        {inside.map((s) => (
          <li key={s.id}>
            <span>{s.displayName}</span>
            <button
              type="button"
              className="btn quiet small"
              aria-label={`Remove ${s.displayName} from ${patrol.name}`}
              onClick={() => run(() => assignPatrol(troopId, [s.id], null))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <Field
          label="Add a Scout"
          htmlFor={`add-${patrol.id}`}
          hint="A Scout is in one patrol. Adding moves them here."
        >
          <select
            id={`add-${patrol.id}`}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">Choose a Scout</option>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          className="btn secondary small"
          disabled={!adding}
          onClick={() =>
            run(
              () => assignPatrol(troopId, [adding], patrol.id),
              `${memberName(adding)} added.`,
            ).then(() => setAdding(''))
          }
        >
          Add to {patrol.name}
        </button>
      </div>
      <form className="form" onSubmit={save} noValidate>
        <div className="row">
          <Field label="Patrol name" htmlFor={`name-${patrol.id}`}>
            <input
              id={`name-${patrol.id}`}
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Emblem color" htmlFor={`color-${patrol.id}`}>
            <select
              id={`color-${patrol.id}`}
              value={color}
              onChange={(e) => setColor(e.target.value)}
            >
              <option value="">No color</option>
              {PATROL_COLORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              {color && !PATROL_COLORS.some((c) => c.value === color) ? (
                <option value={color}>{colorLabel(color)}</option>
              ) : null}
            </select>
          </Field>
        </div>
        <div className="row">
          <Field label="Patrol leader" htmlFor={`pl-${patrol.id}`}>
            <select
              id={`pl-${patrol.id}`}
              value={leaderId}
              onChange={(e) => setLeaderId(e.target.value)}
            >
              <option value="">Not chosen</option>
              {inside.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assistant patrol leader" htmlFor={`apl-${patrol.id}`}>
            <select
              id={`apl-${patrol.id}`}
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
            >
              <option value="">Not chosen</option>
              {inside.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Notice kind="error">{error}</Notice>
        <Notice kind="ok">{message}</Notice>
        <div className="row">
          <button className="btn" type="submit">
            Save {patrol.name}
          </button>
          <button
            type="button"
            className="btn quiet small"
            onClick={() => {
              if (
                window.confirm(
                  `Delete the ${patrol.name} patrol? Its Scouts stay on the roster with no patrol.`,
                )
              ) {
                run(() => deletePatrol(troopId, patrol.id));
              }
            }}
          >
            Delete patrol
          </button>
        </div>
      </form>
    </section>
  );
}
