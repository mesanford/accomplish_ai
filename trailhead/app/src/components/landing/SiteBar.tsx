import { Link, NavLink } from 'react-router-dom';
import lockupDark from '../../assets/forthright-lockup-dark.svg';
import lockup from '../../assets/forthright-lockup.svg';

/** The top bar of the public pages: the logo (home), Features, Sign in and Join the pilot (the pilot form on "/"). */
export function SiteBar() {
  return (
    <div className="l-bar">
      <Link to="/" aria-label="Forthright home">
        <picture>
          <source srcSet={lockupDark} media="(prefers-color-scheme: dark)" />
          <img src={lockup} alt="Forthright" width={146} height={32} />
        </picture>
      </Link>
      <nav className="l-nav" aria-label="Forthright">
        <NavLink className="l-link" to="/features">
          Features
        </NavLink>
        <Link className="l-link l-bar-signin" to="/signin">
          Sign in
        </Link>
        <Link className="l-btn l-btn-small" to="/#pilot">
          Join the pilot
        </Link>
      </nav>
    </div>
  );
}
