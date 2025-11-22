import base64
import hashlib
from typing import BinaryIO
from io import BytesIO

from PIL import Image

from aion2.backend.utilities.exceptions import BizError, ErrorCode

def sha256_base64url(data: bytes, length: int = 16) -> str:
    """
    Hash bytes with SHA-256, truncate to `length` bytes,
    and encode using URL-safe Base64 (no padding).

    length = 16 gives a compact ~22-char ID.
    """
    digest = hashlib.sha256(data).digest()[:length]
    encoded = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return encoded

def process_image_to_buffer(file: BinaryIO, quality):
    try:
        buffer = BytesIO()
        with Image.open(file) as img:
            img.save(
                buffer,
                format="WEBP",
                quality=quality,
                method=6,
            )
        buffer.seek(0)
        return buffer.getvalue(), (img.height, img.width)
    except Exception as e:
        raise BizError(ErrorCode.ImageError, str(e))





