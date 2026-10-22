// Object type designer: size, colour and terminal placement for a template.

const TplEditor = (() => {
  const $ = (id) => document.getElementById(id);
  let ed = null; // { tpl, sel: Set of terminal ids, drag, opts, undo, redo }

  function uid() { return "p" + Math.random().toString(36).slice(2, 8); }
  function snapStep() { return parseFloat($("teSnap").value) || 0.5; }
  function snap(v) { const s = snapStep(); return Math.round(v / s) * s; }
  function round(v) { return Math.round(v * 100) / 100; }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // "IN1" + 2 -> "IN3"; names without a trailing number get one appended after the first.
  function stepName(first, i) {
    const m = /^(.*?)(\d+)$/.exec(first);
    if (m) return m[1] + (parseInt(m[2], 10) + i);
    return i === 0 ? first : first + (i + 1);
  }

  function nextName() {
    const ts = ed.tpl.terminals;
    if (!ts.length) return "1";
    return stepName(ts[ts.length - 1].name, 1);
  }

  const selected = () => ed.tpl.terminals.filter((t) => ed.sel.has(t.id));

  // ---------- undo within the designer ----------
  function remember() {
    ed.undo.push(JSON.stringify(ed.tpl));
    if (ed.undo.length > 200) ed.undo.shift();
    ed.redo.length = 0;
  }

  function restore(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(ed.tpl));
    ed.tpl = JSON.parse(from.pop());
    const ids = new Set(ed.tpl.terminals.map((t) => t.id));
    ed.sel = new Set([...ed.sel].filter((id) => ids.has(id)));
    fillForm();
    renderAll();
  }

  function fillForm() {
    $("teName").value = ed.tpl.name;
    $("teCategory").value = ed.tpl.category || "";
    $("teMount").value = isLoose(ed.tpl) ? "free" : "rail";
    $("teW").value = ed.tpl.w;
    $("teH").value = ed.tpl.h;
    $("tePrefix").value = ed.tpl.prefix || "";
    $("teRadius").value = ed.tpl.radius || 0;
    $("teFill").value = ed.tpl.fill || "#e6e8eb";
    $("teShowName").checked = !!ed.tpl.showName;
  }

  function open(tpl, opts) {
    ed = { tpl: JSON.parse(JSON.stringify(tpl)), sel: new Set(), drag: null, opts, undo: [], redo: [] };
    $("tplModalTitle").textContent = opts.isNew ? "New object type" : "Edit object type";
    fillForm();
    $("categoryList").innerHTML = (opts.categories || []).map((c) => `<option value="${esc(c)}">`).join("");
    $("tplModal").hidden = false;
    renderAll();
    setTimeout(() => $("teName").focus(), 0);
  }

  function close() {
    $("tplModal").hidden = true;
    ed = null;
  }

  function renderAll() { renderPreview(); renderTable(); renderSelBar(); updateWarn(); }

  function updateWarn() {
    const w = $("teWarn");
    const outside = ed.tpl.terminals.filter((t) => t.x < 0 || t.y < 0 || t.x > ed.tpl.w || t.y > ed.tpl.h).length;
    const lost = ed.opts.lostCheck ? ed.opts.lostCheck(ed.tpl) : 0;
    const msgs = [];
    if (outside) msgs.push(`${outside} terminal${outside > 1 ? "s are" : " is"} outside the outline.`);
    if (lost) msgs.push(`Saving will remove ${lost} wire${lost > 1 ? "s" : ""} attached to deleted terminals.`);
    w.textContent = msgs.join(" ");
  }

  function previewBox() {
    const t = ed.tpl;
    const pad = Math.max(t.w, t.h) * 0.12 + 4;
    return { x: -pad, y: -pad, w: t.w + pad * 2, h: t.h + pad * 2 };
  }

  function renderPreview() {
    const t = ed.tpl;
    const svg = $("tePreview");
    const vb = previewBox();
    svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const unit = Math.max(vb.w / (svg.clientWidth || 600), vb.h / (svg.clientHeight || 360)); // mm per screen px
    const step = Math.max(t.w, t.h) > 80 ? 5 : 1;
    let s = "";
    for (let x = 0; x <= t.w + 1e-6; x += step) s += `<line x1="${x}" y1="${vb.y}" x2="${x}" y2="${vb.y + vb.h}" stroke="#e1e6ec" stroke-width="${unit}"/>`;
    for (let y = 0; y <= t.h + 1e-6; y += step) s += `<line x1="${vb.x}" y1="${y}" x2="${vb.x + vb.w}" y2="${y}" stroke="#e1e6ec" stroke-width="${unit}"/>`;
    s += `<rect width="${t.w}" height="${t.h}" rx="${t.radius || 0}" fill="${esc(t.fill)}" stroke="${darken(t.fill, 0.55)}" stroke-width="${unit * 1.5}"/>`;
    const dim = 11 * unit;
    s += `<text x="${t.w / 2}" y="${-2.5 * dim / 2}" font-size="${dim}" text-anchor="middle" fill="#69717c" font-family="${FONT}">${round(t.w)} mm</text>`;
    s += `<text x="${-dim}" y="${t.h / 2}" font-size="${dim}" text-anchor="middle" fill="#69717c" font-family="${FONT}" transform="rotate(-90 ${-dim} ${t.h / 2})">${round(t.h)} mm</text>`;
    const r = termRadius(t);
    const dense = denseTerms(t);
    const ink = inkFor(t.fill);
    // Dashed lines show which terminals are linked inside the part.
    const groups = new Map();
    for (const term of t.terminals) {
      const link = String(term.link || "").trim();
      if (!link) continue;
      if (!groups.has(link)) groups.set(link, []);
      groups.get(link).push(term);
    }
    for (const g of groups.values()) {
      for (let i = 1; i < g.length; i++) {
        s += `<line x1="${g[i - 1].x}" y1="${g[i - 1].y}" x2="${g[i].x}" y2="${g[i].y}" stroke="#2563eb" stroke-opacity="0.6" stroke-width="${unit * 2}" stroke-dasharray="${unit * 6} ${unit * 4}" pointer-events="none"/>`;
      }
    }
    for (const term of t.terminals) {
      const on = ed.sel.has(term.id);
      s += `<g class="tp" data-tid="${esc(term.id)}">`;
      s += `<circle cx="${term.x}" cy="${term.y}" r="${Math.max(r, 6 * unit)}" fill="transparent"/>`;
      if (isSlot(term)) {
        s += slotRect(term.x, term.y, t);
        if (on) s += `<rect x="${term.x - slotSize(t) / 2 - unit * 3}" y="${term.y - slotSize(t) / 2 - unit * 3}" width="${slotSize(t) + unit * 6}" height="${slotSize(t) + unit * 6}" fill="none" stroke="#2563eb" stroke-width="${unit * 2.5}"/>`;
        s += "</g>";
        continue; // slots take bus bars, not wires, so they get no label side
      }
      s += `<circle cx="${term.x}" cy="${term.y}" r="${r}" fill="${on ? "#dbe7ff" : "#fff"}" stroke="${on ? "#2563eb" : "#30353b"}" stroke-width="${on ? unit * 2.5 : unit * 1.2}"/>`;
      const side = localSide(t, term);
      const v = SIDE_VEC[side];
      const tick = `<line x1="${term.x + v[0] * (r + unit * 3)}" y1="${term.y + v[1] * (r + unit * 3)}" x2="${term.x + v[0] * (r + unit * 14)}" y2="${term.y + v[1] * (r + unit * 14)}" stroke="#2563eb" stroke-width="${unit * 1.2}" stroke-opacity="0.55" pointer-events="none"/>`;
      if (dense) {
        // Closely pitched pins: the name goes inside the dot, as on the diagram.
        s += `<text x="${term.x}" y="${term.y}" font-size="${fitText(term.name, r * 1.15, r * 1.7)}" text-anchor="middle" dominant-baseline="central" fill="#1d2126" font-family="${FONT}" pointer-events="none">${esc(term.name)}</text></g>${tick}`;
        continue;
      }
      s += "</g>";
      const fs = Math.max(10 * unit, Math.min(r * 1.4, 2.4));
      let tx = term.x, ty = term.y, anchor = "middle";
      if (side === "top") ty = term.y + r + fs * 0.9;
      else if (side === "bottom") ty = term.y - r - fs * 0.35;
      else if (side === "left") { tx = term.x + r + fs * 0.3; ty = term.y + fs * 0.35; anchor = "start"; }
      else { tx = term.x - r - fs * 0.3; ty = term.y + fs * 0.35; anchor = "end"; }
      s += `<text x="${tx}" y="${ty}" font-size="${fs}" text-anchor="${anchor}" fill="${ink}" font-family="${FONT}" pointer-events="none">${esc(term.name)}</text>`;
      s += tick;
    }
    const d = ed.drag;
    if (d && d.type === "box" && d.moved) {
      const x = Math.min(d.start.x, d.cur.x), y = Math.min(d.start.y, d.cur.y);
      s += `<rect class="marquee" x="${x}" y="${y}" width="${Math.abs(d.cur.x - d.start.x)}" height="${Math.abs(d.cur.y - d.start.y)}" fill="#3b82f6" fill-opacity="0.08" stroke="#3b82f6" stroke-width="${unit}" stroke-dasharray="${unit * 4} ${unit * 3}" pointer-events="none"/>`;
    }
    svg.innerHTML = s;
  }

  function renderTable() {
    const sides = ["auto", "top", "right", "bottom", "left"];
    $("teTerms").innerHTML = ed.tpl.terminals.map((t) => `
      <tr data-tid="${esc(t.id)}" class="${ed.sel.has(t.id) ? "sel" : ""}">
        <td><input data-k="name" type="text" value="${esc(t.name)}"></td>
        <td><input data-k="x" type="number" step="0.1" value="${round(t.x)}"></td>
        <td><input data-k="y" type="number" step="0.1" value="${round(t.y)}"></td>
        <td><select data-k="kind" title="A bus bar slot takes bus bars only, not wires"><option value="wire">Wire</option><option value="bus"${isSlot(t) ? " selected" : ""}>Bus bar slot</option></select></td>
        <td><select data-k="side"${isSlot(t) ? " disabled" : ""}>${sides.map((s) => `<option value="${s}"${(t.side || "auto") === s ? " selected" : ""}>${s === "auto" ? "Auto (" + localSide(ed.tpl, { ...t, side: "auto" }) + ")" : s}</option>`).join("")}</select></td>
        <td><input data-k="link" type="text" value="${esc(t.link || "")}" placeholder="—" title="Same value = connected inside the part"></td>
        <td><button class="icon" data-del title="Delete terminal">✕</button></td>
      </tr>`).join("") || `<tr><td colspan="7" class="muted" style="padding:10px">No terminals yet. Click on the drawing to add one.</td></tr>`;
  }

  // Tools for the selected terminals, shown above the table.
  function renderSelBar() {
    const n = ed.sel.size;
    const bar = $("teSelBar");
    bar.hidden = !n;
    if (!n) return;
    const many = n > 1;
    bar.innerHTML = `<span class="muted">${n} selected</span>
      ${many ? `<button class="small" data-sb="alignY" title="Give them all the same Y (a straight row)">Align in a row</button>
      <button class="small" data-sb="alignX" title="Give them all the same X (a straight column)">Align in a column</button>` : ""}
      ${n > 2 ? `<button class="small" data-sb="space" title="Even spacing between the first and last, along the row or column">Space evenly</button>` : ""}
      ${many ? `<button class="small" data-sb="link" title="Give them the same Link value, connecting them inside the part">Link together</button>` : ""}
      <button class="small" data-sb="dup" title="Copy the selected terminals (Ctrl+D)">Duplicate</button>
      <button class="small danger" data-sb="del" title="Delete the selected terminals (Delete)">Delete</button>`;
  }

  function svgPoint(evt) {
    const svg = $("tePreview");
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function setSel(ids) {
    ed.sel = new Set(ids);
    renderPreview();
    for (const tr of $("teTerms").querySelectorAll("tr")) tr.classList.toggle("sel", ed.sel.has(tr.dataset.tid));
    renderSelBar();
  }

  function addRow() {
    remember();
    const t = ed.tpl;
    const edge = $("rgEdge").value;
    const count = Math.max(1, parseInt($("rgCount").value, 10) || 1);
    const first = $("rgName").value.trim() || "1";
    const inset = parseFloat($("rgInset").value) || 0;
    const along = edge === "top" || edge === "bottom" ? t.w : t.h;
    let pitch = parseFloat($("rgPitch").value);
    let start = parseFloat($("rgStart").value);
    if (!(pitch > 0)) { pitch = along / count; if (isNaN(start)) start = pitch / 2; }
    if (isNaN(start)) start = (along - pitch * (count - 1)) / 2;
    const made = [];
    for (let i = 0; i < count; i++) {
      const a = round(start + pitch * i);
      const pos = { top: [a, inset], bottom: [a, t.h - inset], left: [inset, a], right: [t.w - inset, a] }[edge];
      const id = uid();
      t.terminals.push({ id, name: stepName(first, i), x: round(pos[0]), y: round(pos[1]), side: "auto" });
      made.push(id);
    }
    ed.sel = new Set(made); // the new row is selected, ready to drag into place
    renderAll();
  }

  // Cells of a cols x rows grid in numbering order, as [column, row] pairs counted from the top left.
  // rows / cols / letters wrap row by row or column by column, starting at the pin 1 corner. ccw / cw
  // go around the outside from the pin 1 corner like an IC (2 x 16 counter-clockwise from the top left:
  // down the left side, then up the right), then around each inner ring the same way.
  function gridOrder(cols, rows, mode, corner) {
    const right = corner === "tr" || corner === "br", bottom = corner === "bl" || corner === "br";
    if (mode !== "ccw" && mode !== "cw") {
      const out = [];
      const fc = (c) => (right ? cols - 1 - c : c), fr = (r) => (bottom ? rows - 1 - r : r);
      if (mode === "cols") for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) out.push([fc(c), fr(r), c, r]);
      else for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([fc(c), fr(r), c, r]);
      return out;
    }
    const out = [];
    for (let k = 0; 2 * k < Math.min(cols, rows); k++) {
      const c0 = k, c1 = cols - 1 - k, r0 = k, r1 = rows - 1 - k;
      // Counter-clockwise from the ring's top left: down the left, along the bottom, up the right, back along the top.
      const ring = [];
      const seen = new Set();
      const add = (c, r) => { const key = c + "," + r; if (!seen.has(key)) { seen.add(key); ring.push([c, r]); } };
      for (let r = r0; r <= r1; r++) add(c0, r);
      for (let c = c0 + 1; c <= c1; c++) add(c, r1);
      for (let r = r1 - 1; r >= r0; r--) add(c1, r);
      for (let c = c1 - 1; c > c0; c--) add(c, r0);
      if (mode === "cw") { ring.reverse(); ring.unshift(ring.pop()); } // same cycle the other way, still starting top left
      const start = [right ? c1 : c0, bottom ? r1 : r0];
      const i = Math.max(0, ring.findIndex(([c, r]) => c === start[0] && r === start[1]));
      out.push(...ring.slice(i), ...ring.slice(0, i));
    }
    return out;
  }

  // Labels point away from the grid: in a tall grid the left half faces left and the right half right
  // (a middle column stays automatic); in a wide grid the top half faces up and the bottom half down.
  function gridSide(cols, rows, c, r) {
    const half = (i, n, lo, hi) => (i < (n - 1) / 2 ? lo : i > (n - 1) / 2 ? hi : "auto");
    if (rows > cols) return half(c, cols, "left", "right");
    if (cols > rows) return half(r, rows, "top", "bottom");
    return "auto";
  }

  function addGrid() {
    const t = ed.tpl;
    const cols = Math.max(1, parseInt($("gdCols").value, 10) || 1);
    const rows = Math.max(1, parseInt($("gdRows").value, 10) || 1);
    if (cols * rows > 500) { $("teWarn").textContent = "That's more than 500 terminals; use a smaller grid."; return; }
    const px = parseFloat($("gdPx").value) || 2.54, py = parseFloat($("gdPy").value) || 2.54;
    let left = parseFloat($("gdLeft").value), top = parseFloat($("gdTop").value);
    if (isNaN(left)) left = (t.w - px * (cols - 1)) / 2;
    if (isNaN(top)) top = (t.h - py * (rows - 1)) / 2;
    const mode = $("gdOrder").value, corner = $("gdCorner").value;
    const first = $("gdName").value.trim() || (mode === "letters" ? "A1" : "1");
    // Row letters: the letter counts down the rows from pin 1's row, the number along them from pin 1's column.
    const lm = /^([A-Za-z]?)(\d*)$/.exec(first) || [];
    const letter0 = (lm[1] || "A").charCodeAt(0), num0 = lm[2] ? parseInt(lm[2], 10) : 1;
    remember();
    const made = [];
    gridOrder(cols, rows, mode, corner).forEach(([c, r, ci, ri], i) => {
      const id = uid();
      const name = mode === "letters" ? String.fromCharCode(letter0 + ri) + (num0 + ci) : stepName(first, i);
      t.terminals.push({ id, name, x: round(left + c * px), y: round(top + r * py), side: gridSide(cols, rows, c, r) });
      made.push(id);
    });
    ed.sel = new Set(made); // ready to drag into place
    renderAll();
  }

  // ---------- operations on the selection ----------
  function deleteSelected() {
    if (!ed.sel.size) return;
    remember();
    ed.tpl.terminals = ed.tpl.terminals.filter((x) => !ed.sel.has(x.id));
    ed.sel.clear();
    renderAll();
  }

  function moveSelected(dx, dy) {
    const ts = selected();
    if (!ts.length) return;
    remember();
    for (const t of ts) { t.x = round(t.x + dx); t.y = round(t.y + dy); }
    renderAll();
  }

  // Copies are named on from the last terminal and placed a few snap steps down and right.
  function duplicateSelected() {
    const ts = selected();
    if (!ts.length) return;
    remember();
    const off = Math.max(snapStep() * 4, 2);
    const made = [];
    for (const t of ts) {
      const c = { ...JSON.parse(JSON.stringify(t)), id: uid(), name: nextName(), x: round(t.x + off), y: round(t.y + off) };
      ed.tpl.terminals.push(c);
      made.push(c.id);
    }
    ed.sel = new Set(made);
    renderAll();
  }

  function selBarAction(act) {
    const ts = selected();
    if (!ts.length) return;
    if (act === "del") { deleteSelected(); return; }
    if (act === "dup") { duplicateSelected(); return; }
    remember();
    if (act === "alignY") {
      // Line up on the leftmost terminal's Y.
      const y = ts.slice().sort((a, b) => a.x - b.x)[0].y;
      for (const t of ts) t.y = y;
    } else if (act === "alignX") {
      const x = ts.slice().sort((a, b) => a.y - b.y)[0].x;
      for (const t of ts) t.x = x;
    } else if (act === "space") {
      const xs = ts.map((t) => t.x), ys = ts.map((t) => t.y);
      const k = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? "x" : "y";
      const sorted = ts.slice().sort((a, b) => a[k] - b[k]);
      const a = sorted[0][k], b = sorted[sorted.length - 1][k];
      sorted.forEach((t, i) => { t[k] = round(a + ((b - a) * i) / (sorted.length - 1)); });
    } else if (act === "link") {
      // Use a link one of them already has, otherwise the next unused number.
      const have = ts.map((t) => String(t.link || "").trim()).find(Boolean);
      let v = have;
      if (!v) {
        const used = new Set(ed.tpl.terminals.map((t) => String(t.link || "").trim()));
        let i = 1;
        while (used.has(String(i))) i++;
        v = String(i);
      }
      for (const t of ts) t.link = v;
    }
    renderAll();
  }

  function wire() {
    // Typing in a form field records one undo step per field visit.
    let fieldRemembered = false;
    $("tplModal").addEventListener("focusin", () => { fieldRemembered = false; });
    const before = () => { if (!fieldRemembered) { remember(); fieldRemembered = true; } };
    const bindNum = (id, key) => $(id).addEventListener("input", () => {
      const v = parseFloat($(id).value);
      if (v >= 0) { before(); ed.tpl[key] = v; renderPreview(); updateWarn(); }
    });
    $("teName").addEventListener("input", () => { before(); ed.tpl.name = $("teName").value; });
    $("teCategory").addEventListener("input", () => { before(); ed.tpl.category = $("teCategory").value; });
    $("teMount").addEventListener("change", () => {
      remember();
      if ($("teMount").value === "free") ed.tpl.mount = "free"; else delete ed.tpl.mount;
    });
    $("tePrefix").addEventListener("input", () => { before(); ed.tpl.prefix = $("tePrefix").value.trim(); });
    bindNum("teW", "w");
    bindNum("teH", "h");
    bindNum("teRadius", "radius");
    $("teFill").addEventListener("input", () => { before(); ed.tpl.fill = $("teFill").value; renderPreview(); });
    $("teShowName").addEventListener("change", () => { remember(); ed.tpl.showName = $("teShowName").checked; });
    $("rgAdd").addEventListener("click", addRow);
    $("gdAdd").addEventListener("click", addGrid);
    $("teLinkAll").addEventListener("click", () => { remember(); for (const t of ed.tpl.terminals) t.link = "1"; renderAll(); });
    $("teUnlinkAll").addEventListener("click", () => { remember(); for (const t of ed.tpl.terminals) t.link = ""; renderAll(); });
    $("teSelBar").addEventListener("click", (e) => { const b = e.target.closest("[data-sb]"); if (b) selBarAction(b.dataset.sb); });

    // Preview: click empty space to add a terminal, drag empty space to box-select, drag a terminal to
    // move it with the rest of the selection. Shift or Ctrl click adds or removes from the selection.
    const pv = $("tePreview");
    pv.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const p = svgPoint(e);
      const g = e.target.closest("[data-tid]");
      const toggle = e.shiftKey || e.ctrlKey || e.metaKey;
      pv.focus({ preventScroll: true }); // so Delete, arrows and Esc act on the terminals, not the last text box
      pv.setPointerCapture(e.pointerId);
      if (g) {
        const id = g.dataset.tid;
        if (toggle) {
          const s = new Set(ed.sel);
          s.has(id) ? s.delete(id) : s.add(id);
          setSel(s);
          ed.drag = null;
          return;
        }
        if (!ed.sel.has(id)) setSel([id]);
        const orig = new Map(selected().map((t) => [t.id, { x: t.x, y: t.y }]));
        ed.drag = { type: "move", grab: id, start: p, sx: e.clientX, sy: e.clientY, orig, moved: false, clicked: id };
        return;
      }
      ed.drag = { type: "box", start: p, cur: p, sx: e.clientX, sy: e.clientY, moved: false, base: toggle ? new Set(ed.sel) : new Set() };
    });
    pv.addEventListener("pointermove", (e) => {
      const d = ed && ed.drag;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
      const p = svgPoint(e);
      if (d.type === "move") {
        if (!d.moved) { remember(); d.moved = true; }
        // The grabbed terminal snaps to the grid and the rest keep their spacing. Shift keeps the move straight.
        const o = d.orig.get(d.grab);
        let gx = snap(o.x + p.x - d.start.x), gy = snap(o.y + p.y - d.start.y);
        if (e.shiftKey) { if (Math.abs(p.x - d.start.x) >= Math.abs(p.y - d.start.y)) gy = o.y; else gx = o.x; }
        let dx = gx - o.x, dy = gy - o.y;
        // Keep the whole group inside the outline.
        const os = [...d.orig.values()];
        dx = clamp(dx, -Math.min(...os.map((q) => q.x)), ed.tpl.w - Math.max(...os.map((q) => q.x)));
        dy = clamp(dy, -Math.min(...os.map((q) => q.y)), ed.tpl.h - Math.max(...os.map((q) => q.y)));
        for (const t of ed.tpl.terminals) {
          const q = d.orig.get(t.id);
          if (q) { t.x = round(q.x + dx); t.y = round(q.y + dy); }
        }
      } else {
        d.moved = true;
        d.cur = p;
        const x1 = Math.min(d.start.x, p.x), x2 = Math.max(d.start.x, p.x);
        const y1 = Math.min(d.start.y, p.y), y2 = Math.max(d.start.y, p.y);
        ed.sel = new Set([...d.base, ...ed.tpl.terminals.filter((t) => t.x >= x1 && t.x <= x2 && t.y >= y1 && t.y <= y2).map((t) => t.id)]);
      }
      renderPreview();
    });
    pv.addEventListener("pointerup", (e) => {
      const d = ed && ed.drag;
      if (!d) return;
      ed.drag = null;
      if (d.type === "box" && !d.moved) {
        if (d.base.size || e.shiftKey || e.ctrlKey || e.metaKey) { renderAll(); return; }
        // A plain click on empty space adds a terminal there.
        remember();
        const id = uid();
        ed.tpl.terminals.push({
          id, name: nextName(),
          x: round(clamp(snap(d.start.x), 0, ed.tpl.w)),
          y: round(clamp(snap(d.start.y), 0, ed.tpl.h)), side: "auto",
        });
        ed.sel = new Set([id]);
      } else if (d.type === "move" && !d.moved && ed.sel.size > 1) {
        ed.sel = new Set([d.clicked]); // clicking one of several selected picks just that one
      }
      renderAll();
    });

    const tb = $("teTerms");
    tb.addEventListener("input", (e) => {
      const tr = e.target.closest("tr[data-tid]");
      const k = e.target.dataset.k;
      if (!tr || !k) return;
      before();
      const t = ed.tpl.terminals.find((x) => x.id === tr.dataset.tid);
      // Type, label side and link apply to every selected terminal when the edited row is one of them.
      const targets = ed.sel.has(t.id) && /^(kind|side|link)$/.test(k) ? selected() : [t];
      for (const x of targets) {
        if (k === "name") x.name = e.target.value;
        else if (k === "link") x.link = e.target.value.trim();
        else if (k === "side") x.side = e.target.value;
        else if (k === "kind") x.kind = e.target.value;
        else { const v = parseFloat(e.target.value); if (!isNaN(v)) x[k] = v; }
      }
      if (targets.length > 1 && k === "link") {
        for (const inp of tb.querySelectorAll('tr.sel input[data-k="link"]')) if (inp !== e.target) inp.value = e.target.value.trim();
      }
      renderPreview();
      updateWarn();
    });
    tb.addEventListener("change", (e) => { if (/^(side|kind)$/.test(e.target.dataset.k)) renderTable(); });
    tb.addEventListener("focusin", (e) => {
      const tr = e.target.closest("tr[data-tid]");
      if (tr && !ed.sel.has(tr.dataset.tid)) setSel([tr.dataset.tid]);
    });
    tb.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-tid]");
      if (!tr) return;
      const id = tr.dataset.tid;
      if (e.target.closest("[data-del]")) {
        remember();
        ed.tpl.terminals = ed.tpl.terminals.filter((x) => x.id !== id);
        ed.sel.delete(id);
        renderAll();
      } else if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const s = new Set(ed.sel);
        if (s.has(id) && s.size > 1) s.delete(id); else s.add(id);
        setSel(s);
      } else if (!/INPUT|SELECT/.test(e.target.tagName) && !(ed.sel.size === 1 && ed.sel.has(id))) setSel([id]);
    });

    $("tplModal").addEventListener("keydown", (e) => {
      if (!ed) return;
      const inField = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (k === "Escape") {
        e.stopPropagation();
        if (ed.sel.size && !inField) { setSel([]); return; } // first Esc clears the selection
        close();
        return;
      }
      if (mod && !inField && k.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? restore(ed.redo, ed.undo) : restore(ed.undo, ed.redo); return; }
      if (mod && !inField && k.toLowerCase() === "y") { e.preventDefault(); restore(ed.redo, ed.undo); return; }
      if (inField) return;
      if (mod && k.toLowerCase() === "a") { e.preventDefault(); setSel(ed.tpl.terminals.map((t) => t.id)); }
      else if (mod && k.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(); }
      else if (k === "Delete" || k === "Backspace") { e.preventDefault(); deleteSelected(); }
      else if (k.startsWith("Arrow") && ed.sel.size) {
        e.preventDefault();
        const s = snapStep() * (e.shiftKey ? 10 : 1);
        const v = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[k];
        moveSelected(v[0], v[1]);
      }
    });
    $("tplClose").addEventListener("click", close);
    $("tplCancel").addEventListener("click", close);
    $("tplSave").addEventListener("click", () => {
      const t = ed.tpl;
      t.name = t.name.trim();
      if (!t.name) { $("teWarn").textContent = "Give the object type a name."; $("teName").focus(); return; }
      if (!(t.w > 0 && t.h > 0)) { $("teWarn").textContent = "Width and height must be greater than zero."; return; }
      t.category = (t.category || "").trim() || "Custom";
      const done = ed.opts.onSave;
      const copy = JSON.parse(JSON.stringify(t));
      close();
      done(copy);
    });
    window.addEventListener("resize", () => { if (ed) renderPreview(); });
  }

  document.addEventListener("DOMContentLoaded", wire);
  return { open, close, isOpen: () => !!ed };
})();
