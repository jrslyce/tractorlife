// game/js/inventory.js — Minecraft-style hotbar inventory.
// ES module, Three.js (importmap 0.160.0).
// Hotbar: 9 slots, keys 1-9 + tap to select. Selected item renders in
// character's right hand. Buy flow: money → inventory.
// Save/load integrated via snapshot/applyState in main.js.
import * as THREE from 'three';

// ---------------------------------------------------------------- constants
var HOTBAR_SLOTS = 9;
var HOTBAR_Y = 10; // px above bottom
var HOTBAR_BTN_W = 52;
var HOTBAR_BTN_H = 52;
var HOTBAR_GAP = 4;

var ITEM_EMOJI = {
  gravel: '⬜', asphalt: '⬛', brick: '🧱', wood: '🪵', corn_seeds: '🌽',
  wheat_seeds: '🌾', pumpkin_seeds: '🎃', sunflower_seeds: '🌻', pea_seeds: '🟢',
  fertilizer: '🪴', crop_spray: '🧴', paint: '🎨', lamp_light: '💡', hay_bale: '🟨', scarecrow: '🧑‍🌾',
  pumpkin_pile: '🎃', corn_shocks: '🌽', string_lights: '✨', mailbox: '📮',
  roof_shingles: '🏠', fence_kit: '🪵', window_glass: '🪟', door: '🚪'
};
var ITEM_COLORS = {
  gravel: '#85827a', asphalt: '#333536', brick: '#9a4f3f', wood: '#81552f',
  corn_seeds: '#d6b33d', wheat_seeds: '#c6a544', pumpkin_seeds: '#d47732',
  sunflower_seeds: '#e4bd32', pea_seeds: '#6f9a43', fertilizer: '#60482f', crop_spray: '#4d9ad8',
  paint: '#d84d58', lamp_light: '#f5d86b', hay_bale: '#d8b84d',
  scarecrow: '#86593b', pumpkin_pile: '#e87925', corn_shocks: '#c69f32',
  string_lights: '#f2cc58', mailbox: '#b94738', roof_shingles: '#8c4638',
  fence_kit: '#9a8058', window_glass: '#8bd2e8', door: '#754a2b'
};

// ---------------------------------------------------------------- Item class
// Represents one stackable item in the inventory.
export class InventoryItem {
  constructor(itemId, qty) {
    this.itemId = itemId;
    this.qty = qty;
  }
}

// ---------------------------------------------------------------- Inventory class
export class Inventory {
  constructor() {
    this._slots = [];
    for (var i = 0; i < HOTBAR_SLOTS; i++) {
      this._slots.push(null); // null = empty slot
    }
    this._selectedSlot = -1; // -1 = nothing selected
    this._group = null; // DOM hotbar element
    this._character = null;
    this._heldMesh = null;
  }

  // ---- public API ----

  // Add purchased items to a stack. The shop validates and deducts currency.
  // Returns { ok: bool, error?: string }.
  buy(itemId, qty) {
    qty = Math.floor(Number(qty));
    if (!itemId || !isFinite(qty) || qty <= 0) return { ok: false, error: 'invalid quantity' };
    // Check if item already exists in any slot
    for (var i = 0; i < this._slots.length; i++) {
      var s = this._slots[i];
      if (s && s.itemId === itemId) {
        s.qty += qty;
        s.emoji = ITEM_EMOJI[itemId] || '?';
        this.updateDOM();
        return { ok: true };
      }
    }
    // Find empty slot
    for (var i = 0; i < this._slots.length; i++) {
      if (this._slots[i] === null) {
        this._slots[i] = new InventoryItem(itemId, qty);
        this._slots[i].emoji = ITEM_EMOJI[itemId] || '?';
        this.updateDOM();
        return { ok: true };
      }
    }
    return { ok: false, error: 'inventory full' };
  }

  // Select a slot by index (0-based). Returns the item or null.
  selectSlot(idx) {
    if (idx < 0 || idx >= HOTBAR_SLOTS) return null;
    this._selectedSlot = idx;
    this._updateHeldItem();
    return this._slots[idx];
  }

  setCharacter(character) {
    this._character = character || null;
    this._updateHeldItem();
  }

  _updateHeldItem() {
    var arm = this._character && this._character._rightArm;
    if (this._heldMesh && arm) {
      arm.remove(this._heldMesh);
      this._heldMesh.geometry.dispose();
      this._heldMesh.material.dispose();
      this._heldMesh = null;
    }
    var selected = this.getSelectedItem();
    if (!selected || !arm) return;
    var geometry = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    var material = new THREE.MeshStandardMaterial({ color: ITEM_COLORS[selected.itemId] || '#d6b33d', roughness: 0.8 });
    var mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, -0.55, 0.34);
    mesh.castShadow = true;
    arm.add(mesh);
    this._heldMesh = mesh;
  }

  // Get the currently selected item (or null).
  getSelectedItem() {
    if (this._selectedSlot < 0 || !this._slots[this._selectedSlot]) return null;
    return this._slots[this._selectedSlot];
  }

  // Use/consume one of the selected item (for building/placement).
  useOne() {
    return this.useMany(1);
  }

  useMany(amount) {
    amount = Math.floor(Number(amount));
    if (this._selectedSlot < 0 || !isFinite(amount) || amount <= 0) return false;
    var s = this._slots[this._selectedSlot];
    if (!s || s.qty < amount) return false;
    s.qty -= amount;
    if (s.qty <= 0) {
      this._slots[this._selectedSlot] = null;
    }
    this._updateHeldItem();
    this.updateDOM();
    return true;
  }

  // Stack in slot `idx` (or null).
  getSlot(idx) {
    return idx >= 0 && idx < this._slots.length ? this._slots[idx] : null;
  }

  // First slot index whose item id passes `test`, preferring the selected
  // slot; -1 when none does.
  findSlot(test) {
    var sel = this.getSelectedItem();
    if (sel && sel.qty > 0 && test(sel.itemId)) return this._selectedSlot;
    for (var i = 0; i < this._slots.length; i++) {
      var s = this._slots[i];
      if (s && s.qty > 0 && test(s.itemId)) return i;
    }
    return -1;
  }

  // Consume up to `amount` from slot `idx`; returns how many were used.
  useFromSlot(idx, amount) {
    var s = this.getSlot(idx);
    amount = Math.floor(Number(amount));
    if (!s || !isFinite(amount) || amount <= 0) return 0;
    var used = Math.min(amount, s.qty);
    s.qty -= used;
    if (s.qty <= 0) this._slots[idx] = null;
    this._updateHeldItem();
    this.updateDOM();
    return used;
  }

  // Remove and return the whole stack in slot `idx` ({itemId, qty} or null).
  takeSlot(idx) {
    var s = this.getSlot(idx);
    if (!s) return null;
    this._slots[idx] = null;
    this._updateHeldItem();
    this.updateDOM();
    return { itemId: s.itemId, qty: s.qty };
  }

  // Get slot count
  getSlotCount() { return HOTBAR_SLOTS; }
  getSelectedSlot() { return this._selectedSlot; }

  // ---- DOM hotbar ----
  install(parent) {
    var self = this;
    var wrap = document.createElement('div');
    wrap.id = 'vt-hotbar';
    wrap.style.cssText = 'position:fixed;left:50%;bottom:' + HOTBAR_Y + 'px;' +
      'transform:translateX(-50%);display:none;z-index:42;' +
      '-webkit-flex-direction:row;flex-direction:row;' +
      'gap:' + HOTBAR_GAP + 'px;padding:6px;' +
      'background:rgba(255,251,232,.92);border:3px solid #2f4d1f;border-radius:14px;' +
      '-webkit-user-select:none;user-select:none;box-shadow:0 3px 0 rgba(0,0,0,.25);';

    for (var i = 0; i < HOTBAR_SLOTS; i++) {
      (function (slotIdx) {
        var btn = document.createElement('button');
        btn.style.cssText = 'appearance:none;-webkit-appearance:none;' +
          'width:' + HOTBAR_BTN_W + 'px;height:' + HOTBAR_BTN_H + 'px;' +
          'position:relative;' +
          'border:3px solid #2f4d1f;border-radius:10px;' +
          'background:#fffbe8;color:#233018;font-size:22px;' +
          'cursor:pointer;touch-action:manipulation;' +
          '-webkit-tap-highlight-color:transparent;' +
          '-webkit-user-select:none;user-select:none;';
        btn.setAttribute('data-slot', slotIdx);

        var icon = document.createElement('span');
        icon.className = 'hotbar-icon';
        icon.style.cssText = 'display:block;line-height:1;';

        var qty = document.createElement('span');
        qty.className = 'hotbar-qty';
        qty.style.cssText = 'position:absolute;right:2px;bottom:2px;' +
          'font-size:11px;font-weight:700;';

        btn.appendChild(icon);
        btn.appendChild(qty);

        // Tap to select
        btn.addEventListener('touchend', function (e) {
          if (e.cancelable) e.preventDefault();
          self.selectSlot(slotIdx);
          self.updateDOM();
        });
        btn.addEventListener('click', function () {
          if (Date.now() - (self._lastTouch || 0) < 700) return;
          self.selectSlot(slotIdx);
          self.updateDOM();
        });
        btn.addEventListener('touchstart', function () { self._lastTouch = Date.now(); }, { passive: true });

        wrap.appendChild(btn);
      })(i);
    }

    parent.appendChild(wrap);
    this._group = wrap;
  }

  updateDOM() {
    if (!this._group) return;
    var btns = this._group.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var slot = this._slots[i];
      var icon = btn.querySelector('.hotbar-icon');
      var qty = btn.querySelector('.hotbar-qty');
      if (slot) {
        icon.textContent = slot.emoji || '?';
        qty.textContent = slot.qty > 1 ? slot.qty : '';
        btn.style.display = 'block';
      } else {
        icon.textContent = '';
        qty.textContent = '';
        btn.style.display = 'block';
      }
      // Highlight selected
      if (i === this._selectedSlot) {
        btn.style.borderColor = '#ffe066';
        btn.style.background = '#ffe066';
      } else {
        btn.style.borderColor = '#2f4d1f';
        btn.style.background = '#fffbe8';
      }
    }
  }

  setVisible(visible) {
    if (this._group) this._group.style.display = visible ? 'flex' : 'none';
  }

  dispose() {
    this.setCharacter(null);
    if (this._group && this._group.parentNode) {
      this._group.parentNode.removeChild(this._group);
    }
  }

  // ---- serialization ----
  serialize() {
    var slots = [];
    for (var i = 0; i < this._slots.length; i++) {
      var s = this._slots[i];
      slots.push(s ? { itemId: s.itemId, qty: s.qty, emoji: s.emoji } : null);
    }
    return { v: 1, selectedSlot: this._selectedSlot, slots: slots };
  }

  restore(d) {
    if (!d || !d.slots || !Array.isArray(d.slots)) return false;
    for (var i = 0; i < this._slots.length && i < d.slots.length; i++) {
      var ds = d.slots[i];
      if (ds) {
        this._slots[i] = new InventoryItem(ds.itemId, ds.qty);
        this._slots[i].emoji = ds.emoji || '';
      } else {
        this._slots[i] = null;
      }
    }
    if (typeof d.selectedSlot === 'number' && isFinite(d.selectedSlot)) {
      this._selectedSlot = Math.max(-1, Math.min(HOTBAR_SLOTS - 1, d.selectedSlot));
    }
    this._updateHeldItem();
    this.updateDOM();
    return true;
  }
}
