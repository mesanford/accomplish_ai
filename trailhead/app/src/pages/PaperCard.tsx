import { type FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PaperCardRequirements } from '../components/PaperCardRequirements';
import { Field, Notice, PageHeader, todayIso } from '../components/ui';
import { errorMessage, recordPaperBlueCard } from '../lib/api';
import { attachCardFiles } from '../lib/cardPhotos';
import { cardFileProblem, paperDateProblem, paperRequirements } from '../lib/cards';
import { BADGES } from '../lib/catalog';
import { stillNeeded } from '../lib/formCheck';
import { plural } from '../lib/plural';
import { BADGE_MANAGER_NOTE } from '../lib/badgeAuthority';
import { useTroop } from '../lib/troop';
import { NoAccess } from '../components/NoAccess';

/** The Scoutmaster or advancement chair records a blue card a Scout brought signed on paper by a counselor outside Forthright. */
export function PaperCard() {
  const { scoutId = '' } = useParams();
  const { troopId, canManageBadges, memberName } = useTroop();
  const [awardId, setAwardId] = useState('');
  const [counselorName, setCounselorName] = useState('');
  const [counselorEmail, setCounselorEmail] = useState('');
  const [startedOn, setStartedOn] = useState('');
  const [reqIds, setReqIds] = useState<string[]>([]);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [sharedDate, setSharedDate] = useState('');
  const [completedOn, setCompletedOn] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const max = todayIso();

  if (!canManageBadges) {
    return <NoAccess message={BADGE_MANAGER_NOTE} ask="badges" />;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setResult('');
    const empty = stillNeeded([
      ['the merit badge', awardId],
      ["the counselor's name", counselorName],
      ['the start date', startedOn],
    ]);
    if (empty) {
      setError(empty);
      return;
    }
    const { requirements, missing } = paperRequirements(reqIds, dates, sharedDate);
    if (missing.length > 0) {
      setError(`Add a date for requirement ${missing[0]}, or a date for all of them.`);
      return;
    }
    const dateProblem = paperDateProblem({ startedOn, completedOn, requirements, today: max });
    if (dateProblem) {
      setError(dateProblem);
      return;
    }
    const problem = files.map(cardFileProblem).find(Boolean);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const out = await recordPaperBlueCard({
        troopId,
        scoutId,
        awardId,
        counselorName,
        counselorEmail: counselorEmail || undefined,
        startedOn,
        requirements,
        completedOn: completedOn || undefined,
      });
      const state = out.complete ? 'marked complete' : `saved with ${plural(out.requirements, 'signed requirement')}`;
      setResult(`The card is ${state}.`);
      setAwardId('');
      setReqIds([]);
      setDates({});
      setFiles([]);
      try {
        await attachCardFiles(troopId, { id: out.cardId, scoutId }, files);
      } catch (err) {
        setError(`The card was saved, but the photos weren't: ${errorMessage(err)} You can add them from the Blue cards page.`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow={memberName(scoutId)} title="Record a paper blue card" />
      <p className="muted">
        Enter a blue card {memberName(scoutId)} brought already signed. It counts in Forthright and goes in the next Scoutbook
        report, with the dates written on the card.
      </p>
      <form className="stack" onSubmit={save} noValidate>
        <section className="card form">
          <Field label="Merit badge" htmlFor="pc-award">
            <select id="pc-award" value={awardId} onChange={(e) => setAwardId(e.target.value)} required>
              <option value="">Choose a merit badge</option>
              {BADGES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Counselor's name" htmlFor="pc-name">
            <input id="pc-name" required maxLength={80} value={counselorName} onChange={(e) => setCounselorName(e.target.value)} />
          </Field>
          <Field label="Counselor's email (optional)" htmlFor="pc-email">
            <input id="pc-email" type="email" maxLength={120} value={counselorEmail} onChange={(e) => setCounselorEmail(e.target.value)} />
          </Field>
          <Field label="Started on" htmlFor="pc-started">
            <input id="pc-started" type="date" required max={max} value={startedOn} onChange={(e) => setStartedOn(e.target.value)} style={{ width: 'auto' }} />
          </Field>
        </section>
        {awardId ? (
          <section className="card">
            <PaperCardRequirements
              awardId={awardId}
              reqIds={reqIds}
              dates={dates}
              sharedDate={sharedDate}
              max={max}
              onReqIds={setReqIds}
              onDates={setDates}
              onSharedDate={setSharedDate}
            />
          </section>
        ) : null}
        <section className="card form">
          <Field label="Completed on" htmlFor="pc-done" hint="Fill in only if the counselor has signed the whole card. Leave empty if it is still in progress.">
            <input id="pc-done" type="date" max={max} value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} style={{ width: 'auto' }} />
          </Field>
          <Field label="Photos of the paper card" htmlFor="pc-files" hint="Optional. Photos or a PDF, up to 10 MB each.">
            <input
              id="pc-files"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
              onChange={(e) => setFiles([...(e.target.files ?? [])])}
            />
          </Field>
        </section>
        <Notice kind="error">{error}</Notice>
        <Notice kind="ok">{result}</Notice>
        <div className="row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save paper blue card'}
          </button>
          <Link className="btn quiet" to={`/t/${troopId}/scouts/${scoutId}`}>
            Back to {memberName(scoutId)}
          </Link>
        </div>
      </form>
    </>
  );
}
