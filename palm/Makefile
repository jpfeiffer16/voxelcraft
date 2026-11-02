# VoxelCraft for Palm OS 5 (Tungsten E2)
#   make            -> VoxelCraft.prc
#   make host       -> native PC test harness (screenshots into /tmp/vcshots)
#   make check      -> verify the ARM blob is relocation-free and fits a resource
# Needs: prc-tools (m68k-palmos-gcc, build-prc), PilRC, arm-none-eabi-gcc, Palm OS SDK 5r3 (PALMSDK).

PALMSDK ?= /workspace/palmtools/sdk/sdk-5r3
PILRC   ?= pilrc
M68KCC  ?= m68k-palmos-gcc
ARMCC   ?= arm-none-eabi-gcc
OBJCOPY ?= arm-none-eabi-objcopy
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
	@if arm-none-eabi-objdump -h $< | grep -Eq ' \.(got|data|bss|rel)'; then echo "ARM blob has writable data/relocations" >&2; exit 1; fi
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
	@ls -l $@

check: $(B)/ARMC0001.bin
	arm-none-eabi-size -A $(B)/armc.elf

host: src/host/host.c $(CORE)
	gcc -O2 -w -o $(B)/host src/host/host.c
	mkdir -p /tmp/vcshots && $(B)/host res /tmp/vcshots

clean:
	rm -rf $(B) VoxelCraft.prc

.PHONY: all check host clean
