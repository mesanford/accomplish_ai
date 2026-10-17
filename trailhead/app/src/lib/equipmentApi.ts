import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

async function call<In, Out>(name: string, data: In): Promise<Out> {
  const result = await httpsCallable<In, Out>(functions, name)(data);
  return result.data;
}

export interface CheckOutForm {
  troopId: string;
  itemId: string;
  quantity: number;
  /** Exactly one of memberId and eventId. */
  memberId?: string;
  eventId?: string;
  dueDate: string;
  note?: string;
}

export const checkOutItem = (form: CheckOutForm) => call<CheckOutForm, { checkoutId: string }>('check_out_item', form);

export interface CheckInForm {
  troopId: string;
  checkoutId: string;
  condition: 'good' | 'needs_repair' | 'retired';
  note?: string;
}

export const checkInItem = (form: CheckInForm) => call<CheckInForm, { returned: boolean }>('check_in_item', form);

export interface RequestForm {
  troopId: string;
  itemId: string;
  eventId: string;
  quantity: number;
  note?: string;
}

export const requestItem = (form: RequestForm) => call<RequestForm, { requestId: string }>('request_item', form);

export interface DecideForm {
  troopId: string;
  requestId: string;
  approve: boolean;
  dueDate?: string;
  note?: string;
}

export const decideRequest = (form: DecideForm) =>
  call<DecideForm, { approved: boolean; checkoutId: string | null }>('decide_request', form);

/** Add or replace an item's photo (base64 of a JPEG, PNG or WebP), or remove it. */
export const setItemPhoto = (troopId: string, itemId: string, photo: string | null) =>
  call<{ troopId: string; itemId: string; photo?: string; remove?: boolean }, { photoPath: string | null }>(
    'set_item_photo',
    photo ? { troopId, itemId, photo } : { troopId, itemId, remove: true },
  );

export const setScoutQuartermaster = (troopId: string, memberId: string, quartermaster: boolean) =>
  call<{ troopId: string; memberId: string; quartermaster: boolean }, { roles: string[] }>('set_scout_quartermaster', {
    troopId,
    memberId,
    quartermaster,
  });
