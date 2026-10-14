import { collection, doc, query, where } from 'firebase/firestore';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GuideBlock } from '../components/GuideBlock';
import { HelpTip } from '../components/HelpTip';
import { type BadgeEntry, PriorBadges } from '../components/PriorBadges';
import { type PartialEntry, PriorPartials } from '../components/PriorPartials';
import { PriorRanks } from '../components/PriorRanks';
import { Empty, formatDate, Loading, Notice, PageHeader } from '../components/ui';
import { errorMessage, recordPriorAdvancement } from '../lib/api';
import { awardName } from '../lib/catalog';
import { db } from '../lib/firebase';
import { useDoc, useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { Progress, ScoutRecord } from '../lib/types';

/** Leaders record ranks and merit badges a Scout earned before joining Trailhead. */
export function PriorAdvancement() {
  const { scoutId = '' } = useParams();
  const { troopId, isLeader, memberName } = useTroop();
  const recordRef = useMemo(() => doc(db, `troops/${troopId}/scoutRecords/${scoutId}`), [troopId, scoutId]);
  const doneQ = useMemo(
    () => query(collection(db, `troops/${troopId}/progress`), where('scoutId', '==', scoutId), where('status', '==', 'complete')),
    [troopId, scoutId],
  );
  const record = useDoc<ScoutRecord>(isLeader ? recordRef : null);
  const done = useQuery<Progress>(isLeader ? doneQ : null, `${troopId}/done/${scoutId}/${isLeader}`);
  const [ranks, setRanks] = useState<Record<string, string>>({});
  const [badges, setBadges] = useState<BadgeEntry[]>([]);
  const [partials, setPartials] = useState<PartialEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    if (record.data) {
      setRanks({ ...record.data.rankDates });
    }
  }, [record.data]);

  if (!isLeader) {
    return <Empty>Only leaders can record earlier advancement.</Empty>;
  }
  if (record.loading) {
    return <Loading />;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult('');
    try {
      const out = await recordPriorAdvancement({
        troopId,
        scoutId,
        ranks: Object.fromEntries(Object.entries(ranks).filter(([, d]) => d)),
        badges,
        partials: partials.map((p) => ({ ...p, requirements: p.requirements.split(/[\s,;]+/).filter(Boolean) })),
      });
      const skipped = out.skipped.length ? ` Left as they were, because Trailhead already has them: ${out.skipped.join(', ')}.` : '';
      setResult(`Saved ${out.ranks} rank dates and ${out.badges} merit badges.${skipped}`);
      setBadges([]);
      setPartials([]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const completeIds = new Set([...done.data.map((p) => p.awardId), ...badges.map((b) => b.awardId)]);
  return (
    <>
      <PageHeader eyebrow={memberName(scoutId)} title="Record earlier advancement" />
      <GuideBlock
        id="prior"
        purpose={`Use this for what ${memberName(scoutId)} earned before joining Trailhead. Trailhead then knows what is done and plans only what is left.`}
        steps={[
          'Enter the date for each rank earned. Look in the Scout handbook or Scoutbook.',
          'Add each finished merit badge with its date.',
          'For a badge started but not finished, add it as a partial with the requirements already signed.',
          'Press Save. These do not appear in the Scoutbook report, since Scoutbook already has them.',
        ]}
      />
      <form className="stack" onSubmit={save}>
        <section className="card">
          <h2>
            Ranks
            <HelpTip topic="priorAdvancement" label="what earlier means" />
          </h2>
          <PriorRanks dates={ranks} onChange={setRanks} />
        </section>
        <section className="card">
          <h2>Completed merit badges</h2>
          {done.data.length > 0 ? (
            <p className="small muted">
              Already recorded: {done.data.map((p) => `${awardName(p.awardId)} (${formatDate(p.completedAt)})`).join(', ')}
            </p>
          ) : null}
          <PriorBadges entries={badges} onChange={setBadges} />
        </section>
        <section className="card">
          <h2>
            Partly finished merit badges
            <HelpTip topic="partial" />
          </h2>
          <p className="small muted">Badges started earlier, with the requirement numbers already signed on the blue card.</p>
          <PriorPartials entries={partials} exclude={completeIds} onChange={setPartials} />
        </section>
        <Notice kind="error">{error}</Notice>
        <Notice kind="ok">{result}</Notice>
        <div className="row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save earlier advancement'}
          </button>
          <Link className="btn quiet" to={`/t/${troopId}/scouts/${scoutId}`}>
            Back to {memberName(scoutId)}
          </Link>
        </div>
      </form>
    </>
  );
}
