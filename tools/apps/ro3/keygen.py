"""Ragnarok Online 3's Unity block-0 obfuscation, undone.

What is obfuscated
------------------
Very little, as it turns out. Inside every ``UnityFS`` sub-file only **block index 0** is
touched, and only its first ``min(len(block0), 1280)`` bytes, by a byte-wise XOR. The
bundle header, the block-info table, every other block and the whole trailing payload are
already standard on disk. Undo that one XOR and what remains is an ordinary Unity bundle
that any Unity tooling opens — which is what :mod:`.unpack` produces, so nothing downstream
needs to know this module exists.

The keystream
-------------
``keystream[0:32]`` is the constant byte ``0xA6`` for every sub-file in the game — a 16-byte
SSE loop XOR-ing against the xmmword of sixteen ``0xA6`` bytes at RVA ``0x12f670``, run
twice.

``keystream[32:n]`` is built in five chunks. For the usual ``n = 1280`` they are 96, 288,
288, 288, 288 bytes at offsets 32/128/416/704/992 (96 + 4*288 = 1248); for a shorter block
the sizes shrink proportionally, so the layout is read back from the protector rather than
assumed. Each chunk gets two passes:

1. **RC4**, restarted from a fresh key schedule for every chunk with the same 4-byte key
   (the key length is hardcoded to 4 by an ``and ecx,3`` in the schedule). The output byte
   carries one twist: ``out = rol8(rc4_byte, 1) - 0x61`` (mod 256).
2. an SSE pass that XORs the chunk with a **repeating 4-byte word**, one word per chunk.

So ``keystream[off:off+len] = rc4_chunk(key4, len) XOR (word * (len // 4))``. The SSE pass
covers whole 16-byte lanes only, so when ``len`` is not a multiple of 16 the trailing few
bytes keep a different residual; those are carried verbatim in the ``tail`` of each chunk.

The 4-byte RC4 key and the five chunk words are a function of **both** the 32-byte
ciphertext head and ``n`` — the same head with a different ``n`` yields entirely different
key material, which is why every entry point here takes ``n``. That derivation was not
recovered algebraically; it is evaluated by running the protector's own code offline under
an emulator (:mod:`.fairguard`). Everything from those 24 bytes onward is the native Python
below and is byte-exact.

Verification
------------
102,448 known keystream bytes reproduced exactly, 9,347 distinct heads reconstructed, and
3,638 LZ4 oracle passes across 1,400 bundles with no failures. The oracle is the strongest
of those: a wrong keystream cannot decompress into exactly the block's declared
uncompressed size.
"""

from __future__ import annotations

ENC_LEN = 1280
"""Bytes of block 0 the protector obfuscates, when the block is at least that long."""

PREFIX_LEN = 32
"""Leading run whose keystream is the same for every sub-file in the game."""

PREFIX_BYTE = 0xA6
"""The value of that run."""


def rc4_chunk(key4: bytes, n: int) -> bytes:
    """FairGuard's RC4 stream: textbook RC4, then ``rol(byte, 1) - 0x61`` per output byte."""
    s = list(range(256))
    j = 0
    for i in range(256):
        j = (j + key4[i & 3] + s[i]) & 0xFF
        s[i], s[j] = s[j], s[i]
    out = bytearray(n)
    i = j = 0
    for p in range(n):
        i = (i + 1) & 0xFF
        j = (j + s[i]) & 0xFF
        s[i], s[j] = s[j], s[i]
        k = s[(s[i] + s[j]) & 0xFF]
        k = ((k << 1) | (k >> 7)) & 0xFF  # rol cl, 1
        out[p] = (k - 0x61) & 0xFF  # sub cl, 0x61
    return bytes(out)


def keystream_from_params(key4: bytes, chunks, n: int = ENC_LEN) -> bytes:
    """Rebuild an n-byte keystream from recovered key material.

    ``chunks`` is a sequence of ``(offset, length, word4, tail)``: the chunk covers
    ``[offset, offset + length)``, its SSE word is ``word4`` repeated, and ``tail`` is the
    trailing residual left by the partial 16-byte lane (empty when the length is a
    multiple of 16). Everything not covered by a chunk keeps :data:`PREFIX_BYTE`.
    """
    ks = bytearray([PREFIX_BYTE] * n)
    for off, length, word, tail in chunks:
        pad = bytearray((word * (length // 4 + 1))[:length])
        if tail:
            pad[length - len(tail):] = tail
        ks[off:off + length] = bytes(
            a ^ b for a, b in zip(rc4_chunk(key4, length), pad)
        )
    return bytes(ks)


def keystream(head32: bytes, n: int = ENC_LEN) -> bytes:
    """The keystream for a block 0 whose first 32 ciphertext bytes are ``head32``.

    ``n`` is the obfuscated length, ``min(len(block0), 1280)``. Both inputs matter.
    """
    from .fairguard import key_material

    head32 = bytes(head32)
    if len(head32) != PREFIX_LEN:
        raise ValueError(f"head32 must be exactly {PREFIX_LEN} bytes, got {len(head32)}")
    key, chunks = key_material(head32, n)
    return keystream_from_params(key, chunks, n)


def obfuscated_length(block0_length: int) -> int:
    """How many bytes of a block-0 of this size the protector touches."""
    return min(block0_length, ENC_LEN)


def decrypt_block0(block0: bytes) -> bytes:
    """Return block 0 with its obfuscation removed. Bytes past 1280 are already plain."""
    n = obfuscated_length(len(block0))
    if n < PREFIX_LEN:
        # Nothing shorter than the constant prefix has been observed; the protector's own
        # derivation reads 32 bytes, so there would be nothing honest to feed it.
        raise ValueError(f"block 0 is {len(block0)} bytes, shorter than the {PREFIX_LEN}-byte head")
    ks = keystream(block0[:PREFIX_LEN], n)
    return bytes(a ^ b for a, b in zip(block0[:n], ks)) + block0[n:]
