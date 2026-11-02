#!/usr/bin/env python3
"""Run the real ARM core blob (build/ARMC0001.bin) under Unicorn exactly as PceNativeCall would
(r0 = emulState, r1 = big-endian ArmArgs*, r2 = call68k) and count executed ARM instructions.
Converts to an estimated Tungsten E2 frame rate (PXA255 @ 200 MHz) for a range of cycles-per-instruction.
Usage: armbench.py [build-dir] [res-dir] [out.ppm-prefix]"""
import struct, sys, time
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_ARM, UC_HOOK_BLOCK
from unicorn.arm_const import *

B = sys.argv[1] if len(sys.argv) > 1 else 'build'
R = sys.argv[2] if len(sys.argv) > 2 else 'res'
OUT = sys.argv[3] if len(sys.argv) > 3 else '/tmp/armbench'
blob = open(f'{B}/ARMC0001.bin', 'rb').read()
CODE, VCA, ARGS, ASSET, SCR, STK, RET = 0x100000, 0x1000000, 0x400000, 0x500000, 0x800000, 0x900000, 0xDEAD000
mu = Uc(UC_ARCH_ARM, UC_MODE_ARM)
mu.mem_map(CODE, 0x20000); mu.mem_write(CODE, blob)
mu.mem_map(VCA, 0x300000); mu.mem_map(ARGS, 0x1000); mu.mem_map(ASSET, 0x30000)
mu.mem_map(SCR, 0x40000); mu.mem_map(STK - 0x10000, 0x10000); mu.mem_map(RET, 0x1000)
names = ['zombie', 'dog', 'cat', 'horse', 'lion', 'wolf', 'spider']
addr = ASSET; t = []
for f in ['tiles0', 'tiles1'] + ['spr_' + n for n in names]:
    d = open(f'{R}/{f}.bin', 'rb').read(); mu.mem_write(addr, d); t.append(addr); addr += (len(d) + 15) & ~15
FIELDS = ['cmd', 'vc', 'ret', 't0', 't1'] + [f'spr{i}' for i in range(7)] + ['seed', 'pixBE', 'keys', 'penX', 'penY', 'penDown', 'dtMs', 'dst', 'rowPix', 'pct', 'msg', 'len', 'nsnd'] + [f'snd{i}' for i in range(12)] + ['req', 'frames', 'steps', 'rays']
OFF = {n: 4 * i for i, n in enumerate(FIELDS)}
def setf(n, v): mu.mem_write(ARGS + OFF[n], struct.pack('>I', v & 0xFFFFFFFF))
def getf(n): return struct.unpack('>I', bytes(mu.mem_read(ARGS + OFF[n], 4)))[0]
count = [0]
def hb(uc, a, size, ud): count[0] += size >> 2
mu.hook_add(UC_HOOK_BLOCK, hb)
maxsp = [STK]
def call(cmd):
    setf('cmd', cmd); setf('vc', VCA)
    mu.reg_write(UC_ARM_REG_R0, 0); mu.reg_write(UC_ARM_REG_R1, ARGS); mu.reg_write(UC_ARM_REG_R2, 0)
    mu.reg_write(UC_ARM_REG_SP, STK); mu.reg_write(UC_ARM_REG_LR, RET)
    c0 = count[0]; mu.emu_start(CODE, RET); return count[0] - c0
call(0); print('sizeof(VC) from ARM:', getf('ret'))
setf('t0', t[0]); setf('t1', t[1])
for i in range(7): setf(f'spr{i}', t[2 + i])
setf('seed', 12345); setf('pixBE', 1)
n = call(1); print(f'setup: {n/1e6:.2f} M instr')
gen = 0; pct = 0
while pct < 100:
    gen += call(2); pct = getf('ret')
print(f'world generation: {gen/1e6:.1f} M instr')
def frame(keys=0, dt=50):
    setf('keys', keys); setf('dtMs', dt); setf('penDown', 0); return call(3)
def present():
    setf('dst', SCR); setf('rowPix', 320); return call(6)
res = {}
for name, keys, n in [('stand', 0, 10), ('walk', 1, 20), ('turn+walk', 1 | 8, 20)]:
    tot = 0
    for i in range(n): tot += frame(keys)
    p = present(); res[name] = (tot / n, p)
    print(f'{name:10s}: frame {tot/n/1e6:.2f} M instr + present {p/1e6:.2f} M; steps/ray {getf("steps")/max(1,getf("rays")):.1f}')
# dump the last presented frame (big-endian 565) as PPM to prove the ARM build renders
pix = bytes(mu.mem_read(SCR, 320 * 320 * 2))
with open(OUT + '.ppm', 'wb') as f:
    f.write(b'P6 320 320 255\n')
    for i in range(320 * 320):
        c = (pix[2 * i] << 8) | pix[2 * i + 1]
        f.write(bytes((((c >> 11) & 31) * 255 // 31, ((c >> 5) & 63) * 255 // 63, (c & 31) * 255 // 31)))
print('wrote', OUT + '.ppm')
avg = sum(a + b for a, b in res.values()) / len(res)
for cpi in (1.3, 1.6, 2.0):
    print(f'CPI {cpi}: ~{200e6 / (avg * cpi):.1f} fps (+ WinDrawBitmap blit), world gen ~{gen * cpi / 200e6:.1f} s')
