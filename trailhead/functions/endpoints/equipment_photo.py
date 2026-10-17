"""Photos of troop gear, and tidying up when an item is deleted.

A photo arrives as base64 from the browser (already shrunk there), is decoded and written again from its pixels
alone (`handlers/images.py`), so no EXIF, GPS or camera details are kept, and is stored at gear/{t}/{item}/photo.*.
Storage rules let members read it and nobody write it, so every stored photo has been cleaned here.
"""

from __future__ import annotations

import base64
import binascii
import logging

from firebase_admin import firestore
from firebase_functions import firestore_fn, https_fn

from endpoints.equipment_core import Code, require_manager
from endpoints.erase import commit, delete_folder, delete_op
from endpoints.site_files import bucket
from fb import fail, troop
from handlers.images import UnreadableImage, clean_image

log = logging.getLogger(__name__)
MAX_PHOTO_BYTES = 6 * 1024 * 1024
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def photo_folder(troop_id: str, item_id: str) -> str:
    return f"gear/{troop_id}/{item_id}/"


@https_fn.on_call(memory=512, timeout_sec=60)
def set_item_photo(req: https_fn.CallableRequest) -> dict:
    """Add, replace or (with `remove: true`) delete an item's photo. Gear photos should not show Scouts."""
    data = req.data or {}
    troop_id, item_id = data.get("troopId"), data.get("itemId")
    require_manager(req, troop_id)
    if not isinstance(item_id, str) or not item_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose an item.")
    item_ref = troop(troop_id).collection("inventory").document(item_id)
    if not item_ref.get().exists:
        raise fail(Code.NOT_FOUND, "That item isn't in the inventory.")
    folder = photo_folder(troop_id, item_id)
    if data.get("remove") is True:
        delete_folder(folder)
        item_ref.update({"photoPath": firestore.DELETE_FIELD})
        return {"photoPath": None}
    try:
        raw = base64.b64decode(str(data.get("photo") or ""), validate=True)
    except (binascii.Error, ValueError) as err:
        raise fail(Code.INVALID_ARGUMENT, "That photo could not be read. Try another one.") from err
    if not raw or len(raw) > MAX_PHOTO_BYTES:
        raise fail(Code.INVALID_ARGUMENT, "Choose a photo up to 6 MB.")
    try:
        clean, content_type = clean_image(raw)
    except UnreadableImage as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    delete_folder(folder)
    path = f"{folder}photo.{EXTENSIONS.get(content_type, 'png')}"
    blob = bucket().blob(path)
    blob.cache_control = "private, max-age=300"
    blob.upload_from_string(clean, content_type=content_type)
    item_ref.update({"photoPath": path})
    return {"photoPath": path}


@firestore_fn.on_document_deleted(document="troops/{troopId}/inventory/{itemId}")
def on_inventory_deleted(event: firestore_fn.Event) -> None:
    """A deleted item takes its photo and repair log with it. Past loans keep the item's name."""
    troop_id, item_id = event.params["troopId"], event.params["itemId"]
    delete_folder(photo_folder(troop_id, item_id))
    logs = troop(troop_id).collection("maintenance").where("itemId", "==", item_id).stream()
    commit([delete_op(d.reference) for d in logs])
    log.info("inventory item deleted troop=%s", troop_id)
