import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';

/** The page for an address that doesn't exist. */
export function NotFound() {
  return (
    <section className="stack" style={{ maxWidth: 520 }}>
      <div className="eyebrow">Forthright</div>
      <h1>We couldn't find that page</h1>
      <p className="muted">The link may be old or mistyped.</p>
      <div>
        <Link className="btn" to="/">
          Go home
        </Link>
      </div>
    </section>
  );
}

/**
 * Shown by the router when a page fails to load or a link goes nowhere, instead of its developer error page.
 * It stands alone, so it works even if the app's layout is what failed.
 */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <main className="main">
        <NotFound />
      </main>
    );
  }
  return (
    <main className="main">
      <section className="stack" style={{ maxWidth: 520 }}>
        <div className="eyebrow">Forthright</div>
        <h1>Something went wrong</h1>
        <p className="muted">This page didn't load. Try again, or go back to the start.</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          <a className="btn quiet" href="/">
            Go home
          </a>
        </div>
      </section>
    </main>
  );
}
