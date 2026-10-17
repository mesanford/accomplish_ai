import { Link } from 'react-router-dom';
import { DISCLAIMER, FAQ, SAFETY, WHO_IT_HELPS } from './content';

export function WhoItHelps() {
  return (
    <section className="l-section" aria-labelledby="who-title">
      <div className="l-wrap l-split">
        <div>
          <p className="l-label">What it does</p>
          <h2 id="who-title">One place for everyone who helps a Scout advance</h2>
          <p className="l-more">
            <Link to="/features">See every feature</Link>
          </p>
        </div>
        <ul className="l-rows">
          {WHO_IT_HELPS.map((row) => (
            <li key={row.who}>
              <h3>{row.who}</h3>
              <p>{row.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Safety() {
  return (
    <section className="l-section l-safety" aria-labelledby="safety-title">
      <div className="l-wrap">
        <p className="l-label">Safety and privacy</p>
        <h2 id="safety-title">Built for safety and privacy</h2>
        <div className="l-safety-grid">
          {SAFETY.map((item) => (
            <div key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
        <p>
          <Link to="/privacy">Read the privacy policy</Link>
        </p>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section className="l-section" aria-labelledby="faq-title">
      <div className="l-wrap l-split">
        <div>
          <p className="l-label">Questions</p>
          <h2 id="faq-title">Questions and answers</h2>
        </div>
        <div className="l-faq">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingFooter({ email }: { email: string }) {
  return (
    <footer className="l-footer">
      <div className="l-wrap">
        <p>
          <Link to="/privacy">Privacy policy</Link> · Contact{' '}
          <a href={`mailto:${email}`}>{email}</a>
        </p>
        <p className="l-small">{DISCLAIMER}</p>
      </div>
    </footer>
  );
}
