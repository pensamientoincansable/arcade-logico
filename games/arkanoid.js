/* ============================================================
   NEONOID — Arkanoid con 30 escenarios, potenciadores
   y un JEFE cada 5 niveles (enjambres de bloques con vida propia)
   ============================================================ */
(function (global) {
  'use strict';

  const VW = 800, VH = 1000;           // espacio virtual
  const COLS = 11;
  const BRICK_W = 62, BRICK_H = 26, GAP = 4;
  const OX = (VW - (COLS * (BRICK_W + GAP) - GAP)) / 2;
  const OY = 110;

  const PALETTE = [
    '#7ce9ff', '#ff7ad8', '#9dff8a', '#ffd166', '#b58cff', '#ff8f6b', '#66f0d0'
  ];

  const POWERS = [
    { id: 'wide',   label: 'ANCHO',    color: '#7ce9ff', icon: 'W' },
    { id: 'multi',  label: 'MULTI',    color: '#ff7ad8', icon: 'M' },
    { id: 'laser',  label: 'LÁSER',    color: '#ff5d5d', icon: 'L' },
    { id: 'slow',   label: 'LENTO',    color: '#9dff8a', icon: 'S' },
    { id: 'glue',   label: 'IMÁN',     color: '#ffd166', icon: 'G' },
    { id: 'life',   label: 'VIDA',     color: '#ff9ecb', icon: '+' },
    { id: 'through',label: 'PERFORA',  color: '#b58cff', icon: 'P' },
    { id: 'shrink', label: 'ESTRECHO', color: '#8899aa', icon: '-' }
  ];

  // ---------- generador de 30 escenarios ----------
  function levelLayout(n) {
    // n: 1..30. Cada múltiplo de 5 => jefe
    const rows = Math.min(9, 4 + Math.floor(n / 4));
    const cells = [];
    const mode = n % 7;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        let on = true;
        switch (mode) {
          case 0: on = (r + c) % 2 === 0; break;
          case 1: on = true; break;
          case 2: on = Math.abs(c - (COLS - 1) / 2) <= (rows - r) - 1; break;   // pirámide
          case 3: on = r % 2 === 0 || c % 3 !== 1; break;
          case 4: on = Math.abs(c - (COLS - 1) / 2) + r > 2; break;              // uve
          case 5: on = (c % 4 !== 3) && (r % 3 !== 2); break;
          case 6: on = (r * COLS + c) % 5 !== 4; break;
        }
        if (!on) continue;
        // dureza escalada
        let hp = 1;
        const diff = n / 30;
        const roll = Math.random();
        if (roll < diff * 0.45) hp = 2;
        if (roll < diff * 0.18) hp = 3;
        if (n > 12 && roll > 0.94) hp = 0; // 0 = indestructible
        cells.push({ r, c, hp });
      }
    }
    return cells;
  }

  const BOSSES = [
    { name: 'ENJAMBRE ALFA',   pattern: 'orbit',  hp: 60,  tint: '#ff7ad8' },
    { name: 'SERPIENTE NEÓN',  pattern: 'snake',  hp: 90,  tint: '#9dff8a' },
    { name: 'NÚCLEO PULSANTE', pattern: 'pulse',  hp: 130, tint: '#7ce9ff' },
    { name: 'ARAÑA DE VIDRIO', pattern: 'spider', hp: 180, tint: '#b58cff' },
    { name: 'TORMENTA',        pattern: 'storm',  hp: 240, tint: '#ffd166' },
    { name: 'EL ARQUITECTO',   pattern: 'final',  hp: 320, tint: '#ff5d5d' }
  ];

  function ArkanoidGame(container) {
    container.innerHTML = `
      <div class="ark-wrap">
        <div class="ark-stage">
          <canvas id="arkCanvas"></canvas>
          <div class="ark-hud">
            <div><span class="th-label">NIVEL</span><b id="aLevel">1</b><small>/30</small></div>
            <div><span class="th-label">PUNTOS</span><b id="aScore">0</b></div>
            <div><span class="th-label">VIDAS</span><b id="aLives">3</b></div>
            <div id="aPowers" class="ark-powers"></div>
          </div>
          <div class="ark-bossbar hide" id="aBossBar">
            <span id="aBossName">JEFE</span>
            <div class="ark-bossbar-track"><i id="aBossFill"></i></div>
          </div>
          <div class="tutris-overlay" id="aOverlay">
            <h3>NEONOID</h3>
            <p>30 escenarios · potenciadores · jefe cada 5 niveles<br>
            Mueve con ratón/dedo o ← → · Espacio lanza y dispara</p>
            <button class="game-button" id="aStart">EMPEZAR</button>
          </div>
        </div>
        <div class="ark-tools">
          <button class="glass-btn" id="aPause"><i class="fas fa-pause"></i> Pausa</button>
          <label class="glass-slider">Ir al nivel
            <input type="range" id="aJump" min="1" max="30" value="1">
            <b id="aJumpVal">1</b>
          </label>
        </div>
      </div>`;

    const canvas = container.querySelector('#arkCanvas');
    const ctx = canvas.getContext('2d');
    const overlay = container.querySelector('#aOverlay');
    const bossBar = container.querySelector('#aBossBar');

    let W = VW, H = VH, scale = 1, offX = 0, offY = 0;
    let dpr = Math.min(2, global.devicePixelRatio || 1);
    let destroyed = false, rafId = null, lastT = 0;
    let running = false, paused = false;

    let level = 1, score = 0, lives = 3;
    let bricks = [], balls = [], drops = [], lasers = [], parts = [], boss = null;
    let active = {};        // potenciadores activos -> tiempo restante
    let msg = null;

    const paddle = { x: VW / 2, y: VH - 70, w: 130, h: 16, speed: 12, dir: 0 };

    function resize() {
      const stage = canvas.parentElement;
      const rect = stage.getBoundingClientRect();
      const cw = Math.max(280, rect.width), ch = Math.max(360, rect.height);
      canvas.width = cw * dpr; canvas.height = ch * dpr;
      canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
      scale = Math.min(cw / VW, ch / VH);
      offX = (cw - VW * scale) / 2; offY = (ch - VH * scale) / 2;
      W = cw; H = ch;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ---------- construcción de nivel ----------
    function buildLevel(n) {
      bricks = []; drops = []; lasers = []; boss = null; parts = [];
      active = {};
      paddle.w = 130;
      bossBar.classList.add('hide');

      const isBoss = n % 5 === 0;
      if (isBoss) {
        const b = BOSSES[Math.min(BOSSES.length - 1, n / 5 - 1)];
        boss = {
          name: b.name, pattern: b.pattern, tint: b.tint,
          hp: b.hp, maxHp: b.hp, t: 0,
          cx: VW / 2, cy: 240, phase: 0,
          nodes: makeBossNodes(b.pattern),
          shootT: 0
        };
        bossBar.classList.remove('hide');
        container.querySelector('#aBossName').textContent = b.name;
      } else {
        for (const cell of levelLayout(n)) {
          bricks.push({
            x: OX + cell.c * (BRICK_W + GAP), y: OY + cell.r * (BRICK_H + GAP),
            w: BRICK_W, h: BRICK_H, hp: cell.hp, maxHp: cell.hp || 1,
            color: cell.hp === 0 ? '#5a6b7d' : PALETTE[(cell.r + n) % PALETTE.length],
            solid: cell.hp === 0,
            wob: Math.random() * 6.28
          });
        }
      }
      resetBall();
      updateHud();
    }

    function makeBossNodes(pattern) {
      const nodes = [];
      const count = pattern === 'final' ? 26 : pattern === 'storm' ? 22 : 16;
      for (let i = 0; i < count; i++) {
        nodes.push({
          i, a: (i / count) * Math.PI * 2,
          r: 90 + (i % 3) * 34,
          x: VW / 2, y: 240, hp: 3, alive: true, respawn: 0,
          w: 46, h: 22, wob: Math.random() * 6.28
        });
      }
      return nodes;
    }

    function resetBall() {
      balls = [{
        x: paddle.x, y: paddle.y - 16, vx: 0, vy: 0, r: 9,
        stuck: true, through: false, trail: []
      }];
    }

    // ---------- potenciadores ----------
    function maybeDrop(x, y) {
      if (Math.random() > 0.19) return;
      const p = POWERS[(Math.random() * POWERS.length) | 0];
      drops.push({ x, y, vy: 2.6, p, t: 0 });
    }

    function grabPower(id) {
      switch (id) {
        case 'wide': paddle.w = Math.min(240, paddle.w + 46); active.wide = 14000; break;
        case 'shrink': paddle.w = Math.max(70, paddle.w - 34); active.shrink = 9000; break;
        case 'life': lives++; break;
        case 'slow': balls.forEach(b => { b.vx *= 0.66; b.vy *= 0.66; }); active.slow = 10000; break;
        case 'laser': active.laser = 12000; break;
        case 'glue': active.glue = 12000; break;
        case 'through': active.through = 9000; balls.forEach(b => b.through = true); break;
        case 'multi': {
          const src = balls.slice(0, 3);
          src.forEach(b => {
            for (let k = 0; k < 2; k++) {
              const a = Math.atan2(b.vy || -6, b.vx || 1) + (k ? 0.5 : -0.5);
              const sp = Math.hypot(b.vx, b.vy) || 8;
              balls.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 9, stuck: false, through: b.through, trail: [] });
            }
          });
          break;
        }
      }
      renderPowers();
    }

    function renderPowers() {
      const el = container.querySelector('#aPowers');
      el.innerHTML = Object.keys(active).filter(k => active[k] > 0).map(k => {
        const p = POWERS.find(p => p.id === k);
        return `<i class="ark-pw" style="--pc:${p.color}">${p.icon}</i>`;
      }).join('');
    }

    // ---------- física ----------
    function launch() {
      let launched = false;
      balls.forEach(b => {
        if (b.stuck) {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
          const sp = 8.4 + level * 0.09;
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.stuck = false;
          launched = true;
        }
      });
      if (!launched && active.laser > 0) {
        lasers.push({ x: paddle.x - paddle.w / 2 + 8, y: paddle.y, vy: -16 });
        lasers.push({ x: paddle.x + paddle.w / 2 - 8, y: paddle.y, vy: -16 });
      }
    }

    function burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, s = 1 + Math.random() * 5;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 320 + Math.random() * 380, color, r: 1 + Math.random() * 3 });
      }
    }

    function hitBrick(b, ball) {
      if (b.solid) return false;
      b.hp--;
      score += 25 * level;
      burst(b.x + b.w / 2, b.y + b.h / 2, b.color, b.hp <= 0 ? 16 : 6);
      if (b.hp <= 0) {
        maybeDrop(b.x + b.w / 2, b.y + b.h / 2);
        b.dead = true;
        return true;
      }
      return false;
    }

    function collideRect(ball, r) {
      const nx = Math.max(r.x, Math.min(ball.x, r.x + r.w));
      const ny = Math.max(r.y, Math.min(ball.y, r.y + r.h));
      const dx = ball.x - nx, dy = ball.y - ny;
      if (dx * dx + dy * dy > ball.r * ball.r) return null;
      return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }

    function step(dt) {
      const f = dt / 16.6;

      // paleta
      if (paddle.dir) paddle.x += paddle.dir * paddle.speed * f;
      paddle.x = Math.max(paddle.w / 2, Math.min(VW - paddle.w / 2, paddle.x));

      // potenciadores temporizados
      for (const k of Object.keys(active)) {
        active[k] -= dt;
        if (active[k] <= 0) {
          delete active[k];
          if (k === 'wide' || k === 'shrink') paddle.w = 130;
          if (k === 'through') balls.forEach(b => b.through = false);
          renderPowers();
        }
      }

      // jefe
      if (boss) updateBoss(dt, f);

      // bolas
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        if (b.stuck) { b.x = paddle.x; b.y = paddle.y - 16; continue; }
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 12) b.trail.shift();

        const steps = Math.ceil(Math.hypot(b.vx, b.vy) * f / 6) || 1;
        for (let s = 0; s < steps; s++) {
          b.x += b.vx * f / steps; b.y += b.vy * f / steps;
          if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
          if (b.x > VW - b.r) { b.x = VW - b.r; b.vx = -Math.abs(b.vx); }
          if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }

          // paleta
          if (b.vy > 0 && b.y + b.r >= paddle.y && b.y - b.r <= paddle.y + paddle.h &&
              b.x >= paddle.x - paddle.w / 2 - 4 && b.x <= paddle.x + paddle.w / 2 + 4) {
            const rel = (b.x - paddle.x) / (paddle.w / 2);
            const sp = Math.min(17, Math.hypot(b.vx, b.vy) * 1.015);
            const a = -Math.PI / 2 + rel * 1.05;
            b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
            b.y = paddle.y - b.r - 1;
            if (active.glue > 0) b.stuck = true;
            burst(b.x, paddle.y, '#7ce9ff', 5);
          }

          // ladrillos
          for (const br of bricks) {
            if (br.dead) continue;
            const side = collideRect(b, br);
            if (!side) continue;
            const destroyed_ = hitBrick(br, b);
            if (!(b.through && destroyed_)) {
              if (side === 'x') b.vx = -b.vx; else b.vy = -b.vy;
            }
            break;
          }

          // nodos del jefe
          if (boss) {
            for (const nd of boss.nodes) {
              if (!nd.alive) continue;
              const r = { x: nd.x - nd.w / 2, y: nd.y - nd.h / 2, w: nd.w, h: nd.h };
              const side = collideRect(b, r);
              if (!side) continue;
              nd.hp--; boss.hp = Math.max(0, boss.hp - 1);
              score += 40 * level;
              burst(nd.x, nd.y, boss.tint, 10);
              if (nd.hp <= 0) { nd.alive = false; nd.respawn = 3600 + Math.random() * 2600; burst(nd.x, nd.y, '#fff', 22); }
              if (!b.through) { if (side === 'x') b.vx = -b.vx; else b.vy = -b.vy; }
              break;
            }
          }
        }

        if (b.y > VH + 40) balls.splice(i, 1);
      }

      if (!balls.length) loseLife();

      // caídas
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]; d.t += dt; d.y += d.vy * f;
        if (d.y > paddle.y - 14 && d.y < paddle.y + 26 && Math.abs(d.x - paddle.x) < paddle.w / 2 + 16) {
          grabPower(d.p.id); score += 60; burst(d.x, d.y, d.p.color, 14); drops.splice(i, 1);
        } else if (d.y > VH + 30) drops.splice(i, 1);
      }

      // láseres
      for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i]; l.y += l.vy * f;
        let hit = false;
        for (const br of bricks) {
          if (br.dead) continue;
          if (l.x > br.x && l.x < br.x + br.w && l.y > br.y && l.y < br.y + br.h) { hitBrick(br, null); hit = true; break; }
        }
        if (!hit && boss) {
          for (const nd of boss.nodes) {
            if (!nd.alive) continue;
            if (Math.abs(l.x - nd.x) < nd.w / 2 && Math.abs(l.y - nd.y) < nd.h / 2) {
              nd.hp--; boss.hp = Math.max(0, boss.hp - 1); burst(nd.x, nd.y, boss.tint, 6);
              if (nd.hp <= 0) { nd.alive = false; nd.respawn = 3600; }
              hit = true; break;
            }
          }
        }
        if (hit || l.y < -20) lasers.splice(i, 1);
      }

      // partículas
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life += dt;
        p.x += p.vx * f; p.y += p.vy * f; p.vy += 0.09 * f; p.vx *= 0.99;
        if (p.life > p.max) parts.splice(i, 1);
      }

      bricks = bricks.filter(b => !b.dead);

      // fin de nivel
      const clear = boss ? boss.hp <= 0 : bricks.every(b => b.solid);
      if (clear && running) nextLevel();

      updateHud();
    }

    // ---------- jefes con "vida propia" ----------
    function updateBoss(dt, f) {
      boss.t += dt;
      const t = boss.t / 1000;
      const rage = 1 + (1 - boss.hp / boss.maxHp) * 1.2;

      boss.nodes.forEach((nd, i) => {
        if (!nd.alive) {
          nd.respawn -= dt;
          if (nd.respawn <= 0 && boss.hp > 0) { nd.alive = true; nd.hp = 3; burst(nd.x, nd.y, boss.tint, 10); }
          return;
        }
        const n = boss.nodes.length;
        switch (boss.pattern) {
          case 'orbit': {
            const a = nd.a + t * 0.7 * rage;
            nd.x = VW / 2 + Math.cos(a) * (nd.r + Math.sin(t * 1.4 + i) * 22);
            nd.y = 250 + Math.sin(a) * (nd.r * 0.5 + Math.cos(t + i) * 16);
            break;
          }
          case 'snake': {
            const u = i / n;
            nd.x = VW / 2 + Math.sin(t * 1.1 * rage + u * 6.5) * (VW / 2 - 70);
            nd.y = 150 + u * 210 + Math.sin(t * 2 + u * 8) * 26;
            break;
          }
          case 'pulse': {
            const pr = 70 + Math.sin(t * 1.6 * rage) * 90;
            nd.x = VW / 2 + Math.cos(nd.a + t * 0.4) * pr;
            nd.y = 250 + Math.sin(nd.a + t * 0.4) * pr * 0.55;
            break;
          }
          case 'spider': {
            const leg = i % 8, seg = Math.floor(i / 8);
            const a = (leg / 8) * 6.28 + Math.sin(t * 1.3 * rage) * 0.34;
            const rr = 60 + seg * 44 + Math.sin(t * 3 + leg) * 14;
            nd.x = VW / 2 + Math.cos(a) * rr;
            nd.y = 250 + Math.sin(a) * rr * 0.62;
            break;
          }
          case 'storm': {
            nd.x = VW / 2 + Math.sin(t * (0.6 + (i % 5) * 0.19) * rage + i) * (VW / 2 - 60);
            nd.y = 130 + ((i * 37) % 240) + Math.cos(t * (0.9 + (i % 4) * 0.2) + i) * 40;
            break;
          }
          case 'final': {
            const phase = Math.floor(t / 6) % 3;
            if (phase === 0) {
              const a = nd.a + t * 1.1 * rage;
              nd.x = VW / 2 + Math.cos(a) * nd.r * 1.3;
              nd.y = 250 + Math.sin(a * 2) * 100;
            } else if (phase === 1) {
              nd.x = OX + (i % COLS) * (BRICK_W + GAP) + BRICK_W / 2;
              nd.y = 140 + Math.floor(i / COLS) * 60 + Math.sin(t * 4 + i) * 12;
            } else {
              const a = (i / n) * 6.28 - t * 1.6 * rage;
              nd.x = VW / 2 + Math.cos(a) * (150 + Math.sin(t * 2) * 60);
              nd.y = 250 + Math.sin(a) * (90 + Math.cos(t * 2) * 40);
            }
            break;
          }
        }
        nd.x = Math.max(40, Math.min(VW - 40, nd.x));
      });

      // el jefe escupe proyectiles que hay que esquivar (dañan al perder bola no, restan tiempo de power)
      boss.shootT -= dt;
      if (boss.shootT <= 0) {
        boss.shootT = Math.max(700, 2200 - level * 40) / rage;
        const alive = boss.nodes.filter(n => n.alive);
        if (alive.length) {
          const src = alive[(Math.random() * alive.length) | 0];
          drops.push({ x: src.x, y: src.y, vy: 3.6, hostile: true, t: 0, p: { color: boss.tint, icon: '✷', id: 'hostile', label: '' } });
        }
      }
      // proyectiles hostiles: si tocan la paleta, encogen
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (!d.hostile) continue;
        if (d.y > paddle.y - 14 && Math.abs(d.x - paddle.x) < paddle.w / 2 + 12) {
          paddle.w = Math.max(70, paddle.w - 18);
          burst(d.x, d.y, '#ff5d5d', 14);
          drops.splice(i, 1);
        }
      }
      const fill = container.querySelector('#aBossFill');
      if (fill) fill.style.width = (boss.hp / boss.maxHp * 100) + '%';
    }

    // ---------- flujo ----------
    function loseLife() {
      lives--;
      burst(paddle.x, paddle.y, '#ff5d5d', 26);
      if (lives <= 0) { gameOver(); return; }
      paddle.w = 130; active = {}; renderPowers();
      resetBall();
    }

    function nextLevel() {
      running = false;
      if (level >= 30) {
        overlay.innerHTML = `<h3>¡COMPLETADO!</h3><p>Has superado los 30 escenarios.<br>Puntuación final <b>${score}</b></p>
          <button class="game-button" id="aStart">JUGAR DE NUEVO</button>`;
        overlay.classList.remove('hide');
        overlay.querySelector('#aStart').onclick = () => { level = 1; score = 0; lives = 3; startLevel(); };
        return;
      }
      level++;
      score += 500;
      const isBoss = level % 5 === 0;
      overlay.innerHTML = `<h3>${isBoss ? 'AVISO DE JEFE' : 'NIVEL ' + level}</h3>
        <p>${isBoss ? 'Se aproxima <b>' + BOSSES[Math.min(5, level / 5 - 1)].name + '</b>' : 'Escenario ' + level + ' de 30'}</p>
        <button class="game-button" id="aNext">CONTINUAR</button>`;
      overlay.classList.remove('hide');
      overlay.querySelector('#aNext').onclick = startLevel;
    }

    function gameOver() {
      running = false;
      overlay.innerHTML = `<h3>GAME OVER</h3><p>Nivel ${level} · Puntuación <b>${score}</b></p>
        <button class="game-button" id="aStart">REINTENTAR</button>`;
      overlay.classList.remove('hide');
      overlay.querySelector('#aStart').onclick = () => { level = 1; score = 0; lives = 3; startLevel(); };
    }

    function startLevel() {
      buildLevel(level);
      renderPowers();
      overlay.classList.add('hide');
      running = true; paused = false;
    }

    function updateHud() {
      container.querySelector('#aLevel').textContent = level;
      const jp = container.querySelector('#aJump');
      const jv = container.querySelector('#aJumpVal');
      if (jp && +jp.value !== level) jp.value = level;
      if (jv && jv.textContent !== String(level)) jv.textContent = level;
      container.querySelector('#aScore').textContent = score;
      container.querySelector('#aLives').textContent = lives;
    }

    // ---------- dibujo ----------
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(offX, offY); ctx.scale(scale, scale);

      // fondo campo
      const bg = ctx.createLinearGradient(0, 0, 0, VH);
      bg.addColorStop(0, 'rgba(10,14,34,0.92)');
      bg.addColorStop(1, 'rgba(4,6,18,0.96)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, VW, VH);

      ctx.strokeStyle = 'rgba(120,235,255,0.07)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= VW; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, VH); }
      for (let y = 0; y <= VH; y += 40) { ctx.moveTo(0, y); ctx.lineTo(VW, y); }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(120,235,255,0.4)'; ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, VW - 3, VH - 3);

      // ladrillos
      for (const b of bricks) {
        const wob = Math.sin(t * 0.002 + b.wob) * 1.4;
        const alpha = b.solid ? 0.55 : 0.35 + (b.hp / (b.maxHp || 1)) * 0.5;
        ctx.save();
        ctx.shadowColor = b.color; ctx.shadowBlur = b.solid ? 4 : 14;
        const g = ctx.createLinearGradient(b.x, b.y + wob, b.x + b.w, b.y + b.h + wob);
        g.addColorStop(0, hexA(b.color, alpha));
        g.addColorStop(0.5, hexA(b.color, alpha * 0.55));
        g.addColorStop(1, hexA(b.color, alpha * 0.9));
        ctx.fillStyle = g;
        roundRect(b.x, b.y + wob, b.w, b.h, 5); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = hexA('#ffffff', b.solid ? 0.18 : 0.4); ctx.lineWidth = 1.2; ctx.stroke();
        if (b.hp > 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(b.hp, b.x + b.w / 2, b.y + b.h / 2 + wob);
        }
        if (b.solid) {
          ctx.strokeStyle = 'rgba(255,255,255,0.14)';
          ctx.beginPath();
          ctx.moveTo(b.x + 6, b.y + b.h - 6 + wob); ctx.lineTo(b.x + b.w - 6, b.y + 6 + wob);
          ctx.stroke();
        }
        ctx.restore();
      }

      // jefe
      if (boss) {
        ctx.save();
        // núcleo
        const pulse = 0.6 + Math.sin(t * 0.004) * 0.25;
        const core = ctx.createRadialGradient(VW / 2, 250, 4, VW / 2, 250, 130);
        core.addColorStop(0, hexA(boss.tint, 0.45 * pulse));
        core.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(VW / 2, 250, 140, 0, 6.29); ctx.fill();

        // tentáculos entre nodos
        ctx.strokeStyle = hexA(boss.tint, 0.22); ctx.lineWidth = 2;
        ctx.beginPath();
        boss.nodes.forEach((nd, i) => {
          if (!nd.alive) return;
          ctx.moveTo(VW / 2, 250); ctx.lineTo(nd.x, nd.y);
        });
        ctx.stroke();

        boss.nodes.forEach(nd => {
          if (!nd.alive) return;
          ctx.save();
          ctx.shadowColor = boss.tint; ctx.shadowBlur = 18;
          const g = ctx.createLinearGradient(nd.x - nd.w / 2, nd.y - nd.h / 2, nd.x + nd.w / 2, nd.y + nd.h / 2);
          g.addColorStop(0, hexA('#ffffff', 0.55));
          g.addColorStop(0.5, hexA(boss.tint, 0.6));
          g.addColorStop(1, hexA(boss.tint, 0.28));
          ctx.fillStyle = g;
          roundRect(nd.x - nd.w / 2, nd.y - nd.h / 2, nd.w, nd.h, 6); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.restore();
        });
        ctx.restore();
      }

      // caídas
      for (const d of drops) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(Math.sin(d.t * 0.005) * 0.4);
        ctx.shadowColor = d.p.color; ctx.shadowBlur = 16;
        ctx.fillStyle = hexA(d.p.color, d.hostile ? 0.9 : 0.75);
        roundRect(-16, -10, 32, 20, 6); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#06121f'; ctx.font = 'bold 13px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(d.p.icon, 0, 1);
        ctx.restore();
      }

      // láseres
      ctx.strokeStyle = '#ff8f8f'; ctx.lineWidth = 3; ctx.shadowColor = '#ff5d5d'; ctx.shadowBlur = 12;
      ctx.beginPath();
      for (const l of lasers) { ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, l.y + 18); }
      ctx.stroke(); ctx.shadowBlur = 0;

      // paleta
      ctx.save();
      ctx.shadowColor = '#7ce9ff'; ctx.shadowBlur = 22;
      const pg = ctx.createLinearGradient(paddle.x - paddle.w / 2, 0, paddle.x + paddle.w / 2, 0);
      pg.addColorStop(0, 'rgba(124,233,255,0.55)');
      pg.addColorStop(0.5, 'rgba(255,255,255,0.92)');
      pg.addColorStop(1, 'rgba(255,122,216,0.55)');
      ctx.fillStyle = pg;
      roundRect(paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h, 8); ctx.fill();
      if (active.laser > 0) {
        ctx.fillStyle = '#ff5d5d';
        ctx.fillRect(paddle.x - paddle.w / 2 + 4, paddle.y - 10, 8, 10);
        ctx.fillRect(paddle.x + paddle.w / 2 - 12, paddle.y - 10, 8, 10);
      }
      ctx.restore();

      // bolas
      for (const b of balls) {
        ctx.save();
        for (let i = 0; i < b.trail.length; i++) {
          const p = b.trail[i], a = (i / b.trail.length) * 0.35;
          ctx.fillStyle = `rgba(124,233,255,${a})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, b.r * (i / b.trail.length), 0, 6.29); ctx.fill();
        }
        ctx.shadowColor = b.through ? '#b58cff' : '#ffffff'; ctx.shadowBlur = 24;
        const bg2 = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, b.r);
        bg2.addColorStop(0, '#ffffff');
        bg2.addColorStop(1, b.through ? '#b58cff' : '#7ce9ff');
        ctx.fillStyle = bg2;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.29); ctx.fill();
        ctx.restore();
      }

      // partículas
      ctx.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        const a = Math.max(0, 1 - p.life / p.max);
        ctx.fillStyle = hexA(p.color, a * 0.85);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + a), 0, 6.29); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      ctx.restore();
    }

    function hexA(hex, a) {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
    }

    function loop(t) {
      if (destroyed) return;
      rafId = requestAnimationFrame(loop);
      const dt = Math.min(48, t - lastT || 16);
      lastT = t;
      if (running && !paused) step(dt);
      draw(t);
    }

    // ---------- entrada ----------
    function toVirtualX(clientX) {
      const r = canvas.getBoundingClientRect();
      return (clientX - r.left - offX) / scale;
    }
    function onMove(e) {
      if (!running || paused) return;
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      paddle.x = Math.max(paddle.w / 2, Math.min(VW - paddle.w / 2, toVirtualX(cx)));
    }
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('touchmove', e => { e.preventDefault(); onMove(e); }, { passive: false });
    canvas.addEventListener('touchstart', e => { onMove(e); launch(); }, { passive: true });
    canvas.addEventListener('mousedown', launch);

    function onKey(e) {
      if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.key === 'ArrowLeft') paddle.dir = -1;
      else if (e.key === 'ArrowRight') paddle.dir = 1;
      else if (e.key === ' ') launch();
      else if (e.key === 'p' || e.key === 'P') togglePause();
    }
    function onKeyUp(e) {
      if ((e.key === 'ArrowLeft' && paddle.dir < 0) || (e.key === 'ArrowRight' && paddle.dir > 0)) paddle.dir = 0;
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);

    function togglePause() {
      if (!running) return;
      paused = !paused;
      if (paused) {
        overlay.innerHTML = `<h3>PAUSA</h3><p>Pulsa P para continuar</p><button class="game-button" id="aRes">CONTINUAR</button>`;
        overlay.classList.remove('hide');
        overlay.querySelector('#aRes').onclick = togglePause;
      } else overlay.classList.add('hide');
    }
    container.querySelector('#aPause').onclick = togglePause;

    const jump = container.querySelector('#aJump');
    jump.addEventListener('input', e => {
      container.querySelector('#aJumpVal').textContent = e.target.value;
    });
    jump.addEventListener('change', e => {
      level = +e.target.value; startLevel();
    });

    overlay.querySelector('#aStart').onclick = () => { level = +jump.value || 1; score = 0; lives = 3; startLevel(); };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    resize();
    buildLevel(1);
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);

    return {
      destroy() {
        destroyed = true;
        cancelAnimationFrame(rafId);
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('keyup', onKeyUp);
        ro.disconnect();
      }
    };
  }

  global.loadArkanoidGame = function (container) {
    if (global.__ark && global.__ark.destroy) global.__ark.destroy();
    global.__ark = ArkanoidGame(container);
  };
})(window);
