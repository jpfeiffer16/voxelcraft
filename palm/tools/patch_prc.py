#!/usr/bin/env python3
"""Set the 'pref' stack (16 KB) and min-heap (128 KB), and the PRC version number."""
import struct, sys
path = sys.argv[1]
data = bytearray(open(path, 'rb').read())
# header: name[32], attrs u16, version u16
data[34:36] = struct.pack('>H', 3)
n = struct.unpack('>H', data[76:78])[0]
off = 78
ents = []
for i in range(n):
    typ = bytes(data[off:off+4]); rid = struct.unpack('>H', data[off+4:off+6])[0]
    roff = struct.unpack('>I', data[off+6:off+10])[0]
    ents.append((typ, rid, roff)); off += 10
ents_sorted = sorted(ents, key=lambda e: e[2])
for i, (typ, rid, roff) in enumerate(ents_sorted):
    end = ents_sorted[i+1][2] if i+1 < len(ents_sorted) else len(data)
    if typ == b'pref' and end - roff >= 10:
        flags = struct.unpack('>H', data[roff:roff+2])[0]
        data[roff:roff+10] = struct.pack('>HII', flags, 16384, 131072)
open(path, 'wb').write(data)
print('patched pref stack=16384 minHeap=131072 version=3')
