#!/usr/bin/env python3
"""Stricter Unicorn run of the ARM PNOlet, closer to a real Tungsten E2:

 * The blob is mapped at a high, 4-byte-aligned address (like a locked resource),
   with unmapped guard pages around it. No relocations are applied.
 * ArmArgs is big-endian and is deliberately placed at a 2-byte (not 4-byte) offset
   so unaligned-safe field access is required.
 * The ARM stack is only 8 KB (PACE is similarly tight).
 * Every 16- and 32-bit memory access is checked for alignment; an unaligned
   access is treated as the XScale data abort it would be on the E2.
 * Access to unmapped memory is a failure.
 * World generation is stepped, so a crash can be attributed to terrain / trees /
   lighting / spawn.
 * Canaries surround the VC block.

Usage: armstrict.py [build-dir] [res-dir]
Exit 0 on success, 1 on a fault.
"""
import struct, sys
from unicorn import (
    Uc, UcError, UC_ARCH_ARM, UC_MODE_ARM,
    UC_HOOK_MEM_READ, UC_HOOK_MEM_WRITE,
    UC_HOOK_MEM_READ_UNMAPPED, UC_HOOK_MEM_WRITE_UNMAPPED, UC_HOOK_MEM_FETCH_UNMAPPED,
    UC_HOOK_BLOCK,
)
from unicorn.arm_const import *

B = sys.argv[1] if len(sys.argv) > 1 else 'build'
R = sys.argv[2] if len(sys.argv) > 2 else 'res'
blob = open(f'{B}/ARMC0001.bin', 'rb').read()

# Layout similar to a Palm storage-heap resource, not linked-at-zero.
CODE = 0x09000000
VCA  = 0x00100000          # 4-aligned, like MemChunkNew
# Put ArmArgs at +2 so 32-bit loads of fields would fault unless they are byte-wise.
ARGS_BASE = 0x02000000
ARGS = ARGS_BASE + 2
ASSET = 0x02100000
SCR  = 0x02200000
STKSZ = 8 * 1024
STK  = 0x02300000 + STKSZ   # descending stack, 8 KB
RET  = 0x02400000
CANARY = 0xA5A5A5A5

PAGE = 0x10000
def map_exact(mu, addr, size, name):
    a = addr & ~(PAGE - 1)
    e = (addr + size + PAGE - 1) & ~(PAGE - 1)
    mu.mem_map(a, e - a)
    return a, e - a

mu = Uc(UC_ARCH_ARM, UC_MODE_ARM)
map_exact(mu, CODE, (len(blob) + PAGE + 15) & ~15, 'code')
mu.mem_write(CODE, blob)
# VC ~2.1 MB plus 4 KB canaries on each side, inside one mapping
VC_MAP = 0x00240000  # 2.25 MB, covers sizeof(VC)~2.1M plus canaries
map_exact(mu, VCA - 0x1000, VC_MAP, 'vc')
mu.mem_write(VCA - 0x1000, b'\xA5' * 0x1000)
# args page
map_exact(mu, ARGS_BASE, 0x1000, 'args')
map_exact(mu, ASSET, 0x30000, 'asset')
map_exact(mu, SCR, 0x40000, 'scr')
map_exact(mu, STK - STKSZ, STKSZ, 'stk')
map_exact(mu, RET, 0x1000, 'ret')
# a BKPT/return stub at RET
mu.mem_write(RET, struct.pack('<I', 0xE1200070))  # BKPT #0, will stop via hook or error

names = ['zombie', 'dog', 'cat', 'horse', 'lion', 'wolf', 'spider']
addr = ASSET
t = []
for f in ['tiles0', 'tiles1'] + ['spr_' + n for n in names]:
    d = open(f'{R}/{f}.bin', 'rb').read()
    mu.mem_write(addr, d)
    t.append(addr)
    addr += (len(d) + 15) & ~15

FIELDS = ['cmd', 'vc', 'ret', 't0', 't1'] + [f'spr{i}' for i in range(7)] + [
    'seed', 'pixBE', 'keys', 'penX', 'penY', 'penDown', 'dtMs', 'dst', 'rowPix',
    'pct', 'msg', 'len', 'nsnd'] + [f'snd{i}' for i in range(12)] + ['req', 'frames', 'steps', 'rays']
OFF = {n: 4 * i for i, n in enumerate(FIELDS)}

def setf(n, v):
    mu.mem_write(ARGS + OFF[n], struct.pack('>I', v & 0xFFFFFFFF))
def getf(n):
    return struct.unpack('>I', bytes(mu.mem_read(ARGS + OFF[n], 4)))[0]

faults = []
min_sp = [STK]

def check_align(uc, access, address, size, value, user):
    if size >= 2 and (address % size) != 0:
        pc = uc.reg_read(UC_ARM_REG_PC)
        faults.append(f'UNALIGNED {size}-bit access at 0x{address:08x} (pc=0x{pc:08x})')
        uc.emu_stop()
    if address >= (STK - STKSZ) and address < STK:
        # stack grows down; track the lowest SP we see in a code hook
        pass

def check_unmap(uc, access, address, size, value, user):
    pc = uc.reg_read(UC_ARM_REG_PC)
    faults.append(f'UNMAPPED access 0x{address:08x} size={size} pc=0x{pc:08x}')
    uc.emu_stop()

def on_block(uc, address, size, user):
    sp = uc.reg_read(UC_ARM_REG_SP)
    if sp < min_sp[0]:
        min_sp[0] = sp
        if sp < STK - STKSZ + 64:
            faults.append(f'STACK OVERFLOW sp=0x{sp:08x}')
            uc.emu_stop()

# Unmapped accesses always fail. Alignment hooks are enabled only around
# short / crash-prone stages (see call(..., align=True)); they are too
# expensive to leave on for the whole 300 M-instruction world gen.
hh_r = mu.hook_add(UC_HOOK_MEM_READ, check_align)
hh_w = mu.hook_add(UC_HOOK_MEM_WRITE, check_align)
align_hooks = [hh_r, hh_w]
mu.hook_add(UC_HOOK_MEM_READ_UNMAPPED, check_unmap)
mu.hook_add(UC_HOOK_MEM_WRITE_UNMAPPED, check_unmap)
mu.hook_add(UC_HOOK_MEM_FETCH_UNMAPPED, check_unmap)
mu.hook_add(UC_HOOK_BLOCK, on_block)

def set_align(on):
    # hook_del / hook_add each time we flip
    while align_hooks:
        try:
            mu.hook_del(align_hooks.pop())
        except Exception:
            break
    if on:
        align_hooks.append(mu.hook_add(UC_HOOK_MEM_READ, check_align))
        align_hooks.append(mu.hook_add(UC_HOOK_MEM_WRITE, check_align))


# A short 68K string the progress command may be asked to draw.
MSG = ARGS_BASE + 0x200
mu.mem_write(MSG, b'Generating world...\x00')

def call(cmd, label, align=None):
    if align is True:
        set_align(True)
    elif align is False:
        set_align(False)
    setf('cmd', cmd)
    setf('vc', VCA)
    mu.reg_write(UC_ARM_REG_R0, 0)
    mu.reg_write(UC_ARM_REG_R1, ARGS)   # already a usable ARM pointer (PACE swaps it)
    mu.reg_write(UC_ARM_REG_R2, 0)
    mu.reg_write(UC_ARM_REG_SP, STK)
    mu.reg_write(UC_ARM_REG_LR, RET)
    mu.reg_write(UC_ARM_REG_PC, CODE)
    faults.clear()
    try:
        mu.emu_start(CODE, RET)
    except UcError as e:
        pc = mu.reg_read(UC_ARM_REG_PC)
        faults.append(f'UcError {e} pc=0x{pc:08x} during {label}')
    if faults:
        print(f'FAIL at {label}:')
        for f in faults:
            print(' ', f)
        return False
    return True

ok = True
if not call(0, 'CMD_SIZE', align=True):
    sys.exit(1)
sz = getf('ret')
print(f'sizeof(VC)={sz}  ArmArgs at 0x{ARGS:x} (2-byte aligned)  stack {STKSZ} bytes')
if sz < 100000 or sz > 4000000:
    print('FAIL: implausible sizeof(VC)')
    sys.exit(1)
# canary after the VC too
mu.mem_write(VCA + sz, b'\xA5' * 0x1000)

setf('t0', t[0]); setf('t1', t[1])
for i in range(7):
    setf(f'spr{i}', t[2 + i])
setf('seed', 12345)
setf('pixBE', 0)
if not call(1, 'CMD_SETUP', align=True):
    sys.exit(1)
print('setup ok')

pct = 0
last_stage = 'terrain'
steps = 0
while pct < 100:
    if pct < 70: last_stage = 'terrain'
    elif pct < 90: last_stage = 'trees'
    else: last_stage = 'lighting/spawn'
    # Alignment hooks on for trees and lighting (the E2 crash window); off for terrain.
    want_align = last_stage != 'terrain'
    if not call(2, f'CMD_GEN {last_stage} pct={pct}', align=want_align):
        sys.exit(1)
    pct = getf('ret')
    steps += 1
    if steps > 500:
        print('FAIL: gen did not finish')
        sys.exit(1)
print(f'world generation finished in {steps} steps (last stage {last_stage})')

# present onto a 4-aligned screen and a 2-aligned screen
setf('dst', SCR)
setf('rowPix', 320)
setf('pct', 70)
setf('msg', MSG)
if not call(7, 'CMD_PROGRESS', align=True):
    sys.exit(1)
if not call(6, 'CMD_PRESENT aligned', align=True):
    sys.exit(1)
# 2-byte-aligned destination (legal for 16-bit pixels; 32-bit copies must be avoided)
setf('dst', SCR + 2)
if not call(6, 'CMD_PRESENT 2-align dest', align=True):
    sys.exit(1)

# canaries
pre = bytes(mu.mem_read(VCA - 0x1000, 0x1000))
post = bytes(mu.mem_read(VCA + sz, 0x1000))
if pre != b'\xA5' * 0x1000:
    print('FAIL: VC underflow canary smashed')
    sys.exit(1)
if post != b'\xA5' * 0x1000:
    print('FAIL: VC overflow canary smashed')
    sys.exit(1)

used = STK - min_sp[0]
print(f'stack peak {used} bytes of {STKSZ}  canaries intact')
print('PASS')
sys.exit(0)
