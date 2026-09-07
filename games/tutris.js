/* ============================================================
   TUTRIS — Tetris de cristal con render 3D (motor propio)
   Renderizador: proyección en perspectiva + painter's algorithm
   sobre Canvas2D. Piezas de vidrio translúcido con refracción
   simulada, specular, cáusticas y rotura hiperrealista en astillas.
   ============================================================ */
(function (global) {
  'use strict';

  const COLS = 10, ROWS = 20;
  const CELL = 1;               // tamaño de celda en unidades de mundo
  const DEPTH = 0.92;           // grosor del cristal

  // --------- Piezas ----------
  const SHAPES = {
    I: { cells: [[0,1],[1,1],[2,1],[3,1]], w:4, h:4, color:[ 90, 230, 255] },
    O: { cells: [[1,0],[2,0],[1,1],[2,1]], w:4, h:2, color:[255, 226, 120] },
    T: { cells: [[1,0],[0,1],[1,1],[2,1]], w:3, h:2, color:[214, 130, 255] },
    S: { cells: [[1,0],[2,0],[0,1],[1,1]], w:3, h:2, color:[130, 255, 176] },
    Z: { cells: [[0,0],[1,0],[1,1],[2,1]], w:3, h:2, color:[255, 122, 152] },
    J: { cells: [[0,0],[0,1],[1,1],[2,1]], w:3, h:2, color:[126, 158, 255] },
    L: { cells: [[2,0],[0,1],[1,1],[2,1]], w:3, h:2, color:[255, 170, 96] }
  };
  const KEYS = Object.keys(SHAPES);

  function rotateCells(cells, size, dir) {
    return cells.map(([x, y]) => dir > 0 ? [size - 1 - y, x] : [y, size - 1 - x]);
  }

  // --------- Matemática 3D ----------
  function mkCam() {
    return { rotX: 0.20, rotY: 0.0, dist: 30, fov: 760, shake: 0 };
  }

  function project(p, cam, cx, cy) {
    // rotación Y luego X
    const cy1 = Math.cos(cam.rotY), sy1 = Math.sin(cam.rotY);
    let x = p.x * cy1 + p.z * sy1;
    let z = -p.x * sy1 + p.z * cy1;
    const cx1 = Math.cos(cam.rotX), sx1 = Math.sin(cam.rotX);
    let y = p.y * cx1 - z * sx1;
    z = p.y * sx1 + z * cx1;
    const zc = cam.dist - z;
    const k = cam.fov / Math.max(2, zc);
    return { x: cx + x * k, y: cy - y * k, z: zc, k };
  }

  const CUBE_FACES = [
    // [índices de vértices], normal
    { i: [4, 5, 6, 7], n: { x: 0, y: 0, z: 1 },  id: 'front' },
    { i: [1, 0, 3, 2], n: { x: 0, y: 0, z: -1 }, id: 'back'  },
    { i: [0, 4, 7, 3], n: { x: -1, y: 0, z: 0 }, id: 'left'  },
    { i: [5, 1, 2, 6], n: { x: 1, y: 0, z: 0 },  id: 'right' },
    { i: [0, 1, 5, 4], n: { x: 0, y: 1, z: 0 },  id: 'top'   },
    { i: [7, 6, 2, 3], n: { x: 0, y: -1, z: 0 }, id: 'bottom'}
  ];

  function cubeVerts(cx, cy, cz, s, d) {
    const h = s / 2, q = d / 2;
    return [
      { x: cx - h, y: cy + h, z: cz - q }, // 0
      { x: cx + h, y: cy + h, z: cz - q }, // 1
      { x: cx + h, y: cy - h, z: cz - q }, // 2
      { x: cx - h, y: cy - h, z: cz - q }, // 3
      { x: cx - h, y: cy + h, z: cz + q }, // 4
      { x: cx + h, y: cy + h, z: cz + q }, // 5
      { x: cx + h, y: cy - h, z: cz + q }, // 6
      { x: cx - h, y: cy - h, z: cz + q }  // 7
    ];
  }

  function rot3(n, cam) {
    const cy1 = Math.cos(cam.rotY), sy1 = Math.sin(cam.rotY);
    let x = n.x * cy1 + n.z * sy1;
    let z = -n.x * sy1 + n.z * cy1;
    const cx1 = Math.cos(cam.rotX), sx1 = Math.sin(cam.rotX);
    let y = n.y * cx1 - z * sx1;
    z = n.y * sx1 + z * cx1;
    return { x, y, z };
  }

  // ============================================================
  function TutrisGame(container) {
    container.innerHTML = `
      <div class="tutris-wrap">
        <div class="tutris-bgimg" id="tutrisBg"></div>
        <div class="tutris-stage">
          <canvas id="tutrisCanvas"></canvas>
          <div class="tutris-hud">
            <div class="th-panel">
              <span class="th-label">PUNTOS</span><span class="th-val" id="tScore">0</span>
            </div>
            <div class="th-panel">
              <span class="th-label">NIVEL</span><span class="th-val" id="tLevel">1</span>
            </div>
            <div class="th-panel">
              <span class="th-label">LÍNEAS</span><span class="th-val" id="tLines">0</span>
            </div>
            <div class="th-panel th-next">
              <span class="th-label">SIGUIENTE</span>
              <canvas id="tNext" width="120" height="80"></canvas>
            </div>
          </div>
          <div class="tutris-overlay" id="tOverlay">
            <h3>TUTRIS</h3>
            <p>Cristal templado en caída libre.<br>← → mover · ↑ girar · ↓ acelerar · Espacio soltar · P pausa</p>
            <button class="game-button" id="tStart">EMPEZAR</button>
          </div>
        </div>
        <div class="tutris-tools">
          <label class="glass-btn">
            <i class="fas fa-image"></i> Fondo del dispositivo
            <input type="file" id="tBgInput" accept="image/*" hidden>
          </label>
          <button class="glass-btn" id="tBgClear"><i class="fas fa-eraser"></i> Quitar fondo</button>
          <label class="glass-slider">Contraste del fondo
            <input type="range" id="tBgContrast" min="20" max="100" value="62">
          </label>
          <button class="glass-btn" id="tPause"><i class="fas fa-pause"></i> Pausa</button>
        </div>
        <div class="tutris-touch">
          <button data-act="left"><i class="fas fa-chevron-left"></i></button>
          <button data-act="rot"><i class="fas fa-rotate-right"></i></button>
          <button data-act="down"><i class="fas fa-chevron-down"></i></button>
          <button data-act="drop"><i class="fas fa-angles-down"></i></button>
          <button data-act="right"><i class="fas fa-chevron-right"></i></button>
        </div>
      </div>`;

    const canvas = container.querySelector('#tutrisCanvas');
    const ctx = canvas.getContext('2d');
    const nextCv = container.querySelector('#tNext');
    const nctx = nextCv.getContext('2d');
    const bgLayer = container.querySelector('#tutrisBg');
    const overlay = container.querySelector('#tOverlay');

    const cam = mkCam();
    let W = 0, H = 0, dpr = Math.min(2, global.devicePixelRatio || 1);

    const grid = [];             // grid[y][x] = {color:[r,g,b]} | null
    for (let y = 0; y < ROWS; y++) grid.push(new Array(COLS).fill(null));

    let piece = null, nextKey = null;
    let score = 0, lines = 0, level = 1;
    let dropTimer = 0, dropInterval = 850;
    let running = false, paused = false, over = false;
    let shards = [], flashes = [], sparks = [];
    let rafId = null, lastT = 0, destroyed = false;
    let clearLock = 0;

    // ---------- responsive ----------
    function resize() {
      const stage = canvas.parentElement;
      const rect = stage.getBoundingClientRect();
      W = Math.max(280, rect.width);
      H = Math.max(320, rect.height);
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // ajustar fov para que el tablero encaje
      const fitH = H * 0.92 / (ROWS * CELL);
      const fitW = W * 0.94 / (COLS * CELL);
      cam.fov = Math.min(fitH, fitW) * cam.dist;
    }

    // ---------- piezas ----------
    function bag() { return KEYS[(Math.random() * KEYS.length) | 0]; }

    function spawn(key) {
      const def = SHAPES[key];
      const p = {
        key, color: def.color.slice(),
        size: def.w,
        cells: def.cells.map(c => c.slice()),
        x: Math.floor((COLS - def.w) / 2), y: -1
      };
      if (collides(p, 0, 0, p.cells)) { gameOver(); return null; }
      return p;
    }

    function collides(p, dx, dy, cells) {
      for (const [cxx, cyy] of cells) {
        const x = p.x + cxx + dx, y = p.y + cyy + dy;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && grid[y][x]) return true;
      }
      return false;
    }

    function move(dx) { if (piece && !collides(piece, dx, 0, piece.cells)) { piece.x += dx; return true; } return false; }

    function rotate(dir) {
      if (!piece) return;
      const nc = rotateCells(piece.cells, piece.size, dir);
      const kicks = [0, -1, 1, -2, 2];
      for (const k of kicks) {
        if (!collides(piece, k, 0, nc)) { piece.cells = nc; piece.x += k; ping(); return; }
      }
    }

    function softDrop() {
      if (!piece) return;
      if (!collides(piece, 0, 1, piece.cells)) { piece.y++; score += 1; } else lock();
    }

    function hardDrop() {
      if (!piece) return;
      let d = 0;
      while (!collides(piece, 0, d + 1, piece.cells)) d++;
      piece.y += d; score += d * 2;
      cam.shake = Math.min(14, 4 + d * 0.5);
      lock();
    }

    function lock() {
      for (const [cxx, cyy] of piece.cells) {
        const x = piece.x + cxx, y = piece.y + cyy;
        if (y < 0) { gameOver(); return; }
        grid[y][x] = { color: piece.color.slice(), seed: Math.random() * 6.28 };
      }
      piece = null;
      checkLines();
    }

    function checkLines() {
      const full = [];
      for (let y = 0; y < ROWS; y++) if (grid[y].every(c => c)) full.push(y);
      if (!full.length) { nextPiece(); return; }

      // ROTURA HIPERREALISTA
      full.forEach((y, i) => {
        for (let x = 0; x < COLS; x++) shatterCell(x, y, grid[y][x].color, i);
        flashes.push({ y, t: 0, life: 520 });
      });
      cam.shake = 8 + full.length * 4;

      clearLock = 260;
      setTimeout(() => {
        if (destroyed) return;
        full.sort((a, b) => a - b).forEach(y => { grid.splice(y, 1); grid.unshift(new Array(COLS).fill(null)); });
        const pts = [0, 100, 300, 700, 1500][full.length] * level;
        score += pts;
        lines += full.length;
        level = 1 + Math.floor(lines / 8);
        dropInterval = Math.max(90, 850 - (level - 1) * 62);
        updateHud();
        nextPiece();
      }, 240);
    }

    function nextPiece() {
      piece = spawn(nextKey || bag());
      nextKey = bag();
      drawNext();
    }

    function gameOver() {
      over = true; running = false;
      overlay.innerHTML = `<h3>FIN DE PARTIDA</h3>
        <p>Puntuación <b>${score}</b> · ${lines} líneas · nivel ${level}</p>
        <button class="game-button" id="tStart">REINTENTAR</button>`;
      overlay.classList.remove('hide');
      overlay.querySelector('#tStart').onclick = start;
    }

    // ---------- ASTILLAS DE CRISTAL ----------
    function shatterCell(gx, gy, color, delayIdx) {
      const wx = (gx - COLS / 2 + 0.5) * CELL;
      const wy = (ROWS / 2 - gy - 0.5) * CELL;
      const n = 11 + ((Math.random() * 5) | 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.12 + Math.random() * 0.42;
        const spd = 0.9 + Math.random() * 3.4;
        // triángulo irregular: astilla afilada de vidrio
        const tri = [];
        const base = Math.random() * 6.28;
        for (let v = 0; v < 3; v++) {
          const ang = base + v * (1.4 + Math.random() * 1.6);
          const rad = 0.06 + Math.random() * 0.30;
          tri.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, z: (Math.random() - 0.5) * 0.22 });
        }
        shards.push({
          x: wx + Math.cos(a) * r, y: wy + Math.sin(a) * r * 0.6, z: (Math.random() - 0.5) * DEPTH,
          vx: Math.cos(a) * spd * 0.05, vy: (0.06 + Math.random() * 0.16), vz: (Math.random() - 0.5) * 0.09,
          rx: Math.random() * 6.28, ry: Math.random() * 6.28, rz: Math.random() * 6.28,
          drx: (Math.random() - 0.5) * 0.28, dry: (Math.random() - 0.5) * 0.28, drz: (Math.random() - 0.5) * 0.28,
          tri, color, life: 0, max: 900 + Math.random() * 700, delay: delayIdx * 30
        });
      }
      for (let i = 0; i < 8; i++) {
        sparks.push({
          x: wx + (Math.random() - 0.5) * CELL, y: wy + (Math.random() - 0.5) * CELL, z: (Math.random() - 0.5),
          vx: (Math.random() - 0.5) * 0.1, vy: 0.03 + Math.random() * 0.12, vz: (Math.random() - 0.5) * 0.06,
          life: 0, max: 420 + Math.random() * 420, color
        });
      }
    }

    function updateShards(dt) {
      const g = 0.00055;
      for (let i = shards.length - 1; i >= 0; i--) {
        const s = shards[i];
        s.life += dt;
        if (s.life < s.delay) continue;
        s.x += s.vx * dt * 0.06;
        s.y += s.vy * dt * 0.06;
        s.z += s.vz * dt * 0.06;
        s.vy -= g * dt;
        s.rx += s.drx * dt * 0.01; s.ry += s.dry * dt * 0.01; s.rz += s.drz * dt * 0.01;
        // rebote en el suelo del tablero
        const floor = -ROWS / 2 + 0.1;
        if (s.y < floor && s.vy < 0) { s.y = floor; s.vy *= -0.34; s.vx *= 0.7; }
        if (s.life > s.max) shards.splice(i, 1);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life += dt;
        p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06; p.z += p.vz * dt * 0.06;
        p.vy -= 0.00028 * dt;
        if (p.life > p.max) sparks.splice(i, 1);
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        flashes[i].t += dt;
        if (flashes[i].t > flashes[i].life) flashes.splice(i, 1);
      }
    }

    // ---------- RENDER ----------
    function worldPos(gx, gy) {
      return { x: (gx - COLS / 2 + 0.5) * CELL, y: (ROWS / 2 - gy - 0.5) * CELL, z: 0 };
    }

    function collectCube(list, p, color, opts) {
      const s = CELL * 0.94;
      const v = cubeVerts(p.x, p.y, p.z, s, DEPTH);
      const pv = v.map(q => project(q, cam, W / 2, H / 2));
      for (const f of CUBE_FACES) {
        const n = rot3(f.n, cam);
        // cara visible: normal hacia cámara (z positivo tras rotación)
        const facing = n.z;
        if (facing <= 0.02 && !opts.ghost) continue;
        const pts = f.i.map(i => pv[i]);
        const depth = f.i.reduce((a, i) => a + pv[i].z, 0) / 4;
        list.push({ type: 'face', pts, depth, color, facing, face: f.id, opts, worldY: p.y });
      }
      list.push({ type: 'edges', pv, depth: pv.reduce((a, q) => a + q.z, 0) / 8 - 0.01, color, opts });
    }

    function paintFace(o) {
      const { pts, color, facing, face, opts } = o;
      const alpha = (opts.ghost ? 0.10 : 0.30) + facing * 0.30;
      const [r, g, b] = color;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();

      // vidrio: gradiente de refracción a lo largo de la cara
      const gx0 = pts[0].x, gy0 = pts[0].y, gx1 = pts[2].x, gy1 = pts[2].y;
      const grd = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      const lift = face === 'top' ? 60 : face === 'left' ? -20 : 0;
      grd.addColorStop(0, `rgba(${Math.min(255, r + 70 + lift)},${Math.min(255, g + 70 + lift)},${Math.min(255, b + 80 + lift)},${alpha * 1.05})`);
      grd.addColorStop(0.45, `rgba(${r},${g},${b},${alpha * 0.72})`);
      grd.addColorStop(0.72, `rgba(${(r * 0.45) | 0},${(g * 0.5) | 0},${(b * 0.7) | 0},${alpha * 0.85})`);
      grd.addColorStop(1, `rgba(${Math.min(255, r + 40)},${Math.min(255, g + 50)},${Math.min(255, b + 60)},${alpha})`);
      ctx.fillStyle = grd;
      ctx.fill();

      if (face === 'front' && !opts.ghost) {
        // reflejo especular tipo cristal pulido
        ctx.save();
        ctx.clip();
        const cxm = (pts[0].x + pts[2].x) / 2, cym = (pts[0].y + pts[2].y) / 2;
        const w = Math.abs(pts[2].x - pts[0].x), h = Math.abs(pts[2].y - pts[0].y);
        const sp = ctx.createLinearGradient(cxm - w * 0.5, cym - h * 0.5, cxm + w * 0.2, cym + h * 0.5);
        sp.addColorStop(0, 'rgba(255,255,255,0.55)');
        sp.addColorStop(0.28, 'rgba(255,255,255,0.06)');
        sp.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sp; ctx.fillRect(cxm - w, cym - h, w * 2, h * 2);
        // línea de brillo interior
        ctx.strokeStyle = 'rgba(255,255,255,0.32)';
        ctx.lineWidth = Math.max(1, w * 0.05);
        ctx.beginPath();
        ctx.moveTo(cxm - w * 0.34, cym + h * 0.30);
        ctx.lineTo(cxm + w * 0.20, cym - h * 0.34);
        ctx.stroke();
        ctx.restore();
      }
    }

    function paintEdges(o) {
      const { pv, color, opts } = o;
      const [r, g, b] = color;
      const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      ctx.lineWidth = opts.ghost ? 1 : 1.35;
      ctx.strokeStyle = opts.ghost
        ? `rgba(${r},${g},${b},0.35)`
        : `rgba(${Math.min(255, r + 110)},${Math.min(255, g + 115)},${Math.min(255, b + 120)},0.85)`;
      ctx.beginPath();
      for (const [a, c] of E) { ctx.moveTo(pv[a].x, pv[a].y); ctx.lineTo(pv[c].x, pv[c].y); }
      ctx.stroke();
    }

    function drawShard(s) {
      if (s.life < s.delay) return;
      const t = (s.life - s.delay) / (s.max - s.delay);
      const a = Math.max(0, 1 - t * t);
      const cxr = Math.cos(s.rx), sxr = Math.sin(s.rx);
      const cyr = Math.cos(s.ry), syr = Math.sin(s.ry);
      const czr = Math.cos(s.rz), szr = Math.sin(s.rz);
      const pts = s.tri.map(v => {
        let x = v.x * czr - v.y * szr, y = v.x * szr + v.y * czr, z = v.z;
        let x2 = x * cyr + z * syr; let z2 = -x * syr + z * cyr;
        let y2 = y * cxr - z2 * sxr; let z3 = y * sxr + z2 * cxr;
        return project({ x: s.x + x2, y: s.y + y2, z: s.z + z3 }, cam, W / 2, H / 2);
      });
      const [r, g, b] = s.color;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.closePath();
      const grd = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
      grd.addColorStop(0, `rgba(255,255,255,${0.75 * a})`);
      grd.addColorStop(0.5, `rgba(${r},${g},${b},${0.55 * a})`);
      grd.addColorStop(1, `rgba(${(r * 0.4) | 0},${(g * 0.5) | 0},${(b * 0.8) | 0},${0.35 * a})`);
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * a})`;
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }

    function drawSpark(p) {
      const t = p.life / p.max, a = Math.max(0, 1 - t);
      const q = project({ x: p.x, y: p.y, z: p.z }, cam, W / 2, H / 2);
      const rad = Math.max(0.6, 2.6 * a * q.k / 40);
      const grd = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rad * 4);
      grd.addColorStop(0, `rgba(255,255,255,${0.9 * a})`);
      grd.addColorStop(0.4, `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${0.5 * a})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(q.x, q.y, rad * 4, 0, 6.29); ctx.fill();
    }

    function drawWell() {
      // pozo: suelo y paredes en cristal ahumado
      const tl = worldPos(-0.5, -0.5), br = worldPos(COLS - 0.5, ROWS - 0.5);
      const corners = [
        { x: tl.x, y: tl.y, z: -DEPTH }, { x: br.x, y: tl.y, z: -DEPTH },
        { x: br.x, y: br.y, z: -DEPTH }, { x: tl.x, y: br.y, z: -DEPTH }
      ].map(p => project(p, cam, W / 2, H / 2));
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      corners.slice(1).forEach(c => ctx.lineTo(c.x, c.y));
      ctx.closePath();
      const g = ctx.createLinearGradient(corners[0].x, corners[0].y, corners[2].x, corners[2].y);
      g.addColorStop(0, 'rgba(8,14,32,0.62)');
      g.addColorStop(1, 'rgba(2,4,12,0.78)');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(120,235,255,0.45)'; ctx.lineWidth = 2; ctx.stroke();

      // rejilla sutil del fondo del pozo
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(120,235,255,0.09)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= COLS; x++) {
        const a = project({ ...worldPos(x - 0.5, -0.5), z: -DEPTH }, cam, W / 2, H / 2);
        const b = project({ ...worldPos(x - 0.5, ROWS - 0.5), z: -DEPTH }, cam, W / 2, H / 2);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      for (let y = 0; y <= ROWS; y++) {
        const a = project({ ...worldPos(-0.5, y - 0.5), z: -DEPTH }, cam, W / 2, H / 2);
        const b = project({ ...worldPos(COLS - 0.5, y - 0.5), z: -DEPTH }, cam, W / 2, H / 2);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke(); ctx.restore();
    }

    function ghostY() {
      if (!piece) return 0;
      let d = 0;
      while (!collides(piece, 0, d + 1, piece.cells)) d++;
      return d;
    }

    function render() {
      ctx.clearRect(0, 0, W, H);
      const sh = cam.shake;
      if (sh > 0.1) {
        ctx.save();
        ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
      }

      drawWell();

      const list = [];
      // bloques asentados
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const c = grid[y][x];
        if (c) collectCube(list, worldPos(x, y), c.color, {});
      }
      // fantasma + pieza activa
      if (piece) {
        const gd = ghostY();
        for (const [cxx, cyy] of piece.cells) {
          const y = piece.y + cyy;
          if (y + gd >= 0) collectCube(list, worldPos(piece.x + cxx, y + gd), piece.color, { ghost: true });
        }
        for (const [cxx, cyy] of piece.cells) {
          const y = piece.y + cyy;
          if (y >= 0) collectCube(list, worldPos(piece.x + cxx, y), piece.color, { active: true });
        }
      }

      list.sort((a, b) => b.depth - a.depth);
      for (const o of list) {
        if (o.type === 'face') paintFace(o); else paintEdges(o);
      }

      // destellos de línea
      for (const f of flashes) {
        const t = f.t / f.life, a = Math.max(0, 1 - t);
        const p1 = project(worldPos(-0.5, f.y), cam, W / 2, H / 2);
        const p2 = project(worldPos(COLS - 0.5, f.y), cam, W / 2, H / 2);
        const g = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, `rgba(255,255,255,${0.85 * a})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 24 * a + 2;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }

      ctx.globalCompositeOperation = 'lighter';
      for (const s of shards) drawShard(s);
      for (const p of sparks) drawSpark(p);
      ctx.globalCompositeOperation = 'source-over';

      if (sh > 0.1) ctx.restore();
    }

    function drawNext() {
      const def = SHAPES[nextKey];
      nctx.clearRect(0, 0, nextCv.width, nextCv.height);
      if (!def) return;
      const s = 16;
      const minX = Math.min(...def.cells.map(c => c[0]));
      const maxX = Math.max(...def.cells.map(c => c[0]));
      const minY = Math.min(...def.cells.map(c => c[1]));
      const maxY = Math.max(...def.cells.map(c => c[1]));
      const ox = (nextCv.width - (maxX - minX + 1) * s) / 2 - minX * s;
      const oy = (nextCv.height - (maxY - minY + 1) * s) / 2 - minY * s;
      const [r, g, b] = def.color;
      for (const [x, y] of def.cells) {
        const px = ox + x * s, py = oy + y * s;
        const grd = nctx.createLinearGradient(px, py, px + s, py + s);
        grd.addColorStop(0, `rgba(255,255,255,0.6)`);
        grd.addColorStop(0.5, `rgba(${r},${g},${b},0.55)`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0.25)`);
        nctx.fillStyle = grd;
        nctx.fillRect(px, py, s - 2, s - 2);
        nctx.strokeStyle = `rgba(${Math.min(255, r + 90)},${Math.min(255, g + 90)},${Math.min(255, b + 90)},0.9)`;
        nctx.strokeRect(px + 0.5, py + 0.5, s - 3, s - 3);
      }
    }

    function updateHud() {
      container.querySelector('#tScore').textContent = score;
      container.querySelector('#tLevel').textContent = level;
      container.querySelector('#tLines').textContent = lines;
    }

    function ping() { cam.rotY += 0.05; }

    // ---------- bucle ----------
    function loop(t) {
      if (destroyed) return;
      rafId = requestAnimationFrame(loop);
      const dt = Math.min(60, t - lastT || 16);
      lastT = t;

      // cámara viva
      cam.rotY += (Math.sin(t * 0.00021) * 0.13 - cam.rotY) * 0.02;
      cam.rotX += (0.19 + Math.sin(t * 0.00013) * 0.03 - cam.rotX) * 0.02;
      cam.shake *= 0.86;

      if (running && !paused) {
        if (clearLock > 0) clearLock -= dt;
        else if (piece) {
          dropTimer += dt;
          if (dropTimer >= dropInterval) { dropTimer = 0; softDrop(); }
        }
      }
      updateShards(dt);
      render();
      updateHud();
    }

    // ---------- controles ----------
    function onKey(e) {
      if (!running) return;
      const k = e.key;
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(k)) e.preventDefault();
      if (paused && k.toLowerCase() !== 'p') return;
      switch (k) {
        case 'ArrowLeft': move(-1); break;
        case 'ArrowRight': move(1); break;
        case 'ArrowUp': case 'x': case 'X': rotate(1); break;
        case 'z': case 'Z': rotate(-1); break;
        case 'ArrowDown': softDrop(); dropTimer = 0; break;
        case ' ': hardDrop(); break;
        case 'p': case 'P': togglePause(); break;
      }
    }
    document.addEventListener('keydown', onKey);

    container.querySelector('.tutris-touch').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !running || paused) return;
      const a = b.dataset.act;
      if (a === 'left') move(-1);
      else if (a === 'right') move(1);
      else if (a === 'rot') rotate(1);
      else if (a === 'down') { softDrop(); dropTimer = 0; }
      else if (a === 'drop') hardDrop();
    });

    function togglePause() {
      paused = !paused;
      overlay.classList.toggle('hide', !paused);
      if (paused) {
        overlay.innerHTML = `<h3>PAUSA</h3><p>Pulsa P o el botón para continuar</p>
          <button class="game-button" id="tResume">CONTINUAR</button>`;
        overlay.querySelector('#tResume').onclick = togglePause;
      }
    }
    container.querySelector('#tPause').onclick = () => { if (running) togglePause(); };

    // ---------- fondo del dispositivo ----------
    let bgContrast = 62;
    function applyBgFilter() {
      const c = bgContrast / 100;
      bgLayer.style.filter =
        `contrast(${(0.45 + c * 0.55).toFixed(2)}) brightness(${(0.40 + c * 0.35).toFixed(2)}) saturate(${(0.55 + c * 0.5).toFixed(2)}) blur(${(1.6 - c).toFixed(2)}px)`;
    }
    container.querySelector('#tBgInput').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = ev => {
        bgLayer.style.backgroundImage = `url("${ev.target.result}")`;
        bgLayer.classList.add('on');
        applyBgFilter();
      };
      rd.readAsDataURL(f);
    });
    container.querySelector('#tBgClear').onclick = () => {
      bgLayer.style.backgroundImage = ''; bgLayer.classList.remove('on');
    };
    container.querySelector('#tBgContrast').addEventListener('input', e => {
      bgContrast = +e.target.value; applyBgFilter();
    });
    applyBgFilter();

    // ---------- arranque ----------
    function start() {
      for (let y = 0; y < ROWS; y++) grid[y].fill(null);
      shards = []; sparks = []; flashes = [];
      score = 0; lines = 0; level = 1; dropInterval = 850; dropTimer = 0;
      over = false; paused = false; running = true; clearLock = 0;
      nextKey = bag(); nextPiece(); updateHud();
      overlay.classList.add('hide');
    }
    overlay.querySelector('#tStart').onclick = start;

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    resize();
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);

    return {
      destroy() {
        destroyed = true;
        cancelAnimationFrame(rafId);
        document.removeEventListener('keydown', onKey);
        ro.disconnect();
      }
    };
  }

  global.loadTutrisGame = function (container) {
    if (global.__tutris && global.__tutris.destroy) global.__tutris.destroy();
    global.__tutris = TutrisGame(container);
  };
})(window);
