import { useState } from 'react';
import { errorMessage } from '../../lib/api';

/** Runs one save or call, keeping its busy flag, error and "Saved." message for the form to show. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function run(fn: () => Promise<unknown>, done = 'Saved.'): Promise<boolean> {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      setMessage(done);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, message, run, setError };
}
