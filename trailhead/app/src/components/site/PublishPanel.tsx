import type { EditDraft, SiteDraft } from '../../lib/site';
import { siteAddress, slugProblem } from '../../lib/site';
import type { PublishResult } from '../../lib/siteApi';
import type { Troop } from '../../lib/types';
import { HelpTip } from '../HelpTip';
import { Field, Notice } from '../ui';

interface Props {
  draft: SiteDraft;
  onChange: EditDraft;
  site: Troop['site'];
  busy: boolean;
  dirty: boolean;
  result: PublishResult | null;
  message: { kind: 'ok' | 'error'; text: string } | null;
  onSave: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
}

/** The web address, the draft and publish buttons, and what happened on the last publish. */
export function PublishPanel(props: Props) {
  const { draft, onChange, site, busy, dirty, result, message } = props;
  const origin = window.location.origin;
  const problem = draft.slug ? slugProblem(draft.slug) : null;
  const live = site?.published && site.slug;

  return (
    <section className="card">
      <h2>
        Web address and publishing
        <HelpTip topic="publishSite" />
      </h2>
      <Field label="Web address" htmlFor="site-slug" hint="Short, lowercase words with dashes, like troop-101.">
        <input
          id="site-slug"
          maxLength={40}
          value={draft.slug}
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => onChange({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
        />
      </Field>
      <p className="small">
        Your site's address: <span className="mono">{siteAddress(origin, draft.slug)}</span>
        <HelpTip topic="siteAddress" label="choosing a short link" />
      </p>
      <Notice kind="error">{problem}</Notice>
      {live ? (
        <p className="small">
          Live now at <a href={`/s/${site.slug}`}>{siteAddress(origin, site.slug ?? '')}</a>. Publish again to update it.
        </p>
      ) : (
        <p className="muted small">Not published. Only leaders can see this draft.</p>
      )}
      <div className="row">
        <button type="button" className="btn quiet" disabled={busy} onClick={props.onSave}>
          {dirty ? 'Save draft' : 'Draft saved'}
        </button>
        <button type="button" className="btn" disabled={busy || Boolean(problem)} onClick={props.onPublish}>
          {busy ? 'Working…' : 'Publish'}
        </button>
        {live ? (
          <button type="button" className="btn danger" disabled={busy} onClick={props.onUnpublish}>
            Unpublish
          </button>
        ) : null}
      </div>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      {result ? (
        <div className="stack">
          <Notice kind="ok">
            Published. Your site is at <a href={result.url}>{`${origin}${result.url}`}</a>
          </Notice>
          {result.leftOut.length > 0 ? (
            <div className="notice warn" role="status">
              <p>
                {result.leftOut.length === 1 ? '1 photo was' : `${result.leftOut.length} photos were`} left out:
              </p>
              <ul>
                {result.leftOut.map((p) => (
                  <li key={p.path}>
                    {p.caption || 'Untitled photo'}: {p.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
