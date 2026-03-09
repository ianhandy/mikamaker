// ─── Constants & Helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = "diagramQuizTemplates";
const PIN_COLORS = ["#e86a22","#f0ab30","#8ab84a","#d8602a","#e8c040","#c85020","#a8c84a","#f07840","#60aa50","#d04010"];

// ─── Title Flee ───────────────────────────────────────────────────────────────

let _titleFleeSpans = [];
(function initTitleFlee() {
  const FLEE_RADIUS = 90;
  const MAX_FLEE = 14;
  document.addEventListener('mousemove', e => {
    _titleFleeSpans.forEach(sp => {
      const r = sp.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = cx - e.clientX, dy = cy - e.clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < FLEE_RADIUS && dist > 0) {
        const force = (FLEE_RADIUS - dist) / FLEE_RADIUS;
        const ox = (dx / dist) * force * MAX_FLEE;
        const oy = (dy / dist) * force * MAX_FLEE;
        sp.style.transform = `translate(${ox}px,${oy}px)`;
      } else {
        sp.style.transform = '';
      }
    });
  });
})();

function pinColor(i) { return PIN_COLORS[i % PIN_COLORS.length]; }
function generateId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function loadTemplates() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"); } catch { return []; } }
function saveTemplates(t) { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); }
function similarity(a, b) {
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const prev = Array.from({length: n+1}, (_,j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++)
      curr[j] = a[i-1]===b[j-1] ? prev[j-1] : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
    prev.splice(0, prev.length, ...curr);
  }
  return 1 - prev[n] / Math.max(m, n);
}
function showToast(text) {
  const t = el("div","toast-bounce",{text});
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1500);
}
function el(tag, cls, attrs={}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.entries(attrs).forEach(([k,v]) => { if(k==="text") e.textContent=v; else if(k==="html") e.innerHTML=v; else e.setAttribute(k,v); });
  return e;
}
function readImageFile(file, cb) {
  const r = new FileReader();
  r.onload = e => cb(e.target.result);
  r.readAsDataURL(file);
}

// ─── Pin Flee Behavior ────────────────────────────────────────────────────────

function setupPinFlee(canvasWrap) {
  const FLEE_RADIUS = 52; // px — distance at which pins start fleeing
  const MAX_FLEE = 5;     // px — max displacement when mouse is right on top

  function updateFlee(clientX, clientY) {
    const rect = canvasWrap.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    canvasWrap.querySelectorAll('.pin').forEach(pin => {
      const px = (parseFloat(pin.style.left) / 100) * rect.width;
      const py = (parseFloat(pin.style.top) / 100) * rect.height;
      const dx = px - mx;
      const dy = py - my;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < FLEE_RADIUS && dist > 0) {
        const force = (FLEE_RADIUS - dist) / FLEE_RADIUS;
        const offset = force * MAX_FLEE;
        const ox = (dx / dist) * offset;
        const oy = (dy / dist) * offset;
        pin.dataset.fleeOx = ox; pin.dataset.fleeOy = oy;
        // Check if parent canvasWrap is being pan/zoomed (has transform with scale)
        const parentScale = canvasWrap.style.transform?.match(/scale\(([^)]+)\)/);
        const invScale = parentScale ? 1/parseFloat(parentScale[1]) : 1;
        pin.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px)) scale(${invScale})`;

        // Show flee tooltip if the pin has one and doesn't already have a permanent tooltip
        if (pin.dataset.fleeTooltip !== undefined && !pin.querySelector('.pin-tooltip')) {
          const tip = document.createElement('div');
          tip.className = 'pin-tooltip flee-tip';
          tip.textContent = pin.dataset.fleeTooltip;
          pin.appendChild(tip);
        }
      } else {
        delete pin.dataset.fleeOx; delete pin.dataset.fleeOy;
        const parentScale2 = canvasWrap.style.transform?.match(/scale\(([^)]+)\)/);
        const invScale2 = parentScale2 ? 1/parseFloat(parentScale2[1]) : 1;
        pin.style.transform = invScale2 !== 1 ? `translate(-50%, -50%) scale(${invScale2})` : '';
        pin.querySelector('.flee-tip')?.remove();
      }
    });
  }

  function clearFlee() {
    const parentScale = canvasWrap.style.transform?.match(/scale\(([^)]+)\)/);
    const invScale = parentScale ? 1/parseFloat(parentScale[1]) : 1;
    canvasWrap.querySelectorAll('.pin').forEach(p => {
      delete p.dataset.fleeOx; delete p.dataset.fleeOy;
      p.style.transform = invScale !== 1 ? `translate(-50%, -50%) scale(${invScale})` : '';
      p.querySelector('.flee-tip')?.remove();
    });
  }

  canvasWrap.addEventListener('mousemove', e => updateFlee(e.clientX, e.clientY));
  canvasWrap.addEventListener('mouseleave', clearFlee);
  canvasWrap.addEventListener('touchmove', e => {
    if (e.touches[0]) updateFlee(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  canvasWrap.addEventListener('touchend', clearFlee);
}

// ─── Pan / Zoom ──────────────────────────────────────────────────────────────

function setupPanZoom(viewport, canvasWrap, pzState) {
  const MIN_ZOOM = 1, MAX_ZOOM = 5;

  function applyTransform() {
    canvasWrap.style.transform = `translate(${pzState.panX}px, ${pzState.panY}px) scale(${pzState.zoom})`;
    // counter-scale every pin so it stays the same visual size
    canvasWrap.querySelectorAll('.pin').forEach(pin => {
      // preserve flee offset if present, otherwise center
      if (!pin.dataset.fleeOx) {
        pin.style.transform = `translate(-50%, -50%) scale(${1/pzState.zoom})`;
      } else {
        const ox = parseFloat(pin.dataset.fleeOx)||0, oy = parseFloat(pin.dataset.fleeOy)||0;
        pin.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px)) scale(${1/pzState.zoom})`;
      }
    });
    // pin-label-popup is inside the counter-scaled pin — it inherits the right scale already
  }

  function clampPan() {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const cw = canvasWrap.scrollWidth * pzState.zoom;
    const ch = canvasWrap.scrollHeight * pzState.zoom;
    if (cw <= vw) pzState.panX = (vw - cw) / 2;
    else pzState.panX = Math.min(0, Math.max(vw - cw, pzState.panX));
    if (ch <= vh) pzState.panY = (vh - ch) / 2;
    else pzState.panY = Math.min(0, Math.max(vh - ch, pzState.panY));
  }

  // Wheel zoom (zoom toward cursor)
  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const oldZoom = pzState.zoom;
    const delta = -e.deltaY * 0.002;
    pzState.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pzState.zoom * (1 + delta)));
    const ratio = pzState.zoom / oldZoom;
    pzState.panX = mx - ratio * (mx - pzState.panX);
    pzState.panY = my - ratio * (my - pzState.panY);
    clampPan(); applyTransform();
  }, { passive: false });

  // Mouse drag to pan
  let dragging = false, lastX, lastY;
  viewport.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    // Don't start drag if clicking a pin or its children
    if (e.target.closest('.pin')) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    viewport.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    pzState.panX += e.clientX - lastX;
    pzState.panY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    clampPan(); applyTransform();
  });
  window.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; viewport.style.cursor = ''; }
  });

  // Touch: pinch zoom + drag pan
  let touches0 = null, startDist = 0, startZoom = 1;
  viewport.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      startDist = Math.sqrt(dx*dx + dy*dy);
      startZoom = pzState.zoom;
      touches0 = { x: (e.touches[0].clientX+e.touches[1].clientX)/2, y: (e.touches[0].clientY+e.touches[1].clientY)/2 };
    } else if (e.touches.length === 1) {
      if (e.target.closest('.pin')) return;
      touches0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, single: true };
    }
  }, { passive: false });
  viewport.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && startDist) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const oldZoom = pzState.zoom;
      pzState.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, startZoom * (dist / startDist)));
      const rect = viewport.getBoundingClientRect();
      const mx = (e.touches[0].clientX+e.touches[1].clientX)/2 - rect.left;
      const my = (e.touches[0].clientY+e.touches[1].clientY)/2 - rect.top;
      const ratio = pzState.zoom / oldZoom;
      pzState.panX = mx - ratio * (mx - pzState.panX);
      pzState.panY = my - ratio * (my - pzState.panY);
      clampPan(); applyTransform();
    } else if (e.touches.length === 1 && touches0?.single) {
      pzState.panX += e.touches[0].clientX - touches0.x;
      pzState.panY += e.touches[0].clientY - touches0.y;
      touches0.x = e.touches[0].clientX; touches0.y = e.touches[0].clientY;
      clampPan(); applyTransform();
    }
  }, { passive: false });
  viewport.addEventListener('touchend', () => { startDist = 0; touches0 = null; });

  // Initial
  clampPan();
  applyTransform();

  return { applyTransform, clampPan };
}

// ─── App State ────────────────────────────────────────────────────────────────

const state = {
  templates: loadTemplates(),
  defaultTemplates: [],
  screen: "home",         // home | creator | matchCreator | quizSetup | quiz | results | matchQuiz
  showTypePicker: false,
  creator: { template: null, imageData: null, pins: [], editingPinId: null, name: "", description: "", pz: {zoom:1,panX:0,panY:0} },
  matchCreator: { template: null, name: "", numCols: 2, numRows: 3, headers: ["Column 1","Column 2"], cells: [] },
  quizTemplate: null,
  quiz: { template:null, settings:{order:"sequential",mode:"freetext"}, queue:[], current:0, results:{}, answered:new Set(), mcOptions:[], mcAnswered:null, feedback:null, hoveredPinId:null },
  matchQuiz: { template:null, colOrders:[], selected:null, dragging:null, checkResult:null, showWrong:false },
  resultsData: null,
};

function navigate(screen) { state.screen = screen; render(); }

// ─── Render dispatcher ────────────────────────────────────────────────────────

function render() {
  const root = document.getElementById("root");
  root.innerHTML = "";

  // Modal overlay for type picker
  if (state.showTypePicker) {
    document.body.appendChild(renderTypePicker());
  } else {
    document.querySelectorAll(".modal-overlay").forEach(m=>m.remove());
  }

  const header = el("div","header");
  const h1 = el("h1");
  const mikaWrap = el("span","title-mika");
  const makerWrap = el("span","title-maker");
  [...'Mika'].forEach(ch => { const s=el("span","fc",{text:ch}); s.style.display="inline-block"; mikaWrap.appendChild(s); });
  [...'Maker'].forEach(ch => { const s=el("span","fc",{text:ch}); s.style.display="inline-block"; makerWrap.appendChild(s); });
  h1.append(mikaWrap, makerWrap);
  _titleFleeSpans = [...h1.querySelectorAll('.fc')];
  header.append(h1, el("p",null,{text:"Make-A-Mika"}));
  root.appendChild(header);

  const map = { home:renderHome, creator:renderCreator, matchCreator:renderMatchCreator, quizSetup:renderQuizSetup, quiz:renderQuiz, results:renderResults, matchQuiz:renderMatchQuiz };
  const screenEl = map[state.screen]?.();
  if (screenEl) root.appendChild(screenEl);
}

// ─── Type Picker Modal ────────────────────────────────────────────────────────

function renderTypePicker() {
  const overlay = el("div","modal-overlay");
  overlay.onclick = e => { if(e.target===overlay){ state.showTypePicker=false; render(); } };
  const modal = el("div","modal");
  modal.innerHTML = `<h3>New Template</h3><p>What kind of quiz template do you want to create?</p>`;
  const picker = el("div","type-picker");

  const diagramCard = el("div","type-card");
  diagramCard.innerHTML = `<div class="type-icon">📍</div><h4>Diagram</h4><p>Upload an image and place labeled pins on it</p>`;
  diagramCard.onclick = () => {
    state.showTypePicker = false;
    state.creator = { template:null, imageData:null, pins:[], editingPinId:null, name:"", description:"", pz:{zoom:1,panX:0,panY:0} };
    navigate("creator");
  };

  const matchCard = el("div","type-card");
  matchCard.innerHTML = `<div class="type-icon">🔀</div><h4>Match</h4><p>Create columns of items for the user to match up</p>`;
  matchCard.onclick = () => {
    state.showTypePicker = false;
    state.matchCreator = { template:null, name:"", numCols:2, numRows:3, headers:["Column 1","Column 2"], cells:initMatchCells(2,3) };
    navigate("matchCreator");
  };

  picker.append(diagramCard, matchCard);
  modal.appendChild(picker);
  overlay.appendChild(modal);
  return overlay;
}

function initMatchCells(cols, rows) {
  const cells = [];
  for (let r=0; r<rows; r++) { const row=[]; for(let c=0;c<cols;c++) row.push({type:"text",value:""}); cells.push(row); }
  return cells;
}

// ─── Home ─────────────────────────────────────────────────────────────────────

function renderHome() {
  const wrap = el("div");
  const topRow = el("div","row");

  const btnNew = el("button","btn btn-primary",{text:"＋ New Template"});
  btnNew.onclick = () => { state.showTypePicker = true; render(); };

  const btnImport = el("button","btn btn-ghost",{text:"⬆ Import Template"});
  const importInput = el("input",null,{type:"file",accept:".json"});
  importInput.style.display="none";
  importInput.onchange = e => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => { try { const t=JSON.parse(ev.target.result); t.id=generateId(); state.templates.push(t); saveTemplates(state.templates); render(); } catch { alert("Invalid template file."); } };
    reader.readAsText(file); importInput.value="";
  };
  btnImport.onclick = () => importInput.click();
  const btnShared = el("a","btn btn-sky",{text:"📂 Shared Templates",href:"https://drive.google.com/drive/folders/16rBS93rAXGF2VPtY2lJhZRvBMnbXSP6u?usp=drive_link",target:"_blank",rel:"noopener noreferrer"});
  const helpTip = el("div","help-tip");
  helpTip.innerHTML = `<span class="help-tip-icon">?</span><div class="help-tip-bubble">Download the .json file of the template you'd like to use, then press <strong>Import Template</strong> and select the file you just downloaded. This only needs to be done once per device.</div>`;
  topRow.append(btnNew, btnImport, btnShared, helpTip, importInput);
  wrap.appendChild(topRow);

  if (!state.templates.length) {
    const empty = el("div","card mt24 empty-state");
    empty.innerHTML = `<div class="empty-icon">🫀</div><p>No templates yet. Create one or import a JSON file.</p>`;
    wrap.appendChild(empty);
  } else {
    const grid = el("div","template-grid");
    state.templates.forEach(t => {
      const card = el("div","template-card");
      const isMatch = t.type === "match";

      const thumb = el("div", isMatch ? "template-card-thumb match-thumb" : "template-card-thumb");
      if (isMatch) { thumb.innerHTML = `<span style="font-size:2rem">🔀</span>`; }
      else if (t.imageData) { const img=el("img",null,{src:t.imageData,alt:t.name}); thumb.appendChild(img); }
      else { thumb.textContent="🖼️"; }

      const h3 = el("h3",null,{text:t.name});
      const badge = el("span", isMatch?"badge badge-lavender":"badge badge-coral", {text: isMatch?"Match":"Diagram"});
      badge.style.marginBottom="4px";
      const p = el("p",null,{text: isMatch ? `${t.columns.length} cols · ${t.rows.length} rows` : `${t.pins.length} label${t.pins.length!==1?"s":""}`});

      const actions = el("div","template-card-actions");
      const btnQuiz = el("button","btn btn-primary btn-sm",{text:"▶ Quiz"});
      btnQuiz.onclick = e => { e.stopPropagation(); if(isMatch) startMatchQuiz(t); else { state.quizTemplate=t; navigate("quizSetup"); } };
      const btnEdit = el("button","btn btn-ghost btn-sm",{text:"✏ Edit"});
      btnEdit.onclick = e => {
        e.stopPropagation();
        if (isMatch) {
          state.matchCreator = { template:t, name:t.name, numCols:t.columns.length, numRows:t.rows.length, headers:[...t.columns], cells:t.rows.map(r=>r.map(c=>({...c}))) };
          navigate("matchCreator");
        } else {
          state.creator = { template:t, imageData:t.imageData, pins:t.pins.map(p=>({...p})), editingPinId:null, name:t.name, description:t.description||"", pz:{zoom:1,panX:0,panY:0} };
          navigate("creator");
        }
      };
      const btnExport = el("button","btn btn-ghost btn-sm",{text:"⬇"});
      btnExport.onclick = e => { e.stopPropagation(); exportTemplate(t); };
      const btnDel = el("button","btn btn-danger btn-sm",{text:"🗑"});
      btnDel.onclick = e => { e.stopPropagation(); if(confirm(`Delete "${t.name}"?`)){ state.templates=state.templates.filter(x=>x.id!==t.id); saveTemplates(state.templates); render(); } };

      actions.append(btnQuiz, btnEdit, btnExport, btnDel);
      card.append(thumb, badge, h3, p, actions);
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
  }

  // ── Default templates section ──────────────────────────────────────────────
  if (state.defaultTemplates.length) {
    const divider = el("div","divider"); divider.style.marginTop="32px";
    wrap.appendChild(divider);

    const defLabel = el("div","section-label mt16",{text:"Default Templates"});
    wrap.appendChild(defLabel);

    const defGrid = el("div","template-grid");
    state.defaultTemplates.forEach(t => {
      const card = el("div","template-card");
      const isMatch = t.type === "match";

      const thumb = el("div", isMatch ? "template-card-thumb match-thumb" : "template-card-thumb");
      if (isMatch) { thumb.innerHTML = `<span style="font-size:2rem">🔀</span>`; }
      else if (t.imageData) { const img=el("img",null,{src:t.imageData,alt:t.name}); thumb.appendChild(img); }
      else { thumb.textContent="🖼️"; }

      const badgeRow = el("div","row",{}); badgeRow.style.gap="6px"; badgeRow.style.marginBottom="4px";
      const typeBadge = el("span", isMatch?"badge badge-lavender":"badge badge-coral", {text: isMatch?"Match":"Diagram"});
      const defBadge = el("span","badge badge-sage",{text:"Default"});
      badgeRow.append(typeBadge, defBadge);

      const h3 = el("h3",null,{text:t.name});
      const p = el("p",null,{text: isMatch ? `${t.columns.length} cols · ${t.rows.length} rows` : `${t.pins.length} label${t.pins.length!==1?"s":""}`});

      const actions = el("div","template-card-actions");
      const btnQuiz = el("button","btn btn-primary btn-sm",{text:"▶ Quiz"});
      btnQuiz.onclick = e => { e.stopPropagation(); if(isMatch) startMatchQuiz(t); else { state.quizTemplate=t; navigate("quizSetup"); } };
      // Copy to My Templates button
      const btnCopy = el("button","btn btn-ghost btn-sm",{text:"＋ Copy"});
      btnCopy.title = "Copy to My Templates";
      btnCopy.onclick = e => {
        e.stopPropagation();
        const copy = JSON.parse(JSON.stringify(t));
        copy.id = generateId();
        state.templates.push(copy);
        saveTemplates(state.templates);
        render();
      };

      actions.append(btnQuiz, btnCopy);
      card.append(thumb, badgeRow, h3, p, actions);
      defGrid.appendChild(card);
    });
    wrap.appendChild(defGrid);
  }

  return wrap;
}

function exportTemplate(tpl) {
  const blob = new Blob([JSON.stringify(tpl,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=`${tpl.name.replace(/\s+/g,"_")}.json`; a.click(); URL.revokeObjectURL(url);
}

// ─── Diagram Creator ──────────────────────────────────────────────────────────

function renderCreator() {
  const c = state.creator;
  const wrap = el("div");
  const topbar = el("div","topbar");
  const btnBack = el("button","btn btn-ghost btn-sm",{text:"← Back"}); btnBack.onclick=()=>navigate("home");
  const h2 = el("h2",null,{text: c.template?"Edit Template":"New Template"});
  const btnSave = el("button","btn btn-primary",{text:"Save Template"}); btnSave.onclick=saveCreatorTemplate;
  topbar.append(btnBack,h2,btnSave); wrap.appendChild(topbar);

  const col = el("div","col");
  const nameCard = el("div","card");
  const nameLabel = el("div","section-label",{text:"Template Name"});
  const nameInput = el("input","input mt8",{type:"text",placeholder:"e.g. Leg Vasculature",value:c.name??""});
  nameInput.id="creator-name";
  nameInput.oninput = e => { state.creator.name = e.target.value; };
  nameCard.append(nameLabel,nameInput); col.appendChild(nameCard);

  if (!c.imageData) col.appendChild(renderDropzone());
  else col.appendChild(renderCanvasEditor());

  wrap.appendChild(col);
  return wrap;
}

function renderDropzone() {
  const dz = el("div","dropzone");
  dz.innerHTML=`<div class="dropzone-icon">🖼️</div><div class="dropzone-title">Upload Diagram Image</div><div class="text-muted">Click or drag &amp; drop a PNG, JPG, or SVG</div>`;
  dz.ondragover=e=>{e.preventDefault();dz.classList.add("drag-over");};
  dz.ondragleave=()=>dz.classList.remove("drag-over");
  dz.ondrop=e=>{e.preventDefault();dz.classList.remove("drag-over");const f=e.dataTransfer.files[0];if(f)loadImageFile(f);};
  dz.onclick=()=>{const i=document.createElement("input");i.type="file";i.accept="image/*";i.onchange=e=>{if(e.target.files[0])loadImageFile(e.target.files[0]);};i.click();};
  return dz;
}

function loadImageFile(file) { readImageFile(file, d=>{ state.creator.imageData=d; render(); }); }

function renderCanvasEditor() {
  const c = state.creator;
  const pz = c.pz;
  const card = el("div","card");
  const headerRow = el("div","row"); headerRow.style.marginBottom="12px";
  const lbl = el("div","section-label flex1",{text:"Place Labels — click the image to add a pin"});
  const btnChange = el("button","btn btn-ghost btn-sm",{text:"Change Image"});
  btnChange.onclick=()=>{state.creator.imageData=null;state.creator.pins=[];render();};
  headerRow.append(lbl,btnChange); card.appendChild(headerRow);

  const row = el("div","creator-canvas-row");
  const canvasCol = el("div","creator-canvas-col");

  const viewport = el("div","canvas-zoom-viewport");
  const canvasWrap = el("div","image-canvas-wrap"); canvasWrap.id="canvas-wrap";
  canvasWrap.style.transformOrigin = "0 0";
  const img = el("img",null,{src:c.imageData,alt:"diagram"}); img.draggable=false;
  canvasWrap.appendChild(img);
  c.pins.filter(p=>p.label||p.id===c.editingPinId).forEach((pin,i)=>canvasWrap.appendChild(makeCreatorPin(pin,i,img)));

  // Track mousedown position to distinguish click from drag
  let mdX, mdY;
  canvasWrap.addEventListener('mousedown', e => { mdX = e.clientX; mdY = e.clientY; });
  canvasWrap.addEventListener('click', e => {
    // Ignore if it was a drag (moved more than 5px)
    if (Math.abs(e.clientX - mdX) > 5 || Math.abs(e.clientY - mdY) > 5) return;
    if(c.editingPinId) return;
    if(e.target.closest('.pin')) return;
    const rect=img.getBoundingClientRect();
    const x=((e.clientX-rect.left)/rect.width)*100;
    const y=((e.clientY-rect.top)/rect.height)*100;
    const newPin={id:generateId(),x,y,label:""};
    c.pins.push(newPin); c.editingPinId=newPin.id; render();
    setTimeout(()=>document.getElementById("pin-edit-input")?.focus(),30);
  });

  viewport.appendChild(canvasWrap);
  canvasCol.appendChild(viewport);

  // Reset zoom button
  const pzRef = {};
  const zoomRow = el("div","row mt8"); zoomRow.style.justifyContent = "flex-end";
  const btnResetZoom = el("button","btn btn-ghost btn-sm",{text:"↺ 100%"});
  btnResetZoom.onclick = () => {
    pz.zoom = 1; pz.panX = 0; pz.panY = 0;
    pzRef.clamp?.(); pzRef.apply?.();
  };
  zoomRow.appendChild(btnResetZoom);
  canvasCol.appendChild(zoomRow);

  // Set up pan/zoom after appending to DOM (need layout dimensions)
  setTimeout(() => { const r = setupPanZoom(viewport, canvasWrap, pz); pzRef.apply = r.applyTransform; pzRef.clamp = r.clampPan; }, 0);

  if (c.editingPinId) {
    const editRow=el("div","row mt8");
    const btnConfirm=el("button","btn btn-sage btn-sm",{text:"✓ Confirm"}); btnConfirm.onclick=confirmPinLabel;
    const btnCancel=el("button","btn btn-ghost btn-sm",{text:"✕ Cancel"}); btnCancel.onclick=cancelPinEdit;
    const hint=el("span","text-muted",{text:"Enter to confirm, Esc to cancel"});
    editRow.append(btnConfirm,btnCancel,hint); canvasCol.appendChild(editRow);
  }

  const sidebar=el("div","creator-sidebar");
  const labeledPins=c.pins.filter(p=>p.label);
  sidebar.appendChild(el("div","section-label",{text:`${labeledPins.length} Labels`}));
  const pinList=el("div","pin-list mt8");
  if(!labeledPins.length) pinList.appendChild(el("div","text-muted",{text:"Click the image to add pins"}));
  else labeledPins.forEach((pin,i)=>{
    const item=el("div","pin-list-item");
    const dot=el("div","pin-dot",{text:String(i+1)}); dot.style.background=pinColor(i);
    const span=el("span","pin-item-label",{text:pin.label});
    const btnX=el("button","btn btn-ghost btn-sm",{text:"✕"}); btnX.style.padding="2px 8px";
    btnX.onclick=()=>{c.pins=c.pins.filter(p=>p.id!==pin.id);render();};
    item.append(dot,span,btnX); pinList.appendChild(item);
  });
  sidebar.appendChild(pinList);

  sidebar.appendChild(el("div","section-label mt16",{text:"Quiz Description"}));
  const descInput = el("textarea","input mt8",{placeholder:"Optional — shown at the top of the quiz…"});
  descInput.style.fontSize="0.85rem"; descInput.rows=3; descInput.style.resize="vertical";
  descInput.value = c.description || "";
  descInput.oninput = e => { state.creator.description = e.target.value; };
  sidebar.appendChild(descInput);

  row.append(canvasCol,sidebar); card.appendChild(row);
  return card;
}

function makeCreatorPin(pin,i,img) {
  const c=state.creator;
  const isEditing=pin.id===c.editingPinId;
  const num=c.pins.filter((p,idx)=>p.label&&idx<c.pins.indexOf(pin)).length+1;
  const pinEl=el("div",`pin${isEditing?" active":""}`,{text:String(num)});
  pinEl.style.left=`${pin.x}%`; pinEl.style.top=`${pin.y}%`; pinEl.style.background=pinColor(i);
  pinEl.onclick=e=>e.stopPropagation();
  if(isEditing){
    const popup=el("div","pin-label-popup"); popup.onclick=e=>e.stopPropagation();
    const input=el("input",null,{type:"text",placeholder:"Label…",id:"pin-edit-input"});
    if(pin.label) input.value=pin.label; // pre-fill when renaming
    input.onkeydown=e=>{if(e.key==="Enter")confirmPinLabel();if(e.key==="Escape")cancelPinEdit();};
    popup.appendChild(input); pinEl.appendChild(popup);
    // Draggable even while editing — popup fades during drag
    pinEl.style.cursor='grab';
    pinEl.addEventListener('mousedown', e=>{
      if(e.button!==0||e.target.closest('.pin-label-popup')) return;
      e.stopPropagation(); pinEl.style.cursor='grabbing';
      popup.style.transition='opacity 0.12s'; popup.style.opacity='0.15'; popup.style.pointerEvents='none';
      const onMove=e=>{
        const rect=img.getBoundingClientRect();
        const x=Math.max(0,Math.min(100,(e.clientX-rect.left)/rect.width*100));
        const y=Math.max(0,Math.min(100,(e.clientY-rect.top)/rect.height*100));
        pin.x=x; pin.y=y; pinEl.style.left=`${x}%`; pinEl.style.top=`${y}%`;
      };
      const onUp=()=>{
        pinEl.style.cursor='grab'; popup.style.opacity='1'; popup.style.pointerEvents='';
        document.getElementById("pin-edit-input")?.focus();
        window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp);
      };
      window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp);
    });
  } else {
    // Drag to reposition; click (no drag) to rename
    pinEl.style.cursor='grab';
    let wasDragged=false;
    pinEl.addEventListener('mousedown', e=>{
      if(e.button!==0) return;
      wasDragged=false;
      e.stopPropagation(); pinEl.style.cursor='grabbing';
      const sx=e.clientX, sy=e.clientY;
      const onMove=e=>{
        if(Math.abs(e.clientX-sx)>3||Math.abs(e.clientY-sy)>3) wasDragged=true;
        const rect=img.getBoundingClientRect();
        const x=Math.max(0,Math.min(100,(e.clientX-rect.left)/rect.width*100));
        const y=Math.max(0,Math.min(100,(e.clientY-rect.top)/rect.height*100));
        pin.x=x; pin.y=y; pinEl.style.left=`${x}%`; pinEl.style.top=`${y}%`;
      };
      const onUp=()=>{ pinEl.style.cursor='grab'; window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); };
      window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp);
    });
    pinEl.addEventListener('click', e=>{
      e.stopPropagation();
      if(!wasDragged){ c.editingPinId=pin.id; render(); setTimeout(()=>document.getElementById("pin-edit-input")?.focus(),30); }
    });
  }
  return pinEl;
}

function confirmPinLabel() {
  const c=state.creator;
  const input=document.getElementById("pin-edit-input");
  const val=input?input.value.trim():"";
  const pin=c.pins.find(p=>p.id===c.editingPinId);
  if(val){ if(pin) pin.label=val; }
  else if(pin&&!pin.label) c.pins=c.pins.filter(p=>p.id!==c.editingPinId); // delete only if brand new
  // if val is empty but pin had an existing label, keep the old label
  c.editingPinId=null; render();
}

function cancelPinEdit() {
  const c=state.creator;
  const pin=c.pins.find(p=>p.id===c.editingPinId);
  if(pin&&!pin.label) c.pins=c.pins.filter(p=>p.id!==c.editingPinId); // only delete if new (no label yet)
  c.editingPinId=null; render();
}

function saveCreatorTemplate() {
  const c=state.creator;
  const name=(state.creator.name??document.getElementById("creator-name")?.value??"").trim();
  if(!name){alert("Give your template a name.");return;}
  if(!c.imageData){alert("Please upload an image.");return;}
  const labeledPins=c.pins.filter(p=>p.label);
  if(labeledPins.length<2){alert("Add at least 2 labels.");return;}
  const tpl={id:c.template?.id||generateId(),type:"diagram",name,description:c.description||"",imageData:c.imageData,pins:labeledPins};
  const idx=state.templates.findIndex(t=>t.id===tpl.id);
  if(idx>=0) state.templates[idx]=tpl; else state.templates.push(tpl);
  saveTemplates(state.templates); navigate("home");
}

// ─── Match Creator ────────────────────────────────────────────────────────────

function renderMatchCreator() {
  const mc = state.matchCreator;
  const wrap = el("div");

  const topbar = el("div","topbar");
  const btnBack = el("button","btn btn-ghost btn-sm",{text:"← Back"}); btnBack.onclick=()=>navigate("home");
  const h2 = el("h2",null,{text: mc.template?"Edit Match Template":"New Match Template"});
  const btnSave = el("button","btn btn-primary",{text:"Save Template"}); btnSave.onclick=saveMatchTemplate;
  topbar.append(btnBack,h2,btnSave); wrap.appendChild(topbar);

  const col = el("div","col");

  // Name card
  const nameCard = el("div","card");
  const nameLabel = el("div","section-label",{text:"Template Name"});
  const nameInput = el("input","input mt8",{type:"text",placeholder:"e.g. Anatomy Terms",value:mc.name});
  nameInput.oninput=e=>{state.matchCreator.name=e.target.value;};
  nameCard.append(nameLabel,nameInput); col.appendChild(nameCard);

  // Dimensions card
  const dimCard = el("div","card");
  const dimRow = el("div","row");

  const colsWrap = el("div","col flex1");
  colsWrap.appendChild(el("div","section-label",{text:"Columns (2–10)"}));
  const colsInput = el("input","input mt8",{type:"number",value:String(mc.numCols)});
  colsInput.min="2"; colsInput.max="10";
  colsInput.oninput=e=>{
    const v=Math.max(2,Math.min(10,parseInt(e.target.value)||2));
    const diff=v-mc.numCols;
    if(diff>0){ mc.headers=[...mc.headers,...Array(diff).fill("").map((_,i)=>`Column ${mc.numCols+i+1}`)]; mc.cells=mc.cells.map(row=>[...row,...Array(diff).fill(null).map(()=>({type:"text",value:""}))]);  }
    else if(diff<0){ mc.headers=mc.headers.slice(0,v); mc.cells=mc.cells.map(row=>row.slice(0,v)); }
    mc.numCols=v; render();
  };
  colsWrap.appendChild(colsInput);

  const rowsWrap = el("div","col flex1");
  rowsWrap.appendChild(el("div","section-label",{text:"Rows (2–20)"}));
  const rowsInput = el("input","input mt8",{type:"number",value:String(mc.numRows)});
  rowsInput.min="2"; rowsInput.max="20";
  rowsInput.oninput=e=>{
    const v=Math.max(2,Math.min(20,parseInt(e.target.value)||2));
    const diff=v-mc.numRows;
    if(diff>0){ mc.cells=[...mc.cells,...Array(diff).fill(null).map(()=>Array(mc.numCols).fill(null).map(()=>({type:"text",value:""})))]; }
    else if(diff<0){ mc.cells=mc.cells.slice(0,v); }
    mc.numRows=v; render();
  };
  rowsWrap.appendChild(rowsInput);

  dimRow.append(colsWrap,rowsWrap);
  dimCard.append(el("div","section-label",{text:"Grid Dimensions"}), dimRow);
  col.appendChild(dimCard);

  // Grid editor card
  const gridCard = el("div","card");
  gridCard.appendChild(el("div","section-label",{text:"Fill in the grid — first column is the anchor (shown during quiz)"}));

  const gridWrap = el("div","match-grid-editor");
  const table = el("table","match-table");

  // Header row
  const thead = el("thead"); const headerRow = el("tr");
  const numTh = el("th"); numTh.style.width="32px"; headerRow.appendChild(numTh);
  for(let c=0;c<mc.numCols;c++){
    const th = el("th", c===0?"anchor-col":"");
    const inp = el("input","col-header-input",{type:"text",placeholder:`Col ${c+1}`,value:mc.headers[c]||""});
    inp.oninput=((ci)=>e=>{state.matchCreator.headers[ci]=e.target.value;})(c);
    th.appendChild(inp); headerRow.appendChild(th);
  }
  thead.appendChild(headerRow); table.appendChild(thead);

  // Body rows
  const tbody = el("tbody");
  for(let r=0;r<mc.numRows;r++){
    const tr = el("tr");
    const numTd = el("td"); const numEl = el("div","match-row-num",{text:String(r+1)}); numTd.appendChild(numEl); tr.appendChild(numTd);
    for(let c=0;c<mc.numCols;c++){
      const cell = mc.cells[r]?.[c]||{type:"text",value:""};
      const td = el("td");
      td.appendChild(makeMatchCellEditor(r,c,cell));
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody); gridWrap.appendChild(table);
  gridCard.appendChild(gridWrap);
  col.appendChild(gridCard);

  wrap.appendChild(col);
  return wrap;
}

function makeMatchCellEditor(r,c,cell) {
  const wrap = el("div","match-cell-editor");

  // Type toggle
  const typeRow = el("div","match-cell-type-toggle");
  const btnText = el("button",`match-cell-type-btn${cell.type==="text"?" active":""}`,{text:"Text"});
  const btnImg  = el("button",`match-cell-type-btn${cell.type==="image"?" active":""}`,{text:"Image"});
  btnText.onclick=()=>{ state.matchCreator.cells[r][c]={type:"text",value:""}; render(); };
  btnImg.onclick=()=>{ state.matchCreator.cells[r][c]={type:"image",value:""}; render(); };
  typeRow.append(btnText,btnImg); wrap.appendChild(typeRow);

  if(cell.type==="text"){
    const inp = el("textarea","match-cell-input",{placeholder:"Enter text…"});
    inp.rows=2; inp.value=cell.value||"";
    inp.oninput=((ri,ci)=>e=>{state.matchCreator.cells[ri][ci].value=e.target.value;})(r,c);
    wrap.appendChild(inp);
  } else {
    if(cell.value){
      const img = el("img","match-cell-img-preview",{src:cell.value,alt:"cell image"});
      wrap.appendChild(img);
    }
    const btnUpload = el("button","btn btn-ghost btn-sm",{text: cell.value?"Change":"Upload Image"});
    btnUpload.style.width="100%"; btnUpload.style.justifyContent="center";
    btnUpload.onclick=()=>{
      const inp=document.createElement("input"); inp.type="file"; inp.accept="image/*";
      inp.onchange=e=>{if(e.target.files[0]) readImageFile(e.target.files[0],d=>{state.matchCreator.cells[r][c].value=d;render();});};
      inp.click();
    };
    wrap.appendChild(btnUpload);
  }
  return wrap;
}

function saveMatchTemplate() {
  const mc = state.matchCreator;
  const name = mc.name.trim();
  if(!name){alert("Give your template a name.");return;}
  // validate: every cell must have a value
  for(let r=0;r<mc.numRows;r++){
    for(let c=0;c<mc.numCols;c++){
      if(!mc.cells[r]?.[c]?.value?.trim()){alert(`Row ${r+1}, Column ${mc.numCols>1?c+1:c+1} is empty.`);return;}
    }
  }
  const tpl = {
    id: mc.template?.id||generateId(),
    type:"match",
    name,
    columns: mc.headers.map((h,i)=>h||`Column ${i+1}`),
    rows: mc.cells.map(row=>row.map(c=>({...c,value:c.value}))),
  };
  const idx=state.templates.findIndex(t=>t.id===tpl.id);
  if(idx>=0) state.templates[idx]=tpl; else state.templates.push(tpl);
  saveTemplates(state.templates); navigate("home");
}

// ─── Diagram Quiz Setup ───────────────────────────────────────────────────────

function renderQuizSetup() {
  const wrap = el("div");
  const topbar = el("div","topbar");
  const btnBack=el("button","btn btn-ghost btn-sm",{text:"← Back"}); btnBack.onclick=()=>navigate("home");
  const h2=el("h2",null,{text:state.quizTemplate.name});
  topbar.append(btnBack,h2); wrap.appendChild(topbar);

  if (state.quizTemplate.description) {
    const descCard = el("div","quiz-description-card"); descCard.style.marginBottom="16px";
    descCard.textContent = state.quizTemplate.description;
    wrap.appendChild(descCard);
  }

  const card=el("div","card"); card.style.maxWidth="480px";
  const orderLabel=el("div","section-label",{text:"Question Order"});
  const orderToggle=makeToggle([{val:"sequential",label:"Sequential"},{val:"random",label:"Random"}],"sequential");
  orderToggle.id="order-toggle";
  const modeLabel=el("div","section-label mt16",{text:"Answer Mode"});
  const modeToggle=makeToggle([{val:"freetext",label:"Free Text"},{val:"multiplechoice",label:"Multiple Choice"}],"freetext");
  modeToggle.id="mode-toggle";
  const optLabel=el("div","section-label mt16",{text:"Options"});
  const ceRow=el("div","checkbox-row mt8");
  const ceCheck=el("input",null,{type:"checkbox",id:"close-enough-check"}); ceCheck.checked=true;
  const ceLbl=el("label","checkbox-label",{text:'Close Enough (accept answers with mostly correct spelling)'});
  ceLbl.setAttribute("for","close-enough-check");
  ceRow.append(ceCheck,ceLbl);
  const divider=el("div","divider");
  const hint=el("div","text-muted",{text:`${state.quizTemplate.pins.length} labels to quiz on.`});
  const btnStart=el("button","btn btn-primary btn-full mt8",{text:"▶ Start Quiz"});
  btnStart.onclick=()=>{
    const order=orderToggle.dataset.value||"sequential";
    const mode=modeToggle.dataset.value||"freetext";
    const closeEnough=document.getElementById("close-enough-check")?.checked??true;
    startDiagramQuiz(state.quizTemplate,{order,mode,closeEnough});
  };
  card.append(orderLabel,orderToggle,modeLabel,modeToggle,optLabel,ceRow,divider,hint,btnStart);
  wrap.appendChild(card);
  return wrap;
}

function makeToggle(options, defaultVal) {
  const group=el("div","toggle-group mt8"); group.dataset.value=defaultVal;
  options.forEach(({val,label})=>{
    const btn=el("button",`toggle-option${val===defaultVal?" selected":""}`,{text:label});
    btn.onclick=()=>{ group.querySelectorAll(".toggle-option").forEach(b=>b.classList.remove("selected")); btn.classList.add("selected"); group.dataset.value=val; };
    group.appendChild(btn);
  });
  return group;
}

// ─── Diagram Quiz ─────────────────────────────────────────────────────────────

function startDiagramQuiz(template, settings) {
  let remaining=[...template.pins];
  if(settings.order==="random") remaining=shuffle(remaining);
  state.quiz={template,settings,remaining,results:{},answered:new Set(),mcOptions:[],mcAnswered:null,feedback:null,hoveredPinId:null,pz:{zoom:1,panX:0,panY:0}};
  generateMCOptions(); navigate("quiz");
}

function generateMCOptions() {
  const q=state.quiz;
  if(q.settings.mode!=="multiplechoice") return;
  const pin=q.remaining[0]; if(!pin) return;
  const others=q.template.pins.filter(p=>p.id!==pin.id).map(p=>p.label);
  q.mcOptions=shuffle([pin.label,...shuffle(others).slice(0,3)]);
  q.mcAnswered=null;
}

function renderQuiz() {
  const q=state.quiz;
  const pin=q.remaining[0];
  if(!pin){finishDiagramQuiz();return el("div");}

  const wrap=el("div");
  const topbar=el("div","topbar");
  const progWrap=el("div","flex1");
  const doneCount=Object.keys(q.results).length;
  const total=q.template.pins.length;
  const progInfo=el("div","row"); progInfo.style.marginBottom="6px";
  const progText=el("span","text-muted",{text:`${doneCount} / ${total} answered`}); progText.style.fontSize="0.82rem";
  const badge=el("span","badge badge-coral",{text:q.template.name}); badge.style.marginLeft="auto";
  progInfo.append(progText,badge);
  const barWrap=el("div","progress-bar-wrap");
  const barFill=el("div","progress-bar-fill"); barFill.style.width=`${Math.round((doneCount/total)*100)}%`;
  barWrap.appendChild(barFill); progWrap.append(progInfo,barWrap);
  const btnQuit=el("button","btn btn-ghost btn-sm",{text:"✕ Quit"});
  btnQuit.style.alignSelf="flex-start"; btnQuit.style.flexShrink="0";
  btnQuit.onclick=()=>{ if(confirm("Quit the quiz? Your progress will be lost.")) navigate("home"); };
  topbar.append(progWrap,btnQuit); wrap.appendChild(topbar);

  const mainRow=el("div","quiz-main-row");
  const diagCol=el("div","quiz-diagram-col");

  const pz = q.pz;
  const viewport = el("div","canvas-zoom-viewport");
  const canvasWrap=el("div","image-canvas-wrap no-crosshair");
  canvasWrap.style.transformOrigin = "0 0";
  const img=el("img",null,{src:q.template.imageData,alt:"diagram"}); img.draggable=false;
  canvasWrap.appendChild(img);

  q.template.pins.forEach((p,i)=>{
    const status=q.results[p.id]; const isActive=p.id===pin.id;
    const classes=["pin"]; if(isActive)classes.push("active"); if(status==="correct")classes.push("correct"); else if(status==="wrong")classes.push("incorrect"); else if(status==="revealed")classes.push("revealed"); else if(status==="skipped")classes.push("skipped-pin");
    const pinEl=el("div",classes.join(" "),{text:String(i+1)});
    pinEl.style.left=`${p.x}%`; pinEl.style.top=`${p.y}%`;
    if(!status) { pinEl.style.background=pinColor(i); }
    if(status){ const tip=el("div","pin-tooltip",{text:p.label}); pinEl.appendChild(tip); }
    canvasWrap.appendChild(pinEl);
  });
  setupPinFlee(canvasWrap);
  viewport.appendChild(canvasWrap);
  diagCol.appendChild(viewport);
  setTimeout(() => setupPanZoom(viewport, canvasWrap, pz), 0);
  mainRow.appendChild(diagCol);

  const panelCol=el("div","quiz-panel-col col");
  if (q.template.description) {
    const descDetails=el("details","panel-collapsible"); descDetails.open=true;
    const descSummary=el("summary","panel-collapsible-summary",{text:"Description"});
    const descCard=el("div","quiz-description-card"); descCard.textContent=q.template.description;
    descDetails.append(descSummary,descCard); panelCol.appendChild(descDetails);
  }
  const listDetails=el("details","panel-collapsible"); listDetails.open=true;
  const listSummary=el("summary","panel-collapsible-summary",{text:"Labels"});
  const listCard=el("div","card"); listCard.style.padding="16px";
  const pinList=el("div","pin-list"); pinList.style.maxHeight="220px"; pinList.style.overflowY="auto";
  q.template.pins.forEach((p,i)=>{
    const status=q.results[p.id]; const isActive=p.id===pin.id;
    const item=el("div",`pin-list-item${isActive?" active-item":""}`);
    const dot=el("div","pin-dot",{text:String(i+1)});
    dot.style.background=status==="correct"||status==="closeenough"?"var(--sage)":status==="revealed"?"var(--gold)":status==="wrong"?"#f28b82":pinColor(i);
    const labelText=status?p.label:isActive?"← Answer this":"—";
    const span=el("span","pin-item-label",{text:labelText}); if(!status&&!isActive) span.style.color="var(--text-muted)";
    item.append(dot,span);
    if(status==="correct") item.appendChild(el("span",null,{text:"✅"}));
    if(status==="closeenough") item.appendChild(el("span",null,{text:"🤷"}));
    if(status==="revealed") item.appendChild(el("span",null,{text:"💡"}));
    pinList.appendChild(item);
  });
  listCard.appendChild(pinList); listDetails.append(listSummary,listCard); panelCol.appendChild(listDetails);

  const answerCard=el("div","card quiz-answer-card"); answerCard.style.padding="16px";
  if(!q.initialScrollDone){ q.initialScrollDone=true; setTimeout(()=>{ const ac=document.querySelector(".quiz-answer-card"); if(ac){ const over=ac.getBoundingClientRect().bottom-window.innerHeight+20; if(over>0) window.scrollTo({top:window.scrollY+over,behavior:"smooth"}); } },80); }
  const qLabel=el("div","section-label",{text:`What is pin #${q.template.pins.indexOf(pin)+1}?`}); qLabel.style.marginBottom="8px";
  answerCard.appendChild(qLabel);

  if(q.settings.mode==="freetext"){
    const textInput=el("input","input",{type:"text",placeholder:"Type your answer…",id:"quiz-text-input"});
    if(q.feedback==="correct"||q.feedback==="closeenough") textInput.disabled=true;
    textInput.onkeydown=e=>{if(e.key==="Enter")handleTextSubmit();};
    textInput.oninput=()=>{q.feedback=null;};
    const btnCheck=el("button","btn btn-primary mt8",{text:"Check ↵"});
    btnCheck.style.width="100%"; btnCheck.style.justifyContent="center";
    if(q.feedback==="correct"||q.feedback==="closeenough") btnCheck.disabled=true;
    btnCheck.onclick=handleTextSubmit;
    answerCard.append(textInput,btnCheck);
    if(q.feedback&&q.feedback!=="closeenough"){ const fb=el("div",`feedback ${q.feedback}`); fb.textContent=q.feedback==="correct"?"✅ Correct!":"❌ Not quite — try again"; answerCard.appendChild(fb); }
    setTimeout(()=>document.getElementById("quiz-text-input")?.focus(),30);
  } else {
    const mcGrid=el("div","mc-grid");
    q.mcOptions.forEach(opt=>{
      const isCorrect=opt.toLowerCase()===pin.label.toLowerCase();
      let cls="mc-option";
      if(q.mcAnswered){ if(q.mcAnswered===opt) cls+=isCorrect?" mc-correct":" mc-wrong"; else if(isCorrect) cls+=" mc-correct"; }
      const btn=el("button",cls,{text:opt}); if(q.mcAnswered) btn.disabled=true;
      btn.onclick=()=>handleMCClick(opt); mcGrid.appendChild(btn);
    });
    answerCard.appendChild(mcGrid);
  }

  const skipRow=el("div","row mt16");
  const btnSkip=el("button","btn btn-sky btn-sm flex1",{text:"⏭ Skip"}); btnSkip.style.justifyContent="center"; btnSkip.onclick=handleSkip;
  if(q.remaining.length<=1) btnSkip.disabled=true;
  const btnReveal=el("button","btn btn-ghost btn-sm flex1",{text:"💡 Reveal"}); btnReveal.style.justifyContent="center"; btnReveal.onclick=handleReveal;
  skipRow.append(btnSkip,btnReveal); answerCard.appendChild(skipRow);

  panelCol.insertBefore(answerCard, panelCol.firstChild); mainRow.appendChild(panelCol); wrap.appendChild(mainRow);
  return wrap;
}

function rerenderQuizPins(canvasWrap,img) {
  canvasWrap.querySelectorAll(".pin").forEach(p=>p.remove());
  const q=state.quiz; const pin=q.remaining[0];
  q.template.pins.forEach((p,i)=>{
    const status=q.results[p.id]; const isActive=p.id===pin?.id;
    const classes=["pin"]; if(isActive)classes.push("active"); if(status==="correct")classes.push("correct"); else if(status==="wrong")classes.push("incorrect"); else if(status==="revealed")classes.push("revealed"); else if(status==="skipped")classes.push("skipped-pin");
    const pinEl=el("div",classes.join(" "),{text:String(i+1)});
    pinEl.style.left=`${p.x}%`; pinEl.style.top=`${p.y}%`;
    if(!status) { pinEl.style.background=pinColor(i); }
    if(status){ const tip=el("div","pin-tooltip",{text:p.label}); pinEl.appendChild(tip); }
    canvasWrap.appendChild(pinEl);
  });
}

function markDiagramResult(pinId,status) {
  const q=state.quiz; q.results[pinId]=status; q.answered.add(pinId); q.feedback=null; q.mcAnswered=null;
  q.remaining.shift(); // remove the answered pin from the front
  if(q.remaining.length===0) setTimeout(()=>finishDiagramQuiz(),400);
  else { generateMCOptions(); render(); }
}

function handleTextSubmit() {
  const q=state.quiz; const pin=q.remaining[0];
  const input=document.getElementById("quiz-text-input"); if(!input||!input.value.trim()) return;
  const val=input.value.trim();
  const exact=val.toLowerCase()===pin.label.toLowerCase();
  const close=!exact&&q.settings.closeEnough&&similarity(val,pin.label)>=0.75;
  if(exact){ q.feedback="correct"; render(); setTimeout(()=>markDiagramResult(pin.id,"correct"),800); }
  else if(close){ q.feedback="closeenough"; showToast("Close enough! 🤷"); render(); setTimeout(()=>markDiagramResult(pin.id,"closeenough"),1200); }
  else { q.feedback="wrong"; render(); setTimeout(()=>document.getElementById("quiz-text-input")?.focus(),30); }
}

function handleMCClick(option) {
  const q=state.quiz; const pin=q.remaining[0]; if(q.mcAnswered) return;
  const correct=option.toLowerCase()===pin.label.toLowerCase(); q.mcAnswered=option; render();
  if(correct) setTimeout(()=>markDiagramResult(pin.id,"correct"),900);
}

function handleSkip() {
  const q=state.quiz;
  if(q.remaining.length<=1) return; // only one left — nowhere to skip to
  q.remaining.push(q.remaining.shift()); // move front to back
  q.feedback=null; q.mcAnswered=null; generateMCOptions(); render();
}

function handleReveal() { const q=state.quiz; markDiagramResult(q.remaining[0].id,"revealed"); }

function finishDiagramQuiz() { state.resultsData={...state.quiz.results}; navigate("results"); }

// ─── Diagram Results ──────────────────────────────────────────────────────────

function renderResults() {
  const q=state.quiz; const pins=q.template.pins; const results=state.resultsData;
  const correct=pins.filter(p=>results[p.id]==="correct");
  const closeEnough=pins.filter(p=>results[p.id]==="closeenough");
  const revealed=pins.filter(p=>results[p.id]==="revealed");
  const skipped=pins.filter(p=>!results[p.id]);
  const score=Math.round(((correct.length+closeEnough.length)/pins.length)*100);
  const scoreColor=score>=80?"var(--sage)":score>=50?"var(--gold)":"var(--coral)";
  const missedIds=[...revealed.map(p=>p.id),...skipped.map(p=>p.id)];

  const wrap=el("div");
  const topbar=el("div","topbar");
  const btnBack=el("button","btn btn-ghost btn-sm",{text:"← Home"}); btnBack.onclick=()=>navigate("home");
  const h2=el("h2",null,{text:`Results — ${q.template.name}`});
  topbar.append(btnBack,h2); wrap.appendChild(topbar);

  const scoreCard=el("div","card text-center"); scoreCard.style.cssText="padding:32px 24px;margin-bottom:20px;";
  const scoreEl=el("div","score-display",{text:`${score}%`}); scoreEl.style.color=scoreColor;
  const summaryParts=[`${correct.length} correct`];
  if(closeEnough.length) summaryParts.push(`${closeEnough.length} close enough 🤷`);
  summaryParts.push(`${revealed.length} revealed`,`${skipped.length} skipped`);
  const summary=el("div",null,{text:summaryParts.join(" · ")});
  summary.style.cssText="font-size:1rem;color:var(--text-muted);margin-top:4px;font-weight:600;";
  const btnRow=el("div","row mt16"); btnRow.style.cssText="justify-content:center;gap:12px;";
  if(missedIds.length>0){ const btnRetry=el("button","btn btn-primary",{text:"🔁 Retry Missed"}); btnRetry.onclick=()=>retryMissed(missedIds); btnRow.appendChild(btnRetry); }
  const btnHome=el("button","btn btn-ghost",{text:"🏠 Home"}); btnHome.onclick=()=>navigate("home"); btnRow.appendChild(btnHome);
  scoreCard.append(scoreEl,summary,btnRow); wrap.appendChild(scoreCard);

  const breakCard=el("div","card");
  const breakLabel=el("div","section-label",{text:"Breakdown"}); breakLabel.style.marginBottom="12px"; breakCard.appendChild(breakLabel);
  pins.forEach((p,i)=>{
    const status=results[p.id]||"skipped";
    const icon=status==="correct"?"✅":status==="closeenough"?"🤷":status==="revealed"?"💡":"⏭️";
    const statusLabel=status==="closeenough"?"close enough":status;
    const row=el("div",`result-row r-${status}`);
    const dot=el("div","pin-dot",{text:String(i+1)}); dot.style.cssText=`background:${pinColor(i)};flex-shrink:0;`;
    const labelSpan=el("span",null,{text:p.label}); labelSpan.style.cssText="flex:1;font-weight:700;";
    const iconSpan=el("span",null,{text:icon});
    const statusSpan=el("span",null,{text:statusLabel}); statusSpan.style.cssText="font-size:0.78rem;color:var(--text-muted);text-transform:capitalize;";
    row.append(dot,labelSpan,iconSpan,statusSpan); breakCard.appendChild(row);
  });
  wrap.appendChild(breakCard); return wrap;
}

function retryMissed(missedIds) {
  const q=state.quiz;
  const pins=missedIds.map(id=>q.template.pins.find(p=>p.id===id)).filter(Boolean);
  const remaining=q.settings.order==="random"?shuffle(pins):pins;
  state.quiz={...q,remaining,results:{},answered:new Set(),mcOptions:[],mcAnswered:null,feedback:null,hoveredPinId:null,initialScrollDone:false,pz:{zoom:1,panX:0,panY:0}};
  generateMCOptions(); navigate("quiz");
}

// ─── Match Quiz ───────────────────────────────────────────────────────────────

function startMatchQuiz(template) {
  // colOrders[c] = array of row indices telling us where each original row currently sits in column c
  // For col 0 (anchor): always [0,1,2,...] — fixed
  // For other cols: shuffled
  const numRows=template.rows.length;
  const numCols=template.columns.length;
  const colOrders=[];
  for(let c=0;c<numCols;c++){
    colOrders.push(c===0 ? [...Array(numRows).keys()] : shuffle([...Array(numRows).keys()]));
  }
  state.matchQuiz={template,colOrders,selected:null,dragging:null,checkResult:null,showWrong:false};
  navigate("matchQuiz");
}

function renderMatchQuiz() {
  const mq=state.matchQuiz;
  const {template,colOrders,selected,dragging,checkResult,showWrong}=mq;
  const numRows=template.rows.length;
  const numCols=template.columns.length;

  const wrap=el("div");
  const topbar=el("div","topbar");
  const btnBack=el("button","btn btn-ghost btn-sm",{text:"← Home"}); btnBack.onclick=()=>navigate("home");
  const h2=el("h2",null,{text:template.name});
  topbar.append(btnBack,h2); wrap.appendChild(topbar);

  // Result banner
  if(checkResult!==null){
    const allCorrect=checkResult.every(r=>r);
    const numCorrect=checkResult.filter(Boolean).length;
    const banner=el("div",`match-result-banner ${allCorrect?"all-correct":"has-wrong"}`);
    const scoreEl=el("div","banner-score",{text:`${numCorrect}/${numRows}`});
    const msg=el("div");
    msg.innerHTML=allCorrect
      ? `<div style="font-weight:800;font-size:1.1rem">🎉 Perfect match!</div><div style="color:var(--text-muted);font-size:0.9rem;margin-top:4px">All rows are correctly matched.</div>`
      : `<div style="font-weight:800;font-size:1.1rem">Not quite…</div><div style="color:var(--text-muted);font-size:0.9rem;margin-top:4px">${numCorrect} of ${numRows} rows correct. ${showWrong?"Incorrect cells are highlighted in red.":"What would you like to do?"}</div>`;
    banner.append(scoreEl,msg);
    wrap.appendChild(banner);
  }

  // Table
  const tableWrap=el("div","match-quiz-wrap");
  const table=el("table","match-quiz-table");

  // thead
  const thead=el("thead"); const hrow=el("tr");
  for(let c=0;c<numCols;c++){
    const th=el("th",c===0?"anchor-header":"",{text:template.columns[c]});
    hrow.appendChild(th);
  }
  thead.appendChild(hrow); table.appendChild(thead);

  // tbody
  const tbody=el("tbody");
  for(let r=0;r<numRows;r++){
    const tr=el("tr");
    for(let c=0;c<numCols;c++){
      const td=el("td");
      const origRowIdx=colOrders[c][r]; // which original row is in this visual slot
      const cellData=template.rows[origRowIdx][c];
      const isAnchor=c===0;
      const isDragging=!isAnchor&&dragging&&dragging.col===c&&dragging.slot===r;
      const isSelected=!isAnchor&&selected&&selected.col===c&&selected.slot===r;
      const isDropTarget=!isAnchor&&dragging&&dragging.col===c&&dragging.slot!==r;

      let cls="match-cell";
      if(isAnchor) cls+=" anchor-cell";
      else cls+=" draggable";
      if(isDragging) cls+=" dragging";
      else if(isSelected) cls+=" selected";
      else if(isDropTarget) cls+=" drop-target";

      // Result highlighting
      if(checkResult!==null&&showWrong){
        // check if this row is correct: for each non-anchor col in visual row r, origRowIdx should equal anchor col's origRowIdx (which is always r)
        const anchorOrigRow=colOrders[0][r]; // = r always
        const isRowCorrect = checkResult[r];
        if(!isAnchor){ if(isRowCorrect) cls+=" result-correct"; else cls+=" result-wrong"; }
      }

      const cell=el("div",cls);
      if(cellData.type==="image"&&cellData.value){ const img=el("img",null,{src:cellData.value,alt:"cell"}); cell.appendChild(img); }
      else { cell.textContent=cellData.value; }

      if(!isAnchor&&checkResult===null){
        // Click-to-swap
        cell.onclick=()=>handleMatchCellClick(c,r);
        // Drag
        cell.draggable=true;
        cell.ondragstart=e=>{ e.dataTransfer.effectAllowed="move"; mq.dragging={col:c,slot:r}; mq.selected=null; render(); };
        cell.ondragend=()=>{ mq.dragging=null; render(); };
        cell.ondragover=e=>{ e.preventDefault(); e.dataTransfer.dropEffect="move"; };
        cell.ondrop=e=>{ e.preventDefault(); if(mq.dragging&&mq.dragging.col===c&&mq.dragging.slot!==r){ swapMatchCells(c,mq.dragging.slot,r); mq.dragging=null; } };
      }

      td.appendChild(cell); tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody); tableWrap.appendChild(table);

  const card=el("div","card"); card.style.overflowX="auto";
  card.appendChild(tableWrap); wrap.appendChild(card);

  // Action bar
  const actionBar=el("div","match-action-bar");

  if(checkResult===null){
    // Not yet submitted
    const btnSubmit=el("button","btn btn-primary",{text:"✓ Submit Answers"});
    btnSubmit.onclick=()=>checkMatchAnswers();
    const btnReset=el("button","btn btn-ghost",{text:"↺ Reset"});
    btnReset.onclick=()=>startMatchQuiz(template);
    actionBar.append(btnSubmit,btnReset);
  } else {
    const allCorrect=checkResult.every(r=>r);
    if(allCorrect){
      const btnHome=el("button","btn btn-ghost",{text:"🏠 Home"}); btnHome.onclick=()=>navigate("home");
      const btnAgain=el("button","btn btn-sage",{text:"↺ Try Again"}); btnAgain.onclick=()=>startMatchQuiz(template);
      actionBar.append(btnAgain,btnHome);
    } else {
      if(!showWrong){
        const btnShowWrong=el("button","btn btn-danger",{text:"🔴 Show Incorrect"});
        btnShowWrong.onclick=()=>{ mq.showWrong=true; render(); };
        const btnKeepTrying=el("button","btn btn-sky",{text:"Keep Trying"});
        btnKeepTrying.onclick=()=>{ mq.checkResult=null; mq.showWrong=false; render(); };
        actionBar.append(btnShowWrong,btnKeepTrying);
      } else {
        const btnKeepTrying=el("button","btn btn-sky",{text:"↩ Keep Trying"});
        btnKeepTrying.onclick=()=>{ mq.checkResult=null; mq.showWrong=false; render(); };
        const btnReset=el("button","btn btn-ghost",{text:"↺ Reset"});
        btnReset.onclick=()=>startMatchQuiz(template);
        const btnHome=el("button","btn btn-ghost",{text:"🏠 Home"}); btnHome.onclick=()=>navigate("home");
        actionBar.append(btnKeepTrying,btnReset,btnHome);
      }
    }
  }

  wrap.appendChild(actionBar);
  return wrap;
}

function handleMatchCellClick(col,slot) {
  const mq=state.matchQuiz;
  if(mq.selected===null){
    mq.selected={col,slot}; render();
  } else {
    if(mq.selected.col===col&&mq.selected.slot===slot){ mq.selected=null; render(); return; }
    if(mq.selected.col===col){ swapMatchCells(col,mq.selected.slot,slot); mq.selected=null; }
    else { mq.selected={col,slot}; render(); } // clicked different col: move selection
  }
}

function swapMatchCells(col,slotA,slotB) {
  const mq=state.matchQuiz;
  [mq.colOrders[col][slotA],mq.colOrders[col][slotB]]=[mq.colOrders[col][slotB],mq.colOrders[col][slotA]];
  mq.checkResult=null; mq.showWrong=false; render();
}

function checkMatchAnswers() {
  const mq=state.matchQuiz;
  const {template,colOrders}=mq;
  const numRows=template.rows.length;
  const numCols=template.columns.length;

  // Build a set of "correct" values for each row/col combo
  // For row r to be correct: every non-anchor col c must have colOrders[c][r] === colOrders[0][r]
  // colOrders[0][r] is always r (anchor is fixed)
  // So: for each visual row r, colOrders[c][r] must equal r for all c
  // But handle duplicates: if cell value is identical to another row's cell in same col, it's also valid

  const result=[];
  for(let r=0;r<numRows;r++){
    const anchorOrigRow=colOrders[0][r]; // always r
    let rowCorrect=true;
    for(let c=1;c<numCols;c++){
      const assignedOrigRow=colOrders[c][r];
      if(assignedOrigRow===anchorOrigRow){ continue; } // exact match
      // Check duplicate: does template.rows[assignedOrigRow][c].value === template.rows[anchorOrigRow][c].value?
      const assignedVal=template.rows[assignedOrigRow][c].value;
      const expectedVal=template.rows[anchorOrigRow][c].value;
      if(assignedVal.trim().toLowerCase()!==expectedVal.trim().toLowerCase()){ rowCorrect=false; break; }
    }
    result.push(rowCorrect);
  }
  mq.checkResult=result; mq.showWrong=false; render();
}

// ─── Default Templates ────────────────────────────────────────────────────────

async function loadDefaultTemplates() {
  try {
    const idx = await fetch("./templates/index.json").then(r => r.json());
    if (!Array.isArray(idx) || !idx.length) return;
    const templates = await Promise.all(
      idx.map(filename =>
        fetch(`./templates/${filename}`)
          .then(r => r.json())
          .catch(() => null)
      )
    );
    state.defaultTemplates = templates.filter(Boolean);
    render();
  } catch { /* no templates dir or no index — silently skip */ }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

render();
loadDefaultTemplates();
