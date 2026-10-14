import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { PathTemplate } from './types';

type TemplateInput = Pick<PathTemplate, 'name' | 'description' | 'goalAwardId' | 'items'>;

export function templateRef(troopId: string, id: string) {
  return doc(db, `troops/${troopId}/pathTemplates/${id}`);
}

/** Templates are never deleted: archiving hides one from the picker and keeps it here. */
export async function setArchived(troopId: string, id: string, archived: boolean): Promise<void> {
  await setDoc(templateRef(troopId, id), { archived, updatedAt: serverTimestamp() }, { merge: true });
}

/** Creates a template, or overwrites the one with this id. Pass the original author when editing. */
export async function saveTemplate(
  troopId: string,
  memberId: string,
  input: TemplateInput,
  id?: string,
  archived = false,
): Promise<void> {
  const ref = id ? templateRef(troopId, id) : doc(db, `troops/${troopId}/pathTemplates`);
  await setDoc(ref, {
    name: input.name.trim(),
    description: input.description.trim(),
    goalAwardId: input.goalAwardId,
    items: input.items,
    createdByMemberId: memberId,
    updatedAt: serverTimestamp(),
    archived,
  });
}
