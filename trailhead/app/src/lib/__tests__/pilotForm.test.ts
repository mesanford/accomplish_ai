import { describe, expect, it } from 'vitest';
import { EMPTY_PILOT, pilotProblem } from '../pilotForm';

const ok = { ...EMPTY_PILOT, name: 'Pat', email: 'pat@example.com', unit: '303', role: 'Scoutmaster' };

describe('pilotProblem', () => {
  it('names what is missing', () => {
    expect(pilotProblem(EMPTY_PILOT)).toBe('Still needed: your name, your email, your troop or unit number and your role.');
    expect(pilotProblem({ ...ok, unit: ' ' })).toBe('Still needed: your troop or unit number.');
  });

  it('checks the email shape', () => {
    expect(pilotProblem({ ...ok, email: 'pat@' })).toBe('Enter a valid email address.');
  });

  it('accepts a complete form with the optional fields empty', () => {
    expect(pilotProblem(ok)).toBeNull();
  });
});
