import { Link } from 'react-router-dom';
import lockupDark from '../../assets/forthright-lockup-dark.svg';
import lockup from '../../assets/forthright-lockup.svg';
import { TrailMap } from './TrailMap';

export function Hero() {
  return (
    <header className="l-hero">
      <div className="l-wrap">
        <div className="l-bar">
          <picture>
            <source srcSet={lockupDark} media="(prefers-color-scheme: dark)" />
            <img src={lockup} alt="Forthright" width={146} height={32} />
          </picture>
          <Link className="l-link" to="/signin">
            Sign in
          </Link>
        </div>
        <div className="l-hero-grid">
          <div className="l-hero-copy">
            <p className="l-label">Pilot with a few troops</p>
            <h1>Advancement planning for Scouts BSA troops, from first campout to Eagle</h1>
            <p className="l-lede">
              Forthright helps Scouts, parents and leaders plan each rank, track blue cards and counselors, and hand
              advancement to Scoutbook with a report.
            </p>
            <div className="l-actions">
              <a className="l-btn" href="#pilot">
                Ask to join the pilot
              </a>
              <Link className="l-btn l-btn-outline" to="/signin">
                Sign in
              </Link>
            </div>
            <p className="l-small">Forthright is in a pilot with a few troops. It is free during the pilot, then $20 a month or $199 a year per troop.</p>
          </div>
          <TrailMap />
        </div>
      </div>
    </header>
  );
}
