import { DocumentsManager } from '../documents/DocumentsManager';

/** Documents in the website editor. Same library as the Documents page; the public ones appear on the site. */
export function DocumentsSection({ troopId }: { troopId: string }) {
  return (
    <section className="card">
      <h2>Documents</h2>
      <p className="muted small">
        Documents set to public are listed on your site under "Documents" when you publish. Make one members-only or
        leaders-only and it comes off the site right away. Medical forms are never public.
      </p>
      <DocumentsManager troopId={troopId} />
    </section>
  );
}
