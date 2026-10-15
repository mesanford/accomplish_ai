"""Re-encoding images for the public site. Pure: bytes in, bytes out.

A photo from a phone carries hidden data (EXIF, GPS location, camera and owner details, XMP, IPTC). Youth
Protection: nothing of that may reach the public site. The picture is decoded, turned upright, and written again
from its pixels alone, so no metadata can be carried over.
"""

from __future__ import annotations

import io

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError

MAX_DIMENSION = 2400
MAX_PIXELS = 60_000_000  # refuse decompression bombs before decoding
JPEG_QUALITY = 85
WEBP_QUALITY = 85

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class UnreadableImage(ValueError):
    """The file isn't an image we can read."""


def _to_srgb(img: Image.Image) -> Image.Image:
    """Convert from an embedded colour profile to sRGB so colours stay right once the profile is dropped."""
    profile = img.info.get("icc_profile")
    if not profile or img.mode not in ("RGB", "RGBA", "L", "CMYK"):
        return img
    try:
        source = ImageCms.ImageCmsProfile(io.BytesIO(profile))
        target = ImageCms.createProfile("sRGB")
        return ImageCms.profileToProfile(img, source, target, outputMode="RGBA" if img.mode == "RGBA" else "RGB")
    except (ImageCms.PyCMSError, OSError, ValueError):
        return img


def _fresh(img: Image.Image, mode: str) -> Image.Image:
    """A copy holding only pixels: it has no info dict, EXIF, XMP, ICC or text chunks."""
    flat = img.convert(mode)
    clean = Image.new(mode, flat.size)
    clean.paste(flat)
    return clean


def _has_alpha(img: Image.Image) -> bool:
    return img.mode in ("RGBA", "LA", "PA") or "transparency" in img.info


def clean_image(data: bytes) -> tuple[bytes, str]:
    """(re-encoded bytes, content type). JPEG stays JPEG, PNG stays PNG with transparency, WebP stays WebP and a
    GIF becomes a still PNG. Orientation is applied to the pixels, the longest side is capped at MAX_DIMENSION,
    and every kind of metadata is dropped. Raises UnreadableImage."""
    try:
        with Image.open(io.BytesIO(data)) as opened:
            kind = opened.format
            opened.load()
            img = ImageOps.exif_transpose(opened)  # a copy, so `opened` can close
            if kind not in ("JPEG", "PNG", "WEBP", "GIF"):
                raise UnreadableImage("That file can't be read as an image.")
            img = _to_srgb(img)
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError, ValueError) as err:
        if isinstance(err, UnreadableImage):
            raise
        raise UnreadableImage("That file can't be read as an image.") from None
    img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    if kind == "JPEG":
        _fresh(img, "RGB").save(out, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
        return out.getvalue(), "image/jpeg"
    if kind == "WEBP":
        _fresh(img, "RGBA" if _has_alpha(img) else "RGB").save(out, "WEBP", quality=WEBP_QUALITY)
        return out.getvalue(), "image/webp"
    mode = "RGBA" if _has_alpha(img) else ("L" if img.mode in ("L", "1") else "RGB")
    _fresh(img, mode).save(out, "PNG", optimize=True)
    return out.getvalue(), "image/png"
