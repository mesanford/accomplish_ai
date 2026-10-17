import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { PublicSite } from './pages/PublicSite';

/**
 * What runs on a troop's own domain: just the public site, at "/" and "/{page}". No sign-in, no app pages.
 * Nothing here needs the signed-in user, so the auth provider is not started.
 */
export function TroopDomainApp({ slug }: { slug: string }) {
  const router = createBrowserRouter([
    { path: '/', element: <PublicSite slug={slug} /> },
    { path: '/:page', element: <PublicSite slug={slug} /> },
    { path: '*', element: <PublicSite slug={slug} page="not-found" /> },
  ]);
  return <RouterProvider router={router} />;
}
