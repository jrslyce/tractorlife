// game/js/wagon.js — farm wagon: a voxel trailer that hitches to the truck
// and carries supplies (seeds, spray, building blocks) between the shop and
// the farm. ES module, Three.js (importmap 0.160.0).
//
// Conventions match the vehicles: forward = +X in model space, heading θ is
// rotation.y with world forward = (cos θ, 0, −sin θ), model scale 0.5.
import * as THREE from 'three';
import { ITEM_BY_ID } from './items.js';

export const WAGON_SLOTS = 12;
export const TRUCK_BED_SLOTS = 6;
const SCALE = 0.5;
const TONGUE_TIP_X = 8;     // model units ahead of the wagon centre (hitch ring)
const HITCH_RANGE = 4;      // world units: truck hitch must be this close to hitch up
const REACH = 4.5;          // world units: how close you must stand to load it
const HALF_LEN = 6 * SCALE; // body half-extents in world units (for reach checks)
const HALF_WID = 3.5 * SCALE;

const COL = {
  bed: '#8a5a2b',
  board: '#b5793c',
  trim: '#6b4220',
  metal: '#4d4f55',
  tire: '#1f1f22',
  hub: '#c9ccd2',
  red: '#c0392b'
};

const BOX = new THREE.BoxGeometry(1, 1, 1);
const _dummy = new THREE.Object3D();

function voxels(cells) {
  // cells: Map "x,y,z" -> color. One InstancedMesh per colour.
  const group = new THREE.Group();
  const buckets = new Map();
  cells.forEach(function (c, k) {
    if (!buckets.has(c)) buckets.set(c, []);
    const p = k.split(',');
    buckets.get(c).push([Number(p[0]), Number(p[1]), Number(p[2])]);
  });
  buckets.forEach(function (list, color) {
    const mesh = new THREE.InstancedMesh(BOX,
      new THREE.MeshStandardMaterial({ color: color, roughness: 0.85, metalness: 0.05 }), list.length);
    for (let i = 0; i < list.length; i++) {
      _dummy.position.set(list[i][0], list[i][1], list[i][2]);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  return group;
}

function buildWagonModel() {
  const cells = new Map();
  function set(x, y, z, c) { cells.set(x + ',' + y + ',' + z, c); }
  function box(x0, x1, y0, y1, z0, z1, c) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) set(x, y, z, c);
  }
  box(-6, 5, 2, 2, -3, 3, COL.bed);          // bed floor
  box(-6, 5, 3, 4, -3, -3, COL.board);       // side boards
  box(-6, 5, 3, 4, 3, 3, COL.board);
  box(-6, -6, 3, 4, -2, 2, COL.board);       // tailgate
  box(5, 5, 3, 4, -2, 2, COL.board);         // headboard
  box(-6, 5, 5, 5, -3, -3, COL.trim);        // top rails
  box(-6, 5, 5, 5, 3, 3, COL.trim);
  box(-4, 3, 1, 1, -1, 1, COL.metal);        // chassis
  box(6, TONGUE_TIP_X - 1, 1, 1, 0, 0, COL.metal); // tongue
  set(TONGUE_TIP_X, 1, 0, COL.red);          // hitch ring
  [[-4, -4], [-4, 4], [3, -4], [3, 4]].forEach(function (w) {
    box(w[0] - 1, w[0] + 1, 0, 1, w[1], w[1], COL.tire);
    set(w[0], 1, w[1] + (w[1] > 0 ? 1 : -1), COL.hub);
  });
  const g = voxels(cells);
  g.position.y = 0.5; // voxel centres sit on integer y; lift the tyres onto the ground
  const root = new THREE.Group();
  root.add(g);
  root.scale.set(SCALE, SCALE, SCALE);
  return root;
}

// A bed of item stacks (the wagon's, or the truck's).
export class CargoHold {
  constructor(slots, name, emoji) {
    this.slots = slots;
    this.name = name;
    this.emoji = emoji;
    this.cargo = new Array(slots).fill(null);
  }

  // Add `qty` units of an item, merging into an existing stack first.
  add(itemId, qty) {
    qty = Math.floor(Number(qty));
    if (!ITEM_BY_ID[itemId] || !(qty > 0)) return { ok: false, error: 'invalid item' };
    for (let i = 0; i < this.cargo.length; i++) {
      if (this.cargo[i] && this.cargo[i].itemId === itemId) {
        this.cargo[i].qty += qty;
        return { ok: true };
      }
    }
    for (let i = 0; i < this.cargo.length; i++) {
      if (!this.cargo[i]) {
        this.cargo[i] = { itemId: itemId, qty: qty };
        return { ok: true };
      }
    }
    return { ok: false, error: 'The ' + this.name.toLowerCase() + ' is full.' };
  }

  take(idx) {
    const s = this.cargo[idx];
    if (!s) return null;
    this.cargo[idx] = null;
    return s;
  }

  hasAny(test) {
    for (let i = 0; i < this.cargo.length; i++) if (this.cargo[i] && test(this.cargo[i].itemId)) return true;
    return false;
  }

  serializeCargo() {
    return this.cargo.map(function (s) { return s ? { itemId: s.itemId, qty: s.qty } : null; });
  }

  restoreCargo(list) {
    this.cargo = new Array(this.slots).fill(null);
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length && i < this.slots; i++) {
      const s = list[i];
      const qty = s ? Math.floor(Number(s.qty)) : 0;
      if (s && ITEM_BY_ID[s.itemId] && qty > 0) this.cargo[i] = { itemId: s.itemId, qty: qty };
    }
  }
}

export class Wagon extends CargoHold {
  constructor(scene) {
    super(WAGON_SLOTS, 'Farm Wagon', '🛒');
    this.group = buildWagonModel();
    scene.add(this.group);
    this.hitched = false;
    this._tongue = new THREE.Vector3();
  }

  get position() { return this.group.position; }
  get heading() { return this.group.rotation.y; }

  place(x, z, heading) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading || 0;
  }

  // World position of the hitch ring at the tip of the tongue.
  tongueTip(out) {
    const h = this.group.rotation.y;
    const r = TONGUE_TIP_X * SCALE;
    return out.set(this.group.position.x + Math.cos(h) * r, 0, this.group.position.z - Math.sin(h) * r);
  }

  // Can a hitch point at (x, z) couple to the tongue?
  canHitchAt(x, z) {
    this.tongueTip(this._tongue);
    const dx = x - this._tongue.x;
    const dz = z - this._tongue.z;
    return dx * dx + dz * dz <= HITCH_RANGE * HITCH_RANGE;
  }

  // Trailer follow: the tongue tip rides on the truck's hitch point and the
  // wagon body swings in behind it (classic single-axle trailer kinematics).
  follow(hitchX, hitchZ) {
    const r = TONGUE_TIP_X * SCALE;
    let dx = hitchX - this.group.position.x;
    let dz = hitchZ - this.group.position.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-4) return;
    dx /= len;
    dz /= len;
    this.group.position.x = hitchX - dx * r;
    this.group.position.z = hitchZ - dz * r;
    this.group.rotation.y = Math.atan2(-dz, dx);
  }

  // Snap straight behind a hitch point facing `heading` (restore / hitch-up).
  snapBehind(hitchX, hitchZ, heading) {
    const r = TONGUE_TIP_X * SCALE;
    this.place(hitchX - Math.cos(heading) * r, hitchZ + Math.sin(heading) * r, heading);
  }

  // Distance from (x, z) to the wagon body's footprint (0 when on top of it).
  distanceTo(x, z) {
    const h = this.group.rotation.y;
    const dx = x - this.group.position.x;
    const dz = z - this.group.position.z;
    const c = Math.cos(h), s = Math.sin(h);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const ox = Math.max(0, Math.abs(lx) - HALF_LEN);
    const oz = Math.max(0, Math.abs(lz) - HALF_WID);
    return Math.sqrt(ox * ox + oz * oz);
  }

  isNear(x, z) { return this.distanceTo(x, z) <= REACH; }

  serialize() {
    return {
      x: Math.round(this.group.position.x * 100) / 100,
      z: Math.round(this.group.position.z * 100) / 100,
      h: Math.round(this.group.rotation.y * 1000) / 1000,
      hitched: this.hitched,
      cargo: this.serializeCargo()
    };
  }

  restore(d) {
    if (!d || typeof d !== 'object') return false;
    if (Number.isFinite(d.x) && Number.isFinite(d.z)) {
      this.place(d.x, d.z, Number.isFinite(d.h) ? d.h : 0);
    }
    this.hitched = !!d.hitched;
    this.restoreCargo(d.cargo);
    return true;
  }
}

// ---------------------------------------------------------------- panel
// Two rows of stacks: tap one in the hotbar to load it onto the wagon, tap
// one on the wagon to unload it back into the hotbar.
const PANEL_CSS = [
  '#wagon-panel { position: fixed; inset: 0; z-index: 70; display: none;',
  '  align-items: center; justify-content: center; background: rgba(20,32,14,.55);',
  '  font-family: system-ui, -apple-system, sans-serif; }',
  '#wagon-panel .wp-card { background: #fffbe8; border: 4px solid #2f4d1f; border-radius: 18px;',
  '  padding: 16px 18px; max-width: min(92vw, 560px); box-sizing: border-box; color: #233018;',
  '  box-shadow: 0 6px 0 rgba(0,0,0,.25); }',
  '#wagon-panel h2 { margin: 0 0 4px; font-size: 24px; }',
  '#wagon-panel p { margin: 0 0 10px; font-size: 14px; color: #4a5a3a; }',
  '#wagon-panel h3 { margin: 12px 0 6px; font-size: 16px; }',
  '#wagon-panel .wp-grid { display: flex; flex-wrap: wrap; gap: 6px; }',
  '#wagon-panel .wp-slot { position: relative; width: 52px; height: 52px; border: 3px solid #2f4d1f;',
  '  border-radius: 10px; background: #fff; font-size: 24px; cursor: pointer;',
  '  touch-action: manipulation; -webkit-appearance: none; appearance: none; padding: 0; }',
  '#wagon-panel .wp-slot[disabled] { opacity: .35; cursor: default; }',
  '#wagon-panel .wp-qty { position: absolute; right: 2px; bottom: 1px; font-size: 11px; font-weight: 700; }',
  '#wagon-panel .wp-msg { min-height: 20px; margin-top: 10px; font-weight: 600; color: #7a3b1c; }',
  '#wagon-panel .wp-close { margin-top: 12px; min-height: 48px; width: 100%; font-size: 18px; font-weight: 700;',
  '  border: none; border-radius: 12px; background: #ffe066; color: #2f4d1f; cursor: pointer;',
  '  box-shadow: 0 3px 0 #b8901a; }'
].join('\n');

export class WagonPanel {
  constructor(wagon, inventory, onChange) {
    this._wagon = wagon; // the hold currently shown (set again by open())
    this._inventory = inventory;
    this._onChange = onChange || function () {};
    this._open = false;

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'wagon-panel';
    root.innerHTML =
      '<div class="wp-card" role="dialog" aria-label="Cargo">' +
      '<h2 class="wp-title"></h2>' +
      '<p class="wp-help"></p>' +
      '<h3>🎒 Your hotbar</h3><div class="wp-grid" data-row="hotbar"></div>' +
      '<h3 class="wp-hold"></h3><div class="wp-grid" data-row="wagon"></div>' +
      '<div class="wp-msg"></div>' +
      '<button type="button" class="wp-close">Done</button>' +
      '</div>';
    document.body.appendChild(root);
    this._root = root;
    this._hotbarRow = root.querySelector('[data-row="hotbar"]');
    this._wagonRow = root.querySelector('[data-row="wagon"]');
    this._msg = root.querySelector('.wp-msg');
    this._title = root.querySelector('.wp-title');
    this._help = root.querySelector('.wp-help');
    this._holdLabel = root.querySelector('.wp-hold');

    const self = this;
    root.querySelector('.wp-close').addEventListener('click', function () { self.close(); });
    root.addEventListener('click', function (e) { if (e.target === root) self.close(); });
    document.addEventListener('keydown', function (e) {
      // Deferred so Input's own KeyL handler still sees the game locked and
      // does not immediately queue another 'openWagon'.
      if (self._open && (e.key === 'Escape' || e.code === 'KeyL')) {
        e.preventDefault();
        setTimeout(function () { self.close(); }, 0);
      }
    });
  }

  isOpen() { return this._open; }

  // Show `hold` (the wagon or the truck bed; defaults to the last one shown).
  open(hold) {
    if (hold) this._wagon = hold;
    const noun = this._wagon.name.toLowerCase().replace('farm ', '');
    this._title.textContent = this._wagon.emoji + ' ' + this._wagon.name;
    this._help.textContent = 'Tap something in your hotbar to load it. Tap something in the ' + noun + ' to take it.';
    this._holdLabel.textContent = this._wagon.emoji + ' In the ' + noun;
    this._open = true;
    this._msg.textContent = '';
    this._render();
    this._root.style.display = 'flex';
    window.VT_LOCKED = true; // no walking around while the panel is up
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this._root.style.display = 'none';
    window.VT_LOCKED = false;
  }

  _slotButton(stack, onTap) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wp-slot';
    if (stack) {
      const item = ITEM_BY_ID[stack.itemId];
      b.textContent = item ? item.emoji : '?';
      b.title = (item ? item.name : stack.itemId) + ' × ' + stack.qty;
      const q = document.createElement('span');
      q.className = 'wp-qty';
      q.textContent = stack.qty;
      b.appendChild(q);
      b.addEventListener('click', onTap);
    } else {
      b.disabled = true;
    }
    return b;
  }

  _render() {
    const self = this;
    const inv = this._inventory;
    this._hotbarRow.innerHTML = '';
    for (let i = 0; i < inv.getSlotCount(); i++) {
      this._hotbarRow.appendChild(this._slotButton(inv.getSlot(i), function () { self._load(i); }));
    }
    this._wagonRow.innerHTML = '';
    for (let i = 0; i < this._wagon.cargo.length; i++) {
      this._wagonRow.appendChild(this._slotButton(this._wagon.cargo[i], function () { self._unload(i); }));
    }
  }

  _load(slotIdx) {
    const stack = this._inventory.getSlot(slotIdx);
    if (!stack) return;
    const res = this._wagon.add(stack.itemId, stack.qty);
    if (!res.ok) { this._msg.textContent = res.error; return; }
    this._inventory.takeSlot(slotIdx);
    this._msg.textContent = '';
    this._render();
    this._onChange();
  }

  _unload(wagonIdx) {
    const stack = this._wagon.cargo[wagonIdx];
    if (!stack) return;
    const res = this._inventory.buy(stack.itemId, stack.qty);
    if (!res || !res.ok) { this._msg.textContent = 'Your hotbar is full — load something into the ' + this._wagon.name.toLowerCase().replace('farm ', '') + ' first.'; return; }
    this._wagon.take(wagonIdx);
    this._msg.textContent = '';
    this._render();
    this._onChange();
  }
}
