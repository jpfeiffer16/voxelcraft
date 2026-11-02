/* Flat position-independent ARM blob: entry first, code + read-only data only */
ENTRY(entry)
SECTIONS {
  . = 0;
  .text : { *(.text.entry) *(.text*) *(.rodata*) *(.glue_7*) *(.vfp11_veneer) *(.v4_bx) }
  .got : { *(.got*) }
  .data : { *(.data*) *(.bss*) *(COMMON) }
  /DISCARD/ : { *(.ARM.exidx*) *(.ARM.extab*) *(.comment) *(.note*) *(.ARM.attributes) }
}
