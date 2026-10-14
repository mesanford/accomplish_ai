import { collection } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { GuideBlock } from '../components/GuideBlock';
import { NextStep } from '../components/NextStep';
import { TemplateEditor, type TemplateDraft } from '../components/TemplateEditor';
import { Loading, Notice, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/api';
import { awardName } from '../lib/catalog';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { STARTER_TEMPLATES } from '../lib/starterTemplates';
import { saveTemplate, setArchived } from '../lib/templateStore';
import { daysToWeeks } from '../lib/templates';
import { useTroop } from '../lib/troop';
import type { PathTemplate } from '../lib/types';

const BLANK: TemplateDraft = { name: '', description: '', goalAwardId: 'eagle', items: [] };

export function PathTemplates() {
  const { troopId, isLeader, access } = useTroop();
  const memberId = access?.memberId ?? '';
  const q = useMemo(() => collection(db, `troops/${troopId}/pathTemplates`), [troopId]);
  const templates = useQuery<PathTemplate>(q, `${troopId}/templates`);
  const [editing, setEditing] = useState<{ id?: string; authorId?: string; draft: TemplateDraft } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(draft: TemplateDraft) {
    if (await run(() => saveTemplate(troopId, editing?.authorId ?? memberId, draft, editing?.id))) {
      setEditing(null);
    }
  }

  async function addStarters() {
    const have = new Set(templates.data.map((t) => t.id));
    const missing = STARTER_TEMPLATES.filter((s) => !have.has(s.id));
    await run(async () => {
      for (const s of missing) {
        await saveTemplate(troopId, memberId, s, s.id);
      }
    });
  }

  if (!isLeader) {
    return <Notice kind="warn">Only leaders can manage path templates.</Notice>;
  }
  if (templates.loading) {
    return <Loading />;
  }
  if (editing) {
    return (
      <>
        <PageHeader title={editing.id ? 'Edit template' : 'New template'} />
        <TemplateEditor initial={editing.draft} busy={busy} error={error} onSave={save} onCancel={() => setEditing(null)} />
      </>
    );
  }
  const shown = templates.data.filter((t) => showArchived || !t.archived).sort((a, b) => a.name.localeCompare(b.name));
  const startersLeft = STARTER_TEMPLATES.some((s) => !templates.data.some((t) => t.id === s.id));
  return (
    <>
      <PageHeader title="Path templates">
        <button type="button" className="btn" onClick={() => setEditing({ draft: BLANK })}>
          New template
        </button>
        {startersLeft ? (
          <button type="button" className="btn secondary" disabled={busy} onClick={addStarters}>
            Add starter templates
          </button>
        ) : null}
      </PageHeader>
      <GuideBlock
        id="templates"
        title="What are path templates?"
        purpose="A path template is a ready-made plan, like Eagle by 17, that families can start from instead of a blank page."
        steps={[
          'Press "Add starter templates" for a few ready-made ones, or "New template" to make your own.',
          'Families pick a template when they plan a path. Dates count from the day they apply it.',
          'Archive a template to hide it from families. Nothing is deleted.',
        ]}
      />
      <Notice kind="error">{error || templates.error || ''}</Notice>
      {shown.length === 0 ? (
        <NextStep action="Make your first template" onClick={() => setEditing({ draft: BLANK })}>
          No templates yet. Add the starter templates above, or make your own.
        </NextStep>
      ) : null}
      <div className="stack">
        {shown.map((t) => (
          <section className="card" key={t.id}>
            <div className="row spread">
              <h2>{t.name}</h2>
              {t.archived ? <span className="pill neutral">Archived</span> : null}
            </div>
            {t.description ? <p>{t.description}</p> : null}
            <p className="small muted">
              Goal: {awardName(t.goalAwardId)} · {t.items.length} badges · about{' '}
              {daysToWeeks(Math.max(0, ...t.items.map((i) => i.startOffsetDays + i.durationDays)))} weeks
            </p>
            <div className="row">
              <button type="button" className="btn quiet small" onClick={() => setEditing({ id: t.id, authorId: t.createdByMemberId, draft: t })}>
                Edit
              </button>
              <button
                type="button"
                className="btn quiet small"
                disabled={busy}
                onClick={() => run(() => setArchived(troopId, t.id, !t.archived))}
              >
                {t.archived ? 'Restore' : 'Archive'}
              </button>
            </div>
          </section>
        ))}
      </div>
      <label className="row small">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
      </label>
    </>
  );
}
