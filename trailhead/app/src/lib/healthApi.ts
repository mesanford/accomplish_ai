import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { PartKey } from './healthForm';

export interface RecordHealthForm {
  troopId: string;
  memberId: string;
  part: PartKey;
  /** YYYY-MM-DD, the date on the form. */
  date: string;
}

/** Save one health form date. The server checks who may and stamps who recorded it and when. */
export async function recordHealthForm(form: RecordHealthForm): Promise<void> {
  await httpsCallable<RecordHealthForm, { recorded: boolean }>(functions, 'record_health_form')(form);
}
