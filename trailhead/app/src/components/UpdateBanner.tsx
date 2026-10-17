import { applyUpdate, usePwa } from '../lib/pwa';

/** Shown when a new release has been downloaded in the background. Nothing changes until the person taps Reload, so
 * a form in progress is never lost. */
export function UpdateBanner() {
  const { updateReady } = usePwa();
  if (!updateReady) {
    return null;
  }
  return (
    <div className="update-banner" role="status">
      <span>A new version is ready.</span>
      <button type="button" className="btn small" onClick={applyUpdate}>
        Reload
      </button>
    </div>
  );
}
