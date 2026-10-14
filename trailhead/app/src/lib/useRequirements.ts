import { useEffect, useState } from 'react';
import { loadRequirements, type RequirementsDoc } from './requirements';

export interface RequirementsState {
  doc: RequirementsDoc | null;
  loading: boolean;
  /** True once we know there is no requirement text for this award. */
  missing: boolean;
}

/** Load an award's requirements. Pass enabled=false to wait (for example until a popover is opened). */
export function useRequirements(awardId: string | undefined, enabled = true): RequirementsState {
  const [state, setState] = useState<RequirementsState & { id?: string }>({ doc: null, loading: false, missing: false });
  useEffect(() => {
    if (!awardId || !enabled) {
      return undefined;
    }
    let live = true;
    loadRequirements(awardId).then((doc) => {
      if (live) {
        setState({ id: awardId, doc, loading: false, missing: doc === null });
      }
    });
    return () => {
      live = false;
    };
  }, [awardId, enabled]);
  if (!awardId || !enabled) {
    return { doc: null, loading: false, missing: false };
  }
  if (state.id !== awardId) {
    return { doc: null, loading: true, missing: false };
  }
  return { doc: state.doc, loading: false, missing: state.missing };
}
