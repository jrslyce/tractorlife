import * as THREE from 'three';
import { WorldInteraction } from './world-interaction.js';
import { aimIndicatorState } from './aim-indicator.js';

// One world-action dispatcher; cargo/crop UI can consume the event first.
export class HarvestControls {
  constructor(options) {
    Object.assign(this, options);
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.held = false;
    this.touch = navigator.maxTouchPoints > 0;
    this.buildPitch = -0.45;
    this.lastPointer = null;
    this.pointerId = null;
    this.target = null;
    this.controller = new WorldInteraction((target) => this.commit(target));
    this.outline = new THREE.Box3Helper(new THREE.Box3(), 0xffe36b);
    this.outline.userData.interactionIgnore = true;
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.terrainGhost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x8b7653, transparent: true, opacity: 0.48, depthWrite: false }));
    this.terrainGhost.userData.interactionIgnore = true;
    this.terrainGhost.visible = false;
    this.scene.add(this.terrainGhost);
    this.panel = document.createElement('div');
    this.panel.id = 'harvest-controls';
    this.panel.style.cssText = 'position:fixed;left:50%;top:calc(64px + env(safe-area-inset-top));transform:translateX(-50%);z-index:43;max-width:90vw;display:none;text-align:center;color:#fffbe8;font:700 13px system-ui;pointer-events:none';
    this.caption = document.createElement('div');
    this.caption.style.cssText = 'background:#17251de8;border:2px solid #a9ca72;border-radius:8px;padding:7px 12px';
    this.meter = document.createElement('progress');
    this.meter.max = 1;
    this.meter.style.cssText = 'display:block;width:100%;height:8px;accent-color:#ffe36b';
    this.buttons = document.createElement('div');
    this.buttons.style.cssText = 'display:flex;justify-content:center;gap:8px;margin-top:5px;pointer-events:auto';
    this.breakButton = this.button('Hold to punch', 'harvest-break');
    this.placeButton = this.button('Place', 'harvest-place');
    this.lookUp = this.button('Aim ↑', 'harvest-look-up');
    this.lookDown = this.button('Aim ↓', 'harvest-look-down');
    this.lookUp.addEventListener('click', () => this.changePitch(0.15));
    this.lookDown.addEventListener('click', () => this.changePitch(-0.15));
    this.buttons.append(this.breakButton, this.placeButton, this.lookUp, this.lookDown);
    this.panel.append(this.caption, this.meter, this.buttons);
    document.body.append(this.panel);
    this.aimMarker = document.createElement('div');
    this.aimMarker.style.cssText = 'position:fixed;left:50%;top:50%;width:10px;height:10px;border:2px solid #fffbe8;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;display:none;z-index:40';
    document.body.append(this.aimMarker);
    this.crosshair = document.createElement('div');
    this.crosshair.id = 'aim-crosshair';
    this.crosshair.setAttribute('aria-hidden', 'true');
    this.crosshair.style.cssText = 'position:fixed;left:50%;top:50%;width:22px;height:22px;transform:translate(-50%,-50%);pointer-events:none;display:none;z-index:40;filter:drop-shadow(0 1px 2px #17251d)';
    this.crosshair.innerHTML = '<i></i><i></i><i></i><i></i>';
    const crosshairStyle = document.createElement('style');
    crosshairStyle.textContent = '#aim-crosshair i{position:absolute;display:block;background:#fffbe8;border:1px solid #263326;box-sizing:border-box;border-radius:1px}#aim-crosshair i:nth-child(1){width:7px;height:2px;left:0;top:10px}#aim-crosshair i:nth-child(2){width:7px;height:2px;right:0;top:10px}#aim-crosshair i:nth-child(3){height:7px;width:2px;top:0;left:10px}#aim-crosshair i:nth-child(4){height:7px;width:2px;bottom:0;left:10px}#aim-crosshair.valid i{background:#b9e27e;border-color:#24351f}';
    document.head.append(crosshairStyle);
    document.body.append(this.crosshair);
    this.breakButton.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if (!this.isEnabled()) return;
      this.touch = e.pointerType === 'touch' || this.touch;
      this.start(e.pointerId);
      this.breakButton.setPointerCapture(e.pointerId);
    });
    this.placeButton.addEventListener('click', e => {
      e.preventDefault();
      if (this.isEnabled() && this.getBuildMode()) this.placeFromEvent(this.centerEvent());
    });
    this.canvas.addEventListener('pointermove', e => {
      this.touch = e.pointerType === 'touch';
      this.lastPointer = { clientX: e.clientX, clientY: e.clientY, button: 0 };
    });
    this.canvas.addEventListener('pointerdown', e => {
      this.touch = e.pointerType === 'touch';
      this.lastPointer = { clientX: e.clientX, clientY: e.clientY, button: 0 };
      if (!this.isEnabled()) return;
      const selected = this.inventory.getSelectedItem();
      if (!this.getBuildMode() && e.button === 0 && selected && (/_seeds$/.test(selected.itemId) || selected.itemId === 'fertilizer')) {
        this.builder.placeFromEvent(e);
        return;
      }
      if (this.touch) return;
      if (this.getBuildMode() && e.button === 0) {
        this.placeFromEvent(e);
      } else if (e.button === (this.getBuildMode() ? 2 : 0)) {
        if (this.resolveTarget()) this.start(e.pointerId);
      }
    });
    this.canvas.addEventListener('contextmenu', e => {
      if (this.isEnabled() && this.getBuildMode()) e.preventDefault();
    });
    this.canvas.addEventListener('wheel', e => {
      if (!this.isEnabled() || !this.getBuildMode()) return;
      e.preventDefault();
      this.changePitch(-Math.sign(e.deltaY) * 0.1);
    }, { passive: false });
    this.canvas.addEventListener('mousedown', e => {
      // A harvesting hold must not also start the existing mouse joystick.
      if (this.isEnabled() && (this.held || this.getBuildMode())) e.stopPropagation();
    });
    addEventListener('pointerup', e => { if (e.pointerId === this.pointerId) this.cancel(); });
    addEventListener('pointercancel', () => this.cancel());
    addEventListener('blur', () => this.cancel());
    document.addEventListener('visibilitychange', () => this.cancel());
  }

  button(text, id) {
    const button = document.createElement('button');
    button.id = id;
    button.textContent = text;
    button.style.cssText = 'min-height:48px;min-width:86px;padding:8px;border:2px solid #f3d98a;border-radius:10px;background:#394638;color:#fffbe8;font:700 13px system-ui;touch-action:none';
    return button;
  }

  start(pointerId) {
    this.controller.cancel();
    this.held = true;
    this.pointerId = pointerId;
    // Audio resumes only in response to an actual input gesture.
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) {
      if (!this.audio) this.audio = new Audio();
      this.audio.resume().catch(() => {});
    }
  }

  cancel() {
    this.held = false;
    this.pointerId = null;
    this.controller.cancel();
  }

  centerEvent() {
    const rect = this.canvas.getBoundingClientRect();
    const aimY = this.touch && !this.getBuildMode() ? 0.57 : 0.5;
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height * aimY, button: 0 };
  }

  changePitch(delta) {
    if (!this.isEnabled() || !this.getBuildMode()) return;
    this.buildPitch = Math.max(-1.2, Math.min(0.9, this.buildPitch + delta));
    this.cancel();
  }

  targetAtEvent(e) {
    if (!this.isEnabled()) return null;
    if (e.pointerType) this.touch = e.pointerType === 'touch';
    this.lastPointer = { clientX: e.clientX, clientY: e.clientY, button: 0 };
    return this.resolveTarget(e);
  }

  ignored(object) {
    for (let parent = object; parent; parent = parent.parent) {
      if (!parent.visible || parent.userData.interactionIgnore || parent === this.character.group || parent === this.camera) return true;
    }
    return false;
  }

  firstHit() {
    return this.ray.intersectObjects(this.scene.children, true).find(hit => !this.ignored(hit.object));
  }

  placeFromEvent(event) {
    const selected = this.inventory.getSelectedItem();
    if (selected && ['dirt', 'stone'].includes(selected.itemId)) {
      const target = this.resolveTarget(event);
      if (!target || target.kind !== 'terrain') {
        this.onResult('Aim at a solid terrain face to place a block.', false);
        return false;
      }
      const normal = target.normal;
      const destination = { x: target.x + normal.x, y: target.y + normal.y, z: target.z + normal.z };
      return this.onTerrainAction ? this.onTerrainAction('place', destination, selected.itemId, selected.itemId) : false;
    }
    return this.builder.placeFromEvent(event);
  }

  resolveTarget(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    // Touch actions originate on a separate control, so use the center aim.
    // Desktop build clicks retain their actual canvas coordinates.
    const aim = this.touch || !event && this.getBuildMode() ? this.centerEvent() : event || this.lastPointer;
    if (!aim) return null;
    this.pointer.set((aim.clientX - rect.left) / rect.width * 2 - 1, -(aim.clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.firstHit();
    if (!hit) return null;
    const terrain = this.getTerrain ? this.getTerrain() : this.terrain;
    const terrainRenderer = this.getTerrainRenderer ? this.getTerrainRenderer() : this.terrainRenderer;
    if (hit.object.userData.terrainChunk && terrainRenderer && terrain) {
      const cell = terrainRenderer.mapHit(hit);
      if (cell) {
        const material = terrain.getCell(cell.x, cell.y, cell.z);
        if (material && cell.y > terrain.minY) {
          return { kind: 'terrain', id: `${cell.x},${cell.y},${cell.z}`, material,
            x: cell.x, y: cell.y, z: cell.z, normal: cell.normal, revision: this.getTerrainRevision(),
            mesh: hit.object, point: hit.point };
        }
      }
    }
    const trees = this.getFarmSystems().getHarvestTargets();
    const tree = trees.find(t => t.id === hit.object.userData.harvestTreeId);
    const block = this.builder.getHarvestTargets().find(t => t.mesh === hit.object);
    const target = tree || block;
    if (!target) return null;
    const position = this.character.group.position;
    if (block && Math.hypot(block.x - position.x, block.y - position.y, block.z - position.z) > 4) return null;
    const eye = new THREE.Vector3(position.x, position.y + 1.4, position.z);
    if (eye.distanceTo(hit.point) > 4) return null;
    // A high third-person camera must not harvest over an intervening wall.
    const direction = hit.point.clone().sub(eye);
    const distance = direction.length();
    this.ray.set(eye, direction.normalize());
    const obstacle = this.firstHit();
    if (obstacle && obstacle.distance < distance - 0.08 &&
        (obstacle.object !== hit.object || obstacle.point.distanceTo(hit.point) > 0.08) &&
        !(tree && obstacle.object.userData.harvestTreeId === tree.id)) return null;
    return { ...target, mesh: block ? block.mesh : hit.object, point: hit.point };
  }

  commit(target) {
    const live = this.resolveTarget();
    if (!live || live.kind !== target.kind || live.id !== target.id || live.revision !== target.revision) return { ok: false, error: 'Target changed.' };
    if (target.kind === 'terrain') {
      return this.onTerrainAction ? this.onTerrainAction('break', target, '', this.inventory.getSelectedItem()?.itemId || '') : { ok: false, error: 'Terrain editing unavailable.' };
    }
    const result = target.kind === 'tree'
      ? this.getFarmSystems().harvestTree(target.id, this.inventory, target.revision)
      : this.builder.harvestBlock(target.id, this.inventory);
    const ok = result && (result.ok || result.success);
    this.onResult(ok ? '+ ' + (target.kind === 'tree' ? '3' : '1') + ' Wood' : result.error || result.message || 'Unable to harvest.', !!ok);
    if (ok && this.audio) {
      const oscillator = this.audio.createOscillator(), gain = this.audio.createGain();
      oscillator.type = 'triangle'; oscillator.frequency.value = 180;
      gain.gain.setValueAtTime(0.07, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + 0.12);
      oscillator.connect(gain); gain.connect(this.audio.destination);
      oscillator.start(); oscillator.stop(this.audio.currentTime + 0.12);
    }
    return result;
  }

  update(dt) {
    const enabled = this.isEnabled();
    if (!enabled) this.cancel();
    this.target = enabled ? this.resolveTarget() : null;
    const selected = this.inventory.getSelectedItem();
    const state = this.controller.update(dt, {
      enabled, target: this.target, held: this.held,
      toolId: selected ? selected.itemId : '', slot: this.inventory.getSelectedSlot(),
      mode: this.getBuildMode() ? 'build' : 'walk'
    });
    this.panel.style.display = enabled ? 'block' : 'none';
    this.buttons.style.display = this.touch || this.getBuildMode() ? 'flex' : 'none';
    this.placeButton.style.display = this.getBuildMode() ? 'block' : 'none';
    this.lookUp.style.display = this.lookDown.style.display = this.getBuildMode() ? 'block' : 'none';
    const indicator = aimIndicatorState({ enabled, buildMode: this.getBuildMode(), touch: this.touch, target: this.target });
    this.aimMarker.style.display = indicator.visible && this.touch && !this.getBuildMode() ? 'block' : 'none';
    this.aimMarker.style.top = '57%';
    this.crosshair.style.display = indicator.visible && (!this.touch || this.getBuildMode()) ? 'block' : 'none';
    this.crosshair.classList.toggle('valid', indicator.valid);
    if (indicator.centered) {
      this.crosshair.style.left = '50%';
      this.crosshair.style.top = this.touch && !this.getBuildMode() ? '57%' : '50%';
    } else if (this.lastPointer) {
      this.crosshair.style.left = this.lastPointer.clientX + 'px';
      this.crosshair.style.top = this.lastPointer.clientY + 'px';
    }
    const terrainNames = { grass: 'grass', dirt: 'dirt', stone: 'stone', wood: 'wood block' };
    const label = this.target ? this.target.kind === 'terrain'
      ? (this.target.material === 'stone' ? 'Mine stone' : this.target.material === 'dirt' || this.target.material === 'grass' ? 'Dig dirt' : 'Break wood block')
      : (selected && selected.itemId === 'axe' ? 'Chop' : 'Punch') + (this.target.kind === 'tree' ? ' tree' : ' wood block') : '';
    this.caption.textContent = label ? label + ' · hold ' + (this.touch ? 'action' : this.getBuildMode() ? 'right mouse' : 'left mouse')
      : this.getBuildMode() ? 'Place wood · hold Break to reclaim · ' + (this.touch ? 'tap arrows to aim' : 'scroll to aim') : 'Aim at a grove tree to gather wood';
    this.breakButton.textContent = label ? 'Hold to ' + label.toLowerCase() : 'Hold to punch';
    this.breakButton.disabled = !this.target;
    this.meter.value = state.progress;
    this.meter.style.visibility = this.target ? 'visible' : 'hidden';
    this.outline.visible = !!this.target;
    if (this.target && this.target.kind === 'terrain') {
      this.outline.box.set(new THREE.Vector3(this.target.x - 0.5, this.target.y, this.target.z - 0.5),
        new THREE.Vector3(this.target.x + 0.5, this.target.y + 1, this.target.z + 0.5));
    } else if (this.target) this.outline.box.setFromObject(this.target.mesh);
    const placeable = this.getBuildMode() && selected && ['dirt', 'stone'].includes(selected.itemId) && this.target?.kind === 'terrain';
    this.terrainGhost.visible = !!placeable;
    if (placeable) {
      const destination = { x: this.target.x + this.target.normal.x, y: this.target.y + this.target.normal.y, z: this.target.z + this.target.normal.z };
      this.terrainGhost.position.set(destination.x, destination.y + 0.5, destination.z);
      const terrain = this.getTerrain ? this.getTerrain() : this.terrain;
      const valid = terrain && terrain.isEditable(destination.x, destination.y, destination.z) &&
        !terrain.isSolid(destination.x, destination.y, destination.z) &&
        !(this.isTerrainPlacementBlocked && this.isTerrainPlacementBlocked(destination, selected.itemId));
      this.terrainGhost.material.color.set(valid ? (selected.itemId === 'stone' ? 0x858585 : 0x806044) : 0xff3b30);
    }
    if (this.getBuildMode() && enabled) this.builder.aimFromEvent(this.centerEvent());
    const arm = this.getBuildMode() ? this.firstPersonArm : this.character._rightArm;
    if (arm) arm.rotation.x = this.held && this.target ? -0.35 - Math.sin(performance.now() / 90) * 0.35 : 0;
  }
}
