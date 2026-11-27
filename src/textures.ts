import * as THREE from 'three';

function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function makeTexture(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
  isColor = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

export class ProceduralTextures {
  // 1. Weathered Cracked Asphalt
  static createAsphalt(repeatX = 1, repeatY = 1): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
    const [c, ctx] = createCanvas(512, 512);
    const [b, bCtx] = createCanvas(512, 512);

    ctx.fillStyle = '#25282e';
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 512, 512);

    // Mineral aggregate noise
    for (let i = 0; i < 16000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = Math.floor(25 + Math.random() * 45);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
      ctx.fillRect(x, y, 2, 2);

      const bv = Math.floor(90 + Math.random() * 90);
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(x, y, 2, 2);
    }

    // Cracks
    ctx.strokeStyle = '#121417';
    ctx.lineWidth = 1.5;
    bCtx.strokeStyle = '#151515';
    bCtx.lineWidth = 2.0;
    for (let k = 0; k < 6; k++) {
      let cx = Math.random() * 512;
      let cy = Math.random() * 512;
      ctx.beginPath();
      bCtx.beginPath();
      ctx.moveTo(cx, cy);
      bCtx.moveTo(cx, cy);
      for (let s = 0; s < 10; s++) {
        cx += (Math.random() - 0.5) * 45;
        cy += (Math.random() - 0.5) * 45;
        ctx.lineTo(cx, cy);
        bCtx.lineTo(cx, cy);
      }
      ctx.stroke();
      bCtx.stroke();
    }

    return {
      map: makeTexture(c, repeatX, repeatY, true),
      bumpMap: makeTexture(b, repeatX, repeatY, false)
    };
  }

  // 2. Concrete Sidewalk Paving Slabs
  static createSidewalk(repeatX = 1, repeatY = 1): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
    const [c, ctx] = createCanvas(512, 512);
    const [b, bCtx] = createCanvas(512, 512);

    ctx.fillStyle = '#5c6168';
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#909090';
    bCtx.fillRect(0, 0, 512, 512);

    // Subtle grit
    for (let i = 0; i < 8000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const g = Math.floor(75 + Math.random() * 35);
      ctx.fillStyle = `rgb(${g},${g + 2},${g + 4})`;
      ctx.fillRect(x, y, 2, 2);
      const bg = Math.floor(120 + Math.random() * 40);
      bCtx.fillStyle = `rgb(${bg},${bg},${bg})`;
      bCtx.fillRect(x, y, 2, 2);
    }

    // Expansion joints (4x4 grid)
    ctx.strokeStyle = '#383c42';
    ctx.lineWidth = 3;
    bCtx.strokeStyle = '#202020';
    bCtx.lineWidth = 4;
    for (let i = 0; i <= 512; i += 128) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
      bCtx.beginPath(); bCtx.moveTo(i, 0); bCtx.lineTo(i, 512); bCtx.stroke();
      bCtx.beginPath(); bCtx.moveTo(0, i); bCtx.lineTo(512, i); bCtx.stroke();
    }

    // Grime stains
    for (let s = 0; s < 5; s++) {
      const grad = ctx.createRadialGradient(
        Math.random() * 512, Math.random() * 512, 5,
        Math.random() * 512, Math.random() * 512, 80
      );
      grad.addColorStop(0, 'rgba(30, 35, 25, 0.25)');
      grad.addColorStop(1, 'rgba(30, 35, 25, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
    }

    return {
      map: makeTexture(c, repeatX, repeatY, true),
      bumpMap: makeTexture(b, repeatX, repeatY, false)
    };
  }

  // 3. Staggered Brick Facade
  static createBrick(baseColorHex = '#7a3b30', repeatX = 1, repeatY = 1): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
    const [c, ctx] = createCanvas(512, 512);
    const [b, bCtx] = createCanvas(512, 512);

    // Mortar background
    ctx.fillStyle = '#47433f';
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#252525';
    bCtx.fillRect(0, 0, 512, 512);

    const rows = 16;
    const cols = 8;
    const brickH = 512 / rows;
    const brickW = 512 / cols;
    const mortar = 3;

    const baseCol = new THREE.Color(baseColorHex);

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (brickW / 2);
      for (let col = -1; col <= cols; col++) {
        const x = col * brickW + offset;
        const y = r * brickH;

        const shade = 0.8 + Math.random() * 0.35;
        const colCopy = baseCol.clone().multiplyScalar(shade);
        ctx.fillStyle = `#${colCopy.getHexString()}`;
        ctx.fillRect(x + mortar, y + mortar, brickW - mortar * 2, brickH - mortar * 2);

        const bumpVal = Math.floor(170 + Math.random() * 60);
        bCtx.fillStyle = `rgb(${bumpVal},${bumpVal},${bumpVal})`;
        bCtx.fillRect(x + mortar, y + mortar, brickW - mortar * 2, brickH - mortar * 2);
      }
    }

    // Weathering grime at base
    const dirt = ctx.createLinearGradient(0, 350, 0, 512);
    dirt.addColorStop(0, 'rgba(15,15,12,0)');
    dirt.addColorStop(1, 'rgba(15,15,12,0.4)');
    ctx.fillStyle = dirt;
    ctx.fillRect(0, 0, 512, 512);

    return {
      map: makeTexture(c, repeatX, repeatY, true),
      bumpMap: makeTexture(b, repeatX, repeatY, false)
    };
  }

  // 4. Architectural Concrete Wall Panels
  static createConcrete(baseHex = '#6c727a', repeatX = 1, repeatY = 1): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
    const [c, ctx] = createCanvas(512, 512);
    const [b, bCtx] = createCanvas(512, 512);

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#888888';
    bCtx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 6000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const alpha = Math.random() * 0.14;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
      ctx.fillRect(x, y, 3, 3);
      bCtx.fillStyle = Math.random() > 0.5 ? '#a0a0a0' : '#656565';
      bCtx.fillRect(x, y, 2, 2);
    }

    // Formwork panel seams
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 2;
    bCtx.strokeStyle = '#303030';
    bCtx.lineWidth = 2;
    for (let p = 128; p < 512; p += 128) {
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(512, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 512); ctx.stroke();
      bCtx.beginPath(); bCtx.moveTo(0, p); bCtx.lineTo(512, p); bCtx.stroke();
      bCtx.beginPath(); bCtx.moveTo(p, 0); bCtx.lineTo(p, 512); bCtx.stroke();
    }

    return {
      map: makeTexture(c, repeatX, repeatY, true),
      bumpMap: makeTexture(b, repeatX, repeatY, false)
    };
  }

  // 5. Ceramic Floor Tiles (Hospital / Bathroom / Kitchen)
  static createTileFloor(colorA = '#c7cfd6', colorB = '#b6c0c8', repeatX = 1, repeatY = 1): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
    const [c, ctx] = createCanvas(512, 512);
    const [b, bCtx] = createCanvas(512, 512);

    const grid = 8;
    const size = 512 / grid;

    ctx.fillStyle = '#484d52';
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#303030';
    bCtx.fillRect(0, 0, 512, 512);

    for (let r = 0; r < grid; r++) {
      for (let col = 0; col < grid; col++) {
        ctx.fillStyle = (r + col) % 2 === 0 ? colorA : colorB;
        ctx.fillRect(col * size + 2, r * size + 2, size - 4, size - 4);
        bCtx.fillStyle = '#dcdcdc';
        bCtx.fillRect(col * size + 2, r * size + 2, size - 4, size - 4);
      }
    }

    // Subtle dirt / scuffing
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = 'rgba(40, 38, 30, 0.08)';
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 25, 0, Math.PI * 2);
      ctx.fill();
    }

    return {
      map: makeTexture(c, repeatX, repeatY, true),
      bumpMap: makeTexture(b, repeatX, repeatY, false)
    };
  }

  // 6. Hardwood Plank Floor
  static createWoodFloor(baseHex = '#7c4d2b', repeatX = 1, repeatY = 1): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
    const [c, ctx] = createCanvas(512, 512);
    const [b, bCtx] = createCanvas(512, 512);

    ctx.fillStyle = '#301d10';
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#282828';
    bCtx.fillRect(0, 0, 512, 512);

    const rows = 8;
    const plankH = 512 / rows;
    const baseCol = new THREE.Color(baseHex);

    for (let r = 0; r < rows; r++) {
      const y = r * plankH;
      const split = (r % 2 === 0 ? 180 : 330) + Math.random() * 40;
      const segments = [
        { x: 0, w: split },
        { x: split, w: 512 - split }
      ];

      for (const seg of segments) {
        const shade = 0.85 + Math.random() * 0.25;
        const col = baseCol.clone().multiplyScalar(shade);
        ctx.fillStyle = `#${col.getHexString()}`;
        ctx.fillRect(seg.x + 1, y + 1, seg.w - 2, plankH - 2);

        // Wood grain lines
        ctx.strokeStyle = 'rgba(30, 15, 5, 0.18)';
        ctx.lineWidth = 1;
        for (let g = 0; g < 6; g++) {
          const gy = y + 6 + g * (plankH / 7);
          ctx.beginPath();
          ctx.moveTo(seg.x + 2, gy);
          ctx.lineTo(seg.x + seg.w - 2, gy + (Math.random() - 0.5) * 4);
          ctx.stroke();
        }

        bCtx.fillStyle = '#c8c8c8';
        bCtx.fillRect(seg.x + 1, y + 1, seg.w - 2, plankH - 2);
      }
    }

    return {
      map: makeTexture(c, repeatX, repeatY, true),
      bumpMap: makeTexture(b, repeatX, repeatY, false)
    };
  }

  // 7. Overgrown Dead Grass & Earth
  static createOvergrownGrass(repeatX = 1, repeatY = 1): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
    const [c, ctx] = createCanvas(512, 512);
    const [b, bCtx] = createCanvas(512, 512);

    ctx.fillStyle = '#323a23';
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#707070';
    bCtx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 12000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const colors = ['#3e4a29', '#4a5532', '#2d331f', '#524933'];
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      ctx.fillRect(x, y, 2, 4);

      const bv = Math.floor(90 + Math.random() * 120);
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(x, y, 2, 3);
    }

    return {
      map: makeTexture(c, repeatX, repeatY, true),
      bumpMap: makeTexture(b, repeatX, repeatY, false)
    };
  }

  // 8. School Chalkboard with Chalk Scrawl
  static createChalkboard(): THREE.CanvasTexture {
    const [c, ctx] = createCanvas(512, 256);
    ctx.fillStyle = '#183f32';
    ctx.fillRect(0, 0, 512, 256);

    // Chalk dust haze
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(235, 245, 240, 0.04)';
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 256, 15 + Math.random() * 40, 0, Math.PI * 2);
      ctx.fill();
    }

    // Chalk writing
    ctx.fillStyle = 'rgba(240, 248, 245, 0.85)';
    ctx.font = 'bold 26px Georgia, serif';
    ctx.fillText('EVACUATION NOTICE - SECTOR 4', 32, 54);
    ctx.font = '20px monospace';
    ctx.fillText('E = mc^2   |   H2O + NaCl -> ...', 42, 110);
    ctx.fillText('LOCK ALL DOORS AFTER 18:00', 42, 165);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 70);
    ctx.lineTo(460, 70);
    ctx.stroke();

    return makeTexture(c, 1, 1, true);
  }

  // 9. Police Pinboard / Evidence Board
  static createEvidenceBoard(): THREE.CanvasTexture {
    const [c, ctx] = createCanvas(512, 256);
    ctx.fillStyle = '#9c7853';
    ctx.fillRect(0, 0, 512, 256);

    // Cork grain
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
    }

    // Pinned paper cards & maps
    const cards = [
      { x: 35, y: 25, w: 95, h: 110, col: '#f2efe9' },
      { x: 165, y: 40, w: 130, h: 120, col: '#e6e1d3' },
      { x: 330, y: 20, w: 140, h: 95, col: '#f5f2eb' },
      { x: 280, y: 140, w: 110, h: 90, col: '#fff5b8' },
      { x: 60, y: 155, w: 85, h: 75, col: '#f2efe9' }
    ];

    for (const card of cards) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(card.x + 3, card.y + 3, card.w, card.h);
      ctx.fillStyle = card.col;
      ctx.fillRect(card.x, card.y, card.w, card.h);
      // Lines
      ctx.fillStyle = '#555';
      for (let l = 15; l < card.h - 15; l += 14) {
        ctx.fillRect(card.x + 10, card.y + l, card.w - 20, 3);
      }
    }

    // Red investigation strings
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 45);
    ctx.lineTo(230, 80);
    ctx.lineTo(395, 55);
    ctx.lineTo(335, 170);
    ctx.lineTo(100, 185);
    ctx.stroke();

    // Red pins
    for (const [px, py] of [[80, 45], [230, 80], [395, 55], [335, 170], [100, 185]]) {
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    return makeTexture(c, 1, 1, true);
  }

  // 10. Rooftop Helipad Pad Texture
  static createHelipadTexture(): THREE.CanvasTexture {
    const [c, ctx] = createCanvas(512, 512);
    ctx.fillStyle = '#25292e';
    ctx.fillRect(0, 0, 512, 512);

    // Concrete grain
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    // Outer Dashed Circle
    ctx.strokeStyle = '#e1b12c';
    ctx.lineWidth = 18;
    ctx.setLineDash([28, 16]);
    ctx.beginPath();
    ctx.arc(256, 256, 210, 0, Math.PI * 2);
    ctx.stroke();

    // Solid Inner Ring
    ctx.setLineDash([]);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(256, 256, 175, 0, Math.PI * 2);
    ctx.stroke();

    // Bold "H"
    ctx.fillStyle = '#e1b12c';
    ctx.fillRect(180, 150, 32, 212);
    ctx.fillRect(300, 150, 32, 212);
    ctx.fillRect(180, 240, 152, 32);

    return makeTexture(c, 1, 1, true);
  }

  // 11. Building Signage Texture
  static createSignTexture(text: string, bgHex: string, fgHex: string, subtext = ''): THREE.CanvasTexture {
    const [c, ctx] = createCanvas(512, 128);
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = fgHex;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 116);

    ctx.fillStyle = fgHex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fontSize = 38;
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    while (ctx.measureText(text).width > 464 && fontSize > 18) {
      fontSize -= 2;
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    }
    ctx.fillText(text, 256, subtext ? 46 : 64);

    if (subtext) {
      ctx.font = 'bold 19px Arial, sans-serif';
      ctx.fillText(subtext, 256, 94);
    }

    return makeTexture(c, 1, 1, true);
  }
}
