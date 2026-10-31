import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { DRIVE_CREDIT, estimateDriveTime, isMapsLink } from '../../lib/driveTime';
import { minutesText } from '../../lib/planForms';
import { Field, Notice } from '../ui';

/** The Google Maps link on a research card, with a button that fills the drive time from the troop's meeting place. */
export function DriveEstimate({
  id,
  troopId,
  planId,
  mapsUrl,
  onMapsUrl,
  onEstimate,
}: {
  id: string;
  troopId: string;
  planId: string;
  mapsUrl: string;
  onMapsUrl: (url: string) => void;
  onEstimate: (minutes: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  async function estimate() {
    if (!isMapsLink(mapsUrl)) {
      setError('Paste a Google Maps link, such as one from Share in Google Maps.');
      return;
    }
    setBusy(true);
    setError('');
    setResult('');
    try {
      const { minutes, miles } = await estimateDriveTime(troopId, planId, mapsUrl);
      onEstimate(minutes);
      setResult(`About ${minutesText(minutes)} (${miles} miles) from the troop's meeting place.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <Field label="Google Maps link" htmlFor={`${id}-maps`} hint="Paste it from Share in Google Maps.">
          <input id={`${id}-maps`} type="url" value={mapsUrl} maxLength={500} onChange={(e) => onMapsUrl(e.target.value)} />
        </Field>
        <button className="btn secondary small" type="button" disabled={busy || !mapsUrl.trim()} onClick={estimate}>
          {busy ? 'Working it out…' : 'Estimate drive time'}
        </button>
      </div>
      {result ? (
        <p className="small" role="status">
          {result} <span className="muted">{DRIVE_CREDIT}. No live traffic.</span>
        </p>
      ) : null}
      <Notice kind="error">{error}</Notice>
    </div>
  );
}
