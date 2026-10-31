// A valid first version of a plan's core form, for a plan started from a chosen weekend.
import type { CoreForm } from './plansApi';
import { emptySegment } from './planForms';
import type { PlanKind } from './plans';

const LOG_KIND: Record<PlanKind, 'campout' | 'service' | 'hike' | 'other'> = {
  campout: 'campout',
  service: 'service',
  highAdventure: 'campout',
  other: 'other',
};

/** The core form for a brand new plan with its dates set (the end is dropped for a one-day plan). */
export function coreWithDates(title: string, kind: PlanKind, start: string, end: string | null): CoreForm {
  return {
    title,
    kind,
    targetWindow: { from: null, to: null },
    headcount: { scouts: 0, adults: 0 },
    familyNotes: '',
    packingList: '',
    segments: [{ ...emptySegment(), logKind: LOG_KIND[kind], start, endDate: end && end !== start ? end : null }],
  };
}

/** Read ?start=&end= (YYYY-MM-DD) from a URL; null if the start is missing or not a date. */
export function datesFromParams(params: URLSearchParams): { start: string; end: string | null } | null {
  const ok = (v: string | null): v is string => v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const start = params.get('start');
  const end = params.get('end');
  if (!ok(start)) {
    return null;
  }
  return { start, end: ok(end) && end >= start ? end : null };
}
