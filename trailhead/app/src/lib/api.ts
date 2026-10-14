import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { CustomRequirement, Feasibility, PathItemDoc } from './types';

async function call<In, Out>(name: string, data: In): Promise<Out> {
  const result = await httpsCallable<In, Out>(functions, name)(data);
  return result.data;
}

/** A message safe to show a person: the server's own wording, or a plain fallback. */
export function errorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    if (err.code === 'functions/internal' || err.code === 'functions/unavailable') {
      return "Something went wrong on our side. Try again in a moment.";
    }
    return err.message.replace(/^Firebase: /, '');
  }
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}

export interface TroopForm {
  name: string;
  unitNumber: string;
  council: string;
  displayName: string;
  yptExpiresAt: string;
}

export const createTroop = (form: TroopForm) => call<TroopForm, { troopId: string }>('create_troop', form);

export interface InviteForm {
  troopId: string;
  role: string;
  note?: string;
  scoutIds?: string[];
  scoutMemberId?: string;
}

export const createInvite = (form: InviteForm) =>
  call<InviteForm, { code: string; path: string; expiresAt: string }>('create_invite', form);

export interface JoinForm {
  troopId: string;
  code: string;
  displayName: string;
  yptExpiresAt?: string;
}

export const acceptInvite = (form: JoinForm) => call<JoinForm, { troopId: string }>('accept_invite', form);

export interface ScoutForm {
  troopId: string;
  displayName: string;
  birthYear: number;
  birthMonth: number;
  currentRankId: string;
}

export const addScout = (form: ScoutForm) => call<ScoutForm, { scoutId: string }>('add_scout', form);

export interface MessageForm {
  troopId: string;
  body: string;
  threadId?: string;
  recipientMemberIds?: string[];
}

export const sendMessage = (form: MessageForm) =>
  call<MessageForm, { threadId: string; addedMemberIds: string[] }>('send_message', form);

export interface PreviewForm {
  troopId: string;
  path: { scoutId: string; goalAwardId: string; targetDate?: string; items: PathItemDoc[] };
}

export const previewPath = (form: PreviewForm) => call<PreviewForm, Feasibility>('check_path_preview', form);

export interface CustomAwardForm {
  troopId: string;
  awardId?: string;
  name: string;
  description: string;
  note?: string;
  /** New rows have no id yet; the server assigns one. */
  requirements: (Omit<CustomRequirement, 'id'> & { id?: string })[];
}

export const saveCustomAward = (form: CustomAwardForm) =>
  call<CustomAwardForm, { awardId: string; versionId: string; newVersion: boolean }>('save_custom_award', form);

export const archiveCustomAward = (form: { troopId: string; awardId: string; archived: boolean }) =>
  call<typeof form, { archived: boolean }>('archive_custom_award', form);

export interface MoveSummary {
  fromVersionId: string;
  toVersionId: string;
  carried: string[];
  needsReview: string[];
  dropped: string[];
}

export interface MoveForm {
  troopId: string;
  scoutId: string;
  awardId: string;
  versionId: string;
}

export const moveToCustomVersion = (form: MoveForm) => call<MoveForm, MoveSummary>('move_to_custom_version', form);
