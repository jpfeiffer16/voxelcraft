#!/usr/bin/env python3
"""Per-function instruction profile of the ARM core (one generation pass + N frames)."""
import subprocess, bisect, collections, sys, runpy
sys.argv = ['armbench.py', 'build', 'res', '/tmp/armprof']
syms = []
for l in subprocess.check_output(['arm-none-eabi-nm', '-n', 'build/armc.elf'], text=True).splitlines():
    p = l.split()
    if len(p) == 3 and p[1] in 'tTW': syms.append((int(p[0], 16), p[2]))
addrs = [a for a, _ in syms]
import unicorn
prof = collections.Counter(); phase = ['gen']
orig = unicorn.Uc.hook_add
def hook_add(self, kind, cb, *a, **k):
    def wrap(uc, addr, size, ud):
        cb(uc, addr, size, ud)
        i = bisect.bisect_right(addrs, addr - 0x100000) - 1
        prof[(phase[0], syms[i][1] if i >= 0 else '?')] += size >> 2
    return orig(self, kind, wrap, *a, **k)
unicorn.Uc.hook_add = hook_add
import builtins
_print = builtins.print
def pr(*a, **k):
    _print(*a, **k)
    s = ' '.join(map(str, a))
    if s.startswith('world generation'): phase[0] = 'frame'
builtins.print = pr
runpy.run_path('tools/armbench.py', run_name='__main__')
builtins.print = _print
for ph in ('gen', 'frame'):
    tot = sum(v for (p, _), v in prof.items() if p == ph)
    print(f'--- {ph}: {tot/1e6:.1f} M')
    for (p, n), v in prof.most_common():
        if p == ph and v > tot * 0.01: print(f'  {v/tot*100:5.1f}%  {n}')
