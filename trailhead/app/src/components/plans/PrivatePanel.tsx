import { doc } from 'firebase/firestore';
import { type FormEvent, useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/hooks';
import type { PlanPrivate } from '../../lib/plans';
import { updatePrivate } from '../../lib/plansApi';
import { Field, Loading, Notice } from '../ui';
import { useAction } from './useAction';

function PrivateForm({ troopId, planId, saved, canEdit }: { troopId: string; planId: string; saved: PlanPrivate | null; canEdit: boolean }) {
  const [contacts, setContacts] = useState(saved?.contacts ?? '');
  const [confirmations, setConfirmations] = useState(saved?.confirmations ?? '');
  const [notes, setNotes] = useState(saved?.notes ?? '');
  const [helpers, setHelpers] = useState((saved?.helpers ?? []).join('\n'));
  const act = useAction();

  function save(e: FormEvent) {
    e.preventDefault();
    const list = helpers.split('\n').map((h) => h.trim()).filter((h) => h !== '');
    void act.run(() => updatePrivate(troopId, planId, { contacts, confirmations, notes, helpers: list }));
  }

  return (
    <form className="form" onSubmit={save}>
      <fieldset className="stack" disabled={!canEdit}>
        <legend className="sr-only">Adult-only details</legend>
        <Field label="Contacts" htmlFor="pv-contacts" hint="Phone numbers and emails for the site, venue and other adults.">
          <textarea id="pv-contacts" value={contacts} onChange={(e) => setContacts(e.target.value)} />
        </Field>
        <Field label="Confirmation numbers" htmlFor="pv-conf">
          <textarea id="pv-conf" value={confirmations} maxLength={500} onChange={(e) => setConfirmations(e.target.value)} />
        </Field>
        <Field label="Adult notes" htmlFor="pv-notes">
          <textarea id="pv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Helpers and drivers who are not in the troop, one name per line" htmlFor="pv-helpers" hint="Names only.">
          <textarea id="pv-helpers" value={helpers} onChange={(e) => setHelpers(e.target.value)} />
        </Field>
      </fieldset>
      <Notice kind="error">{act.error}</Notice>
      <Notice kind="ok">{act.message}</Notice>
      {canEdit ? (
        <div>
          <button className="btn" type="submit" disabled={act.busy}>
            Save adult-only details
          </button>
        </div>
      ) : null}
    </form>
  );
}

function PrivateLoader({ troopId, planId, canEdit }: { troopId: string; planId: string; canEdit: boolean }) {
  const ref = useMemo(() => doc(db, `troops/${troopId}/eventPlans/${planId}/private/adult`), [troopId, planId]);
  const live = useDoc<PlanPrivate>(ref);
  if (live.loading) {
    return <Loading />;
  }
  return (
    <>
      <Notice kind="error">{live.error}</Notice>
      <PrivateForm troopId={troopId} planId={planId} saved={live.data} canEdit={canEdit} />
    </>
  );
}

/** Contacts and confirmation numbers. The document is read only after the panel is opened. */
export function PrivatePanel({ troopId, planId, canEdit }: { troopId: string; planId: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="card" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Adult-only details: contacts, confirmation numbers and helpers</summary>
      <p className="muted small">Only leaders, committee members, the treasurer and the trip lead can see this.</p>
      {open ? <PrivateLoader troopId={troopId} planId={planId} canEdit={canEdit} /> : null}
    </details>
  );
}
