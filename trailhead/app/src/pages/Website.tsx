import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { AboutSection } from '../components/site/AboutSection';
import { ContactsSection } from '../components/site/ContactsSection';
import { CoverSection } from '../components/site/CoverSection';
import { FaqSection } from '../components/site/FaqSection';
import { GallerySection } from '../components/site/GallerySection';
import { MeetingSection } from '../components/site/MeetingSection';
import { GuideBlock } from '../components/GuideBlock';
import { PublishPanel } from '../components/site/PublishPanel';
import { Empty, Loading, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/api';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/hooks';
import { type EditDraft, normalizeDraft, type SiteDraft } from '../lib/site';
import { publishSite, type PublishResult, unpublishSite } from '../lib/siteApi';
import { useTroop } from '../lib/troop';

type Message = { kind: 'ok' | 'error'; text: string } | null;

/** The no-code website builder. Leaders edit a draft; Publish makes a safe public copy on the server. */
export function Website() {
  const { troopId, troop, isLeader, loading } = useTroop();
  const draftRef = useMemo(() => (isLeader ? doc(db, 'troops', troopId, 'site', 'draft') : null), [troopId, isLeader]);
  const saved = useDoc<Partial<SiteDraft>>(draftRef);
  const [draft, setDraft] = useState<SiteDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [result, setResult] = useState<PublishResult | null>(null);

  useEffect(() => {
    if (!draft && !saved.loading && troop) {
      setDraft(normalizeDraft(saved.data, troop));
    }
  }, [draft, saved.loading, saved.data, troop]);

  if (!loading && !isLeader) {
    return <Empty>Only troop leaders can edit the troop website.</Empty>;
  }
  if (!draft) {
    return <Loading />;
  }

  const edit: EditDraft = (patch) => {
    setDraft((d) => (d ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) } : d));
    setDirty(true);
  };

  async function save(): Promise<boolean> {
    if (!draft || !draftRef) {
      return false;
    }
    try {
      // The id field from useDoc is not part of the draft; normalizeDraft never adds it.
      await setDoc(draftRef, { ...draft, updatedAt: serverTimestamp() });
      setDirty(false);
      return true;
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) });
      return false;
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      await action();
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const onSave = () =>
    run(async () => {
      if (await save()) {
        setMessage({ kind: 'ok', text: 'Draft saved.' });
      }
    });
  const onPublish = () =>
    run(async () => {
      if (await save()) {
        setResult(await publishSite(troopId));
      }
    });
  const onUnpublish = () =>
    run(async () => {
      await unpublishSite(troopId);
      setMessage({ kind: 'ok', text: 'Your site is unpublished. Your draft is still here.' });
    });

  return (
    <>
      <PageHeader eyebrow="Troop" title="Website" />
      <GuideBlock
        id="website"
        purpose="A simple public page that helps new families find your troop. Scouts' names never appear on it, photos need a parent's permission, and only adult leaders are listed as contacts."
        steps={[
          'Choose your web address in the first box.',
          'Fill in each section below. Short and friendly is best.',
          'Press Save draft. Only leaders can see a draft.',
          'Press Publish when you are happy. You can unpublish any time.',
        ]}
      />
      <PublishPanel
        draft={draft}
        onChange={edit}
        site={troop?.site}
        busy={busy}
        dirty={dirty}
        result={result}
        message={message}
        onSave={onSave}
        onPublish={onPublish}
        onUnpublish={onUnpublish}
      />
      <CoverSection troopId={troopId} draft={draft} onChange={edit} />
      <AboutSection troopId={troopId} draft={draft} onChange={edit} />
      <MeetingSection draft={draft} onChange={edit} />
      <FaqSection draft={draft} onChange={edit} />
      <ContactsSection draft={draft} onChange={edit} />
      <GallerySection troopId={troopId} draft={draft} onChange={edit} />
    </>
  );
}
