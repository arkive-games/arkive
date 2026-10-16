"""Read the client's packed KSBC tables without executing client code.

The footer contains six (start, end-inclusive, count) regions followed by the
root handle. Tables reference shared key/type/offset descriptors. Types >= 50
store constants backwards from their own offset slot, not from the row.
The file's repeating mask is supplied locally; it is never stored in the repo.
"""
from __future__ import annotations

import os
import struct
from functools import lru_cache
from pathlib import Path


class KsbcReader:
    FORMATS = {1: 'B', 2: 'h', 3: 'H', 4: 'i', 5: 'I', 6: 'd', 9: 'B', 10: 'd'}
    WIDTHS = {1: 1, 3: 2, 5: 4}

    def __init__(self, path: Path, mask: bytes):
        if len(mask) != 64:
            raise ValueError('KSBC mask must contain 64 bytes')
        raw = path.read_bytes()
        self.data = bytes(value ^ mask[index % len(mask)] for index, value in enumerate(raw))
        if len(self.data) < 76:
            raise ValueError('Truncated KSBC footer')
        self.footer = struct.unpack_from('<19I', self.data, len(self.data) - 76)
        for index in range(0, 18, 3):
            start, end, _ = self.footer[index:index + 3]
            if not 0 <= start <= end < len(self.data) - 76:
                raise ValueError('Invalid KSBC region')
            if index and start != self.footer[index - 2] + 1:
                raise ValueError('Non-contiguous KSBC regions')
        self.root = self.footer[-1]
        self.keys, _, self.offsets, _ = self.schema(self.u32(self.root))

    def unpack(self, fmt: str, offset: int):
        size = struct.calcsize('<' + fmt)
        if not 0 <= offset <= len(self.data) - size:
            raise ValueError(f'KSBC offset outside file: {offset}')
        return struct.unpack_from('<' + fmt, self.data, offset)[0]

    def u32(self, offset: int) -> int:
        return self.unpack('I', offset)

    def text(self, offset: int) -> str:
        if not self.footer[0] <= offset <= self.footer[1]:
            raise ValueError(f'KSBC string outside string pool: {offset}')
        end = self.data.index(0, offset, self.footer[1] + 1)
        return self.data[offset:end].decode('utf-8')

    @lru_cache(maxsize=None)
    def schema(self, address: int):
        key_at, type_at, offsets_at = (self.u32(address + i * 4) for i in range(3))
        array_length = self.u32(key_at)
        key_type = self.data[key_at + 4]
        count, numeric_count = self.u32(key_at + 5), self.u32(key_at + 9)
        if count > 2_000_000 or numeric_count > count or array_length > count:
            raise ValueError('Invalid KSBC key counts')
        keys = []
        cursor = key_at + 13
        for index in range(count):
            if index < numeric_count:
                fmt = self.FORMATS[key_type]
                value = self.unpack(fmt, cursor)
                cursor += struct.calcsize(fmt)
                if isinstance(value, float) and value.is_integer():
                    value = int(value)
            else:
                value = self.text(self.u32(cursor))
                cursor += 4
            keys.append(value)
        if len(set(keys)) != count:
            raise ValueError('Duplicate KSBC keys')
        types = self.data[type_at:type_at + count]
        width = self.WIDTHS[self.data[offsets_at]]
        slots = [offsets_at + 1 + index * width for index in range(count)]
        offsets = [int.from_bytes(self.data[slot:slot + width], 'little') for slot in slots]
        return keys, types, offsets, slots

    @lru_cache(maxsize=None)
    def node(self, address: int):
        keys, types, offsets, slots = self.schema(self.u32(address))
        result = {}
        for key, kind, offset, slot in zip(keys, types, offsets, slots):
            if kind >= 50:
                kind -= 50
                location = slot - offset
            else:
                location = address + offset
            if kind == 8:
                value = self.node(self.u32(location))
            elif kind == 7:
                value = self.text(self.u32(location))
            elif kind == 10:
                value = f'@LANG:{int(self.unpack("d", location))}'
            elif kind == 9:
                value = bool(self.unpack('B', location))
            elif kind in self.FORMATS:
                value = self.unpack(self.FORMATS[kind], location)
                if isinstance(value, float) and value.is_integer():
                    value = int(value)
            elif kind == 0:
                value = self.unpack('d', location)
                if value.is_integer():
                    value = int(value)
            else:
                raise ValueError(f'Unsupported KSBC value type {kind}')
            result[str(key)] = value
        if result.get('__cname') == 'LangStrSplit':
            value = result.get('value')
            if not isinstance(value, list) or not value or not isinstance(value[0], int):
                raise ValueError('Invalid split localization reference')
            return f'@LANG:{value[0]}'
        if keys and all(isinstance(key, int) for key in keys) and keys == list(range(1, len(keys) + 1)):
            return [result[str(key)] for key in keys]
        return result

    def table(self, name: str):
        index = self.keys.index(name)
        result = self.node(self.u32(self.root + self.offsets[index]))
        return result.get('data', result) if isinstance(result, dict) else result


@lru_cache(maxsize=2)
def reader(path: Path):
    mask = os.environ.get('GMZZ_KSBC_MASK')
    if not mask:
        raise RuntimeError('GMZZ_KSBC_MASK is required for packed tables')
    return KsbcReader(path, bytes.fromhex(mask))
