import { findRequirement, type RequirementsDoc } from './requirements';

const MAX_TEXT = 90;

/** Cut long requirement text at a word boundary, ending with an ellipsis. */
export function shortenText(text: string, max = MAX_TEXT): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) {
    return t;
  }
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

/** A readable name for the chosen requirement: its number and text, or just the id when no text is available. */
export function selectedRequirementLabel(doc: RequirementsDoc | null | undefined, reqId: string): string {
  const id = reqId.trim();
  const req = findRequirement(doc, id);
  const text = req ? shortenText(req.text) : '';
  if (!req || !text) {
    return id;
  }
  return `${req.id}. ${text}`;
}
