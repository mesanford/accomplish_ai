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
from endpoints.assistant import draft_path
from endpoints.custom_awards import archive_custom_award, move_to_custom_version, save_custom_award
from endpoints.membership import accept_invite, add_scout, create_invite, create_troop
from endpoints.messaging import send_message
from endpoints.prior import record_prior_advancement
from endpoints.recruiting import submit_interest
from endpoints.scoutbook import create_scoutbook_report, set_scoutbook_entered

__all__ = [
    "accept_invite",
    "add_scout",
    "archive_custom_award",
    "check_path_preview",
    "create_invite",
    "create_scoutbook_report",
    "create_troop",
    "draft_path",
    "move_to_custom_version",
    "on_attendance_written",
    "on_blue_card_written",
    "on_path_written",
    "on_signoff_created",
    "record_prior_advancement",
    "save_custom_award",
    "send_message",
    "set_scoutbook_entered",
    "submit_interest",
]
