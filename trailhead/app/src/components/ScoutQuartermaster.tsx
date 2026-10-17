import { useState } from 'react';
import { errorMessage } from '../lib/api';
import { setScoutQuartermaster } from '../lib/equipmentApi';
import { useTroop } from '../lib/troop';
import type { Member } from '../lib/types';
import { Notice } from './ui';

/** A leader makes a Scout the quartermaster. Only for Scouts 13 or older who have their own login. The role grants
 * nothing but managing the troop's gear. */
export function ScoutQuartermaster({ scout }: { scout: Member }) {
  const { troopId } = useTroop();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!scout.uid) {
    return null;
  }
  const on = (scout.roles ?? []).includes('quartermaster');
  async function toggle() {
    setBusy(true);
    setError('');
    try {
      await setScoutQuartermaster(troopId, scout.id, !on);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="btn quiet small" disabled={busy} onClick={toggle}>
        {on ? `Remove ${scout.displayName} as quartermaster` : `Make ${scout.displayName} quartermaster`}
      </button>
      <Notice kind="error">{error}</Notice>
    </>
  );
}
