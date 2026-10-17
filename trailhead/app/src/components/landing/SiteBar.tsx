import { Link, NavLink } from 'react-router-dom';
import lockupDark from '../../assets/forthright-lockup-dark.svg';
import lockup from '../../assets/forthright-lockup.svg';

/** The top bar of the public pages: the logo (home), Features and Sign in. */
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
        <Link className="l-link" to="/signin">
          Sign in
        </Link>
      </nav>
    </div>
  );
}
