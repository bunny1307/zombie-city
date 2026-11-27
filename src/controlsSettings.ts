export interface ControlSensitivitySettings {
  mouseSensitivity: number; // 0.2 .. 3.0 (multiplier on base 0.0021)
  touchSensitivity: number; // 0.2 .. 3.0 (multiplier on touch look radians/px)
  adsMultiplier: number; // 0.2 .. 1.2
  keyboardTurnSpeed: number; // 0.5 .. 2.5
  invertY: boolean;
  touchControlsMode: 'auto' | 'on' | 'off';
}

export interface TouchActionHooks {
  onFireStart: () => void;
  onFireEnd: () => void;
  onAimToggle: () => void;
  onReload: () => void;
  onJump: () => void;
  onCrouchToggle: () => void;
  onCameraToggle: () => void;
  onFlashlightToggle: () => void;
  onLookDelta: (dxRad: number, dyRad: number) => void;
}

const STORAGE_KEY = 'zombie_city_controls_v1';

const DEFAULT_SETTINGS: ControlSensitivitySettings = {
  mouseSensitivity: 1.0,
  touchSensitivity: 1.2,
  adsMultiplier: 0.55,
  keyboardTurnSpeed: 1.0,
  invertY: false,
  touchControlsMode: 'auto'
};

/**
 * Manages Mouse, Keyboard, ADS, and Touch-screen rotation/movement sensitivity,
 * persists user preferences to localStorage, provides a collapsible Settings UI ([O]),
 * and renders responsive multi-touch virtual joystick + look-pad controls when needed.
 */
export class ControlsSettingsManager {
  settings: ControlSensitivitySettings;
  isSettingsOpen = false;

  // Virtual touch joystick output (-1..+1) & sprint threshold
  moveX = 0;
  moveZ = 0;
  touchSprint = false;

  private canvas: HTMLElement;
  private hooks: TouchActionHooks;
  private isTouchCapable: boolean;

  private panelEl: HTMLElement | null = null;
  private toggleBtn: HTMLElement | null = null;
  private touchLayer: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;

  private moveTouchId: number | null = null;
  private lookTouchId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;
  private joyOriginX = 0;
  private joyOriginY = 0;

  constructor(canvas: HTMLElement, hooks: TouchActionHooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.isTouchCapable = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.settings = this.loadSettings();

    this.buildSettingsUI();
    this.buildTouchUI();
    this.bindTouchLookListeners();
    this.applyTouchVisibility();
  }

  private loadSettings(): ControlSensitivitySettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage quota errors
    }
  }

  getEffectiveMouseSensitivity(isAiming: boolean): number {
    const base = 0.0021 * this.settings.mouseSensitivity;
    return isAiming ? base * this.settings.adsMultiplier : base;
  }

  getEffectiveTouchSensitivity(isAiming: boolean): number {
    const base = 0.0042 * this.settings.touchSensitivity;
    return isAiming ? base * this.settings.adsMultiplier : base;
  }

  getKeyboardYawSpeed(): number {
    return 2.1 * this.settings.keyboardTurnSpeed;
  }

  getKeyboardPitchSpeed(): number {
    return 1.5 * this.settings.keyboardTurnSpeed;
  }

  getYSign(): number {
    return this.settings.invertY ? -1 : 1;
  }

  toggleSettingsPanel(force?: boolean) {
    this.isSettingsOpen = force !== undefined ? force : !this.isSettingsOpen;
    if (this.panelEl) {
      this.panelEl.style.display = this.isSettingsOpen ? 'flex' : 'none';
    }
    if (this.isSettingsOpen && document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  private buildSettingsUI() {
    const overlay = document.getElementById('ui-overlay');
    if (!overlay) return;

    const btn = document.createElement('button');
    btn.id = 'controls-settings-btn';
    btn.type = 'button';
    btn.innerText = '⚙ Sensitivity [O]';
    btn.style.cssText =
      'position:absolute;top:148px;right:16px;pointer-events:auto;cursor:pointer;background:rgba(12,16,24,0.9);border:1px solid rgba(112,161,255,0.55);color:#dfe6ef;font-size:11px;font-weight:700;padding:5px 11px;border-radius:7px;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSettingsPanel();
    });
    overlay.appendChild(btn);
    this.toggleBtn = btn;

    const panel = document.createElement('div');
    panel.id = 'controls-settings-panel';
    panel.style.cssText =
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:320px;max-width:92vw;background:rgba(10,14,22,0.96);border:1px solid rgba(112,161,255,0.65);border-radius:12px;padding:16px 18px;color:#e4e9f0;font-size:12px;display:none;flex-direction:column;gap:11px;pointer-events:auto;box-shadow:0 12px 36px rgba(0,0,0,0.85);z-index:20;';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(120,145,175,0.3);padding-bottom:8px;">
        <span style="font-weight:700;font-size:14px;color:#70a1ff;">Controls &amp; Sensitivity</span>
        <button id="ctrl-close-btn" type="button" style="cursor:pointer;background:#2f3542;border:none;color:#fff;padding:3px 9px;border-radius:5px;font-weight:700;">✕</button>
      </div>
      <label style="display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;justify-content:space-between;"><span>Mouse Rotation Sensitivity</span><span id="val-mouse-sens"></span></div>
        <input id="inp-mouse-sens" type="range" min="0.2" max="3.0" step="0.05" />
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;justify-content:space-between;"><span>Touch Rotation Sensitivity</span><span id="val-touch-sens"></span></div>
        <input id="inp-touch-sens" type="range" min="0.2" max="3.0" step="0.05" />
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;justify-content:space-between;"><span>ADS (Aim) Multiplier</span><span id="val-ads-mult"></span></div>
        <input id="inp-ads-mult" type="range" min="0.2" max="1.2" step="0.05" />
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;justify-content:space-between;"><span>Arrow-Key Turn Speed</span><span id="val-key-turn"></span></div>
        <input id="inp-key-turn" type="range" min="0.5" max="2.5" step="0.1" />
      </label>
      <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
        <span>Invert Vertical Look (Y-Axis)</span>
        <input id="inp-invert-y" type="checkbox" />
      </label>
      <label style="display:flex;justify-content:space-between;align-items:center;">
        <span>On-Screen Touch Controls</span>
        <select id="inp-touch-mode" style="background:#1e2533;color:#fff;border:1px solid #485468;border-radius:5px;padding:3px 7px;">
          <option value="auto">Auto</option>
          <option value="on">Always On</option>
          <option value="off">Off</option>
        </select>
      </label>
      <div style="display:flex;justify-content:space-between;gap:8px;padding-top:4px;">
        <button id="ctrl-reset-btn" type="button" style="flex:1;cursor:pointer;background:#2f3542;border:1px solid #57606f;color:#dfe6ef;padding:6px;border-radius:6px;font-weight:600;">Reset Defaults</button>
        <button id="ctrl-done-btn" type="button" style="flex:1;cursor:pointer;background:#1e90ff;border:none;color:#fff;padding:6px;border-radius:6px;font-weight:700;">Apply &amp; Close</button>
      </div>
    `;
    panel.addEventListener('mousedown', (e) => e.stopPropagation());
    overlay.appendChild(panel);
    this.panelEl = panel;

    const mouseInp = document.getElementById('inp-mouse-sens') as HTMLInputElement;
    const touchInp = document.getElementById('inp-touch-sens') as HTMLInputElement;
    const adsInp = document.getElementById('inp-ads-mult') as HTMLInputElement;
    const keyInp = document.getElementById('inp-key-turn') as HTMLInputElement;
    const invInp = document.getElementById('inp-invert-y') as HTMLInputElement;
    const modeSel = document.getElementById('inp-touch-mode') as HTMLSelectElement;

    const syncUi = () => {
      mouseInp.value = String(this.settings.mouseSensitivity);
      touchInp.value = String(this.settings.touchSensitivity);
      adsInp.value = String(this.settings.adsMultiplier);
      keyInp.value = String(this.settings.keyboardTurnSpeed);
      invInp.checked = this.settings.invertY;
      modeSel.value = this.settings.touchControlsMode;

      const setTxt = (id: string, txt: string) => {
        const el = document.getElementById(id);
        if (el) el.innerText = txt;
      };
      setTxt('val-mouse-sens', `${this.settings.mouseSensitivity.toFixed(2)}x`);
      setTxt('val-touch-sens', `${this.settings.touchSensitivity.toFixed(2)}x`);
      setTxt('val-ads-mult', `${this.settings.adsMultiplier.toFixed(2)}x`);
      setTxt('val-key-turn', `${this.settings.keyboardTurnSpeed.toFixed(1)}x`);
    };
    syncUi();

    mouseInp.addEventListener('input', () => {
      this.settings.mouseSensitivity = Number(mouseInp.value);
      this.saveSettings();
      syncUi();
    });
    touchInp.addEventListener('input', () => {
      this.settings.touchSensitivity = Number(touchInp.value);
      this.saveSettings();
      syncUi();
    });
    adsInp.addEventListener('input', () => {
      this.settings.adsMultiplier = Number(adsInp.value);
      this.saveSettings();
      syncUi();
    });
    keyInp.addEventListener('input', () => {
      this.settings.keyboardTurnSpeed = Number(keyInp.value);
      this.saveSettings();
      syncUi();
    });
    invInp.addEventListener('change', () => {
      this.settings.invertY = invInp.checked;
      this.saveSettings();
    });
    modeSel.addEventListener('change', () => {
      this.settings.touchControlsMode = modeSel.value as ControlSensitivitySettings['touchControlsMode'];
      this.saveSettings();
      this.applyTouchVisibility();
    });

    document.getElementById('ctrl-reset-btn')?.addEventListener('click', () => {
      this.settings = { ...DEFAULT_SETTINGS };
      this.saveSettings();
      this.applyTouchVisibility();
      syncUi();
    });
    document.getElementById('ctrl-close-btn')?.addEventListener('click', () => this.toggleSettingsPanel(false));
    document.getElementById('ctrl-done-btn')?.addEventListener('click', () => this.toggleSettingsPanel(false));
  }

  private buildTouchUI() {
    const overlay = document.getElementById('ui-overlay');
    if (!overlay) return;

    const layer = document.createElement('div');
    layer.id = 'touch-controls-layer';
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none;';

    // Left virtual movement joystick pad
    const joyBase = document.createElement('div');
    joyBase.style.cssText =
      'position:absolute;left:24px;bottom:92px;width:118px;height:118px;border-radius:50%;background:rgba(15,22,32,0.52);border:2px solid rgba(140,170,210,0.45);pointer-events:auto;touch-action:none;display:flex;align-items:center;justify-content:center;';
    const joyKnob = document.createElement('div');
    joyKnob.style.cssText =
      'width:48px;height:48px;border-radius:50%;background:rgba(255,159,67,0.85);border:2px solid #fff;pointer-events:none;transform:translate(0px,0px);';
    joyBase.appendChild(joyKnob);
    layer.appendChild(joyBase);

    // Right action cluster (Fire, Aim, Reload, Jump, Crouch, View, Light)
    const actions = document.createElement('div');
    actions.style.cssText =
      'position:absolute;right:20px;bottom:92px;display:grid;grid-template-columns:repeat(3,54px);gap:8px;pointer-events:none;';

    const makeBtn = (label: string, bg: string, onDown: () => void, onUp?: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerText = label;
      b.style.cssText = `width:54px;height:48px;border-radius:10px;border:1px solid rgba(255,255,255,0.35);background:${bg};color:#fff;font-size:11px;font-weight:700;pointer-events:auto;touch-action:none;`;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onDown();
      });
      if (onUp) {
        b.addEventListener('touchend', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onUp();
        });
        b.addEventListener('touchcancel', () => onUp());
      }
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        onDown();
      });
      if (onUp) {
        b.addEventListener('mouseup', (e) => {
          e.stopPropagation();
          onUp();
        });
      }
      return b;
    };

    actions.appendChild(makeBtn('AIM', 'rgba(30,144,255,0.72)', () => this.hooks.onAimToggle()));
    actions.appendChild(makeBtn('RELOAD', 'rgba(255,159,67,0.82)', () => this.hooks.onReload()));
    actions.appendChild(makeBtn('FIRE', 'rgba(255,71,87,0.88)', () => this.hooks.onFireStart(), () => this.hooks.onFireEnd()));
    actions.appendChild(makeBtn('CROUCH', 'rgba(47,53,66,0.8)', () => this.hooks.onCrouchToggle()));
    actions.appendChild(makeBtn('VIEW', 'rgba(47,53,66,0.8)', () => this.hooks.onCameraToggle()));
    actions.appendChild(makeBtn('JUMP', 'rgba(46,213,115,0.78)', () => this.hooks.onJump()));
    actions.appendChild(makeBtn('LIGHT', 'rgba(254,202,87,0.75)', () => this.hooks.onFlashlightToggle()));
    layer.appendChild(actions);

    overlay.appendChild(layer);
    this.touchLayer = layer;
    this.joystickKnob = joyKnob;

    const maxR = 42;
    const updateJoy = (clientX: number, clientY: number) => {
      const dx = clientX - this.joyOriginX;
      const dy = clientY - this.joyOriginY;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(maxR, dist);
      const ang = Math.atan2(dy, dx);
      const kx = Math.cos(ang) * clamped;
      const ky = Math.sin(ang) * clamped;
      if (this.joystickKnob) {
        this.joystickKnob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
      }
      const norm = clamped / maxR;
      this.moveX = dist > 5 ? (kx / maxR) : 0;
      this.moveZ = dist > 5 ? (-ky / maxR) : 0; // Up on stick = +1 forward
      this.touchSprint = norm > 0.85 && this.moveZ > 0.35;
    };

    const resetJoy = () => {
      this.moveTouchId = null;
      this.moveX = 0;
      this.moveZ = 0;
      this.touchSprint = false;
      if (this.joystickKnob) {
        this.joystickKnob.style.transform = 'translate(0px, 0px)';
      }
    };

    joyBase.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.moveTouchId !== null) return;
      const t = e.changedTouches[0];
      const rect = joyBase.getBoundingClientRect();
      this.moveTouchId = t.identifier;
      this.joyOriginX = rect.left + rect.width / 2;
      this.joyOriginY = rect.top + rect.height / 2;
      updateJoy(t.clientX, t.clientY);
    });
    joyBase.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.moveTouchId) {
          updateJoy(t.clientX, t.clientY);
          break;
        }
      }
    });
    joyBase.addEventListener('touchend', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.moveTouchId) resetJoy();
      }
    });
    joyBase.addEventListener('touchcancel', resetJoy);
  }

  private bindTouchLookListeners() {
    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        if (!this.isTouchCapable) {
          this.isTouchCapable = true;
          this.applyTouchVisibility();
        }
        if (this.isSettingsOpen) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (this.lookTouchId === null && t.identifier !== this.moveTouchId) {
            this.lookTouchId = t.identifier;
            this.lookLastX = t.clientX;
            this.lookLastY = t.clientY;
            break;
          }
        }
      },
      { passive: true }
    );

    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        if (this.isSettingsOpen || this.lookTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.lookTouchId) {
            e.preventDefault();
            const dx = Math.max(-90, Math.min(90, t.clientX - this.lookLastX));
            const dy = Math.max(-90, Math.min(90, t.clientY - this.lookLastY));
            this.lookLastX = t.clientX;
            this.lookLastY = t.clientY;
            this.hooks.onLookDelta(dx, dy);
            break;
          }
        }
      },
      { passive: false }
    );

    const endLook = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.lookTouchId) {
          this.lookTouchId = null;
        }
      }
    };
    this.canvas.addEventListener('touchend', endLook, { passive: true });
    this.canvas.addEventListener('touchcancel', endLook, { passive: true });
  }

  applyTouchVisibility() {
    if (!this.touchLayer) return;
    const show =
      this.settings.touchControlsMode === 'on' ||
      (this.settings.touchControlsMode === 'auto' && this.isTouchCapable);
    this.touchLayer.style.display = show ? 'block' : 'none';
    if (this.toggleBtn) {
      this.toggleBtn.style.opacity = '1';
    }
  }
}
