/* VoxelCraft for Palm OS 5 (Tungsten E2) - 68K shell.
 * Owns everything that talks to Palm OS (events, keys, pen, screen bitmap, sound, the save database)
 * and calls the ARM native core (resource 'ARMC' 1) through PceNativeCall once per step/frame. */
#include <PalmOS.h>
#include <PceNativeCall.h>
#include "../shared.h"
#include "resource.h"

#define CREATOR 'VxCf'
#define SAVE_NAME "VoxelCraftSave"
#define SAVE_TYPE 'DATA'
#define LOG_NAME "VxLg"
#define LOG_TYPE 'DATA'
#define PREF_NAME "VoxelCraftPref"
#define PREF_TYPE 'DATA'
#define REC_MAX 32000UL
#ifndef memNewChunkFlagAllowLarge
#define memNewChunkFlagAllowLarge 0x1000
#endif
#ifndef kMinRomVersion
#define kMinRomVersion sysMakeROMVersion(5, 0, 0, sysROMStageRelease, 0)
#endif
/* palmOne 5-way (palmOneNavigator.h) */
#ifndef keyBitNavLeft
#define keyBitNavLeft 0x01000000UL
#define keyBitNavRight 0x02000000UL
#define keyBitNavSelect 0x04000000UL
#endif
#ifndef vchrNavChange
#define vchrNavChange 0x0503
#endif
#ifndef pixelFormat565LE
#define pixelFormat565LE 2
#endif
/* core key bits (src/core/vc.h) */
#define K_UP 1
#define K_DOWN 2
#define K_LEFT 4
#define K_RIGHT 8
#define K_CENTER 16
#define K_JUMP 32
#define K_BREAK 64
#define K_PLACE 128
#define K_INV 256
#define K_MENU 512
#define REQ_SAVE 1
#define REQ_QUIT 2
#define REQ_NEWWORLD 4
#define REQ_PIXSWAP 8
#ifndef keyBitHard4
#define keyBitHard4 0x00000020UL
#endif

typedef struct {
  MemHandle armH, tileH[2], sprH[7];
  void *arm;          /* 4-byte-aligned ARM entry (resource or a copy) */
  void *armCopy;      /* extra chunk if the resource itself was unaligned */
  void *vc;
  UInt32 vcSize;
  Boolean vcInStorage; /* allocated with FtrPtrNew: need the write semaphore */
  BitmapType *bmp; BitmapTypeV3 *bmp3; UInt16 *bits; UInt16 rowBytes;
  ArmArgs a;
  UInt32 menuKey;      /* one-shot K_MENU from the silkscreen Menu button */
  Boolean quit;
  UInt16 sndVol;
  UInt32 calPixBE;     /* empirical offscreen-bitmap endianness (1 = ARM must swap) */
} App;

/* ---- tiny persistent stage log so a Fatal Exception can be reported ---- */
static void log_stage(const char *msg) {
  LocalID id; DmOpenRef db; MemHandle h; UInt16 at, n;
  if (!msg) return;
  id = DmFindDatabase(0, LOG_NAME);
  if (!id) {
    if (DmCreateDatabase(0, LOG_NAME, CREATOR, LOG_TYPE, false) != 0) return;
    id = DmFindDatabase(0, LOG_NAME);
    if (!id) return;
  }
  db = DmOpenDatabase(0, id, dmModeReadWrite);
  if (!db) return;
  while (DmNumRecords(db)) DmRemoveRecord(db, 0);
  for (n = 0; msg[n]; n++) {}
  n++;
  at = dmMaxRecordIndex;
  h = DmNewRecord(db, &at, n);
  if (h) {
    DmWrite(MemHandleLock(h), 0, msg, n);
    MemHandleUnlock(h);
    DmReleaseRecord(db, at, true);
  }
  DmCloseDatabase(db);
}

static void log_clear(void) {
  LocalID id = DmFindDatabase(0, LOG_NAME);
  if (id) DmDeleteDatabase(0, id);
}

/* If the previous launch died mid-start, tell the user the last stage reached. */
static void show_last_stage(void) {
  LocalID id = DmFindDatabase(0, LOG_NAME);
  DmOpenRef db; MemHandle h; char buf[48];
  if (!id) return;
  db = DmOpenDatabase(0, id, dmModeReadOnly);
  if (!db) return;
  h = DmNumRecords(db) ? DmQueryRecord(db, 0) : 0;
  buf[0] = 0;
  if (h) {
    UInt16 n = (UInt16)MemHandleSize(h); char *p = (char *)MemHandleLock(h);
    if (n > 47) n = 47;
    if (n) MemMove(buf, p, n);
    buf[n] = 0; if (n && buf[n - 1] == 0) {}
    MemHandleUnlock(h);
  }
  DmCloseDatabase(db);
  if (buf[0]) FrmCustomAlert(AlertLastStage, buf, "", "");
}

/* Returns true if buf was filled with the last VxLg stage name. */
static Boolean read_stage(char *buf, UInt16 max) {
  LocalID id = DmFindDatabase(0, LOG_NAME);
  DmOpenRef db; MemHandle h;
  if (buf && max) buf[0] = 0;
  if (!id || !buf || max < 2) return false;
  db = DmOpenDatabase(0, id, dmModeReadOnly);
  if (!db) return false;
  h = DmNumRecords(db) ? DmQueryRecord(db, 0) : 0;
  if (h) {
    UInt16 n = (UInt16)MemHandleSize(h); char *p = (char *)MemHandleLock(h);
    if (n >= max) n = (UInt16)(max - 1);
    if (n) MemMove(buf, p, n);
    buf[n] = 0;
    MemHandleUnlock(h);
  }
  DmCloseDatabase(db);
  return buf[0] != 0;
}

static Boolean stage_is_play(const char *s) {
  const char *a, *b;
  if (!s || !s[0]) return false;
  /* "Loading saved world", "Starting play", "Playing", "First frame" */
  a = s; b = "Loading saved";
  while (*b && *a == *b) { a++; b++; }
  if (*b == 0) return true;
  a = s; b = "Starting play";
  while (*b && *a == *b) { a++; b++; }
  if (*b == 0) return true;
  a = s; b = "Playing";
  while (*b && *a == *b) { a++; b++; }
  if (*b == 0) return true;
  a = s; b = "First frame";
  while (*b && *a == *b) { a++; b++; }
  return *b == 0;
}

static Boolean hold_memo(void) {
  return (KeyCurrentState() & keyBitHard4) != 0;
}

/* 0 = try to load a save if one exists, 1 = start a new world (do not load). */
static int decide_load(void) {
  char buf[48];
  Boolean have = read_stage(buf, 48);
  if (hold_memo()) {
    FrmAlert(AlertSkipSave);
    return 1;
  }
  if (have && stage_is_play(buf)) {
    /* Button 1 = Continue, button 2 = New World (Palm buttons are 1-based). */
    if (FrmCustomAlert(AlertCrashLoad, buf, "", "") == 2) return 1;
    return 0;
  }
  if (have) FrmCustomAlert(AlertLastStage, buf, "", "");
  return 0;
}

static void pref_set(UInt8 pixBE) {
  LocalID id = DmFindDatabase(0, PREF_NAME);
  DmOpenRef db; MemHandle h; UInt16 at; UInt8 rec[2];
  rec[0] = 'C'; rec[1] = pixBE ? 1 : 0;
  if (!id) {
    if (DmCreateDatabase(0, PREF_NAME, CREATOR, PREF_TYPE, false) != 0) return;
    id = DmFindDatabase(0, PREF_NAME);
    if (!id) return;
  }
  db = DmOpenDatabase(0, id, dmModeReadWrite);
  if (!db) return;
  {
    UInt16 attr = 0;
    DmDatabaseInfo(0, id, 0, &attr, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    if (!(attr & dmHdrAttrBackup)) { attr |= dmHdrAttrBackup; DmSetDatabaseInfo(0, id, 0, &attr, 0, 0, 0, 0, 0, 0, 0, 0, 0); }
  }
  while (DmNumRecords(db)) DmRemoveRecord(db, 0);
  at = dmMaxRecordIndex;
  h = DmNewRecord(db, &at, 2);
  if (h) {
    DmWrite(MemHandleLock(h), 0, rec, 2);
    MemHandleUnlock(h);
    DmReleaseRecord(db, at, true);
  }
  DmCloseDatabase(db);
}

/* 0/1 = stored override, 2 = none (use calibration). */
static int pref_get(void) {
  LocalID id = DmFindDatabase(0, PREF_NAME);
  DmOpenRef db; MemHandle h; int v = 2;
  if (!id) return 2;
  db = DmOpenDatabase(0, id, dmModeReadOnly);
  if (!db) return 2;
  h = DmNumRecords(db) ? DmQueryRecord(db, 0) : 0;
  if (h && MemHandleSize(h) >= 2) {
    UInt8 *p = (UInt8 *)MemHandleLock(h);
    if (p[0] == 'C') v = p[1] ? 1 : 0;
    MemHandleUnlock(h);
  }
  DmCloseDatabase(db);
  return v;
}

/* Draw known pixels with the 68K blitter into the same offscreen bitmap ARM will
   write, then read the raw bytes. This is the only reliable way to learn the
   endianness and row stride of BmpCreate + BmpCreateBitmapV3 on a given device.
   Fallback if it fails: swap (pixBE=1), which is what 1.0 effectively did, and
   640-byte rows (320 pixels). */
static void calibrate_pixels(App *s) {
  Err err = 0;
  WinHandle wh, oldW;
  UInt16 oldc, rb = 0, rb3 = 0;
  Coord w = 0, h = 0;
  RGBColorType red, grn, prev;
  UInt8 *bits;
  Int32 row;
  Boolean be = true; /* 1.0 default: ARM writes byte-swapped (68K-BE) pixels */
  int ov;

  oldc = WinSetCoordinateSystem(kCoordinatesNative);
  BmpGetDimensions(s->bmp, &w, &h, &rb);
  if (s->bmp3) BmpGetDimensions((BitmapType *)s->bmp3, 0, 0, &rb3);
  WinSetCoordinateSystem(oldc);
  /* Never trust a halved stride. BmpGetDimensions may return standard-density
     width/height (160) depending on the current coordinate system; rowBytes is
     documented as the real byte count, but we still refuse anything under 640
     for a 320-wide 16-bpp buffer. */
  if (rb3 >= 640) row = rb3;
  else if (rb >= 640) row = rb;
  else row = 640;
  s->rowBytes = (UInt16)row;
  s->a.rowPix = (UInt32)(row / 2);
  if (s->a.rowPix < 320) { s->rowBytes = 640; s->a.rowPix = 320; }

  bits = (UInt8 *)s->bits;
  if (!bits) { s->calPixBE = 1; s->a.pixBE = 1; return; }

  red.index = 0; red.r = 0xF8; red.g = 0; red.b = 0;
  grn.index = 0; grn.r = 0; grn.g = 0xFC; grn.b = 0;
  wh = WinCreateBitmapWindow(s->bmp3 ? (BitmapType *)s->bmp3 : s->bmp, &err);
  if (wh && err == 0) {
    Int16 i, found = 0;
    oldW = WinSetDrawWindow(wh);
    oldc = WinSetCoordinateSystem(kCoordinatesNative);
    WinSetForeColorRGB(&red, &prev);
    WinDrawPixel(0, 0);
    WinSetForeColorRGB(&grn, &prev);
    WinDrawPixel(0, 1);
    WinSetCoordinateSystem(oldc);
    WinSetDrawWindow(oldW);
    WinDeleteWindow(wh, false);

    /* RGB565 red is 0xF800, green is 0x07E0. */
    if (bits[0] == 0xF8 && bits[1] == 0x00) be = true;       /* BE in memory: ARM must swap */
    else if (bits[0] == 0x00 && bits[1] == 0xF8) be = false; /* LE in memory */
    else be = true; /* keep the 1.0 default if the probe did not land */

    for (i = 2; i < 2048; i += 2) {
      UInt16 vbe = (UInt16)(((UInt16)bits[i] << 8) | bits[i + 1]);
      UInt16 vle = (UInt16)(bits[i] | ((UInt16)bits[i + 1] << 8));
      if (vbe == 0x07E0 || vle == 0x07E0) { found = i; break; }
    }
    if (found >= 640 && found <= 768 && (found % 2) == 0) {
      s->rowBytes = (UInt16)found;
      s->a.rowPix = (UInt32)found / 2;
    }
    bits[0] = bits[1] = 0;
    if (s->rowBytes >= 2) { bits[s->rowBytes] = 0; bits[s->rowBytes + 1] = 0; }
  }

  s->calPixBE = be ? 1 : 0;
  ov = pref_get();
  s->a.pixBE = (ov == 2) ? s->calPixBE : (UInt32)ov;
}

static void u32dec(char *out, UInt32 v) {
  char tmp[12]; int n = 0, i;
  if (!v) { out[0] = '0'; out[1] = 0; return; }
  while (v && n < 11) { tmp[n++] = (char)('0' + (v % 10)); v /= 10; }
  for (i = 0; i < n; i++) out[i] = tmp[n - 1 - i];
  out[n] = 0;
}

static void alert_nomem(UInt32 need) {
  UInt32 freeb = 0, maxc = 0; char a[12], b[12];
  MemHeapFreeBytes(0, &freeb, &maxc);
  u32dec(a, (need ? need : freeb) / 1024);
  u32dec(b, maxc / 1024);
  FrmCustomAlert(AlertNoMem, a, b, "");
}

/* ---- ARM call: 68K writes ArmArgs as native big-endian words; the ARM side swaps fields. */
static void arm_reserve(App *s, Boolean grab) {
  if (s->vcInStorage) {
    if (grab) MemSemaphoreReserve(true);
    else MemSemaphoreRelease(true);
  }
}

static UInt32 call(App *s, UInt32 cmd) {
  s->a.cmd = cmd; s->a.vc = (UInt32)s->vc;
  arm_reserve(s, true);
  PceNativeCall((NativeFuncType *)s->arm, &s->a);
  arm_reserve(s, false);
  return s->a.ret;
}

static void present(App *s) {
  s->a.dst = (UInt32)s->bits;
  s->a.rowPix = s->rowBytes ? (UInt32)(s->rowBytes / 2) : 320;
  call(s, CMD_PRESENT);
  { UInt16 old = WinSetCoordinateSystem(kCoordinatesNative);
    WinDrawBitmap((BitmapType *)s->bmp3, 0, 0);
    WinSetCoordinateSystem(old); }
}

static void progress(App *s, UInt32 pct, const char *msg) {
  if (pct > 100) pct = 100;
  s->a.pct = pct; s->a.msg = (UInt32)msg;
  call(s, CMD_PROGRESS);
  present(s);
}

/* ---- save database (type 'DATA', creator 'VxCf', backup bit set so HotSync backs it up) ---- */
static DmOpenRef open_save(Boolean create) {
  LocalID id = DmFindDatabase(0, SAVE_NAME);
  if (!id && create) {
    if (DmCreateDatabase(0, SAVE_NAME, CREATOR, SAVE_TYPE, false)) return 0;
    id = DmFindDatabase(0, SAVE_NAME);
  }
  if (!id) return 0;
  {
    UInt16 attr = 0;
    DmDatabaseInfo(0, id, 0, &attr, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    if (!(attr & dmHdrAttrBackup)) { attr |= dmHdrAttrBackup; DmSetDatabaseInfo(0, id, 0, &attr, 0, 0, 0, 0, 0, 0, 0, 0, 0); }
  }
  return DmOpenDatabase(0, id, dmModeReadWrite);
}

static Boolean save_world(App *s) {
  UInt32 len = call(s, CMD_SAVE), off = 0; UInt8 *io = (UInt8 *)call(s, CMD_IOPTR);
  DmOpenRef db = open_save(true); UInt16 i = 0;
  if (!db || !len || !io) { if (db) DmCloseDatabase(db); return false; }
  while (DmNumRecords(db)) DmRemoveRecord(db, 0);
  while (off < len) {
    UInt32 n = len - off; MemHandle h; UInt16 at = dmMaxRecordIndex;
    if (n > REC_MAX) n = REC_MAX;
    h = DmNewRecord(db, &at, n);
    if (!h) { DmCloseDatabase(db); return false; }
    DmWrite(MemHandleLock(h), 0, io + off, n);
    MemHandleUnlock(h); DmReleaseRecord(db, at, true);
    off += n; i++;
  }
  DmCloseDatabase(db);
  return true;
}

/* returns the seed stored in the save, or 0 if none */
static UInt32 save_seed(void) {
  DmOpenRef db = open_save(false); UInt32 seed = 0;
  if (!db) return 0;
  if (DmNumRecords(db)) {
    MemHandle h = DmQueryRecord(db, 0);
    if (h && MemHandleSize(h) >= 8) { UInt8 *p = MemHandleLock(h); /* header: magic (LE), seed (LE) */
      if (p[0] == 'V' && p[1] == 'X' && p[2] == 'S' && p[3] == '1') seed = (UInt32)p[4] | ((UInt32)p[5] << 8) | ((UInt32)p[6] << 16) | ((UInt32)p[7] << 24);
      MemHandleUnlock(h); }
  }
  DmCloseDatabase(db);
  return seed;
}

static Boolean load_world(App *s) {
  DmOpenRef db = open_save(false); UInt8 *io = (UInt8 *)call(s, CMD_IOPTR); UInt32 len = 0; UInt16 i, n;
  if (!db || !io) return false;
  n = DmNumRecords(db);
  for (i = 0; i < n; i++) {
    MemHandle h = DmQueryRecord(db, i); UInt32 sz;
    if (!h) continue;
    sz = MemHandleSize(h);
    if (len + sz > 262000UL) break;
    MemMove(io + len, MemHandleLock(h), sz); MemHandleUnlock(h); len += sz;
  }
  DmCloseDatabase(db);
  s->a.len = len;
  return call(s, CMD_LOAD) != 0;
}

static void delete_save(void) { LocalID id = DmFindDatabase(0, SAVE_NAME); if (id) DmDeleteDatabase(0, id); }

/* ---- world setup ---- */
static const char *gen_label(UInt32 pct) {
  if (pct < 70) return "Generating terrain...";
  if (pct < 90) return "Growing trees...";
  return "Lighting...";
}

static void start_world(App *s, UInt32 seed, Boolean tryLoad) {
  UInt16 i; UInt32 pct = 0;
  if (!seed) seed = TimGetSeconds() ^ (TimGetTicks() << 12);
  /* resources stay locked from init(); take the pointer without unlocking them */
  s->a.t0 = (UInt32)MemHandleLock(s->tileH[0]); MemHandleUnlock(s->tileH[0]);
  s->a.t1 = (UInt32)MemHandleLock(s->tileH[1]); MemHandleUnlock(s->tileH[1]);
  for (i = 0; i < 7; i++) { s->a.spr[i] = (UInt32)MemHandleLock(s->sprH[i]); MemHandleUnlock(s->sprH[i]); }
  s->a.seed = seed;
  /* pixBE and rowPix were set by calibrate_pixels() / the Swap colors pref.
     Do not re-query WinScreenGetAttribute here: that reads the LCD format,
     which on the E2 can disagree with the offscreen BmpCreate bitmap ARM writes. */
  log_stage("ARM setup");
  call(s, CMD_SETUP);
  progress(s, 0, "Generating world...");
  for (;;) {
    const char *lab = gen_label(pct);
    log_stage(lab);
    progress(s, pct, lab);           /* show the upcoming stage, then do the work */
    EvtResetAutoOffTimer();
    pct = call(s, CMD_GEN);
    if (pct >= 100) break;
    EvtResetAutoOffTimer();
  }
  progress(s, 100, "Done");
  if (tryLoad) {
    log_stage("Loading saved world");
    progress(s, 99, "Loading saved world...");
    if (!load_world(s)) {
      FrmAlert(AlertBadSave);
      delete_save();
    }
  }
}

/* ---- input ---- */
static UInt32 read_keys(App *s) {
  UInt32 st = KeyCurrentState(), k = 0;
  if (st & keyBitPageUp) k |= K_UP;
  if (st & keyBitPageDown) k |= K_DOWN;
  /* T|E2 reports the 5-way sideways as keyBitNavLeft/Right; PumpkinOS (used for
     emulator testing) reports them as 0x0400/0x0800, unused on the E2. */
  if (st & (keyBitNavLeft | 0x0400UL)) k |= K_LEFT;
  if (st & (keyBitNavRight | 0x0800UL)) k |= K_RIGHT;
  if (st & keyBitNavSelect) k |= K_CENTER;
  if (st & keyBitHard1) k |= K_JUMP;
  if (st & keyBitHard2) k |= K_BREAK;
  if (st & keyBitHard3) k |= K_PLACE;
  if (st & keyBitHard4) k |= K_INV;
  k |= s->menuKey;
  return k;
}

static void play_sounds(App *s) {
  UInt32 i, n = s->a.nsnd;
  if (!s->sndVol) return;
  /* the Palm speaker plays one square-wave tone at a time: play the first, queue nothing (non-blocking) */
  for (i = 0; i < n && i < 1; i++) {
    SndCommandType c;
    c.cmd = sndCmdFrqOn; c.param1 = (Int32)s->a.snd[i][0]; c.param2 = (UInt16)s->a.snd[i][1];
    c.param3 = (UInt16)((s->a.snd[i][2] * s->sndVol) / 100); if (c.param3 > sndMaxAmp) c.param3 = sndMaxAmp;
    c.reserved = 0;
    SndDoCmd(0, &c, true);
  }
}

static Boolean alloc_vc(App *s, UInt32 sz) {
  UInt32 freeb = 0, maxc = 0;
  s->vcSize = sz;
  s->vcInStorage = false;
  MemHeapFreeBytes(0, &freeb, &maxc);
  /* Prefer a large non-movable dynamic-heap chunk. memNewChunkFlagAllowLarge (0x1000)
     is required on OS 5 for allocations over 64 KB. */
  if (maxc >= sz) {
    s->vc = MemChunkNew(0, sz, (UInt16)(memNewChunkFlagNonMovable | memNewChunkFlagPreLock | memNewChunkFlagAllowLarge));
    if (s->vc && (((UInt32)s->vc) & 3)) {
      /* extremely unlikely: refuse rather than let ARM fault on unaligned 32-bit accesses */
      MemChunkFree(s->vc); s->vc = 0;
    }
  }
  if (!s->vc) {
    /* Fall back to the storage heap (much larger on the E2). Writes need MemSemaphoreReserve. */
    if (FtrPtrNew(CREATOR, 1, sz, &s->vc) != 0) s->vc = 0;
    if (s->vc) s->vcInStorage = true;
  }
  if (!s->vc) { alert_nomem(sz); return false; }
  arm_reserve(s, true);
  MemSet(s->vc, sz, 0);
  arm_reserve(s, false);
  return true;
}

static Boolean init(App *s) {
  UInt32 proc = 0, depth = 16, sz; Err err; UInt16 i, rowBytes = 0;
  MemSet(s, sizeof *s, 0);
  log_stage("Checking device");
  if (FtrGet(sysFileCSystem, sysFtrNumProcessorID, &proc) || !sysFtrNumProcessorIsARM(proc)) { FrmAlert(AlertNeedARM); return false; }
  {
    UInt32 ver = 0; FtrGet(sysFtrCreator, sysFtrNumROMVersion, &ver);
    if (ver < kMinRomVersion) { FrmAlert(AlertNeedOS); return false; }
  }
  WinScreenMode(winScreenModeSet, 0, 0, &depth, 0);
  {
    UInt32 dens = 0; WinScreenGetAttribute(winScreenDensity, &dens);
    if (dens < kDensityDouble) { FrmAlert(AlertNeedHiRes); return false; }
  }
  log_stage("Locking resources");
  s->armH = DmGetResource('ARMC', 1);
  s->tileH[0] = DmGetResource('VXtl', 0); s->tileH[1] = DmGetResource('VXtl', 1);
  for (i = 0; i < 7; i++) s->sprH[i] = DmGetResource('VXsp', i);
  if (!s->armH || !s->tileH[0] || !s->tileH[1]) { alert_nomem(0); return false; }
  for (i = 0; i < 7; i++) if (!s->sprH[i]) { alert_nomem(0); return false; }
  s->arm = MemHandleLock(s->armH);
  MemHandleLock(s->tileH[0]); MemHandleLock(s->tileH[1]);
  for (i = 0; i < 7; i++) MemHandleLock(s->sprH[i]);
  /* XScale fetches ARM instructions only from 4-byte-aligned addresses. If the locked
     resource isn't aligned, copy it into a non-movable, aligned chunk. */
  if (!s->arm) { alert_nomem(0); return false; }
  if (((UInt32)s->arm & 3) != 0) {
    UInt32 asz = MemHandleSize(s->armH);
    UInt8 *raw;
    log_stage("Aligning ARM core");
    s->armCopy = MemChunkNew(0, asz + 8, (UInt16)(memNewChunkFlagNonMovable | memNewChunkFlagPreLock));
    if (!s->armCopy) { alert_nomem(asz + 8); return false; }
    raw = (UInt8 *)((((UInt32)s->armCopy) + 3u) & ~3u);
    MemMove(raw, s->arm, asz);
    s->arm = raw;
  }
  log_stage("Querying core size");
  s->a.cmd = CMD_SIZE; s->a.vc = 0;
  PceNativeCall((NativeFuncType *)s->arm, &s->a);
  sz = s->a.ret;
  if (sz < 100000UL || sz > 4000000UL) { FrmAlert(AlertNeedARM); return false; }
  log_stage("Allocating world");
  if (!alloc_vc(s, sz)) return false;
  log_stage("Creating bitmap");
  /* 320x320 16-bit double-density offscreen bitmap; the ARM core writes its pixels directly */
  s->bmp = BmpCreate(320, 320, 16, 0, &err);
  if (!s->bmp) { alert_nomem(320UL * 320UL * 2UL); return false; }
  s->bits = (UInt16 *)BmpGetBits(s->bmp);
  BmpGetDimensions(s->bmp, 0, 0, &rowBytes);
  s->rowBytes = rowBytes ? rowBytes : 640;
  if (!s->bits || ((UInt32)s->bits & 1)) { FrmAlert(AlertNeedHiRes); return false; }
  s->bmp3 = BmpCreateBitmapV3(s->bmp, kDensityDouble, s->bits, 0);
  if (!s->bmp3) { alert_nomem(64); return false; }
  log_stage("Calibrating display");
  calibrate_pixels(s);
  s->sndVol = (UInt16)PrefGetPreference(prefGameSoundVolume);
  if (s->sndVol > sndMaxAmp) s->sndVol = sndMaxAmp;
  s->sndVol = (UInt16)(s->sndVol * 100 / sndMaxAmp);
  /* hard buttons + 5-way go to the game, not to other apps */
  KeySetMask(~(keyBitPageUp | keyBitPageDown | keyBitHard1 | keyBitHard2 | keyBitHard3 | keyBitHard4 | keyBitNavLeft | keyBitNavRight | keyBitNavSelect | 0x0C00UL));
  return true;
}

static void cleanup(App *s) {
  UInt16 i;
  KeySetMask(keyBitsAll);
  if (s->bmp3) BmpDelete((BitmapType *)s->bmp3);
  if (s->bmp) BmpDelete(s->bmp);
  if (s->vc) {
    if (s->vcInStorage) FtrPtrFree(CREATOR, 1);
    else MemChunkFree(s->vc);
    s->vc = 0;
  }
  if (s->armCopy) { MemChunkFree(s->armCopy); s->armCopy = 0; }
  s->arm = 0;
  if (s->armH) { MemHandleUnlock(s->armH); DmReleaseResource(s->armH); s->armH = 0; }
  for (i = 0; i < 2; i++) if (s->tileH[i]) { MemHandleUnlock(s->tileH[i]); DmReleaseResource(s->tileH[i]); }
  for (i = 0; i < 7; i++) if (s->sprH[i]) { MemHandleUnlock(s->sprH[i]); DmReleaseResource(s->sprH[i]); }
}

static Boolean form_handler(EventType *e) { (void)e; return false; }

static void run(App *s) {
  EventType e; UInt32 last = TimGetTicks(), tps = SysTicksPerSecond(), saveT = 0;
  Int16 penX = 0, penY = 0, latchX = 0, latchY = 0; Boolean penDown = false, latch = false;
  log_stage("Starting play");
  while (!s->quit) {
    UInt32 now, dt;
    /* drain events without blocking */
    do {
      EvtGetEvent(&e, 0);
      if (e.eType == nilEvent) break;
      if (e.eType == appStopEvent) { s->quit = true; break; }
      if (e.eType == keyDownEvent && (e.data.keyDown.modifiers & commandKeyMask)) {
        WChar c = e.data.keyDown.chr;
        if (c == vchrMenu || c == vchrCommand) { s->menuKey = K_MENU; continue; }
        if (c == vchrNavChange || c == vchrPageUp || c == vchrPageDown || (c >= vchrHard1 && c <= vchrHard4)) continue;
      }
      /* Pen events go to SysHandleEvent first so silkscreen taps (Home, Menu, Find)
         still become key events; on-screen pen state is polled below. A pen-down is
         latched so a tap shorter than one frame is not lost. Event coordinates are
         standard (160x160) because the window stays in kCoordinatesStandard. */
      if (e.eType == penDownEvent && e.screenY >= 0 && e.screenY < 160 && e.screenX >= 0 && e.screenX < 160) {
        latch = true; latchX = (Int16)(e.screenX * 2); latchY = (Int16)(e.screenY * 2);
      }
      if (SysHandleEvent(&e)) continue;
      if (e.eType == penDownEvent || e.eType == penMoveEvent || e.eType == penUpEvent) continue;
      if (e.eType == frmLoadEvent) { FormType *f = FrmInitForm(e.data.frmLoad.formID); FrmSetActiveForm(f); FrmSetEventHandler(f, form_handler); continue; }
      FrmDispatchEvent(&e);
    } while (EvtEventAvail());
    if (s->quit) break;
    /* EvtGetPen reports standard coordinates on OS 5; EvtGetPenNative gives the
       320x320 native pixels of the double-density display window. */
    EvtGetPenNative(WinGetDisplayWindow(), &penX, &penY, &penDown);
    if (!penDown && latch) { penX = latchX; penY = latchY; penDown = true; }
    latch = false;
    now = TimGetTicks(); dt = (now - last) * 1000UL / tps; last = now;
    if (dt > 100) dt = 100; if (dt < 1) dt = 1;
    s->a.keys = read_keys(s); s->menuKey = 0;
    s->a.penX = (UInt32)(Int32)penX; s->a.penY = (UInt32)(Int32)penY; s->a.penDown = penDown && penY < 320 && penX >= 0 && penX < 320;
    s->a.dtMs = dt;
    call(s, CMD_FRAME);
    present(s);
    play_sounds(s);
    EvtResetAutoOffTimer();
    if (s->a.frames == 8) log_stage("Playing");
    saveT += dt;
    if (s->a.req & REQ_PIXSWAP) {
      /* ARM already flipped g->pixfmtBE; keep the 68K copy in sync so the
         next present (and this immediate redraw) uses the new order. */
      s->a.pixBE = s->a.pixBE ? 0 : 1;
      pref_set((UInt8)s->a.pixBE);
      present(s);
    }
    if (s->a.req & REQ_NEWWORLD) { delete_save(); start_world(s, 0, false); saveT = 0; }
    /* Do not write a save until a handful of play frames have succeeded, so a
       Fatal Exception on the first frame of a bad 1.0.1 save cannot replace
       (or create) a broken autosave mid-crash. Menu save is also gated. */
    if ((s->a.req & REQ_SAVE) && s->a.frames >= 8) { save_world(s); saveT = 0; }
    if (s->a.req & REQ_QUIT) { s->quit = true; }
    if (saveT > 300000UL && s->a.frames >= 20) { save_world(s); saveT = 0; }
  }
  if (s->a.frames >= 20) {
    log_stage("Saving");
    save_world(s);
  }
}

UInt32 PilotMain(UInt16 cmd, MemPtr cmdPBP, UInt16 launchFlags) {
  UInt32 ver = 0;
  (void)cmdPBP;
  /* Other launch codes (HotSync notify, system reset, ...) must not touch globals or UI. */
  if (cmd != sysAppLaunchCmdNormalLaunch) return 0;
  FtrGet(sysFtrCreator, sysFtrNumROMVersion, &ver);
  if (ver && ver < kMinRomVersion) {
    if (launchFlags & sysAppLaunchFlagNewGlobals) FrmAlert(AlertNeedOS);
    return sysErrRomIncompatible;
  }
  {
    Boolean chunk = false;
    App *s = (App *)MemPtrNew(sizeof(App));
    /* ArmArgs inside App must be 4-byte aligned for the ARM core. */
    if (!s) return 0;
    if (((UInt32)s & 3) != 0) {
      MemPtrFree(s);
      s = (App *)MemChunkNew(0, sizeof(App) + 4, (UInt16)(memNewChunkFlagNonMovable | memNewChunkFlagPreLock));
      chunk = true;
      if (!s) return 0;
      if (((UInt32)s & 3) != 0) { MemChunkFree(s); return 0; }
    }
    if (init(s)) {
      UInt32 seed;
      int forceNew = decide_load();
      FrmGotoForm(FormMain);
      { EventType e; do { EvtGetEvent(&e, 10); if (e.eType == frmLoadEvent) { FormType *f = FrmInitForm(e.data.frmLoad.formID); FrmSetActiveForm(f); FrmSetEventHandler(f, form_handler); } else if (!SysHandleEvent(&e)) FrmDispatchEvent(&e); } while (e.eType != frmOpenEvent && e.eType != nilEvent); }
      if (forceNew) delete_save();
      seed = save_seed();
      start_world(s, seed, seed != 0);
      run(s);
      log_clear();
    }
    cleanup(s);
    FrmCloseAllForms();
    if (chunk) MemChunkFree(s); else MemPtrFree(s);
  }
  return 0;
}
