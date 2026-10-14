import { deleteField, type FieldValue } from 'firebase/firestore';
import { useState } from 'react';
import type { BlueCard, Member } from '../lib/types';

export const OUTSIDE = '__outside__';

export type CardPatch = Record<string, string | null | FieldValue>;

interface Props {
  card: BlueCard;
  counselors: Member[];
  /** Apply a change to the card; resolves once saved, or shows the error itself. */
  onAssign: (patch: CardPatch) => void;
}

/** Choose a troop member as counselor, or enter the name (and email) of someone outside the troop. */
export function CounselorAssign({ card, counselors, onAssign }: Props) {
  const [choice, setChoice] = useState(card.counselorName ? OUTSIDE : (card.counselorUid ?? ''));
  const [name, setName] = useState(card.counselorName ?? '');
  const [email, setEmail] = useState(card.counselorEmail ?? '');
  const outside = choice === OUTSIDE;
  const ready = outside ? name.trim().length > 0 : choice !== '';

  function assign() {
    if (outside) {
      onAssign({
        status: 'counselor_assigned',
        counselorName: name.trim(),
        counselorEmail: email.trim() || null,
        counselorUid: deleteField(),
      });
    } else {
      onAssign({
        status: 'counselor_assigned',
        counselorUid: choice,
        counselorName: deleteField(),
        counselorEmail: deleteField(),
      });
    }
  }

  return (
    <>
      <select aria-label="Counselor" value={choice} onChange={(e) => setChoice(e.target.value)} style={{ width: 'auto' }}>
        <option value="">Choose counselor</option>
        {counselors.map((c) => (
          <option key={c.id} value={c.uid}>
            {c.displayName}
          </option>
        ))}
        <option value={OUTSIDE}>Someone outside the troop</option>
      </select>
      {outside ? (
        <>
          <input
            aria-label="Counselor name"
            placeholder="Counselor's name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: 'auto' }}
          />
          <input
            aria-label="Counselor email (optional)"
            type="email"
            placeholder="Email (optional)"
            maxLength={120}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: 'auto' }}
          />
        </>
      ) : null}
      <button type="button" className="btn small" disabled={!ready} onClick={assign}>
        Assign
      </button>
    </>
  );
}
