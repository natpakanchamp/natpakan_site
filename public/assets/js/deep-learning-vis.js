/* deep-learning-vis.js — Interactive visualizations for the Deep Learning notes post */
(function () {
  'use strict';

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function clr() {
    const d = isDark();
    return {
      bg:      d ? '#1b1b1b' : '#fdfdfd',
      surface: d ? '#262626' : '#f7f7f7',
      border:  d ? '#444'    : '#ddd',
      text:    d ? '#e6e6e6' : '#111111',
      muted:   d ? '#9a9a9a' : '#666666',
      link:    d ? '#6cb4ff' : '#2a7ae2',
      green:   '#22c55e',
      red:     d ? '#f87171' : '#ef4444',
      yellow:  d ? '#fbbf24' : '#d97706',
    };
  }

  function watchTheme(cb) {
    new MutationObserver(cb).observe(
      document.documentElement,
      { attributes: true, attributeFilter: ['data-theme'] }
    );
  }

  function onResize(cb) {
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(cb, 150); });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SGD LOSS LANDSCAPE
  // ─────────────────────────────────────────────────────────────────────────────
  function initSGD(id) {
    const el = document.getElementById(id);
    if (!el) return;

    el.innerHTML = `
      <div class="dlv-head">🎯 Gradient Descent บน Loss Landscape</div>
      <canvas id="${id}-c" class="dlv-canvas"></canvas>
      <div class="dlv-foot">
        <div class="dlv-row">
          <label class="dlv-label">Learning Rate: <strong id="${id}-lrv">0.10</strong>
            <input id="${id}-lr" class="dlv-slider" type="range" min="2" max="48" value="10">
          </label>
          <div class="dlv-btns">
            <button class="dlv-btn" id="${id}-rst">↺ Reset</button>
            <button class="dlv-btn" id="${id}-stp">Step</button>
            <button class="dlv-btn dlv-btn-p" id="${id}-aut">▶ Auto</button>
          </div>
          <span class="dlv-info">Steps: <span id="${id}-n">0</span> | Loss: <span id="${id}-l">—</span></span>
        </div>
        <p class="dlv-hint">ลอง LR สูง (≥ 0.30) → เห็นการสั่นไหวข้ามจุดต่ำสุด · LR ต่ำ (≤ 0.05) → ลงช้าแต่ตรง</p>
      </div>
    `;

    const canvas = document.getElementById(`${id}-c`);
    const ctx    = canvas.getContext('2d');
    const lr$    = document.getElementById(`${id}-lr`);
    const lrv$   = document.getElementById(`${id}-lrv`);
    const n$     = document.getElementById(`${id}-n`);
    const l$     = document.getElementById(`${id}-l`);
    const rst    = document.getElementById(`${id}-rst`);
    const stp    = document.getElementById(`${id}-stp`);
    const aut    = document.getElementById(`${id}-aut`);

    let W, H, dpr;
    let w1 = 2.1, w2 = 1.7;
    let path = [];
    let stepCount = 0;
    let timer = null;
    const D = 2.5;

    // Loss: f(x,y) = x² + 5y²  (elongated bowl — zigzag is dramatic at high LR)
    const loss = (x, y) => x * x + 5 * y * y;
    const grad = (x, y) => [2 * x, 10 * y];
    const getLR = () => lr$.value / 100;

    function toCanvas(wx, wy) {
      return [(wx + D) / (2 * D) * W, (1 - (wy + D) / (2 * D)) * H];
    }

    const CONV_THRESH = 1e-5;

    function isConverged() { return loss(w1, w2) < CONV_THRESH; }

    function fmtLoss(v) {
      if (v >= 0.001) return v.toFixed(4);
      return v.toExponential(2);
    }

    function updateInfo() {
      n$.textContent = stepCount;
      const v = loss(w1, w2);
      l$.textContent = isConverged() ? '≈ 0 ✓' : fmtLoss(v);
    }

    // Returns true if a step was taken, false if already converged or at limit.
    function doStep() {
      if (isConverged() || stepCount >= 100) return false;
      const lr = getLR();
      const [g1, g2] = grad(w1, w2);
      w1 = Math.max(-D, Math.min(D, w1 - lr * g1));
      w2 = Math.max(-D, Math.min(D, w2 - lr * g2));
      path.push([w1, w2]);
      stepCount++;
      updateInfo();
      return true;
    }

    function stopAuto() {
      if (timer) { clearInterval(timer); timer = null; }
      aut.textContent = '▶ Auto';
    }

    function reset() {
      stopAuto();
      w1 = 2.1; w2 = 1.7;
      path = [[w1, w2]];
      stepCount = 0;
      updateInfo();
      draw();
    }

    function toggleAuto() {
      if (timer) {
        stopAuto();
      } else {
        aut.textContent = '⏸ Pause';
        timer = setInterval(() => {
          const moved = doStep();
          draw();
          if (!moved) stopAuto();
        }, 80);
      }
    }

    function sizeCanvas() {
      dpr = window.devicePixelRatio || 1;
      W = el.clientWidth;
      H = Math.round(W * 0.52);
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      const c = clr();
      ctx.clearRect(0, 0, W, H);

      // Colormap — drawn on an offscreen canvas then composited via drawImage
      // so the dpr transform on ctx is respected (putImageData ignores transforms).
      const off    = document.createElement('canvas');
      off.width    = W;
      off.height   = H;
      const offCtx = off.getContext('2d');
      const img    = offCtx.createImageData(W, H);
      const data   = img.data;
      const maxL   = loss(D, D);
      const dark   = isDark();
      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          const wx = (px / W) * 2 * D - D;
          const wy = (1 - py / H) * 2 * D - D;
          const t  = Math.min(loss(wx, wy) / maxL, 1);
          const i  = (py * W + px) * 4;
          if (dark) {
            data[i]   = Math.round(15  + t * 200);
            data[i+1] = Math.round(15  + (1 - t) * 80);
            data[i+2] = Math.round(160 - t * 140);
          } else {
            data[i]   = Math.round(210 + t * 45);
            data[i+1] = Math.round(220 - t * 150);
            data[i+2] = Math.round(255 - t * 210);
          }
          data[i+3] = 255;
        }
      }
      offCtx.putImageData(img, 0, 0);
      ctx.drawImage(off, 0, 0, W, H);

      // Ellipse contour lines
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 0.8;
      [0.12, 0.35, 0.8, 1.6, 3, 5.5, 9, 14].forEach(lv => {
        const a = Math.sqrt(lv), b = Math.sqrt(lv / 5);
        if (a > D) return;
        const [ox, oy] = toCanvas(0, 0);
        ctx.beginPath();
        ctx.ellipse(ox, oy, a / (2 * D) * W, b / (2 * D) * H, 0, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Path
      if (path.length > 1) {
        ctx.strokeStyle = dark ? 'rgba(251,191,36,0.85)' : 'rgba(37,99,235,0.8)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        const [sx, sy] = toCanvas(path[0][0], path[0][1]);
        ctx.moveTo(sx, sy);
        path.forEach(([px, py]) => { const [cx, cy] = toCanvas(px, py); ctx.lineTo(cx, cy); });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Minimum marker (green dot)
      const [mx, my] = toCanvas(0, 0);
      ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

      // Current position (ball)
      const [cx2, cy2] = toCanvas(w1, w2);
      ctx.beginPath(); ctx.arc(cx2, cy2, 7, 0, Math.PI * 2);
      ctx.fillStyle = dark ? '#fbbf24' : '#ef4444'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

      // Axis labels
      ctx.font = '11px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
      ctx.textAlign = 'right'; ctx.fillText('w₁ →', W - 4, H / 2);
      ctx.textAlign = 'left';  ctx.fillText('↑ w₂', W / 2 + 4, 13);

      // Min label
      ctx.fillStyle = '#22c55e';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('min', mx + 8, my - 3);
    }

    lr$.addEventListener('input', () => { lrv$.textContent = getLR().toFixed(2); draw(); });
    rst.addEventListener('click', reset);
    stp.addEventListener('click', () => { doStep(); draw(); });
    aut.addEventListener('click', toggleAuto);
    watchTheme(() => draw());
    onResize(() => { sizeCanvas(); draw(); });

    sizeCanvas();
    reset();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. CONVOLUTION OPERATION
  // ─────────────────────────────────────────────────────────────────────────────
  function initConv(id) {
    const el = document.getElementById(id);
    if (!el) return;

    // 5×5 input: a bright rectangle in the center
    const INPUT = [
      [0, 0, 0, 0, 0],
      [0, 8, 8, 8, 0],
      [0, 8, 9, 8, 0],
      [0, 8, 8, 8, 0],
      [0, 0, 0, 0, 0],
    ];

    const FILTERS = {
      edge_h: { label: 'ขอบแนวนอน',      k: [[-1,-1,-1],[0,0,0],[1,1,1]],       scale: 1 },
      edge_v: { label: 'ขอบแนวตั้ง',      k: [[-1,0,1],[-1,0,1],[-1,0,1]],       scale: 1 },
      blur:   { label: 'เบลอ (Blur ×⅑)',  k: [[1,1,1],[1,1,1],[1,1,1]],          scale: 1/9 },
      sharp:  { label: 'คมชัด (Sharpen)', k: [[0,-1,0],[-1,5,-1],[0,-1,0]],       scale: 1 },
    };

    let step = 0;       // 0 = idle, 1-9 = cell index (1-based), 10 = done
    let autoTimer = null;

    el.innerHTML = `
      <div class="dlv-head">🔍 Convolution Operation — ฟิลเตอร์เลื่อนบน Input</div>
      <canvas id="${id}-c" class="dlv-canvas"></canvas>
      <div class="dlv-foot">
        <div class="dlv-row">
          <label class="dlv-label">Filter:
            <select id="${id}-fsel" class="dlv-select">
              ${Object.entries(FILTERS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
            </select>
          </label>
          <div class="dlv-btns">
            <button class="dlv-btn" id="${id}-rst">↺ Reset</button>
            <button class="dlv-btn" id="${id}-stp">Step →</button>
            <button class="dlv-btn dlv-btn-p" id="${id}-aut">▶ Auto</button>
          </div>
          <span class="dlv-info">Cell: <span id="${id}-pos">—</span></span>
        </div>
        <div class="dlv-compute" id="${id}-comp">กด Step เพื่อดูการคำนวณทีละ cell</div>
      </div>
    `;

    const canvas = document.getElementById(`${id}-c`);
    const ctx    = canvas.getContext('2d');
    const fsel   = document.getElementById(`${id}-fsel`);
    const pos$   = document.getElementById(`${id}-pos`);
    const comp$  = document.getElementById(`${id}-comp`);
    const rstBtn = document.getElementById(`${id}-rst`);
    const stpBtn = document.getElementById(`${id}-stp`);
    const autBtn = document.getElementById(`${id}-aut`);

    let W, H, dpr, cs;

    function getFilter() { return FILTERS[fsel.value]; }

    function computeAll() {
      const { k, scale } = getFilter();
      const out = [];
      for (let r = 0; r < 3; r++) {
        out.push([]);
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let kr = 0; kr < 3; kr++)
            for (let kc = 0; kc < 3; kc++)
              sum += INPUT[r + kr][c + kc] * k[kr][kc];
          out[r].push(Math.round(sum * scale * 10) / 10);
        }
      }
      return out;
    }

    function sizeCanvas() {
      dpr = window.devicePixelRatio || 1;
      W   = el.clientWidth;
      // cs: fit [5 cols input] + [cs gap] + [3 cols filter] + [cs gap] + [3 cols output] + 20px margin
      cs  = Math.max(18, Math.min(44, Math.floor((W - 20) / 13)));
      H   = cs * 5 + 55;   // 5 rows + label + bottom padding
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function cellValue(v, maxAbs) {
      if (maxAbs === 0) return isDark() ? '#2a2a2a' : '#f5f5f5';
      const t = Math.abs(v) / maxAbs;
      if (v > 0)  return isDark() ? `rgba(34,197,94,${0.15 + t * 0.5})` : `rgba(34,197,94,${0.12 + t * 0.4})`;
      if (v < 0)  return isDark() ? `rgba(239,68,68,${0.15 + t * 0.5})` : `rgba(239,68,68,${0.12 + t * 0.4})`;
      return isDark() ? '#2a2a2a' : '#f5f5f5';
    }

    function drawCellGrid(grid, ox, oy, cellSz, highlightR, highlightC, highW, highH, out) {
      const dark = isDark();
      const rows = grid.length, cols = grid[0].length;

      // Find max abs value for color scaling
      let maxAbs = 0;
      grid.forEach(row => row.forEach(v => { if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v); }));

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = ox + c * cellSz;
          const y = oy + r * cellSz;
          const v = grid[r][c];

          const inHighlight = highlightR >= 0 &&
            r >= highlightR && r < highlightR + highH &&
            c >= highlightC && c < highlightC + highW;

          let bg = cellValue(v, maxAbs);
          if (inHighlight) bg = dark ? 'rgba(251,191,36,0.22)' : 'rgba(37,99,235,0.14)';

          ctx.fillStyle = bg;
          ctx.fillRect(x + 1, y + 1, cellSz - 2, cellSz - 2);

          ctx.strokeStyle = inHighlight ? (dark ? '#fbbf24' : '#2563eb') : (dark ? '#444' : '#ddd');
          ctx.lineWidth   = inHighlight ? 1.5 : 0.7;
          ctx.strokeRect(x + 0.5, y + 0.5, cellSz - 1, cellSz - 1);

          const dispV = Number.isInteger(v) ? v : v.toFixed(1);
          ctx.fillStyle     = dark ? '#e6e6e6' : '#111';
          ctx.font          = `${Math.round(cellSz * 0.32)}px monospace`;
          ctx.textAlign     = 'center';
          ctx.textBaseline  = 'middle';
          ctx.fillText(String(dispV), x + cellSz / 2, y + cellSz / 2);
        }
      }
    }

    function draw() {
      const dark = isDark();
      ctx.clearRect(0, 0, W, H);

      const inputX  = 10;
      const inputY  = 28;
      const filterX = inputX + 5 * cs + cs;
      const filterY = inputY + cs;        // vertically centered: offset = (5-3)/2 = 1 row
      const outputX = filterX + 3 * cs + cs;
      const outputY = filterY;

      const { k, scale } = getFilter();
      const out = computeAll();

      // Current filter position in input
      const cr = step > 0 && step <= 9 ? Math.floor((step - 1) / 3) : -1;
      const cc = step > 0 && step <= 9 ? (step - 1) % 3 : -1;

      // Labels
      ctx.font      = `${Math.min(12, cs * 0.3)}px sans-serif`;
      ctx.fillStyle = dark ? '#9a9a9a' : '#666';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('Input (5×5)', inputX, inputY - 2);
      ctx.fillText('Filter (3×3)', filterX, filterY - 2);
      ctx.fillText('Output (3×3)', outputX, outputY - 2);

      // Input grid
      drawCellGrid(INPUT, inputX, inputY, cs, cr, cc, 3, 3, null);

      // Filter grid
      drawCellGrid(k, filterX, filterY, cs, -1, -1, 0, 0, null);

      // Output grid (show only computed cells)
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const ci  = r * 3 + c;       // 0-based cell index
          const x   = outputX + c * cs;
          const y   = outputY + r * cs;
          const done    = step > 0 && ci < step;
          const current = step > 0 && ci === step - 1;

          ctx.fillStyle = done
            ? (dark ? 'rgba(251,191,36,0.15)' : 'rgba(37,99,235,0.1)')
            : (dark ? '#2a2a2a' : '#f5f5f5');
          ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);

          ctx.strokeStyle = current ? (dark ? '#fbbf24' : '#2563eb') : (dark ? '#444' : '#ddd');
          ctx.lineWidth   = current ? 1.5 : 0.7;
          ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);

          if (done) {
            const v = out[r][c];
            ctx.fillStyle    = dark ? '#e6e6e6' : '#111';
            ctx.font         = `${Math.round(cs * 0.32)}px monospace`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Number.isInteger(v) ? v : v.toFixed(1), x + cs / 2, y + cs / 2);
          }
        }
      }

      // Operator symbols
      const opX1 = filterX - Math.round(cs * 0.5);
      const opX2 = outputX - Math.round(cs * 0.5);
      const opY  = filterY + cs * 1.5;
      ctx.font         = `${Math.round(cs * 0.7)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = dark ? '#555' : '#bbb';
      ctx.fillText('⊛', opX1, opY);
      ctx.fillText('=', opX2, opY);

      // Update info text
      if (step === 0) {
        comp$.textContent = 'กด Step เพื่อเริ่มการคำนวณทีละ output cell';
        pos$.textContent  = '—';
      } else if (step <= 9) {
        const r = cr, c = cc;
        let terms = [];
        for (let kr = 0; kr < 3; kr++)
          for (let kc = 0; kc < 3; kc++)
            terms.push(`${INPUT[r+kr][c+kc]}×${k[kr][kc]}`);
        const val = out[r][c];
        const scaleStr = scale !== 1 ? ` × ${scale.toFixed(3)}` : '';
        comp$.textContent = `Output[${r}][${c}] = (${terms.join(' + ')})${scaleStr} = ${Number.isInteger(val) ? val : val.toFixed(2)}`;
        pos$.textContent  = `(${r}, ${c})`;
      } else {
        comp$.textContent = '✓ Convolution เสร็จสิ้น — เปลี่ยน filter หรือกด Reset เพื่อลองใหม่';
        pos$.textContent  = 'done';
      }
    }

    function stopAutoConv() {
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
      autBtn.textContent = '▶ Auto';
    }

    rstBtn.addEventListener('click', () => { stopAutoConv(); step = 0; draw(); });
    stpBtn.addEventListener('click', () => { if (step < 9) step++; else step = 0; draw(); });
    autBtn.addEventListener('click', () => {
      if (autoTimer) {
        stopAutoConv();
      } else {
        autBtn.textContent = '⏸ Pause';
        autoTimer = setInterval(() => {
          if (step >= 9) { stopAutoConv(); return; }
          step++; draw();
        }, 700);
      }
    });
    fsel.addEventListener('change', () => { step = 0; draw(); });
    watchTheme(() => draw());
    onResize(() => { sizeCanvas(); draw(); });

    sizeCanvas();
    draw();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. BACKPROPAGATION STEP-BY-STEP
  // ─────────────────────────────────────────────────────────────────────────────
  function initBackprop(id) {
    const el = document.getElementById(id);
    if (!el) return;

    // Fixed network  2 → 2 → 1  (ReLU hidden, Sigmoid output)
    // Input
    const X1 = 1.0, X2 = 0.5;
    // Hidden weights (row = hidden node, col = input)
    const W11 = 0.8, W21 = 0.4;   // node h1: w from x1, w from x2
    const W12 = -0.3, W22 = 0.9;  // node h2: w from x1, w from x2
    const B1 = 0.1, B2 = -0.2;
    // Output weights
    const V1 = 0.6, V2 = -0.5, BOUT = 0.3;
    const TARGET = 1.0;
    const LR = 0.1;

    // Forward
    const z1   = W11*X1 + W21*X2 + B1;          // 1.1
    const z2   = W12*X1 + W22*X2 + B2;          // -0.05
    const h1   = Math.max(0, z1);                // 1.1
    const h2   = Math.max(0, z2);                // 0
    const zout = V1*h1 + V2*h2 + BOUT;          // 0.96
    const sig  = z => 1 / (1 + Math.exp(-z));
    const yhat = sig(zout);                      // ≈ 0.723
    const L    = 0.5 * (yhat - TARGET) ** 2;

    // Backward
    const dL_dyhat    = yhat - TARGET;
    const dyhat_dzout = yhat * (1 - yhat);
    const delta_out   = dL_dyhat * dyhat_dzout;
    const dL_dV1      = delta_out * h1;
    const dL_dV2      = delta_out * h2;
    const delta_h1    = delta_out * V1 * (z1 > 0 ? 1 : 0);
    const delta_h2    = delta_out * V2 * (z2 > 0 ? 1 : 0);
    const dL_dW11     = delta_h1 * X1;
    const dL_dW12     = delta_h2 * X1;
    const dL_dW21     = delta_h1 * X2;
    const dL_dW22     = delta_h2 * X2;

    const STEPS = [
      {
        phase: 'init',
        title: 'สถานะเริ่มต้น — โครงสร้างโครงข่าย',
        lines: [
          `Input: x₁ = ${X1},  x₂ = ${X2}   •   Target: y = ${TARGET}`,
          `สถาปัตยกรรม: 2 → 2 (ReLU) → 1 (Sigmoid)`,
        ],
        hi: [],
        dir: 'none',
      },
      {
        phase: 'fwd',
        title: '1/6 → Forward: คำนวณ Hidden Layer',
        lines: [
          `z₁ = ${W11}·${X1} + ${W21}·${X2} + ${B1} = ${z1.toFixed(2)}   →   h₁ = ReLU(${z1.toFixed(2)}) = ${h1.toFixed(2)}`,
          `z₂ = ${W12}·${X1} + ${W22}·${X2} + (${B2}) = ${z2.toFixed(2)}   →   h₂ = ReLU(${z2.toFixed(2)}) = ${h2.toFixed(2)}`,
        ],
        hi: ['h1', 'h2'],
        dir: 'fwd',
      },
      {
        phase: 'fwd',
        title: '2/6 → Forward: คำนวณ Output',
        lines: [
          `z_out = ${V1}·${h1.toFixed(2)} + (${V2})·${h2.toFixed(2)} + ${BOUT} = ${zout.toFixed(3)}`,
          `ŷ = σ(${zout.toFixed(3)}) = ${yhat.toFixed(4)}`,
        ],
        hi: ['out'],
        dir: 'fwd',
      },
      {
        phase: 'loss',
        title: '3/6 ▼ คำนวณ Loss',
        lines: [
          `L = ½(ŷ − y)² = ½(${yhat.toFixed(4)} − ${TARGET})² = ${L.toFixed(5)}`,
          `dL/dŷ = ŷ − y = ${dL_dyhat.toFixed(4)}`,
        ],
        hi: ['loss'],
        dir: 'none',
      },
      {
        phase: 'bwd',
        title: '4/6 ← Backward: Output Layer',
        lines: [
          `δ_out = dL/dŷ · σ'(z_out) = ${dL_dyhat.toFixed(4)} · ŷ(1−ŷ) = ${delta_out.toFixed(5)}`,
          `dL/dV₁ = δ_out · h₁ = ${dL_dV1.toFixed(5)}   |   dL/dV₂ = δ_out · h₂ = ${dL_dV2.toFixed(5)}`,
        ],
        hi: ['out'],
        dir: 'bwd',
      },
      {
        phase: 'bwd',
        title: '5/6 ← Backward: Hidden Layer',
        lines: [
          `δ_h₁ = δ_out · V₁ · ReLU'(z₁) = ${delta_out.toFixed(4)} · ${V1} · 1 = ${delta_h1.toFixed(5)}`,
          `δ_h₂ = δ_out · V₂ · ReLU'(z₂) = ${delta_out.toFixed(4)} · (${V2}) · 0 = ${delta_h2.toFixed(5)}  (z₂ < 0 → ReLU' = 0)`,
        ],
        hi: ['h1', 'h2'],
        dir: 'bwd',
      },
      {
        phase: 'upd',
        title: `6/6 ✓ อัปเดต Weights (lr = ${LR})`,
        lines: [
          `V₁ ← ${V1} − ${LR}·(${dL_dV1.toFixed(5)}) = ${(V1 - LR*dL_dV1).toFixed(5)}`,
          `W₁₁ ← ${W11} − ${LR}·(${dL_dW11.toFixed(5)}) = ${(W11 - LR*dL_dW11).toFixed(5)}   |   W₁₂ ← ${W12} − ${LR}·(${dL_dW12.toFixed(5)}) = ${(W12 - LR*dL_dW12).toFixed(5)}`,
        ],
        hi: ['edges'],
        dir: 'upd',
      },
    ];

    let curStep = 0;

    el.innerHTML = `
      <div class="dlv-head">⚡ Backpropagation — Chain Rule ทีละขั้นตอน</div>
      <canvas id="${id}-c" class="dlv-canvas"></canvas>
      <div class="dlv-step-box" id="${id}-info"></div>
      <div class="dlv-foot">
        <div class="dlv-row">
          <div class="dlv-btns">
            <button class="dlv-btn" id="${id}-rst">↺ Reset</button>
            <button class="dlv-btn" id="${id}-prv">← Prev</button>
            <button class="dlv-btn dlv-btn-p" id="${id}-nxt">Next →</button>
          </div>
          <span class="dlv-info" id="${id}-prog">Step 0 / ${STEPS.length - 1}</span>
        </div>
      </div>
    `;

    const canvas  = document.getElementById(`${id}-c`);
    const ctx     = canvas.getContext('2d');
    const info$   = document.getElementById(`${id}-info`);
    const prog$   = document.getElementById(`${id}-prog`);
    const rstBtn  = document.getElementById(`${id}-rst`);
    const prvBtn  = document.getElementById(`${id}-prv`);
    const nxtBtn  = document.getElementById(`${id}-nxt`);

    let W, H, dpr;

    function sizeCanvas() {
      dpr = window.devicePixelRatio || 1;
      W   = el.clientWidth;
      H   = Math.max(160, Math.round(W * 0.42));
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function layout() {
      const midY = H / 2;
      const sep  = H * 0.22;
      return {
        x1:   { x: W*0.12, y: midY - sep, label: `x₁=${X1}`,        type: 'in'  },
        x2:   { x: W*0.12, y: midY + sep, label: `x₂=${X2}`,        type: 'in'  },
        h1:   { x: W*0.42, y: midY - sep, label: `h₁`,              type: 'hid' },
        h2:   { x: W*0.42, y: midY + sep, label: `h₂`,              type: 'hid' },
        out:  { x: W*0.72, y: midY,       label: `ŷ`,               type: 'out' },
        loss: { x: W*0.92, y: midY,       label: `L`,               type: 'loss'},
      };
    }

    function nodeColors(type) {
      const d = isDark();
      const map = {
        in:   { bg: d?'#1e3a5f':'#dbeafe', stroke: d?'#60a5fa':'#2563eb', text: d?'#93c5fd':'#1d4ed8' },
        hid:  { bg: d?'#14432a':'#dcfce7', stroke: d?'#4ade80':'#16a34a', text: d?'#86efac':'#166534' },
        out:  { bg: d?'#3a1f5f':'#fae8ff', stroke: d?'#c084fc':'#9333ea', text: d?'#d8b4fe':'#7e22ce' },
        loss: { bg: d?'#3a1414':'#fef2f2', stroke: d?'#f87171':'#dc2626', text: d?'#fca5a5':'#991b1b' },
      };
      return map[type];
    }

    function draw() {
      const s    = STEPS[curStep];
      const lay  = layout();
      const dark = isDark();
      const R    = Math.max(18, Math.min(H * 0.11, 30)); // node radius

      ctx.clearRect(0, 0, W, H);

      const edges = [
        { from: 'x1', to: 'h1', w: W11 }, { from: 'x1', to: 'h2', w: W12 },
        { from: 'x2', to: 'h1', w: W21 }, { from: 'x2', to: 'h2', w: W22 },
        { from: 'h1', to: 'out', w: V1  }, { from: 'h2', to: 'out', w: V2 },
        { from: 'out', to: 'loss', w: null },
      ];

      // Draw edges
      edges.forEach(({ from, to, w }) => {
        const fn = lay[from], tn = lay[to];

        const isFwd = s.dir === 'fwd' && s.hi.includes(to);
        const isBwd = (s.dir === 'bwd' || s.dir === 'upd') &&
                      (s.hi.includes(from) || s.hi.includes(to) || s.hi.includes('edges'));
        const active = isFwd || isBwd;

        if (isFwd)       ctx.strokeStyle = dark ? 'rgba(96,165,250,0.8)'  : 'rgba(37,99,235,0.7)';
        else if (isBwd)  ctx.strokeStyle = dark ? 'rgba(248,113,113,0.8)' : 'rgba(220,38,38,0.7)';
        else             ctx.strokeStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)';

        ctx.lineWidth = active ? 2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(fn.x, fn.y);
        ctx.lineTo(tn.x, tn.y);
        ctx.stroke();

        // Weight label on active edges
        if (active && w !== null) {
          const mx = (fn.x + tn.x) / 2, my = (fn.y + tn.y) / 2;
          ctx.fillStyle    = ctx.strokeStyle;
          ctx.font         = `${Math.round(R * 0.5)}px monospace`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(w.toFixed(1), mx, my - 3);
        }
      });

      // Arrow direction overlay (small arrowhead near destination)
      if (s.dir === 'fwd' || s.dir === 'bwd') {
        edges.forEach(({ from, to }) => {
          const fn = lay[from], tn = lay[to];
          const active = s.dir === 'fwd' ? s.hi.includes(to)
                                         : (s.hi.includes(from) || s.hi.includes(to));
          if (!active) return;

          const srcNode = s.dir === 'fwd' ? fn : tn;
          const dstNode = s.dir === 'fwd' ? tn : fn;
          const dx = dstNode.x - srcNode.x, dy = dstNode.y - srcNode.y;
          const len = Math.hypot(dx, dy);
          const nx = dx / len, ny = dy / len;

          // Arrow tip just outside destination node
          const tipX = dstNode.x - nx * (R + 4);
          const tipY = dstNode.y - ny * (R + 4);
          const sz   = 6;
          const px   = -ny, py = nx;  // perpendicular

          ctx.fillStyle = s.dir === 'fwd'
            ? (dark ? 'rgba(96,165,250,0.9)' : 'rgba(37,99,235,0.8)')
            : (dark ? 'rgba(248,113,113,0.9)' : 'rgba(220,38,38,0.8)');
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - nx * sz + px * sz * 0.5, tipY - ny * sz + py * sz * 0.5);
          ctx.lineTo(tipX - nx * sz - px * sz * 0.5, tipY - ny * sz - py * sz * 0.5);
          ctx.closePath();
          ctx.fill();
        });
      }

      // Draw nodes
      Object.entries(lay).forEach(([key, node]) => {
        const hi  = s.hi.includes(key) || (s.hi.includes('edges') && key !== 'loss');
        const nc  = nodeColors(node.type);

        ctx.beginPath();
        ctx.arc(node.x, node.y, R, 0, Math.PI * 2);
        ctx.fillStyle   = nc.bg;
        ctx.fill();
        ctx.strokeStyle = nc.stroke;
        ctx.lineWidth   = hi ? 2.5 : 1.5;
        ctx.stroke();

        // Value label
        let label = node.label;
        if (hi || curStep > 0) {
          if (key === 'h1' && curStep >= 1)   label = `h₁=${h1.toFixed(2)}`;
          if (key === 'h2' && curStep >= 1)   label = `h₂=${h2.toFixed(2)}`;
          if (key === 'out' && curStep >= 2)  label = `ŷ=${yhat.toFixed(3)}`;
          if (key === 'loss' && curStep >= 3) label = `L=${L.toFixed(4)}`;
        }

        ctx.fillStyle    = nc.text;
        ctx.font         = `${Math.round(R * 0.52)}px monospace`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, node.x, node.y);
      });

      // Layer labels
      ctx.font         = `${Math.min(11, R * 0.4)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle    = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)';
      ctx.fillText('Input',          lay.x1.x,   8);
      ctx.fillText('Hidden (ReLU)', lay.h1.x,   8);
      ctx.fillText('Output (σ)',     lay.out.x,  8);
      ctx.fillText('Loss',           lay.loss.x, 8);

      // Phase badge
      const phaseMap = { init:'—', fwd:'→ Forward', loss:'▼ Loss', bwd:'← Backward', upd:'✓ Update' };
      ctx.font         = '10px sans-serif';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle    = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.28)';
      ctx.fillText(phaseMap[s.phase] || '', W - 6, 6);

      // Info text
      info$.innerHTML = `<strong>${s.title}</strong><br><code>${s.lines.join('<br>')}</code>`;
      prog$.textContent = `Step ${curStep} / ${STEPS.length - 1}`;
      prvBtn.disabled = curStep === 0;
      nxtBtn.disabled = curStep === STEPS.length - 1;
    }

    rstBtn.addEventListener('click', () => { curStep = 0; draw(); });
    prvBtn.addEventListener('click', () => { if (curStep > 0) { curStep--; draw(); } });
    nxtBtn.addEventListener('click', () => { if (curStep < STEPS.length - 1) { curStep++; draw(); } });
    watchTheme(() => draw());
    onResize(() => { sizeCanvas(); draw(); });

    sizeCanvas();
    draw();
  }

  // ─── Boot ────────────────────────────────────────────────────────────────────
  function init() {
    initSGD('vis-sgd');
    initConv('vis-conv');
    initBackprop('vis-backprop');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
