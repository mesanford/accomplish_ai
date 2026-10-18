import { type FormEvent, useState } from 'react';
import { PatrolCard } from '../components/patrols/PatrolCard';
import { Empty, Field, Notice, PageHeader } from '../components/ui';
import { savePatrol } from '../lib/activityApi';
import { errorMessage } from '../lib/api';
import { PATROL_COLORS } from '../lib/patrols';
import { usePatrols } from '../lib/patrolHooks';
import { useTroop } from '../lib/troop';
import { HelpTip } from '../components/HelpTip';
import { NoAccess } from '../components/NoAccess';

export function Patrols() {
  const { troopId, members, isLeader } = useTroop();
  const patrols = usePatrols();
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [error, setError] = useState('');
  const loose = members.filter((m) => m.kind === 'scout' && !m.patrolId);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError("Enter the patrol's name.");
      return;
    }
    try {
      await savePatrol({ troopId, name, color: color || null });
      setName('');
      setColor('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!isLeader) {
    return <NoAccess message="Only leaders can manage patrols." ask="leader" />;
  }
  return (
    <>
      <PageHeader eyebrow="Troop" title="Patrols">
        <HelpTip topic="patrols" />
      </PageHeader>
      <p className="muted">
        A patrol is a small group of Scouts. Each Scout is in one patrol. Name a patrol leader and
        an assistant from its Scouts.
      </p>
      {patrols.data.length === 0 ? <Empty>No patrols yet. Add the first one below.</Empty> : null}
      {patrols.data.map((p) => (
        <PatrolCard key={p.id} patrol={p} />
      ))}
      {patrols.data.length > 0 ? (
        <section className="card stack">
          <h2>Scouts with no patrol ({loose.length})</h2>
          <p className="small">
            {loose.length === 0
              ? 'Every Scout is in a patrol.'
              : loose.map((s) => s.displayName).join(', ')}
          </p>
        </section>
      ) : null}
      <section className="card">
        <h2>Add a patrol</h2>
        <form className="form" onSubmit={create} noValidate>
          <div className="row">
            <Field label="Patrol name" htmlFor="patrol-name">
              <input
                id="patrol-name"
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Eagles"
              />
            </Field>
            <Field label="Emblem color (optional)" htmlFor="patrol-color">
              <select id="patrol-color" value={color} onChange={(e) => setColor(e.target.value)}>
                <option value="">No color</option>
                {PATROL_COLORS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Notice kind="error">{error}</Notice>
          <div>
            <button className="btn" type="submit">
              Add patrol
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
