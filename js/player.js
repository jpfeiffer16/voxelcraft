// First-person player: input, physics, AABB voxel collision, raycasting.
window.VC = window.VC || {};
(function () {
  'use strict';
  const { SOLID } = VC.Blocks;
  const B = VC.B;
  const HW = 0.3, HEIGHT = 1.8, EYE = 1.62;

  class Player {
    constructor(world, camera) {
      this.world = world; this.camera = camera;
      this.pos = new THREE.Vector3(0, 80, 0);
      this.vel = new THREE.Vector3();
      this.yaw = 0; this.pitch = 0;
      this.onGround = false; this.flying = false; this.inWater = false; this.headInWater = false;
      this.keys = {};
      this.lastSpace = 0;
      this.bob = 0;
      this.analog = { x: 0, y: 0 }; this.touchSprint = false;
      this.frozen = true; // until chunk under player is loaded
      this.maxHealth = 20; this.health = 20; this.dead = false;
      this.invuln = 0; this.knockT = 0; this.sinceHurt = 99; this.regenT = 0;
      this.lastAttacker = null; this.lastAttackT = 0; this.shake = 0;
    }
    // amount in half-hearts; from: Vector3 source for knockback; returns true if damage applied
    hurt(amount, from, attacker, knock) {
      if (this.dead || this.invuln > 0 || amount <= 0) return false;
      this.health = Math.max(0, this.health - amount); this.invuln = 0.5; this.sinceHurt = 0;
      if (attacker) { this.lastAttacker = attacker; this.lastAttackT = 8; }
      if (from) {
        const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1, k = knock != null ? knock : 6;
        this.vel.x = dx / d * k; this.vel.z = dz / d * k; this.vel.y = Math.max(this.vel.y, Math.min(12, 4 + k * 0.3)); this.knockT = 0.35;
        if (this.flying) this.flying = false;
      }
      this.shake = Math.max(this.shake, 0.15 + amount * 0.02);
      if (this.health <= 0) { this.dead = true; this.vel.set(0, 0, 0); }
      return true;
    }
    respawn(x, y, z) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.health = this.maxHealth; this.dead = false; this.invuln = 2; this.lastAttacker = null; this.flying = false; this.frozen = true; }
    isSolidAt(x, y, z) {
      const id = this.world.getBlock(x, y, z);
      return id === -1 ? true : SOLID[id] === 1; // unloaded chunks act solid
    }
    // Returns null or the bounds of what we overlap (blocks, door panels, panes, beds)
    collides(px, py, pz) { return VC.Blocks.aabbHit(this.world, px - HW, py, pz - HW, px + HW, py + HEIGHT, pz + HW); }
    // Move along one axis, resolving collisions. Returns true if blocked.
    moveAxis(axis, amount) {
      const p = this.pos;
      const steps = Math.ceil(Math.abs(amount) / 0.25) || 1;
      const d = amount / steps;
      for (let s = 0; s < steps; s++) {
        const before = p.getComponent(axis);
        p.setComponent(axis, before + d);
        const hit = this.collides(p.x, p.y, p.z);
        if (hit) {
          // snap against the surface we hit (works for partial boxes like doors and beds too)
          if (axis === 1) p.y = d > 0 ? hit.minY - HEIGHT - 1e-4 : hit.maxY + 1e-4;
          else if (axis === 0) p.x = d > 0 ? hit.minX - HW - 1e-4 : hit.maxX + HW + 1e-4;
          else p.z = d > 0 ? hit.minZ - HW - 1e-4 : hit.maxZ + HW + 1e-4;
          if (Math.abs(p.getComponent(axis) - before) > Math.abs(d) + 1e-3 || this.collides(p.x, p.y, p.z)) p.setComponent(axis, before);
          return true;
        }
      }
      return false;
    }
    intersectsBlock(bx, by, bz) {
      const p = this.pos;
      return p.x + HW > bx && p.x - HW < bx + 1 && p.y + HEIGHT > by && p.y < by + 1 && p.z + HW > bz && p.z - HW < bz + 1;
    }
    toggleFly() { this.flying = !this.flying; this.vel.y = 0; }
    update(dt) {
      const k = this.keys;
      const w = this.world;
      const feetId = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z));
      const headId = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
      const FL = VC.Blocks.FLUID;
      this.inWater = feetId > 0 && FL[feetId] === 1; this.headInWater = headId > 0 && FL[headId] === 1;
      this.inLava = (feetId > 0 && FL[feetId] === 2) || (headId > 0 && FL[headId] === 2); this.headInLava = headId > 0 && FL[headId] === 2;
      if (this.frozen) {
        const c = w.getChunk(Math.floor(this.pos.x / 16), Math.floor(this.pos.z / 16));
        if (c && c.meshes) this.frozen = false; else { this.updateCamera(0); return; }
      }
      this.invuln = Math.max(0, this.invuln - dt); this.knockT = Math.max(0, this.knockT - dt); this.lastAttackT = Math.max(0, this.lastAttackT - dt);
      this.sinceHurt += dt;
      if (!this.dead && this.health < this.maxHealth && this.sinceHurt > 6) { this.regenT += dt; if (this.regenT >= 3) { this.regenT = 0; this.health++; } } else this.regenT = 0;
      if (this.dead) { this.updateCamera(0); return; }
      const an = this.analog; // touch joystick (-1..1), y = forward
      const fwd = Math.max(-1, Math.min(1, (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + an.y));
      const strafe = Math.max(-1, Math.min(1, (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + an.x));
      const sprint = k.ShiftLeft && !this.flying || k.ControlLeft || k.ControlRight || k.ShiftRight || this.touchSprint;
      let speed = this.flying ? (sprint ? 22 : 11) : sprint && fwd > 0 ? 5.8 : 4.3;
      if (this.inWater && !this.flying) speed *= 0.55;
      if (this.inLava && !this.flying) speed *= 0.3;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      let mx = -sin * fwd + cos * strafe, mz = -cos * fwd - sin * strafe;
      const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      const accel = this.onGround || this.flying ? 14 : this.inWater ? 6 : 4;
      const t = Math.min(1, accel * dt) * (this.knockT > 0 ? 0.08 : 1); // knockback briefly overrides steering
      this.vel.x += (mx * speed - this.vel.x) * t;
      this.vel.z += (mz * speed - this.vel.z) * t;

      if (this.flying) {
        const up = (k.Space ? 1 : 0) - (k.ShiftLeft ? 1 : 0);
        this.vel.y += (up * speed * 0.8 - this.vel.y) * Math.min(1, 10 * dt);
      } else if (this.inLava) { // thick: sink slowly, swim up slowly
        this.vel.y -= 6 * dt; this.vel.y *= Math.pow(0.05, dt);
        if (k.Space) this.vel.y = Math.min(this.vel.y + 20 * dt, 2.0);
        this.vel.y = Math.max(this.vel.y, -2);
      } else if (this.inWater) {
        this.vel.y -= 9 * dt;
        this.vel.y *= Math.pow(0.12, dt);
        if (k.Space) this.vel.y = Math.min(this.vel.y + 30 * dt, 3.8);
        this.vel.y = Math.max(this.vel.y, -4);
      } else {
        this.vel.y -= 30 * dt;
        this.vel.y = Math.max(this.vel.y, -55);
        if (k.Space && this.onGround) { this.vel.y = 8.6; this.onGround = false; }
      }

      if (this.moveAxis(0, this.vel.x * dt)) this.vel.x = 0;
      if (this.moveAxis(2, this.vel.z * dt)) this.vel.z = 0;
      const vy = this.vel.y * dt;
      const blockedY = this.moveAxis(1, vy);
      this.onGround = blockedY && vy < 0;
      if (blockedY) { if (this.flying && vy < 0) this.flying = false; this.vel.y = 0; }
      if (!blockedY && !this.flying) this.onGround = this.collides(this.pos.x, this.pos.y - 0.02, this.pos.z);
      if (this.pos.y < -20) { this.pos.y = 120; this.vel.set(0, 0, 0); }

      const hspeed = Math.hypot(this.vel.x, this.vel.z);
      if (this.onGround && hspeed > 0.5) this.bob += dt * hspeed * 1.8; else this.bob *= Math.pow(0.001, dt);
      this.updateCamera(hspeed);
    }
    updateCamera() {
      const bobY = this.flying ? 0 : Math.sin(this.bob * 2) * 0.05, bobX = this.flying ? 0 : Math.cos(this.bob) * 0.03;
      this.camera.position.set(this.pos.x + Math.cos(this.yaw) * bobX, this.pos.y + EYE + bobY, this.pos.z - Math.sin(this.yaw) * bobX);
      let sp = 0, sy = 0, sr = 0;
      if (this.shake > 0.001) {
        const a = Math.min(0.12, this.shake * 0.12), q = performance.now() / 1000;
        sp = Math.sin(q * 61) * a; sy = Math.sin(q * 47 + 1) * a; sr = Math.sin(q * 53 + 2) * a * 0.6;
        this.camera.position.y += Math.sin(q * 71) * a * 0.6;
        this.shake *= Math.pow(0.02, 1 / 60);
      } else this.shake = 0;
      this.camera.rotation.set(this.pitch + sp, this.yaw + sy, this.dead ? 0.6 : sr, 'YXZ');
    }
    // Voxel DDA raycast from the eye. Returns {x,y,z,nx,ny,nz,id} or null.
    raycast(maxDist = 6) {
      const o = this.camera.position;
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
      let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
      const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
      const tdx = Math.abs(1 / dir.x), tdy = Math.abs(1 / dir.y), tdz = Math.abs(1 / dir.z);
      let tmx = sx > 0 ? (x + 1 - o.x) * tdx : (o.x - x) * tdx;
      let tmy = sy > 0 ? (y + 1 - o.y) * tdy : (o.y - y) * tdy;
      let tmz = sz > 0 ? (z + 1 - o.z) * tdz : (o.z - z) * tdz;
      let nx = 0, ny = 0, nz = 0, t = 0;
      while (t <= maxDist) {
        const id = this.world.getBlock(x, y, z);
        if (id > 0 && !VC.Blocks.FLUID[id]) return { x, y, z, nx, ny, nz, id, t };
        if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
        else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
        else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
      }
      return null;
    }
  }
  VC.Player = Player;
})();
