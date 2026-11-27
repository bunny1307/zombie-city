import { InventorySystem, CALIBERS, ItemTemplate } from './inventory.ts';

export type ReloadStage = 'none' | 'mag_out' | 'mag_in' | 'bolt_rack';

export interface ReloadStateSnapshot {
  isReloading: boolean;
  progress: number; // 0..1
  stage: ReloadStage;
  remainingSec: number;
  durationSec: number;
}

/**
 * Dedicated timed weapon reloading system:
 * - Supports [R] key, HUD [R] Reload button, and auto-reload on empty clip.
 * - Uses 3 realistic phases (mag_out -> mag_in -> bolt_rack) with distinct foley cues.
 * - Transfers reserve caliber ammo into the magazine upon completion (cancels safely on slot switch).
 */
export class ReloadSystem {
  private inventory: InventorySystem;
  private isReloading = false;
  private elapsed = 0;
  private duration = 1.4;
  private reloadSlot = -1;
  private reloadTemplateId = '';
  private stageNotified: { magOut: boolean; magIn: boolean; boltRack: boolean } = {
    magOut: false,
    magIn: false,
    boltRack: false
  };

  private playFoley: (stage: 'mag_out' | 'mag_in' | 'bolt_rack') => void;
  private statusTimeout: number | null = null;

  private reloadBtn: HTMLElement | null = null;
  private progressWrap: HTMLElement | null = null;
  private progressFill: HTMLElement | null = null;
  private progressLabel: HTMLElement | null = null;

  constructor(
    inventory: InventorySystem,
    playFoley: (stage: 'mag_out' | 'mag_in' | 'bolt_rack') => void
  ) {
    this.inventory = inventory;
    this.playFoley = playFoley;
    this.mountHud();
  }

  private mountHud() {
    const hotbarWrap = document.getElementById('hud-hotbar-wrap');
    const overlay = document.getElementById('ui-overlay');

    if (overlay && !document.getElementById('reload-progress-wrap')) {
      const wrap = document.createElement('div');
      wrap.id = 'reload-progress-wrap';
      wrap.style.cssText =
        'position:absolute;top:56%;left:50%;transform:translateX(-50%);width:170px;background:rgba(10,14,20,0.9);border:1px solid rgba(255,159,67,0.75);border-radius:8px;padding:5px 8px;display:none;flex-direction:column;gap:4px;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,0.65);';
      wrap.innerHTML = `
        <div id="reload-progress-label" style="font-size:11px;font-weight:700;color:#ffa502;text-align:center;letter-spacing:0.6px;text-transform:uppercase;">RELOADING...</div>
        <div style="width:100%;height:6px;background:rgba(255,255,255,0.12);border-radius:999px;overflow:hidden;">
          <div id="reload-progress-fill" style="width:0%;height:100%;background:linear-gradient(90deg,#ff9f43,#2ed573);border-radius:999px;"></div>
        </div>
      `;
      overlay.appendChild(wrap);
      this.progressWrap = wrap;
      this.progressFill = document.getElementById('reload-progress-fill');
      this.progressLabel = document.getElementById('reload-progress-label');
    }

    if (hotbarWrap && !document.getElementById('hud-reload-btn')) {
      const btn = document.createElement('button');
      btn.id = 'hud-reload-btn';
      btn.type = 'button';
      btn.style.cssText =
        'pointer-events:auto;cursor:pointer;background:rgba(20,28,40,0.92);border:1px solid rgba(255,159,67,0.65);color:#ffd28a;font-size:11px;font-weight:700;padding:4px 12px;border-radius:999px;letter-spacing:0.5px;box-shadow:0 3px 10px rgba(0,0,0,0.55);transition:background 0.12s,transform 0.1s;';
      btn.innerText = '🔄 RELOAD [R]';
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.tryStartReload();
      });
      // Insert right beside/above active-weapon-pill
      const pill = document.getElementById('active-weapon-pill');
      if (pill && pill.parentElement === hotbarWrap) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;pointer-events:none;';
        hotbarWrap.insertBefore(row, pill);
        row.appendChild(pill);
        row.appendChild(btn);
      } else {
        hotbarWrap.prepend(btn);
      }
      this.reloadBtn = btn;
    }
  }

  private getWeaponReloadDuration(tpl: ItemTemplate): number {
    switch (tpl.grip) {
      case 'pistol':
        return 1.15;
      case 'smg':
        return 1.35;
      case 'rifle':
        return 1.6;
      case 'shotgun':
        return 1.8;
      default:
        return 1.4;
    }
  }

  tryStartReload(): boolean {
    if (this.isReloading) return false;
    const check = this.inventory.canReloadActiveWeapon();
    const item = this.inventory.activeItem;
    const tpl = this.inventory.activeTemplate;

    if (!item || !tpl || item.kind !== 'weapon') {
      this.flashStatus('Equip a gun to reload', '#a4b0be');
      return false;
    }
    if (!check.canReload) {
      if (check.reason === 'full') {
        this.flashStatus('Magazine already full', '#7bed9f');
      } else if (check.reason === 'no_ammo' && item.caliber) {
        this.flashStatus(`No ${CALIBERS[item.caliber].shortName} reserve ammo!`, '#ff6b6b');
      }
      return false;
    }

    this.isReloading = true;
    this.elapsed = 0;
    this.duration = this.getWeaponReloadDuration(tpl);
    this.reloadSlot = this.inventory.activeSlot;
    this.reloadTemplateId = item.templateId;
    this.stageNotified = { magOut: true, magIn: false, boltRack: false };
    this.playFoley('mag_out');
    this.syncHud();
    return true;
  }

  cancelReload() {
    if (!this.isReloading) return;
    this.isReloading = false;
    this.elapsed = 0;
    this.reloadSlot = -1;
    this.reloadTemplateId = '';
    this.syncHud();
  }

  update(delta: number): ReloadStateSnapshot {
    if (!this.isReloading) {
      this.updateButtonAvailability();
      return {
        isReloading: false,
        progress: 0,
        stage: 'none',
        remainingSec: 0,
        durationSec: this.duration
      };
    }

    // Cancel cleanly if player switched slot or dropped the weapon mid-reload
    const active = this.inventory.activeItem;
    if (
      !active ||
      this.inventory.activeSlot !== this.reloadSlot ||
      active.templateId !== this.reloadTemplateId
    ) {
      this.cancelReload();
      return {
        isReloading: false,
        progress: 0,
        stage: 'none',
        remainingSec: 0,
        durationSec: this.duration
      };
    }

    this.elapsed += delta;
    const p = Math.min(1, this.elapsed / Math.max(0.1, this.duration));

    if (p >= 0.4 && !this.stageNotified.magIn) {
      this.stageNotified.magIn = true;
      this.playFoley('mag_in');
    }
    if (p >= 0.76 && !this.stageNotified.boltRack) {
      this.stageNotified.boltRack = true;
      this.playFoley('bolt_rack');
    }

    if (p >= 1) {
      const res = this.inventory.completeReloadActiveWeapon();
      this.isReloading = false;
      this.elapsed = 0;
      this.reloadSlot = -1;
      this.reloadTemplateId = '';
      if (res.loaded > 0) {
        this.flashStatus(`Reloaded +${res.loaded}`, '#7bed9f');
      }
      this.syncHud();
      return {
        isReloading: false,
        progress: 1,
        stage: 'none',
        remainingSec: 0,
        durationSec: this.duration
      };
    }

    const stage: ReloadStage = p < 0.35 ? 'mag_out' : p < 0.75 ? 'mag_in' : 'bolt_rack';
    this.syncHud(p, stage);

    return {
      isReloading: true,
      progress: p,
      stage,
      remainingSec: Math.max(0, this.duration - this.elapsed),
      durationSec: this.duration
    };
  }

  private flashStatus(msg: string, color: string) {
    if (!this.progressWrap || !this.progressLabel || !this.progressFill) return;
    if (this.statusTimeout !== null) {
      window.clearTimeout(this.statusTimeout);
    }
    this.progressWrap.style.display = 'flex';
    this.progressLabel.innerText = msg;
    this.progressLabel.style.color = color;
    this.progressFill.style.width = '100%';
    this.progressFill.style.background = color;
    this.statusTimeout = window.setTimeout(() => {
      this.statusTimeout = null;
      if (!this.isReloading && this.progressWrap) {
        this.progressWrap.style.display = 'none';
      }
    }, 1100);
  }

  private updateButtonAvailability() {
    if (!this.reloadBtn) return;
    const item = this.inventory.activeItem;
    if (!item || item.kind !== 'weapon') {
      this.reloadBtn.style.display = 'none';
      return;
    }
    this.reloadBtn.style.display = 'inline-block';
    const check = this.inventory.canReloadActiveWeapon();
    if (check.canReload) {
      this.reloadBtn.style.opacity = '1';
      this.reloadBtn.style.borderColor = item.clip === 0 ? '#ff4757' : 'rgba(255,159,67,0.85)';
      this.reloadBtn.style.color = item.clip === 0 ? '#ff6b6b' : '#ffd28a';
      this.reloadBtn.innerText = item.clip === 0 ? '🔄 RELOAD NOW [R]' : '🔄 RELOAD [R]';
    } else if (check.reason === 'no_ammo') {
      this.reloadBtn.style.opacity = '0.75';
      this.reloadBtn.style.borderColor = 'rgba(255,71,87,0.5)';
      this.reloadBtn.style.color = '#ff6b6b';
      this.reloadBtn.innerText = 'NO AMMO';
    } else {
      this.reloadBtn.style.opacity = '0.55';
      this.reloadBtn.style.borderColor = 'rgba(120,145,175,0.4)';
      this.reloadBtn.style.color = '#9aa8b8';
      this.reloadBtn.innerText = 'FULL [R]';
    }
  }

  private syncHud(progress = 0, stage: ReloadStage = 'none') {
    this.updateButtonAvailability();
    if (!this.progressWrap || !this.progressFill || !this.progressLabel) return;
    if (!this.isReloading) {
      if (this.statusTimeout === null) {
        this.progressWrap.style.display = 'none';
      }
      return;
    }
    if (this.statusTimeout !== null) {
      window.clearTimeout(this.statusTimeout);
      this.statusTimeout = null;
    }
    this.progressWrap.style.display = 'flex';
    const rem = Math.max(0, this.duration - this.elapsed).toFixed(1);
    const stageText =
      stage === 'mag_out' ? 'EJECTING MAG' : stage === 'mag_in' ? 'INSERTING MAG' : 'CHAMBERING';
    this.progressLabel.innerText = `${stageText} (${rem}s)`;
    this.progressLabel.style.color = '#ffa502';
    this.progressFill.style.background = 'linear-gradient(90deg,#ff9f43,#2ed573)';
    this.progressFill.style.width = `${Math.round(progress * 100)}%`;
  }

  get reloading(): boolean {
    return this.isReloading;
  }
}
