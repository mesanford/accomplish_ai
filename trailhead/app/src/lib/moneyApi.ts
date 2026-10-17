import { httpsCallable } from 'firebase/functions';
import type { AccountSettings, CreditRule, SalesRow } from './campaigns';
import { functions } from './firebase';
import type { PayMethod } from './ledger';

/** Server functions for Scout accounts. Every money write goes through these; the rules refuse client writes. */

async function call<In, Out>(name: string, data: In): Promise<Out> {
  const result = await httpsCallable<In, Out>(functions, name)(data);
  return result.data;
}

export type PayFrom = 'credit' | 'open';

export interface ChargeForm {
  troopId: string;
  amountCents: number;
  description: string;
  payFrom: PayFrom;
  scoutIds?: string[];
  everyone?: boolean;
  date?: string;
}

export interface ChargeResult {
  posted: number;
  paidFromCredit: number;
  open: number;
  skipped: string[];
  entryIds: string[];
}

export const postCharge = (form: ChargeForm) => call<ChargeForm, ChargeResult>('post_charge', form);

export type AttendeesForm = Omit<ChargeForm, 'scoutIds' | 'everyone'> & { eventId: string };

export const chargeAttendees = (form: AttendeesForm) => call<AttendeesForm, ChargeResult>('charge_attendees', form);

export interface PaymentForm {
  troopId: string;
  scoutId: string;
  amountCents: number;
  method: PayMethod;
  chargeIds: string[];
  note?: string;
  date?: string;
}

export const recordPayment = (form: PaymentForm) =>
  call<PaymentForm, { entryId: string; coveredCents: number }>('record_payment', form);

export const reverseEntry = (form: { troopId: string; entryId: string; reason: string }) =>
  call<typeof form, { entryId: string }>('reverse_entry', form);

export interface SettleForm {
  troopId: string;
  scoutId: string;
  to: 'general' | 'sibling';
  siblingId?: string;
}

export const settleAccount = (form: SettleForm) => call<SettleForm, { movedCents: number }>('settle_account', form);

export interface CampaignForm {
  troopId: string;
  campaignId?: string;
  name: string;
  rule?: CreditRule;
  sales: Record<string, SalesRow>;
}

export const saveCampaign = (form: CampaignForm) =>
  call<CampaignForm, { campaignId: string; totals: { salesCents: number; creditCents: number; troopCents: number } }>(
    'save_campaign',
    form,
  );

export const postSales = (troopId: string, campaignId: string) =>
  call<{ troopId: string; campaignId: string }, { credited: number; creditCents: number }>('post_sales', {
    troopId,
    campaignId,
  });

export const saveAccountSettings = (form: AccountSettings & { troopId: string }) =>
  call<typeof form, AccountSettings>('save_account_settings', form);
