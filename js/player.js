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
      this.frozen = true; // until chunk under player is loaded
    }
    isSolidAt(x, y, z) {
      const id = this.world.getBlock(x, y, z);
      return id === -1 ? true : SOLID[id] === 1; // unloaded chunks act solid
    }
    collides(px, py, pz) {
      const x0 = Math.floor(px - HW), x1 = Math.floor(px + HW - 1e-7);
      const y0 = Math.floor(py), y1 = Math.floor(py + HEIGHT - 1e-7);
      const z0 = Math.floor(pz - HW), z1 = Math.floor(pz + HW - 1e-7);
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (this.isSolidAt(x, y, z)) return true;
      return false;
    }
    // Move along one axis, resolving collisions. Returns true if blocked.
    moveAxis(axis, amount) {
      const p = this.pos;
      const steps = Math.ceil(Math.abs(amount) / 0.25) || 1;
      const d = amount / steps;
      for (let s = 0; s < steps; s++) {
        const before = p.getComponent(axis);
        p.setComponent(axis, before + d);
        if (this.collides(p.x, p.y, p.z)) {
          // snap to the block boundary
          if (axis === 1) {
            p.y = d > 0 ? Math.floor(p.y + HEIGHT) - HEIGHT - 1e-4 : Math.floor(p.y) + 1 + 1e-4;
            if (this.collides(p.x, p.y, p.z)) p.y = before;
          } else {
            const half = HW;
            const v = p.getComponent(axis);
            const snapped = d > 0 ? Math.floor(v + half) - half - 1e-4 : Math.floor(v - half) + 1 + half + 1e-4;
            p.setComponent(axis, snapped);
            if (this.collides(p.x, p.y, p.z)) p.setComponent(axis, before);
          }
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
      this.inWater = feetId === B.WATER; this.headInWater = headId === B.WATER;
      if (this.frozen) {
        const c = w.getChunk(Math.floor(this.pos.x / 16), Math.floor(this.pos.z / 16));
        if (c && c.meshes) this.frozen = false; else { this.updateCamera(0); return; }
      }
      const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      const strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      const sprint = k.ShiftLeft && !this.flying || k.ControlLeft || k.ControlRight || k.ShiftRight;
      let speed = this.flying ? (sprint ? 22 : 11) : sprint && fwd > 0 ? 5.8 : 4.3;
      if (this.inWater && !this.flying) speed *= 0.55;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      let mx = -sin * fwd + cos * strafe, mz = -cos * fwd - sin * strafe;
      const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }
      const accel = this.onGround || this.flying ? 14 : this.inWater ? 6 : 4;
      const t = Math.min(1, accel * dt);
      this.vel.x += (mx * speed - this.vel.x) * t;
      this.vel.z += (mz * speed - this.vel.z) * t;

      if (this.flying) {
        const up = (k.Space ? 1 : 0) - (k.ShiftLeft ? 1 : 0);
        this.vel.y += (up * speed * 0.8 - this.vel.y) * Math.min(1, 10 * dt);
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
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
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
        if (id > 0 && id !== B.WATER) return { x, y, z, nx, ny, nz, id };
        if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
        else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
        else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
      }
      return null;
    }
  }
  VC.Player = Player;
})();
