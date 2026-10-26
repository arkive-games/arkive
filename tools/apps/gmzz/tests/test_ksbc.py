"""Small synthetic fixtures for the packed reader's most error-prone rules."""
import struct

import pytest

from gmzz.ksbc import KsbcReader


def fixture(kind=1, value=b'\x07', shared=False):
    reader = object.__new__(KsbcReader)
    data = bytearray(220)
    data[:5] = b'name\0'
    struct.pack_into('<I', data, 20, 0)
    data[24] = 1
    struct.pack_into('<II', data, 25, 1, 0)
    struct.pack_into('<I', data, 33, 0)
    data[50] = kind + (50 if shared else 0)
    data[70] = 1
    data[71] = 11 if shared else 4
    location = 60 if shared else 104
    data[location:location + len(value)] = value
    struct.pack_into('<III', data, 80, 20, 50, 70)
    struct.pack_into('<I', data, 100, 80)
    reader.data = bytes(data)
    reader.footer = (0, 19)
    return reader


def test_row_relative_value():
    assert fixture().node(100) == {'name': 7}


def test_shared_value_is_backward_from_its_offset_slot():
    assert fixture(shared=True).node(100) == {'name': 7}


def test_double_is_not_nil():
    assert fixture(0, struct.pack('<d', 1234567890123456)).node(100) == {'name': 1234567890123456}


def test_localized_number_preserves_identifier():
    assert fixture(10, struct.pack('<d', 1234567890123456)).node(100) == {'name': '@LANG:1234567890123456'}


def test_boolean_is_not_double():
    assert fixture(9, b'\x01', True).node(100) == {'name': True}


def test_unknown_type_fails():
    with pytest.raises(ValueError, match='Unsupported'):
        fixture(11).node(100)


def test_invalid_mask_fails(tmp_path):
    with pytest.raises(ValueError, match='64 bytes'):
        KsbcReader(tmp_path / 'missing', b'')


@pytest.mark.parametrize(('kind', 'raw', 'value'), [
    # Measured on the live client: a contaminated affix's Mark (-200) and 攻击 (-76),
    # a 12v12 LoseScore (-30) and a MinValue constant (-99999).
    (2, b'\xe2', -30),
    (4, b'\x38\xff', -200),
    (6, struct.pack('<i', -99999), -99999),
])
def test_signed_widths(kind, raw, value):
    assert fixture(kind, raw).node(100) == {'name': value}
