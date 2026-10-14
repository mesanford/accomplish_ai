"""Trailhead Cloud Functions (2nd gen, Python).

Firebase deploys the functions found in this module, so each one is re-exported here.
Logic lives in `handlers` and `trailhead_core`; Firestore wiring lives in `endpoints`.
"""

from endpoints.advancement import (
    check_path_preview,
    on_attendance_written,
    on_blue_card_written,
    on_path_written,
    on_signoff_created,
)
from endpoints.membership import accept_invite, add_scout, create_invite, create_troop
from endpoints.messaging import send_message

__all__ = [
    "accept_invite",
    "add_scout",
    "check_path_preview",
    "create_invite",
    "create_troop",
    "on_attendance_written",
    "on_blue_card_written",
    "on_path_written",
    "on_signoff_created",
    "send_message",
]
