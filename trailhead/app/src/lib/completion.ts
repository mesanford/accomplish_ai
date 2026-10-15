import { plural } from './plural';
import { flatten, isSignable, normalizeReqId, type RequirementsDoc } from './requirements';

export interface SignedCount {
  signed: number;
  /** How many requirements the badge has to sign; null when its requirement text isn't available. */
  total: number | null;
}

/** How many of a badge's signable requirements are signed. Falls back to the signed ids when there is no text. */
export function signedCount(
  doc: RequirementsDoc | null,
  statuses: Record<string, string>,
  signedIds: string[],
): SignedCount {
  if (!doc) {
    return { signed: signedIds.length, total: null };
  }
  const signable = flatten(doc.requirements).filter(isSignable);
  const signed = signable.filter((r) => statuses[normalizeReqId(r.id)] === 'signed').length;
  return { signed, total: signable.length };
}

/**
 * What to ask before marking a badge complete, or null when every requirement is signed.
 * Completing early stays allowed, because some requirements are options and a Scout does only one.
 */
export function incompleteWarning(name: string, { signed, total }: SignedCount): string | null {
  if (total !== null && signed >= total) {
    return null;
  }
  if (signed === 0) {
    return `No requirements are signed. Mark ${name} complete anyway?`;
  }
  if (total === null) {
    return `Only ${plural(signed, 'requirement')} ${signed === 1 ? 'is' : 'are'} signed. Mark ${name} complete anyway?`;
  }
  return `Only ${signed} of ${plural(total, 'requirement')} ${total === 1 ? 'is' : 'are'} signed. Mark ${name} complete anyway?`;
}
