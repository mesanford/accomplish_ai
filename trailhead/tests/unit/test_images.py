import io

import pytest
from PIL import Image

from handlers.images import MAX_DIMENSION, UnreadableImage, clean_image

GPS_IFD = 0x8825
ORIENTATION = 0x0112


def jpeg_with_metadata(size=(60, 40), orientation=None) -> bytes:
    """A JPEG with GPS EXIF, a camera make, an owner name and an XMP packet, like a phone photo."""
    img = Image.new("RGB", size, (200, 30, 30))
    img.paste((0, 0, 255), (0, 0, size[0] // 2, size[1] // 2))  # top-left quarter is blue
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"
    exif[0xA430] = "Pat Parent"  # camera owner name
    exif[ORIENTATION] = orientation or 1
    exif.get_ifd(GPS_IFD).update({1: "N", 2: (38.0, 15.0, 0.0), 3: "W", 4: (85.0, 45.0, 0.0)})
    out = io.BytesIO()
    img.save(out, "JPEG", exif=exif.tobytes(), xmp=b"<x:xmpmeta>secret-location</x:xmpmeta>")
    return out.getvalue()


def test_the_test_photo_really_carries_gps_and_xmp():
    data = jpeg_with_metadata()
    assert Image.open(io.BytesIO(data)).getexif().get_ifd(GPS_IFD)
    assert b"secret-location" in data


def test_jpeg_comes_out_as_jpeg_with_no_metadata():
    data, content_type = clean_image(jpeg_with_metadata())
    assert content_type == "image/jpeg"
    out = Image.open(io.BytesIO(data))
    assert out.format == "JPEG"
    assert len(out.getexif()) == 0 and not out.getexif().get_ifd(GPS_IFD)
    assert "xmp" not in out.info and "icc_profile" not in out.info
    for marker in (b"Exif", b"PhoneMaker", b"Pat Parent", b"secret-location", b"xpacket", b"Photoshop"):
        assert marker not in data
    assert out.size == (60, 40)


def test_orientation_is_applied_to_the_pixels():
    # Orientation 6 means "rotate 90 degrees clockwise to display": a 60x40 sensor image shows as 40x60.
    data, _ = clean_image(jpeg_with_metadata(orientation=6))
    out = Image.open(io.BytesIO(data))
    assert out.size == (40, 60)
    assert ORIENTATION not in out.getexif()
    # The blue top-left quarter of the stored image ends up in the top-right after a clockwise turn.
    r, g, b = out.convert("RGB").getpixel((35, 5))
    assert b > 150 and r < 100
    r, g, b = out.convert("RGB").getpixel((5, 5))
    assert r > 150 and b < 100


def test_png_keeps_transparency_and_loses_text_chunks():
    from PIL.PngImagePlugin import PngInfo

    img = Image.new("RGBA", (30, 30), (0, 0, 0, 0))
    img.paste((255, 0, 0, 255), (10, 10, 20, 20))
    info = PngInfo()
    info.add_text("Author", "Pat Parent")
    info.add_text("Location", "38N 85W")
    src = io.BytesIO()
    img.save(src, "PNG", pnginfo=info, exif=Image.Exif().tobytes())
    assert b"Pat Parent" in src.getvalue()

    data, content_type = clean_image(src.getvalue())
    assert content_type == "image/png"
    out = Image.open(io.BytesIO(data))
    assert out.format == "PNG" and out.mode == "RGBA"
    assert out.getpixel((0, 0))[3] == 0 and out.getpixel((15, 15)) == (255, 0, 0, 255)
    assert b"Pat Parent" not in data and b"38N 85W" not in data
    assert not out.text


def test_palette_png_with_transparency_stays_transparent():
    img = Image.new("P", (10, 10), 0)
    img.putpalette([255, 0, 0] * 256)
    src = io.BytesIO()
    img.save(src, "PNG", transparency=0)
    out = Image.open(io.BytesIO(clean_image(src.getvalue())[0]))
    assert out.mode == "RGBA" and out.getpixel((0, 0))[3] == 0


def test_oversized_images_are_scaled_down_keeping_proportions():
    src = io.BytesIO()
    Image.new("RGB", (MAX_DIMENSION * 2, MAX_DIMENSION), (10, 20, 30)).save(src, "JPEG")
    out = Image.open(io.BytesIO(clean_image(src.getvalue())[0]))
    assert out.size == (MAX_DIMENSION, MAX_DIMENSION // 2)


def test_small_images_are_not_enlarged():
    src = io.BytesIO()
    Image.new("RGB", (100, 80)).save(src, "JPEG")
    assert Image.open(io.BytesIO(clean_image(src.getvalue())[0])).size == (100, 80)


def test_gif_becomes_a_still_png():
    src = io.BytesIO()
    Image.new("P", (12, 8)).save(src, "GIF")
    data, content_type = clean_image(src.getvalue())
    assert content_type == "image/png" and Image.open(io.BytesIO(data)).format == "PNG"


def test_webp_stays_webp_without_metadata():
    src = io.BytesIO()
    Image.new("RGB", (20, 20), (1, 2, 3)).save(src, "WEBP", exif=jpeg_exif(), xmp=b"<x:xmpmeta>secret</x:xmpmeta>")
    data, content_type = clean_image(src.getvalue())
    assert content_type == "image/webp"
    assert b"EXIF" not in data and b"XMP" not in data and b"secret" not in data


def jpeg_exif() -> bytes:
    exif = Image.Exif()
    exif.get_ifd(GPS_IFD).update({1: "N", 2: (38.0, 15.0, 0.0)})
    return exif.tobytes()


@pytest.mark.parametrize("junk", [b"", b"not an image at all", b"%PDF-1.4 ...", b"\x89PNG\r\n\x1a\n truncated"])
def test_files_that_are_not_images_are_refused(junk):
    with pytest.raises(UnreadableImage):
        clean_image(junk)
