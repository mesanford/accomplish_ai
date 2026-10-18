import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../lib/api';
import { IOS_INSTALL_STEPS, type PushState } from '../lib/installHint';
import { dismissInstall, promptInstall, useInstallHint, usePwa } from '../lib/pwa';
import { deviceHasToken, disablePush, enablePush, pushConfigured, readPushState } from '../lib/push';
import { Notice } from './ui';
import { HelpTip } from './HelpTip';

const PUSH_NOTES: Partial<Record<PushState, string>> = {
  'needs-install': `On an iPhone or iPad, install Forthright first. ${IOS_INSTALL_STEPS} Then open it from your home screen and turn this on.`,
  blocked: 'Notifications are blocked for Forthright in this browser. Allow them in the browser settings to turn this on.',
  off: 'A short note with a link, never a last name, health or money detail. It follows your email choices above.',
};

/** "Install Forthright" and "Notify me on this device". Both belong to this device, not the account, so a phone can
 * be on while a laptop is off. Pushes follow the same email choices above (blue cards and announcements). */
export function DeviceSettings() {
  const hint = useInstallHint();
  const { registration } = usePwa();
  const [push, setPush] = useState<PushState>('hidden');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    readPushState(deviceHasToken()).then(setPush, () => setPush('hidden'));
  }, []);
  // The worker registers a moment after the page loads, so look again once it has.
  useEffect(refresh, [refresh, registration]);

  async function toggle(on: boolean) {
    setBusy(true);
    setError('');
    try {
      await (on ? enablePush() : disablePush());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const showPush = pushConfigured && push !== 'hidden';
  const showInstall = hint === 'prompt' || hint === 'ios';
  if (!showInstall && !showPush) {
    return null;
  }
  return (
    <section className="card stack" aria-labelledby="device-heading">
      <h2 id="device-heading">
        This device
        <HelpTip topic="installApp" />
      </h2>
      {hint === 'prompt' ? (
        <div className="row">
          <button type="button" className="btn" onClick={promptInstall}>
            Install Forthright
          </button>
          <button type="button" className="btn quiet small" onClick={dismissInstall}>
            Not now
          </button>
        </div>
      ) : null}
      {hint === 'ios' ? (
        <>
          <p className="small">
            <strong>Install Forthright.</strong> {IOS_INSTALL_STEPS}
          </p>
          <button type="button" className="btn quiet small" onClick={dismissInstall}>
            Hide this
          </button>
        </>
      ) : null}
      {showInstall ? (
        <p className="small muted">It opens like an app, loads faster and keeps working when the signal is poor.</p>
      ) : null}
      {showPush ? (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={push === 'on'}
              disabled={busy || push === 'blocked' || push === 'needs-install'}
              onChange={(e) => toggle(e.target.checked)}
            />
            Notify me on this device
          </label>
          <p className="small muted">
            {PUSH_NOTES[push] ?? PUSH_NOTES.off}
          </p>
        </>
      ) : null}
      <Notice kind="error">{error}</Notice>
    </section>
  );
}
