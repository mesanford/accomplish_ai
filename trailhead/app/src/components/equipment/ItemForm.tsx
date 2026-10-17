import { collection, deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../lib/api';
import {
  CATEGORIES,
  CONDITIONS,
  type InventoryItem,
  type ItemCategory,
  type ItemCondition,
} from '../../lib/equipment';
import { setItemPhoto } from '../../lib/equipmentApi';
import { EMPTY_FORM, formFrom, formProblem, itemFields } from '../../lib/equipmentForm';
import { db } from '../../lib/firebase';
import { shrinkPhoto } from '../../lib/photo';
import { useTroop } from '../../lib/troop';
import { Field, Notice } from '../ui';
import { PhotoField } from './PhotoField';

interface Props {
  /** The item being edited, or null to add a new one. */
  item: InventoryItem | null;
  onDone: (itemId: string) => void;
  onCancel: () => void;
}

const OPTIONAL = ['tag', 'purchaseDate', 'costCents'] as const;

/** Add an item, or change one. A quantity item (12 mess kits) and a single tracked item (tent 4) use the same form. */
export function ItemForm({ item, onDone, onCancel }: Props) {
  const { troopId } = useTroop();
  const [form, setForm] = useState(item ? formFrom(item) : EMPTY_FORM);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const problem = formProblem(form, item?.out ?? 0);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const fields = itemFields(form);
      const ref = item ? doc(db, 'troops', troopId, 'inventory', item.id) : doc(collection(db, 'troops', troopId, 'inventory'));
      if (item) {
        const cleared = Object.fromEntries(OPTIONAL.filter((k) => item[k] !== undefined && !(k in fields)).map((k) => [k, deleteField()]));
        await updateDoc(ref, { ...fields, ...cleared, updatedAt: serverTimestamp() });
      } else {
        await setDoc(ref, { ...fields, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      if (photo) {
        await setItemPhoto(troopId, ref.id, await shrinkPhoto(photo));
      }
      onDone(ref.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const single = Number(form.quantity) === 1;
  return (
    <form className="form card" onSubmit={save} aria-label={item ? `Change ${item.name}` : 'Add an item'}>
      <h2>{item ? `Change ${item.name}` : 'Add an item'}</h2>
      <Field label="Name" htmlFor="item-name">
        <input id="item-name" required maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="Category" htmlFor="item-category">
        <select id="item-category" value={form.category} onChange={(e) => set('category', e.target.value as ItemCategory)}>
          {CATEGORIES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Quantity"
        htmlFor="item-quantity"
        hint={single ? 'One item, like a single tent. Give it an asset tag so you can tell it apart.' : 'A set of the same thing, like mess kits.'}
      >
        <input id="item-quantity" inputMode="numeric" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
      </Field>
      <Field label="Asset tag (optional)" htmlFor="item-tag" hint="For example T-4 or a number on a sticker.">
        <input id="item-tag" maxLength={40} value={form.tag} onChange={(e) => set('tag', e.target.value)} />
      </Field>
      <Field label="Location" htmlFor="item-location" hint="Where it is kept, like the trailer or the closet.">
        <input id="item-location" maxLength={120} value={form.location} onChange={(e) => set('location', e.target.value)} />
      </Field>
      <Field label="Condition" htmlFor="item-condition">
        <select id="item-condition" value={form.condition} onChange={(e) => set('condition', e.target.value as ItemCondition)}>
          {CONDITIONS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Purchase date (optional)" htmlFor="item-bought">
        <input id="item-bought" type="date" value={form.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} />
      </Field>
      <Field label="Cost in dollars (optional)" htmlFor="item-cost" hint="What you paid for the whole quantity.">
        <input id="item-cost" inputMode="decimal" value={form.cost} onChange={(e) => set('cost', e.target.value)} />
      </Field>
      <Field label="Notes" htmlFor="item-notes">
        <textarea id="item-notes" maxLength={1000} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <PhotoField id="item-photo" label={item ? 'Replace the photo (optional)' : undefined} disabled={busy} onFile={setPhoto} />
      <Notice kind="error">{error}</Notice>
      <div className="row">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Saving…' : item ? 'Save changes' : 'Add item'}
        </button>
        <button className="btn quiet" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
