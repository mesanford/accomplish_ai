"""Trailhead Cloud Functions (2nd gen, Python).

Firebase deploys the functions found in this module, so each one is re-exported here.
Logic lives in `handlers` and `trailhead_core`; Firestore wiring lives in `endpoints`.
"""

from endpoints.account import delete_account, set_email_announcements, set_email_notifications
from endpoints.activity import mark_scout_left, record_activity
from endpoints.activity_log import (
    add_activity_entry,
    delete_activity_entry,
    on_event_written_activity_log,
    review_activity_entry,
)
from endpoints.advancement import (
    check_path_preview,
    on_attendance_written,
    on_blue_card_written,
    on_path_written,
    on_signoff_created,
)
from endpoints.announcement_catchup import on_access_written_announcements
from endpoints.announcements import delete_announcement, edit_announcement, post_announcement
from endpoints.assistant import draft_path
from endpoints.campaigns import post_sales, save_account_settings, save_campaign
from endpoints.charges import charge_attendees, post_charge
from endpoints.checkout import create_checkout
from endpoints.consent import invite_notice, withdraw_parent_consent
from endpoints.custom_awards import archive_custom_award, move_to_custom_version, save_custom_award
from endpoints.domains import add_domain, check_domain, remove_domain
from endpoints.domains_sync import sync_domains
from endpoints.entries import record_payment, reverse_entry, settle_account
from endpoints.equipment import check_in_item, check_out_item, decide_request, request_item
from endpoints.equipment_photo import on_inventory_deleted, set_item_photo
from endpoints.event_fees import charge_event_fees
from endpoints.event_reminders import send_event_reminders
from endpoints.feeds import calendar_feed, get_calendar_feed, reset_calendar_feed
from endpoints.health_forms import record_health_form
from endpoints.leads import delete_lead
from endpoints.membership import accept_invite, create_invite, create_troop
from endpoints.messaging import send_message
from endpoints.notify import on_blue_card_notify
from endpoints.paper_cards import record_paper_blue_card
from endpoints.parent_consent import answer_pending_consent, link_self_as_parent
from endpoints.patrols import assign_patrol, delete_patrol, save_patrol
from endpoints.payments import connect_stripe, disconnect_stripe, payments_status
from endpoints.permission import approve_permission, record_paper_permission
from endpoints.pilot import request_pilot
from endpoints.prior import record_prior_advancement
from endpoints.push import register_push_device, remove_push_device
from endpoints.quartermaster import set_scout_quartermaster
from endpoints.recruiting import submit_interest
from endpoints.removal import remove_scout
from endpoints.retention import apply_retention
from endpoints.roles import set_member_roles
from endpoints.scoutbook import create_scoutbook_report, set_scoutbook_entered
from endpoints.scouts import add_scout
from endpoints.signup_trigger import import_rsvps, on_event_written_signups
from endpoints.signups import cancel_signup, sign_up_for_event
from endpoints.site import on_event_written_site, publish_site, unpublish_site
from endpoints.site_about import draft_site_about
from endpoints.site_consent import set_media_consent
from endpoints.site_documents import on_document_written_site
from endpoints.site_shell import site_shell
from endpoints.stripe_webhook import stripe_webhook
from endpoints.ypt_reminders import send_ypt_reminders
from endpoints.ypt_self import set_my_ypt

__all__ = [
    "add_domain",
    "check_domain",
    "remove_domain",
    "sync_domains",
    "add_activity_entry",
    "assign_patrol",
    "delete_activity_entry",
    "delete_patrol",
    "on_event_written_activity_log",
    "review_activity_entry",
    "save_patrol",
    "settle_account",
    "save_campaign",
    "save_account_settings",
    "reverse_entry",
    "record_payment",
    "post_sales",
    "post_charge",
    "charge_attendees",
    "accept_invite",
    "add_scout",
    "answer_pending_consent",
    "apply_retention",
    "approve_permission",
    "archive_custom_award",
    "calendar_feed",
    "cancel_signup",
    "charge_event_fees",
    "check_in_item",
    "check_out_item",
    "check_path_preview",
    "create_invite",
    "create_scoutbook_report",
    "create_troop",
    "delete_account",
    "delete_announcement",
    "decide_request",
    "delete_lead",
    "draft_path",
    "draft_site_about",
    "edit_announcement",
    "get_calendar_feed",
    "import_rsvps",
    "invite_notice",
    "link_self_as_parent",
    "mark_scout_left",
    "move_to_custom_version",
    "on_access_written_announcements",
    "on_attendance_written",
    "on_blue_card_notify",
    "on_blue_card_written",
    "on_document_written_site",
    "on_inventory_deleted",
    "on_event_written_signups",
    "on_event_written_site",
    "on_path_written",
    "on_signoff_created",
    "post_announcement",
    "publish_site",
    "record_activity",
    "record_health_form",
    "record_paper_blue_card",
    "record_paper_permission",
    "record_prior_advancement",
    "register_push_device",
    "remove_push_device",
    "remove_scout",
    "request_item",
    "request_pilot",
    "reset_calendar_feed",
    "save_custom_award",
    "send_event_reminders",
    "send_message",
    "send_ypt_reminders",
    "set_item_photo",
    "set_member_roles",
    "set_my_ypt",
    "set_scout_quartermaster",
    "set_email_announcements",
    "set_email_notifications",
    "set_media_consent",
    "set_scoutbook_entered",
    "site_shell",
    "sign_up_for_event",
    "submit_interest",
    "unpublish_site",
    "withdraw_parent_consent",
    "payments_status",
    "connect_stripe",
    "disconnect_stripe",
    "create_checkout",
    "stripe_webhook",
]
