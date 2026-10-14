import { type ReactNode, useState } from 'react';
import { safeUrl, paragraphs } from '../../lib/siteTheme';
import type { PublicSite } from '../../lib/types';
import { formatDate } from '../ui';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="site-section" aria-labelledby={`${id}-title`} id={id}>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </section>
  );
}

export function About({ text }: { text?: string }) {
  const parts = paragraphs(text);
  if (parts.length === 0) {
    return null;
  }
  return (
    <Section id="about" title="About our troop">
      {parts.map((p) => (
        <p key={p} style={{ whiteSpace: 'pre-line' }}>
          {p}
        </p>
      ))}
    </Section>
  );
}

export function Meeting({ meeting }: { meeting: PublicSite['meeting'] }) {
  if (!meeting || (!meeting.schedule && !meeting.place)) {
    return null;
  }
  const map = safeUrl(meeting.mapUrl);
  return (
    <Section id="meetings" title="When and where we meet">
      <div className="site-card">
        {meeting.schedule ? <p className="site-strong">{meeting.schedule}</p> : null}
        {meeting.place ? <p>{meeting.place}</p> : null}
        {meeting.address ? <p className="site-muted">{meeting.address}</p> : null}
        {map ? (
          <p>
            <a href={map} target="_blank" rel="noopener noreferrer">
              Open in maps<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        ) : null}
      </div>
    </Section>
  );
}

export function Events({ events }: { events?: PublicSite['events'] }) {
  if (!events || events.length === 0) {
    return null;
  }
  return (
    <Section id="events" title="Coming up">
      <ul className="site-events">
        {events.map((e) => (
          <li key={`${e.start}-${e.title}`} className="site-card">
            <span className="site-date">{formatDate(e.start)}</span>
            <span className="site-strong">{e.title}</span>
            {e.place ? <span className="site-muted">{e.place}</span> : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Gallery({ photos }: { photos?: PublicSite['gallery'] }) {
  const shown = (photos ?? []).map((p) => ({ ...p, src: safeUrl(p.url) })).filter((p) => p.src);
  if (shown.length === 0) {
    return null;
  }
  return (
    <Section id="gallery" title="Photos">
      <ul className="site-gallery">
        {shown.map((p) => (
          <li key={p.src}>
            <figure>
              <img src={p.src ?? ''} alt={p.caption || 'Troop photo'} loading="lazy" />
              {p.caption ? <figcaption>{p.caption}</figcaption> : null}
            </figure>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Faq({ items }: { items?: PublicSite['faq'] }) {
  if (!items || items.length === 0) {
    return null;
  }
  return (
    <Section id="faq" title="Questions families ask">
      <div className="site-faq">
        {items.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p style={{ whiteSpace: 'pre-line' }}>{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Contact({ name, role, email }: { name: string; role: string; email?: string | null }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(email ?? '');
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <li className="site-card">
      <span className="site-strong">{name}</span>
      <span className="site-muted">{role}</span>
      {email ? (
        <span className="site-contact-line">
          <a href={`mailto:${email}`}>{email}</a>
          <button type="button" className="site-btn ghost" onClick={copy} aria-label={`Copy ${name}'s email`}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      ) : null}
    </li>
  );
}

export function Contacts({ contacts }: { contacts?: PublicSite['contacts'] }) {
  if (!contacts || contacts.length === 0) {
    return null;
  }
  return (
    <Section id="contact" title="Who to ask">
      <ul className="site-contacts">
        {contacts.map((c) => (
          <Contact key={`${c.name}-${c.role}`} {...c} />
        ))}
      </ul>
    </Section>
  );
}
