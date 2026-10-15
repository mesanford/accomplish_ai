import { PageHeader } from '../components/ui';
import { PRIVACY_ADDRESS, PRIVACY_EFFECTIVE, PRIVACY_EMAIL, PRIVACY_OPERATOR, PRIVACY_PHONE, PRIVACY_SECTIONS } from '../lib/privacy';

/** The public privacy policy. Anyone can read it without signing in. */
export function PrivacyPage() {
  return (
    <article className="stack policy" aria-labelledby="privacy-title">
      <PageHeader eyebrow="Forthright" title="Privacy policy" />
      <p className="muted small">Effective {PRIVACY_EFFECTIVE}</p>
      <nav aria-label="On this page" className="policy-toc">
        {PRIVACY_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.heading}
          </a>
        ))}
      </nav>
      {PRIVACY_SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="stack">
          <h2>{s.heading}</h2>
          {s.items ? (
            <ul className="policy-list">
              {s.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {(s.paragraphs ?? []).map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
      <section className="card" aria-label="Contact">
        <h2>Questions or requests</h2>
        {PRIVACY_EMAIL ? (
          <p>
            Email {PRIVACY_OPERATOR} at <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. For a deletion request,
            tell us your troop and the person the request is about.
          </p>
        ) : (
          <p>Contact {PRIVACY_OPERATOR} through your troop leader. A direct privacy email address will be listed here.</p>
        )}
        <p className="muted small">
          By mail: {PRIVACY_OPERATOR}, {PRIVACY_ADDRESS}
          {PRIVACY_PHONE ? `. By phone: ${PRIVACY_PHONE}` : ''}
        </p>
      </section>
    </article>
  );
}
