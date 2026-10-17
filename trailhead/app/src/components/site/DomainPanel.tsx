import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { addDomain, checkDomain, cleanDomain, domainProblem, PROGRESS, progressIndex, removeDomain, type TroopDomain } from '../../lib/domains';
import { errorMessage } from '../../lib/api';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/hooks';
import type { Troop } from '../../lib/types';
import { Field, Notice } from '../ui';

function Records({ domain }: { domain: TroopDomain }) {
  if (domain.records.length === 0) {
    return null;
  }
  return (
    <div className="table-box">
      <table>
        <caption className="sr-only">DNS records to set at your registrar</caption>
        <thead>
          <tr>
            <th scope="col">Do this</th>
            <th scope="col">Type</th>
            <th scope="col">Name (Host)</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {domain.records.map((r) => (
            <tr key={`${r.action}-${r.type}-${r.name}-${r.value}`}>
              <td>{r.action === 'remove' ? 'Delete' : 'Add'}</td>
              <td className="mono">{r.type}</td>
              <td className="mono">{r.label === '@' ? `@ (${r.name})` : r.label}</td>
              <td className="mono">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Progress({ domain }: { domain: TroopDomain }) {
  const at = progressIndex(domain.status);
  return (
    <ol className="small">
      {PROGRESS.map((p, i) => (
        <li key={p.status} aria-current={i === at ? 'step' : undefined}>
          {i < at || domain.status === 'live' ? '✓ ' : ''}
          {i === at ? <strong>{p.label}</strong> : p.label}
        </li>
      ))}
    </ol>
  );
}

/** "Use your own domain": enter a domain, see the DNS records to add, and follow it until it is live. */
export function DomainPanel({ troopId, site }: { troopId: string; site: Troop['site'] }) {
  const ref = useMemo(() => doc(db, 'troops', troopId, 'site', 'domain'), [troopId]);
  const { data: domain } = useDoc<TroopDomain>(ref);
  const [text, setText] = useState('');
  const [www, setWww] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const problem = domainProblem(text);
  const published = Boolean(site?.published && site.slug);

  async function run(action: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(ok ? { kind: 'ok', text: ok } : null);
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="own-domain">
      <h2 id="own-domain">Use your own domain</h2>
      {domain ? (
        <div className="stack">
          <p>
            <strong>{domain.host}</strong>
            {domain.wwwHost ? ` and ${domain.wwwHost}` : ''}
          </p>
          <Notice kind={domain.status === 'failed' ? 'error' : domain.status === 'live' ? 'ok' : 'warn'}>
            <strong>{domain.headline}.</strong> {domain.detail}
          </Notice>
          {domain.status !== 'failed' ? <Progress domain={domain} /> : null}
          {domain.records.length > 0 ? (
            <>
              <h3>Add these records at your registrar</h3>
              <ol>
                {domain.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <Records domain={domain} />
            </>
          ) : null}
          {domain.status === 'live' ? (
            <p>
              <a href={`https://${domain.host}`}>Open https://{domain.host}</a>
            </p>
          ) : null}
          <div className="row">
            {domain.status !== 'failed' && domain.status !== 'live' ? (
              <button type="button" className="btn" disabled={busy} onClick={() => run(() => checkDomain(troopId))}>
                {busy ? 'Checking…' : 'Check again'}
              </button>
            ) : null}
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => run(() => removeDomain(troopId), 'Your domain was disconnected.')}
            >
              Remove this domain
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p className="muted small">
            Show your troop website at an address you own, like troop101springfield.org. You buy the domain from a
            registrar such as GoDaddy or Namecheap (about $15 a year). We'll give you the exact settings to add there.
            Only one domain per troop.
          </p>
          {published ? null : <Notice kind="warn">Publish your website first. Your domain shows the published site.</Notice>}
          <Field label="Your domain" htmlFor="own-domain-input" hint="Just the domain, with no https:// or page.">
            <input
              id="own-domain-input"
              value={text}
              autoCapitalize="off"
              spellCheck={false}
              placeholder="troop101springfield.org"
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <Notice kind="error">{problem}</Notice>
          <label className="check">
            <input type="checkbox" checked={www} onChange={(e) => setWww(e.target.checked)} /> Also send www.
            {cleanDomain(text) || 'your-domain'} to the same site
          </label>
          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={busy || !published || !text.trim() || Boolean(problem)}
              onClick={() => run(() => addDomain(troopId, text, www))}
            >
              {busy ? 'Working…' : 'Use this domain'}
            </button>
          </div>
        </div>
      )}
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
    </section>
  );
}
