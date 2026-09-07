/* Hero 3D + previsualizaciones animadas de la galería */
(function () {
  'use strict';

  function proj(p, rx, ry, dist, fov, cx, cy) {
    const cyr = Math.cos(ry), syr = Math.sin(ry);
    let x = p.x * cyr + p.z * syr, z = -p.x * syr + p.z * cyr;
    const cxr = Math.cos(rx), sxr = Math.sin(rx);
    let y = p.y * cxr - z * sxr; z = p.y * sxr + z * cxr;
    const zc = dist - z, k = fov / Math.max(1, zc);
    return { x: cx + x * k, y: cy - y * k, z: zc, k };
  }

  // ---------------- HERO: retícula de cubos de cristal ----------------
  function initHero() {
    const cv = document.getElementById('heroCanvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    let W, H, dpr = Math.min(2, devicePixelRatio || 1);
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

    function resize() {
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    addEventListener('resize', resize);

    const N = 14;
    const nodes = [];
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        nodes.push({ gx: i - (N - 1) / 2, gz: j - (N - 1) / 2 });

    const stars = Array.from({ length: 130 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + .2, a: Math.random()
    }));

    addEventListener('pointermove', e => {
      mouse.tx = (e.clientX / innerWidth - .5) * 2;
      mouse.ty = (e.clientY / innerHeight - .5) * 2;
    });

    function frame(t) {
      requestAnimationFrame(frame);
      if (!W) resize();
      const rect = cv.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > innerHeight + 200) return;

      ctx.clearRect(0, 0, W, H);

      // nebulosa
      const g = ctx.createRadialGradient(W * .5, H * .25, 0, W * .5, H * .25, Math.max(W, H) * .8);
      g.addColorStop(0, 'rgba(20,40,90,0.55)');
      g.addColorStop(.5, 'rgba(10,14,38,0.5)');
      g.addColorStop(1, 'rgba(4,6,15,1)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      for (const s of stars) {
        const a = .25 + Math.abs(Math.sin(t * .0006 + s.a * 9)) * .6;
        ctx.fillStyle = `rgba(190,230,255,${a * .7})`;
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.29); ctx.fill();
      }

      mouse.x += (mouse.tx - mouse.x) * .05;
      mouse.y += (mouse.ty - mouse.y) * .05;

      const rx = .78 + mouse.y * .18;
      const ry = t * .00011 + mouse.x * .32;
      const dist = 26, fov = Math.min(W, H) * 1.05;
      const cx = W / 2, cy = H * .88;

      const items = [];
      for (const n of nodes) {
        const d = Math.hypot(n.gx, n.gz);
        const h = Math.sin(t * .0011 - d * .55) * 1.15 + 1.35;
        items.push({ n, h, d, p: { x: n.gx * 1.5, y: h * .5 - 4, z: n.gz * 1.5 } });
      }
      items.sort((a, b) => (b.p.z + b.p.x) - (a.p.z + a.p.x));

      for (const it of items) {
        const s = .62, hh = Math.max(.25, it.h);
        const c = it.p;
        const v = [
          { x: c.x - s, y: c.y + hh / 2, z: c.z - s }, { x: c.x + s, y: c.y + hh / 2, z: c.z - s },
          { x: c.x + s, y: c.y - hh / 2, z: c.z - s }, { x: c.x - s, y: c.y - hh / 2, z: c.z - s },
          { x: c.x - s, y: c.y + hh / 2, z: c.z + s }, { x: c.x + s, y: c.y + hh / 2, z: c.z + s },
          { x: c.x + s, y: c.y - hh / 2, z: c.z + s }, { x: c.x - s, y: c.y - hh / 2, z: c.z + s }
        ].map(q => proj(q, rx, ry, dist, fov, cx, cy));

        const hue = 185 + Math.sin(it.d * .5 + t * .0007) * 60;
        const alpha = Math.max(.05, .38 - it.d * .018);
        const faces = [[4, 5, 6, 7], [0, 1, 5, 4], [5, 1, 2, 6]];
        for (let fi = 0; fi < faces.length; fi++) {
          const f = faces[fi];
          ctx.beginPath();
          ctx.moveTo(v[f[0]].x, v[f[0]].y);
          for (let i = 1; i < 4; i++) ctx.lineTo(v[f[i]].x, v[f[i]].y);
          ctx.closePath();
          const grd = ctx.createLinearGradient(v[f[0]].x, v[f[0]].y, v[f[2]].x, v[f[2]].y);
          grd.addColorStop(0, `hsla(${hue},95%,78%,${alpha * (fi === 1 ? 1.5 : 1)})`);
          grd.addColorStop(1, `hsla(${hue + 40},90%,42%,${alpha * .5})`);
          ctx.fillStyle = grd; ctx.fill();
          ctx.strokeStyle = `hsla(${hue},100%,85%,${alpha * 1.3})`;
          ctx.lineWidth = .8; ctx.stroke();
        }
      }

      // scrim para garantizar legibilidad del texto del hero
      const sc = ctx.createLinearGradient(0, 0, 0, H);
      sc.addColorStop(0, 'rgba(4,6,15,0.55)');
      sc.addColorStop(.55, 'rgba(4,6,15,0.42)');
      sc.addColorStop(.8, 'rgba(4,6,15,0.05)');
      sc.addColorStop(1, 'rgba(4,6,15,0)');
      ctx.fillStyle = sc; ctx.fillRect(0, 0, W, H);

      // viñeta
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(4,6,15,0.85)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    resize();
    requestAnimationFrame(frame);
  }

  // ---------------- Previsualizaciones ----------------
  function initPreviews() {
    document.querySelectorAll('canvas[data-preview]').forEach(cv => {
      const kind = cv.dataset.preview;
      const ctx = cv.getContext('2d');
      let W, H, dpr = Math.min(2, devicePixelRatio || 1);
      function resize() {
        W = cv.clientWidth; H = cv.clientHeight;
        cv.width = W * dpr; cv.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      addEventListener('resize', resize);
      resize();

      const bricks = [];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) bricks.push({ r, c, on: true, t: Math.random() * 6 });
      const ball = { x: .5, y: .7, vx: .006, vy: -.008 };

      function frame(t) {
        requestAnimationFrame(frame);
        if (!W) resize();
        const rect = cv.getBoundingClientRect();
        if (rect.bottom < -100 || rect.top > innerHeight + 100) return;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(6,10,24,0.9)'; ctx.fillRect(0, 0, W, H);

        if (kind === 'tutris') {
          const rx = .22 + Math.sin(t * .0004) * .05, ry = Math.sin(t * .0003) * .4;
          const cx = W / 2, cy = H / 2, fov = Math.min(W, H) * 2.4, dist = 26;
          const cells = [[0,0],[1,0],[0,1],[1,1],[2,1],[-1,2],[0,2],[1,2],[-2,3],[-1,3],[0,3],[1,3],[2,3]];
          const drop = ((t * .0016) % 6) - 3;
          const all = [];
          cells.forEach(([gx, gy], i) => {
            const yy = 1.6 - gy * .95 + (i < 3 ? drop : 0);
            all.push({ x: gx * .95, y: yy, z: 0, hue: 180 + i * 14 });
          });
          all.sort((a, b) => b.y - a.y);
          for (const c of all) {
            const s = .45, d = .42;
            const v = [
              { x: c.x - s, y: c.y + s, z: c.z - d }, { x: c.x + s, y: c.y + s, z: c.z - d },
              { x: c.x + s, y: c.y - s, z: c.z - d }, { x: c.x - s, y: c.y - s, z: c.z - d },
              { x: c.x - s, y: c.y + s, z: c.z + d }, { x: c.x + s, y: c.y + s, z: c.z + d },
              { x: c.x + s, y: c.y - s, z: c.z + d }, { x: c.x - s, y: c.y - s, z: c.z + d }
            ].map(q => proj(q, rx, ry, dist, fov, cx, cy));
            [[4,5,6,7],[0,1,5,4],[5,1,2,6]].forEach((f, fi) => {
              ctx.beginPath(); ctx.moveTo(v[f[0]].x, v[f[0]].y);
              for (let i = 1; i < 4; i++) ctx.lineTo(v[f[i]].x, v[f[i]].y);
              ctx.closePath();
              const grd = ctx.createLinearGradient(v[f[0]].x, v[f[0]].y, v[f[2]].x, v[f[2]].y);
              grd.addColorStop(0, `hsla(${c.hue},100%,85%,${fi === 0 ? .55 : .35})`);
              grd.addColorStop(1, `hsla(${c.hue},90%,50%,.22)`);
              ctx.fillStyle = grd; ctx.fill();
              ctx.strokeStyle = `hsla(${c.hue},100%,88%,.75)`; ctx.lineWidth = 1; ctx.stroke();
            });
          }
        } else {
          const bw = W / 11, bh = H / 14;
          bricks.forEach(b => {
            b.t += .01;
            if (!b.on && Math.random() < .004) b.on = true;
            if (!b.on) return;
            const x = W * .08 + b.c * bw, y = H * .12 + b.r * bh + Math.sin(b.t) * 2;
            const hue = 180 + b.r * 26;
            ctx.fillStyle = `hsla(${hue},95%,65%,.55)`;
            ctx.fillRect(x, y, bw - 4, bh - 4);
            ctx.strokeStyle = `hsla(${hue},100%,85%,.8)`;
            ctx.strokeRect(x + .5, y + .5, bw - 5, bh - 5);
          });
          ball.x += ball.vx; ball.y += ball.vy;
          if (ball.x < .04 || ball.x > .96) ball.vx *= -1;
          if (ball.y < .1 || ball.y > .88) ball.vy *= -1;
          bricks.forEach(b => {
            if (!b.on) return;
            const x = (W * .08 + b.c * bw) / W, y = (H * .12 + b.r * bh) / H;
            if (ball.x > x && ball.x < x + bw / W && ball.y > y && ball.y < y + bh / H) { b.on = false; ball.vy *= -1; }
          });
          ctx.fillStyle = 'rgba(124,233,255,.9)';
          ctx.fillRect(ball.x * W - 22, H * .9, 44, 7);
          ctx.beginPath(); ctx.arc(ball.x * W, ball.y * H, 5, 0, 6.29);
          ctx.fillStyle = '#fff'; ctx.shadowColor = '#7ce9ff'; ctx.shadowBlur = 14; ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      requestAnimationFrame(frame);
    });
  }

  function initExtras() {
    document.querySelectorAll('[data-launch]').forEach(b => {
      b.addEventListener('click', () => window.launchGame && window.launchGame(+b.dataset.launch));
    });
    const grid = document.getElementById('gamesGrid');
    if (grid) grid.addEventListener('pointermove', e => {
      const card = e.target.closest('.game-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  }

  function boot() { initHero(); initPreviews(); initExtras(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
