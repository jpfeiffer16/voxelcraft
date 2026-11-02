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
#define REC_MAX 32000UL
#define memNewChunkFlagAllowLarge 0x1000
/* palmOne 5-way (palmOneNavigator.h) */
#ifndef keyBitNavLeft
#define keyBitNavLeft 0x01000000UL
#define keyBitNavRight 0x02000000UL
#define keyBitNavSelect 0x04000000UL
#endif
#ifndef vchrNavChange
#define vchrNavChange 0x0503
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

typedef struct {
  MemHandle armH, tileH[2], sprH[7];
  void *arm;
  void *vc;
  BitmapType *bmp; BitmapTypeV3 *bmp3; UInt16 *bits;
  ArmArgs a;
  UInt32 menuKey;      /* one-shot K_MENU from the silkscreen Menu button */
  Boolean quit;
  UInt16 sndVol;
} App;

static UInt32 call(App *s, UInt32 cmd) {
  s->a.cmd = cmd; s->a.vc = (UInt32)s->vc;
  PceNativeCall((NativeFuncType *)s->arm, &s->a);
  return s->a.ret;
}

static void present(App *s) {
  s->a.dst = (UInt32)s->bits; s->a.rowPix = 320;
  call(s, CMD_PRESENT);
  WinDrawBitmap((BitmapType *)s->bmp3, 0, 0);
}

static void progress(App *s, UInt32 pct, const char *msg) {
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
  if (!db || !len) { if (db) DmCloseDatabase(db); return false; }
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
  if (!db) return false;
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
static void start_world(App *s, UInt32 seed, Boolean tryLoad) {
  UInt16 i; UInt32 pct = 0;
  if (!seed) seed = TimGetSeconds() ^ (TimGetTicks() << 12);
  s->a.t0 = (UInt32)MemHandleLock(s->tileH[0]); MemHandleUnlock(s->tileH[0]);
  s->a.t1 = (UInt32)MemHandleLock(s->tileH[1]); MemHandleUnlock(s->tileH[1]);
  for (i = 0; i < 7; i++) { s->a.spr[i] = (UInt32)MemHandleLock(s->sprH[i]); MemHandleUnlock(s->sprH[i]); }
  s->a.seed = seed;
  s->a.pixBE = ((UInt8 *)s->bmp3)[11] != 3; /* pixelFormat565LE == 3, otherwise big-endian 565 */
  call(s, CMD_SETUP);
  progress(s, 0, "Generating world...");
  while (pct < 100) {
    pct = call(s, CMD_GEN);
    progress(s, pct, pct < 70 ? "Generating terrain..." : pct < 90 ? "Growing trees..." : "Lighting...");
    EvtResetAutoOffTimer();
  }
  if (tryLoad) { progress(s, 99, "Loading saved world..."); load_world(s); }
}

/* ---- input ---- */
static UInt32 read_keys(App *s) {
  UInt32 st = KeyCurrentState(), k = 0;
  if (st & keyBitPageUp) k |= K_UP;
  if (st & keyBitPageDown) k |= K_DOWN;
  if (st & keyBitNavLeft) k |= K_LEFT;
  if (st & keyBitNavRight) k |= K_RIGHT;
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

static Boolean init(App *s) {
  UInt32 proc = 0, depth = 16, sz; Err err; UInt16 i;
  MemSet(s, sizeof *s, 0);
  if (FtrGet(sysFileCSystem, sysFtrNumProcessorID, &proc) || !sysFtrNumProcessorIsARM(proc)) { FrmAlert(AlertNeedARM); return false; }
  {
    UInt32 ver = 0; FtrGet(sysFtrCreator, sysFtrNumROMVersion, &ver);
    if (ver < sysMakeROMVersion(5, 0, 0, sysROMStageRelease, 0)) { FrmAlert(AlertNeedARM); return false; }
  }
  WinScreenMode(winScreenModeSet, 0, 0, &depth, 0);
  {
    UInt32 dens = 0; WinScreenGetAttribute(winScreenDensity, &dens);
    if (dens < kDensityDouble) { FrmAlert(AlertNeedHiRes); return false; }
  }
  s->armH = DmGetResource('ARMC', 1);
  s->tileH[0] = DmGetResource('VXtl', 0); s->tileH[1] = DmGetResource('VXtl', 1);
  for (i = 0; i < 7; i++) s->sprH[i] = DmGetResource('VXsp', i);
  if (!s->armH || !s->tileH[0] || !s->tileH[1]) { FrmAlert(AlertNoMem); return false; }
  for (i = 0; i < 7; i++) if (!s->sprH[i]) { FrmAlert(AlertNoMem); return false; }
  s->arm = MemHandleLock(s->armH);
  MemHandleLock(s->tileH[0]); MemHandleLock(s->tileH[1]);
  for (i = 0; i < 7; i++) MemHandleLock(s->sprH[i]);
  /* game state lives in one large non-movable dynamic-heap chunk (about 2.1 MB; the E2 heap is 6.3 MB) */
  s->a.cmd = CMD_SIZE; s->a.vc = 0; PceNativeCall((NativeFuncType *)s->arm, &s->a); sz = s->a.ret;
  s->vc = MemChunkNew(0, sz, memNewChunkFlagNonMovable | memNewChunkFlagAllowLarge);
  if (!s->vc) { FrmAlert(AlertNoMem); return false; }
  MemSet(s->vc, sz, 0);
  /* 320x320 16-bit double-density offscreen bitmap; the ARM core writes its pixels directly */
  s->bmp = BmpCreate(320, 320, 16, 0, &err);
  if (!s->bmp) { FrmAlert(AlertNoMem); return false; }
  s->bits = (UInt16 *)BmpGetBits(s->bmp);
  s->bmp3 = BmpCreateBitmapV3(s->bmp, kDensityDouble, s->bits, 0);
  if (!s->bmp3) { FrmAlert(AlertNoMem); return false; }
  WinSetCoordinateSystem(kCoordinatesNative);
  s->sndVol = (UInt16)PrefGetPreference(prefGameSoundVolume);
  if (s->sndVol > sndMaxAmp) s->sndVol = sndMaxAmp;
  s->sndVol = (UInt16)(s->sndVol * 100 / sndMaxAmp);
  /* hard buttons + 5-way go to the game, not to other apps */
  KeySetMask(~(keyBitPageUp | keyBitPageDown | keyBitHard1 | keyBitHard2 | keyBitHard3 | keyBitHard4 | keyBitNavLeft | keyBitNavRight | keyBitNavSelect));
  return true;
}

static void cleanup(App *s) {
  UInt16 i;
  KeySetMask(keyBitsAll);
  WinSetCoordinateSystem(kCoordinatesStandard);
  if (s->bmp3) BmpDelete((BitmapType *)s->bmp3);
  if (s->bmp) BmpDelete(s->bmp);
  if (s->vc) MemChunkFree(s->vc);
  if (s->arm) MemHandleUnlock(s->armH);
  if (s->armH) DmReleaseResource(s->armH);
  for (i = 0; i < 2; i++) if (s->tileH[i]) { MemHandleUnlock(s->tileH[i]); DmReleaseResource(s->tileH[i]); }
  for (i = 0; i < 7; i++) if (s->sprH[i]) { MemHandleUnlock(s->sprH[i]); DmReleaseResource(s->sprH[i]); }
}

static Boolean form_handler(EventType *e) { (void)e; return false; }

static void run(App *s) {
  EventType e; UInt32 last = TimGetTicks(), tps = SysTicksPerSecond(), saveT = 0;
  Int16 penX = 0, penY = 0; Boolean penDown = false;
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
      if (e.eType == penDownEvent || e.eType == penMoveEvent || e.eType == penUpEvent) continue; /* polled below */
      if (SysHandleEvent(&e)) continue;
      if (e.eType == frmLoadEvent) { FormType *f = FrmInitForm(e.data.frmLoad.formID); FrmSetActiveForm(f); FrmSetEventHandler(f, form_handler); continue; }
      FrmDispatchEvent(&e);
    } while (EvtEventAvail());
    if (s->quit) break;
    EvtGetPen(&penX, &penY, &penDown);
    now = TimGetTicks(); dt = (now - last) * 1000UL / tps; last = now;
    if (dt > 100) dt = 100; if (dt < 1) dt = 1;
    s->a.keys = read_keys(s); s->menuKey = 0;
    s->a.penX = (UInt32)(Int32)penX; s->a.penY = (UInt32)(Int32)penY; s->a.penDown = penDown && penY < 320 && penX >= 0 && penX < 320;
    s->a.dtMs = dt;
    call(s, CMD_FRAME);
    present(s);
    play_sounds(s);
    EvtResetAutoOffTimer();
    saveT += dt;
    if (s->a.req & REQ_NEWWORLD) { delete_save(); start_world(s, 0, false); saveT = 0; }
    if (s->a.req & REQ_SAVE) { save_world(s); saveT = 0; }
    if (s->a.req & REQ_QUIT) { s->quit = true; }
    if (saveT > 300000UL) { save_world(s); saveT = 0; } /* autosave every 5 minutes */
  }
  save_world(s);
}

UInt32 PilotMain(UInt16 cmd, MemPtr cmdPBP, UInt16 launchFlags) {
  (void)cmdPBP; (void)launchFlags;
  if (cmd == sysAppLaunchCmdNormalLaunch) {
    App *s = (App *)MemPtrNew(sizeof(App));
    if (!s) return 0;
    if (init(s)) {
      UInt32 seed;
      FrmGotoForm(FormMain);
      { EventType e; do { EvtGetEvent(&e, 10); if (e.eType == frmLoadEvent) { FormType *f = FrmInitForm(e.data.frmLoad.formID); FrmSetActiveForm(f); FrmSetEventHandler(f, form_handler); } else if (!SysHandleEvent(&e)) FrmDispatchEvent(&e); } while (e.eType != frmOpenEvent && e.eType != nilEvent); }
      seed = save_seed();
      start_world(s, seed, seed != 0);
      run(s);
    }
    cleanup(s);
    FrmCloseAllForms();
    MemPtrFree(s);
  }
  return 0;
}
