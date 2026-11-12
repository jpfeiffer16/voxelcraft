# VoxelCraft for Palm OS 5 (Tungsten E2)
#   make            -> VoxelCraft.prc
#   make host       -> native PC test harness (screenshots into /tmp/vcshots)
#   make check      -> verify the ARM blob is relocation-free and fits a resource
# Needs: prc-tools (m68k-palmos-gcc, build-prc), PilRC, arm-none-eabi-gcc, Palm OS SDK 5r3 (PALMSDK).

PALMSDK ?= /workspace/palmtools/sdk/sdk-5r3
PILRC   ?= pilrc
M68KCC  ?= m68k-palmos-gcc
# Prefer a modern arm-none-eabi-gcc (needed for -fno-jump-tables). gcc 3.3's
# arm-palmos-gcc emits absolute jump tables that crash a raw PNOlet on device.
ARM_TOOLCHAIN ?= /tmp/armgcc/xpack-arm-none-eabi-gcc-14.2.1-1.1/bin
ARMCC   ?= $(firstword $(wildcard $(ARM_TOOLCHAIN)/arm-none-eabi-gcc) arm-none-eabi-gcc)
OBJCOPY ?= $(firstword $(wildcard $(ARM_TOOLCHAIN)/arm-none-eabi-objcopy) arm-none-eabi-objcopy)
OBJDUMP ?= $(firstword $(wildcard $(ARM_TOOLCHAIN)/arm-none-eabi-objdump) arm-none-eabi-objdump)
B := build

SDKINC  := $(shell find $(PALMSDK)/include -type d | sed 's/^/-I/')
M68KFLAGS := -O2 -Wall -Wno-unused $(SDKINC)
ARMFLAGS := -Os -march=armv5te -marm -mfloat-abi=soft -fPIC -fvisibility=hidden -ffreestanding -fno-builtin \
            -nostdlib -fno-jump-tables -fno-tree-loop-distribute-patterns -fno-common -w
CORE := $(wildcard src/core/*.c src/core/*.h) src/shared.h
SPRITES := zombie dog cat horse lion wolf spider

all: VoxelCraft.prc

$(B):
	mkdir -p $(B)

# ---- ARM native core: one flat position-independent blob in resource 'ARMC' 1 ----
$(B)/armc.elf: src/arm/entry.c src/arm/pno.ld $(CORE) | $(B)
	$(ARMCC) $(ARMFLAGS) -c src/arm/entry.c -o $(B)/entry.o
	$(ARMCC) -nostdlib -T src/arm/pno.ld -Wl,--no-undefined -o $@ $(B)/entry.o -lgcc

$(B)/ARMC0001.bin: $(B)/armc.elf
	@if $(OBJDUMP) -h $< | grep -Eq ' \.(got|data|bss|rel)'; then echo "ARM blob has writable data/relocations" >&2; exit 1; fi
	$(OBJCOPY) -O binary -j .text $< $@
	@sz=$$(stat -c %s $@); echo "ARM core: $$sz bytes"; test $$sz -lt 65000

# ---- art: RGB565 little-endian tiles and 4-view mob sprites ----
$(B)/VXtl0000.bin: res/tiles0.bin | $(B)
	cp $< $@
$(B)/VXtl0001.bin: res/tiles1.bin | $(B)
	cp $< $@
SPRBINS := $(foreach i,0 1 2 3 4 5 6,$(B)/VXsp000$(i).bin)
$(SPRBINS): $(addprefix res/spr_,$(addsuffix .bin,$(SPRITES))) | $(B)
	i=0; for s in $(SPRITES); do cp res/spr_$$s.bin $(B)/VXsp000$$i.bin; i=$$((i+1)); done

# ---- 68K shell + UI resources ----
$(B)/app: src/m68k/app.c src/m68k/resource.h src/shared.h | $(B)
	$(M68KCC) $(M68KFLAGS) -o $@ src/m68k/app.c

$(B)/rsrc.stamp: src/m68k/app.rcp src/m68k/resource.h $(wildcard res/*.bmp) | $(B)
	cd src/m68k && $(PILRC) -q -I . app.rcp ../../$(B)
	touch $@

VoxelCraft.prc: src/m68k/VoxelCraft.def $(B)/app $(B)/rsrc.stamp $(B)/ARMC0001.bin $(B)/VXtl0000.bin $(B)/VXtl0001.bin $(SPRBINS)
	build-prc -o $@ src/m68k/VoxelCraft.def $(B)/app $(B)/ARMC0001.bin $(B)/VXtl0000.bin $(B)/VXtl0001.bin $(SPRBINS) \
	  $(filter-out $(B)/ARMC0001.bin $(B)/VXtl% $(B)/VXsp%,$(wildcard $(B)/*.bin))
	python3 tools/patch_prc.py $@
	@ls -l $@

check: $(B)/ARMC0001.bin
	$(firstword $(wildcard $(ARM_TOOLCHAIN)/arm-none-eabi-size) arm-none-eabi-size) -A $(B)/armc.elf

host: src/host/host.c $(CORE)
	gcc -O2 -w -o $(B)/host src/host/host.c
	mkdir -p /tmp/vcshots && $(B)/host res /tmp/vcshots

test: src/host/roundtrip.c src/host/cmp.c $(CORE)
	mkdir -p $(B)
	gcc -O2 -w -o $(B)/roundtrip src/host/roundtrip.c && $(B)/roundtrip res 500 && $(B)/roundtrip res 60000
	gcc -O2 -w -o $(B)/cmp src/host/cmp.c && $(B)/cmp res
	gcc -O2 -w -o $(B)/canary src/host/canary.c && $(B)/canary res

strict: $(B)/ARMC0001.bin
	python3 tools/armstrict.py $(B) res

clean:
	rm -rf $(B) VoxelCraft.prc

.PHONY: all check host test strict clean
