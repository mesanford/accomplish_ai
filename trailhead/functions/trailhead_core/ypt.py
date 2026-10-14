"""Youth Protection rules for digital messages.

No adult may have one-on-one digital contact with a Scout. Every message that includes
a Scout and an adult must also reach the Scout's parent or a second registered adult.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


class YPTViolation(Exception):
    """The message cannot be sent without breaking Youth Protection rules.

    `person_id` names the adult whose training is missing, so callers can show their name.
    """

    def __init__(self, message: str, person_id: str | None = None):
        super().__init__(message)
        self.person_id = person_id


@dataclass(frozen=True)
class Person:
    id: str
    is_youth: bool
    guardian_ids: tuple[str, ...] = ()  # for youth: linked parents with accounts
    ypt_expires: date | None = None  # for adults: Youth Protection training expiry


@dataclass
class Delivery:
    recipient_ids: list[str]
    added_ids: list[str] = field(default_factory=list)  # who the rules added, for the audit log


def has_current_ypt(person: Person, today: date) -> bool:
    return person.ypt_expires is not None and person.ypt_expires >= today


def plan_delivery(
    sender: Person,
    recipients: list[Person],
    people: dict[str, Person],
    second_adult_ids: list[str],
    today: date,
) -> Delivery:
    """Return the full recipient list for a message, adding parents or a second adult as required.

    `people` maps ids to everyone in the troop. `second_adult_ids` are leaders the troop has
    named to be copied when a Scout has no parent on the app, in order of preference.
    """
    everyone = [sender, *recipients]
    adults = [p for p in everyone if not p.is_youth]
    youth = [p for p in everyone if p.is_youth]
    if not adults or not youth:
        return Delivery(recipient_ids=_unique(r.id for r in recipients))
    for adult in adults:
        # A parent talking with their own children needs no training; anyone else in the conversation does.
        own_children_only = all(adult.id in y.guardian_ids for y in youth)
        if not own_children_only and not has_current_ypt(adult, today):
            raise YPTViolation("needs current Youth Protection training to message Scouts.", person_id=adult.id)

    ids = [r.id for r in recipients]
    added: list[str] = []
    needs_second_adult = False
    for scout in youth:
        guardians = [g for g in scout.guardian_ids if g in people]
        if guardians:
            added += [g for g in guardians if g not in ids and g != sender.id]
        else:
            needs_second_adult = True
    if needs_second_adult and len(adults) < 2:
        second = next(
            (
                a
                for a in second_adult_ids
                if a in people and a not in {p.id for p in adults} and has_current_ypt(people[a], today)
            ),
            None,
        )
        if second is None:
            raise YPTViolation("A Scout without a parent on the app needs a second trained adult copied.")
        added.append(second)
    return Delivery(recipient_ids=_unique([*ids, *added]), added_ids=_unique(added))


def _unique(ids) -> list[str]:
    seen: dict[str, None] = {}
    for i in ids:
        seen.setdefault(i, None)
    return list(seen)
