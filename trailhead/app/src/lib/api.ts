import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { PilotForm } from './pilotForm';
import type { CustomRequirement, Feasibility, PathItemDoc } from './types';

async function call<In, Out>(name: string, data: In): Promise<Out> {
  const result = await httpsCallable<In, Out>(functions, name)(data);
  return result.data;
}

export { errorMessage, isPermissionDenied } from './errors';

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
  /** A website family (see Recruiting): the parent may have no Scouts on the roster yet. */
  leadId?: string;
}

export const createInvite = (form: InviteForm) =>
  call<InviteForm, { code: string; path: string; expiresAt: string }>('create_invite', form);

export interface JoinForm {
  troopId: string;
  code: string;
  displayName: string;
  yptExpiresAt?: string;
  /** A parent agrees to the notice. The server refuses a parent invite without it. */
  consent?: boolean;
  consentVersion?: string;
}

export const acceptInvite = (form: JoinForm) => call<JoinForm, { troopId: string }>('accept_invite', form);

export const getInviteNotice = (troopId: string, code: string) =>
  call<{ troopId: string; code: string }, { troopName: string; role: string; alreadyMember: boolean }>('invite_notice', {
    troopId,
    code,
  });

export const setEmailNotifications = (enabled: boolean) =>
  call<{ enabled: boolean }, { enabled: boolean }>('set_email_notifications', { enabled });

/** Save or remove this device's push token. Only these functions write device records. */
export const registerPushDevice = (token: string) => call<{ token: string }, { deviceId: string }>('register_push_device', { token });
export const removePushDevice = (token: string) => call<{ token: string }, { removed: boolean }>('remove_push_device', { token });

export const withdrawParentConsent =(troopId: string, scoutId: string) =>
  call<{ troopId: string; scoutId: string }, { ok: boolean }>('withdraw_parent_consent', { troopId, scoutId });

export interface ConsentAnswer {
  consent: boolean;
  consentVersion?: string;
}

/** A leader or advancement chair says an existing Scout is their child. */
export const linkSelfAsParent = (troopId: string, scoutId: string, agree: ConsentAnswer) =>
  call<{ troopId: string; scoutId: string } & ConsentAnswer, { ok: boolean }>('link_self_as_parent', { troopId, scoutId, ...agree });

/** A parent a leader linked to Scouts agrees to the notice (consent true) or declines (false). */
export const answerPendingConsent = (troopId: string, agree: ConsentAnswer) =>
  call<{ troopId: string } & ConsentAnswer, { ok: boolean }>('answer_pending_consent', { troopId, ...agree });

export interface RolesForm {
  troopId: string;
  memberId: string;
  roles: string[];
  /** The Scouts to link when the person is a parent. */
  scoutIds?: string[];
  yptExpiresAt?: string;
}

export const setMemberRoles = (form: RolesForm) =>
  call<RolesForm, { roles: string[]; pendingScoutIds: string[] }>('set_member_roles', form);

export interface ScoutForm {
  troopId: string;
  displayName: string;
  birthYear: number;
  birthMonth: number;
  currentRankId: string;
  /** A leader confirms the family's permission for a Scout who may be under 13. */
  leaderConfirmed?: boolean;
  /** A parent adding their own child agrees to the notice. */
  consent?: boolean;
  consentVersion?: string;
  /** A leader says this Scout is their own child, so they are linked as a parent and agree to the notice. */
  isMyChild?: boolean;
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

export interface DraftForm {
  troopId: string;
  scoutId: string;
  goalAwardId: string;
  targetDate?: string;
  request: string;
}

export interface DraftResult {
  items: { awardId: string; plannedStart: string | null; plannedEnd: string | null }[];
  explanation: string;
  feasibility: Feasibility;
  repaired: boolean;
}

export const draftPath = (form: DraftForm) => call<DraftForm, DraftResult>('draft_path', form);

export const createScoutbookReport = (troopId: string) =>
  call<{ troopId: string }, { created: boolean; reportId?: string; rowCount?: number; message?: string }>(
    'create_scoutbook_report',
    { troopId },
  );

export interface EnteredForm {
  troopId: string;
  reportId: string;
  scoutId: string;
  entered: boolean;
}

export const setScoutbookEntered = (form: EnteredForm) => call<EnteredForm, { ok: boolean }>('set_scoutbook_entered', form);
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

export interface PriorForm {
  troopId: string;
  scoutId: string;
  ranks: Record<string, string>;
  badges: { awardId: string; date: string }[];
  partials: { awardId: string; date: string; requirements: string[] }[];
}

export const recordPriorAdvancement = (form: PriorForm) =>
  call<PriorForm, { ranks: number; badges: number; skipped: string[] }>('record_prior_advancement', form);

export interface PaperCardForm {
  troopId: string;
  scoutId: string;
  awardId: string;
  counselorName: string;
  counselorEmail?: string;
  startedOn: string;
  requirements: { reqId: string; date: string }[];
  completedOn?: string;
}

export const recordPaperBlueCard = (form: PaperCardForm) =>
  call<PaperCardForm, { cardId: string; requirements: number; complete: boolean }>('record_paper_blue_card', form);

export interface InterestForm {
  name: string;
  email: string;
  phone: string;
  scoutAge: string;
  message: string;
  /** Hidden field that people leave empty; bots fill it in. */
  website: string;
}

export const submitInterest = (slug: string, form: InterestForm) =>
  call<{ slug: string; form: InterestForm }, { ok: boolean }>('submit_interest', { slug, form });

export const requestPilot = (form: PilotForm) => call<{ form: PilotForm }, { ok: boolean }>('request_pilot', { form });

export interface RemoveScoutForm {
  troopId: string;
  scoutId: string;
  /** The server refuses unless this is true; the page asks the person to confirm first. */
  confirm: true;
}

export const removeScout = (form: RemoveScoutForm) =>
  call<RemoveScoutForm, { removed: boolean; documents: number; files: number; photosTakenDown: number }>(
    'remove_scout',
    form,
  );

export const deleteAccount = () =>
  call<{ confirm: true }, { deleted: boolean; troops: number }>('delete_account', { confirm: true });

/** Note that someone used this troop today. The server writes at most once a day per troop. */
export const recordActivity = (troopId: string) =>
  call<{ troopId: string }, { recorded: boolean }>('record_activity', { troopId });

export interface MarkLeftForm {
  troopId: string;
  scoutId: string;
  /** true: the Scout has left the troop; false: undo it. */
  left: boolean;
}

export const markScoutLeft = (form: MarkLeftForm) =>
  call<MarkLeftForm, { left: boolean; leftAt: string | null }>('mark_scout_left', form);

export const deleteLead = (troopId: string, leadId: string) =>
  call<{ troopId: string; leadId: string }, { deleted: boolean }>('delete_lead', { troopId, leadId });

export const setEmailAnnouncements = (enabled: boolean) =>
  call<{ enabled: boolean }, { enabled: boolean }>('set_email_announcements', { enabled });

export interface AnnouncementContent {
  kind: 'announcement' | 'newsletter';
  title: string;
  body: string;
  sections?: { heading: string; text: string }[];
  eventIds?: string[];
  pinned: boolean;
}

export interface PostAnnouncementForm extends AnnouncementContent {
  troopId: string;
  audience: { type: string; scoutIds?: string[]; eventId?: string };
  /** Also email the adults in the audience. Never sent again when the post is edited. */
  email: boolean;
}

export const postAnnouncement = (form: PostAnnouncementForm) =>
  call<PostAnnouncementForm, { announcementId: string; emailed: number; emailSkipped: number }>('post_announcement', form);

export const editAnnouncement = (troopId: string, announcementId: string, content: AnnouncementContent) =>
  call<AnnouncementContent & { troopId: string; announcementId: string }, { announcementId: string }>('edit_announcement', {
    troopId,
    announcementId,
    ...content,
  });

export const deleteAnnouncement = (troopId: string, announcementId: string) =>
  call<{ troopId: string; announcementId: string }, { deleted: boolean }>('delete_announcement', { troopId, announcementId });
