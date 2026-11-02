/* VoxelCraft for Palm OS 5 - portable game core (runs as an ARM PNOlet on the device,
 * and natively on the host for tests). No OS calls, no globals: all state lives in VC (G). */
#ifndef VC_H
#define VC_H
typedef unsigned char u8; typedef signed char s8;
typedef unsigned short u16; typedef short s16;
typedef unsigned int u32; typedef int s32;
typedef long long s64; typedef unsigned long long u64;
typedef s32 fx; /* 16.16 fixed point */
#define FX(x) ((fx)((x) * 65536))
#define FONE 65536
#define fmul(a, b) ((fx)(((s64)(a) * (b)) >> 16))
#define VC_STATIC static
#if defined(__arm__) && !defined(VC_NO_HOT)
#define HOT __attribute__((optimize("O2")))
#define AI __attribute__((always_inline))
#else
#define HOT
#define AI
#endif

/* ---- world size (web: infinite 16x16x128 chunks; Palm: one 96x96x64 island) */
#define WX 96
#define WZ 96
#define WY 64
#define WXZ (WX * WZ)
#define WSIZE (WX * WZ * WY)
#define SEA 32
#define ORIGIN 48  /* web world x = palm x - ORIGIN */
#define IDX(x, y, z) ((x) + (z) * WX + (y) * WXZ)

/* ---- view: 160x144 internal, doubled to 320x288; hotbar strip 320x32 */
#define SW 320
#define SH 320
#define VW 160
#define VH 144
#define HOTY 288
#ifdef __arm__
#define STEP_STAT(x) ((void)0)
#else
#define STEP_STAT(x) (x)
#endif
#define VIEWDIST 24 /* blocks (web mobile: 4 chunks = 64) */

/* ---- block ids (same numbers as js/blocks.js) */
enum {
  AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, WATER = 5, LOG = 6, LEAVES = 7, GLASS = 8, PLANKS = 9,
  COBBLE = 10, BEDROCK = 11, COAL = 12, IRON = 13, BRICK = 14, SNOW = 15, TALLGRASS = 16, ROSE = 17, DANDELION = 18,
  GRAVEL = 19, GOLD = 20, STONE_BRICKS = 21, BOOKSHELF = 22, SANDSTONE = 23, CACTUS = 24, WOOL_WHITE = 25,
  WOOL_RED = 26, WOOL_BLUE = 27, GLOWSTONE = 28, OBSIDIAN = 29, BIRCH_LOG = 30, BIRCH_LEAVES = 31,
  TORCH = 32, LANTERN = 37, CRAFTING_TABLE = 38, PUMPKIN = 39, JACK_O_LANTERN = 40, WOOL_YELLOW = 41, WOOL_LIME = 42,
  WOOL_GREEN = 43, WOOL_ORANGE = 44, WOOL_PURPLE = 45, WOOL_CYAN = 46, WOOL_PINK = 47, WOOL_BLACK = 48, WOOL_GRAY = 49,
  MOSSY_COBBLE = 50, HAY = 51, MELON = 52, BLUE_FLOWER = 53, MUSHROOM = 54, TERRACOTTA = 55, TULIP = 56, TNT = 57,
  GLASS_PANE = 58, OAK_WINDOW = 59, STAINED_BLUE = 60, STAINED_AMBER = 61, LAVA = 62,
  OAK_DOOR = 80, /* 80..95 = base + facing*4 + open*2 + upper */
  BED = 112,     /* 112..119 = base + facing*2 + head */
  DOG_EGG = 200, CAT_EGG = 201, LION_EGG = 202, OAK_DOOR_ITEM = 203, BED_ITEM = 205,
  WOLF_EGG = 209, SPIDER_EGG = 211, ZOMBIE_EGG = 213, HORSE_EGG = 214,
  WOOD_SWORD = 219, STONE_SWORD = 220, IRON_SWORD = 221, DIAMOND_SWORD = 222, IRON_AXE = 223,
  STEAK = 226, APPLE = 229
};
/* tile ids (js/blocks.js T) */
enum {
  T_GRASS_TOP = 0, T_GRASS_SIDE = 1, T_DIRT = 2, T_STONE = 3, T_SAND = 4, T_WATER = 5, T_LOG_SIDE = 6, T_LOG_TOP = 7,
  T_LEAVES = 8, T_GLASS = 9, T_PLANKS = 10, T_COBBLE = 11, T_BEDROCK = 12, T_COAL = 13, T_IRON = 14, T_BRICK = 15,
  T_SNOW = 16, T_SNOW_SIDE = 17, T_TALLGRASS = 18, T_FLOWER_RED = 19, T_FLOWER_YELLOW = 20, T_GRAVEL = 21, T_GOLD = 22,
  T_STONE_BRICKS = 23, T_BOOKSHELF = 24, T_SANDSTONE_SIDE = 25, T_SANDSTONE_TOP = 26, T_CACTUS_SIDE = 27, T_CACTUS_TOP = 28,
  T_WOOL_WHITE = 29, T_WOOL_RED = 30, T_WOOL_BLUE = 31, T_GLOWSTONE = 32, T_OBSIDIAN = 33, T_BIRCH_SIDE = 34, T_BIRCH_LEAVES = 35,
  T_TORCH = 36, T_LANTERN = 37, T_CRAFT_TOP = 38, T_CRAFT_SIDE = 39, T_PUMPKIN_SIDE = 40, T_PUMPKIN_TOP = 41, T_JACK_FACE = 42,
  T_WOOL_YELLOW = 43, T_WOOL_LIME = 44, T_WOOL_GREEN = 45, T_WOOL_ORANGE = 46, T_WOOL_PURPLE = 47, T_WOOL_CYAN = 48, T_WOOL_PINK = 49,
  T_WOOL_BLACK = 50, T_WOOL_GRAY = 51, T_MOSSY = 52, T_HAY_SIDE = 53, T_HAY_TOP = 54, T_MELON_SIDE = 55, T_MELON_TOP = 56,
  T_FLOWER_BLUE = 57, T_MUSHROOM = 58, T_DOG_EGG = 59, T_CAT_EGG = 60, T_LANTERN_TOP = 61, T_TERRACOTTA = 62, T_TULIP = 63,
  T_TNT_SIDE = 64, T_TNT_TOP = 65, T_TNT_BOTTOM = 66, T_LION_EGG = 67, T_PANE = 68, T_OAK_WINDOW = 69, T_STAINED_BLUE = 70,
  T_STAINED_AMBER = 71, T_LAVA = 72, T_DOOR_BOTTOM = 73, T_DOOR_TOP = 74, T_BED_HEAD_TOP = 77, T_BED_FOOT_TOP = 78,
  T_BED_SIDE = 79, T_BED_END = 80, T_DOOR_ITEM = 81, T_BED_ITEM = 83, T_WOLF_EGG = 87, T_SPIDER_EGG = 89, T_ZOMBIE_EGG = 91,
  T_HORSE_EGG = 94, T_WOOD_SWORD = 99, T_STONE_SWORD = 100, T_IRON_SWORD = 101, T_DIAMOND_SWORD = 102, T_IRON_AXE = 103,
  T_STEAK = 108, T_APPLE = 111
};

/* render kinds */
enum { R_NONE = 0, R_OPAQUE, R_CUTOUT, R_WATER, R_LAVA, R_CROSS, R_TORCH, R_DOOR, R_BED, R_PANE, R_GLASS };
/* block flags */
#define F_SOLID 1      /* collides */
#define F_OPAQUE 2     /* full cube that blocks light & hides neighbours */
#define F_PLACE 4      /* appears in the inventory */
#define F_ITEM 8       /* never stored in the world */

typedef struct { u8 render, flags, light, top, side, bottom, kind, arg; } BDef;
/* kind for items */
enum { K_BLOCK = 0, K_EGG, K_SWORD, K_FOOD, K_DOOR, K_BED };

/* ---- mobs */
enum { M_ZOMBIE = 0, M_DOG, M_CAT, M_HORSE, M_LION, M_WOLF, M_SPIDER, M_TYPES };
#define MAXMOBS 48
typedef struct {
  u8 type, alive, tamed, wild, state, hurt, coat, sitting;
  fx x, y, z, vx, vy, vz;
  s16 yaw;            /* 0..1023 */
  s16 hp;
  s16 timer, cd, foeT, angry, soundT; /* in 1/100 s */
  s8 dir, onGround, inWater, target; /* target: -1 none, -2 player, else mob index */
} Mob;

typedef struct { u8 used, x, y, z; s16 fuse; s16 t; } Tnt;
#define MAXTNT 24

/* sounds requested this frame (played by the 68K shell with SndDoCmd) */
typedef struct { u16 freq, ms, amp; } Snd;
#define MAXSND 4

/* input */
#define K_UP 1
#define K_DOWN 2
#define K_LEFT 4
#define K_RIGHT 8
#define K_CENTER 16
#define K_JUMP 32   /* hard 1 (Calendar) */
#define K_BREAK 64  /* hard 2 (Contacts) */
#define K_PLACE 128 /* hard 3 (Favorites/Web) */
#define K_INV 256   /* hard 4 (Note Pad/Home) */
#define K_MENU 512  /* silkscreen Menu button */
typedef struct { u32 keys; s32 penX, penY, penDown; u32 dtMs; } Input;

enum { ST_PLAY = 0, ST_INV, ST_MENU, ST_DEAD, ST_SLEEP };
/* requests to the shell */
#define REQ_SAVE 1
#define REQ_QUIT 2
#define REQ_NEWWORLD 4

typedef struct VC {
  u32 magic, size;
  /* assets (pointers into PRC resources) */
  const u16 *tiles[2];
  const u16 *spr[M_TYPES];
  int pixfmtBE;          /* screen bitmap wants big-endian 565 */
  /* tables */
  fx sinT[1024];
  u16 rcpT[257];
  u8 perm[9][512];       /* simplex permutations for the 9 noise generators (js/world.js) */
  BDef bd[256];
  u8 lightCurve[16];
  /* world */
  u32 seed;
  u8 blocks[WSIZE];
  u8 light[WSIZE];       /* low nibble: block light, high nibble: sky light */
  u8 hmap[WXZ];          /* highest sky-blocking y per column */
  s16 genH[WXZ];
  s8 genT[WXZ];          /* temperature*100 */
  s8 genF[WXZ];          /* forest*100 */
  int genStage, genRow;
  u32 lq[65536];         /* light BFS queue (ring) */
  /* player */
  fx px, py, pz, pvx, pvy, pvz;
  s32 yaw, pitch;        /* yaw 0..1023 (0 looks -z, like three.js), pitch -240..240 */
  s32 yawVel;
  int onGround, inWater, headInWater, inLava;
  s32 health, maxHealth, invuln, sinceHurt, regenT, lavaT, fallStart, dead, deathT;
  fx spawnX, spawnY, spawnZ;
  int hotbar[9], sel;
  /* time: worldTime 0..65535 (0 = 06:00, 16384 = noon), web PHASES with 720 s cycle */
  u32 worldTime;         /* 0.32 fraction of a day */
  u32 timeMs;
  int day;               /* daylight 0..256 */
  int bright;            /* 0.15 + 0.85*day, 0..256 */
  u16 skyCol, fogCol;
  /* game */
  int state, menuSel, invScroll, invSel;
  Mob mobs[MAXMOBS];
  int spawnTimer, hostileTimer, hostileOn, soundOn;
  Tnt tnt[MAXTNT];
  int shake;
  u32 rng;
  /* interaction */
  int tgtValid, tgtX, tgtY, tgtZ, tgtFace, tgtMob; /* crosshair target */
  int swing, attackCD, holdT, penWasDown, penStartX, penStartY, penLastX, penLastY, penMoved, penHoldFired, penOnView;
  int toastT; char toast[48];
  int eggNote;
  /* sounds + requests out */
  Snd snd[MAXSND]; int nsnd;
  u32 req;
  /* render */
  fx cfx, cfy, cfz, crx, crz, cux, cuy, cuz; /* camera basis */
  fx camX, camY, camZ;
  u16 zbuf[VW * VH];
  u16 view[VW * VH];
  u16 back[SW * SH];     /* composed frame (native LE 565) */
  int clipH, riding, sleepT, tntFlash, bobA, bob, stepPh, hotDirty, hurtFlash;
  u32 prevKeys; int breakRepeat, penLookX, penLookY;
  int invList[128], invN;
  u8 edited[WSIZE / 8];  /* blocks changed since generation (saved as a diff) */
  /* stats */
  u32 frames, rays, steps;
  /* save */
  u8 io[262144];
  u32 ioLen;
} VC;

/* entry points */
void vc_setup(VC *g, const u16 *t0, const u16 *t1, const u16 *const *spr, u32 seed);
int vc_gen_step(VC *g);              /* returns 0..100, 100 = done */
void vc_frame(VC *g, const Input *in);
u32 vc_save(VC *g);                  /* serialise into g->io, returns length */
int vc_load(VC *g, u32 len);         /* parse g->io */
void vc_present(VC *g, u16 *dst, int rowPix); /* copy back buffer to the screen bitmap */
void vc_progress(VC *g, int pct, const char *msg); /* draw a loading screen into back */
#endif
