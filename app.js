/* Flip v1 — plain JavaScript, no build step. */
"use strict";

const APP_VERSION = "1.1.0";
const STATE_VERSION = 2; // 2: Logbook, delay pulls, Lonely + Tired pulls
const MAX_ACTIVE = 5;

const LEVELS = [
  { at: 1,   label: "First flip",      board: "FIRST FLIP" },
  { at: 10,  label: "On a roll",       board: "ON A ROLL" },
  { at: 50,  label: "Pattern breaker", board: "PATTERN BREAKER" },
  { at: 150, label: "Mythic",          board: "MYTHIC" }
];
const STAGE_KEYS = ["practicing", "becoming", "proving", "being"];
const STAGE_LABELS = ["Practicing", "Becoming", "Proving", "Being"];
const STATUS_WIDTH = 15;

const ERA_COLORS = [
  { name: "Yellow", c: "#FFCC1A" },
  { name: "Teal",   c: "#2BB3A3" },
  { name: "Coral",  c: "#F2685A" },
  { name: "Sky",    c: "#4C9EEB" },
  { name: "Lilac",  c: "#A98BE8" }
];

const TRIGGERS = ["Bored", "Stressed", "Lonely", "Tired", "Late night", "Social"]; // starting pulls for every era
const MOODS = ["rough", "low", "okay", "good", "great"];
const MAX_TRIGGERS = 12;
const TRIGGER_MAX_LEN = 24;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------------- Storage ---------------- */

const store = {
  db: null,
  mode: "idb", // "idb" | "local" | "memory"
  memory: null,

  async open() {
    try {
      if (!("indexedDB" in window)) throw new Error("no idb");
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("flip", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("kv");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      this.mode = "idb";
    } catch (e) {
      try {
        localStorage.setItem("flip-test", "1");
        localStorage.removeItem("flip-test");
        this.mode = "local";
      } catch (e2) {
        this.mode = "memory";
      }
    }
  },

  async get() {
    if (this.mode === "idb") {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction("kv", "readonly");
        const req = tx.objectStore("kv").get("state");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }
    if (this.mode === "local") {
      const raw = localStorage.getItem("flip-state");
      return raw ? JSON.parse(raw) : null;
    }
    return this.memory;
  },

  async set(value) {
    const copy = JSON.parse(serialize(value));
    if (this.mode === "idb") {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(copy, "state");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    if (this.mode === "local") {
      localStorage.setItem("flip-state", serialize(copy));
      return;
    }
    this.memory = copy;
  }
};

let state = freshState();

/** JSON without runtime-only keys (anything starting with "_"). */
function serialize(value, space) {
  return JSON.stringify(value, (k, v) => (k.startsWith("_") ? undefined : v), space);
}

function freshState() {
  return {
    version: STATE_VERSION,
    eras: [],
    logbook: [],
    settings: { sound: true, lastExport: null, showPreviews: false }
  };
}

function normalize(s) {
  const base = freshState();
  const out = Object.assign(base, s || {});
  out.settings = Object.assign(freshState().settings, (s && s.settings) || {});
  out.eras = Array.isArray(out.eras) ? out.eras.map(normalizeEra) : [];
  out.logbook = Array.isArray(out.logbook)
    ? out.logbook.filter(x => x && typeof x === "object").map(normalizeEntry)
    : [];
  const from = Number(out.version) || 1;
  if (from < 2) out.eras.forEach(addNewDefaultPulls);
  out.version = Math.max(from, STATE_VERSION);
  return out;
}

/** v1 -> v2: give existing eras the new Lonely and Tired pulls (once), keeping custom tags. */
function addNewDefaultPulls(era) {
  const have = era.triggers.map(t => t.toLowerCase());
  const add = ["Lonely", "Tired"].filter(t => !have.includes(t.toLowerCase()));
  const room = Math.max(0, MAX_TRIGGERS - era.triggers.length);
  if (!add.length || !room) return;
  const s = have.indexOf("stressed");
  era.triggers.splice(s >= 0 ? s + 1 : era.triggers.length, 0, ...add.slice(0, room));
}

function normalizeEntry(x) {
  const out = Object.assign({ id: uid(), t: Date.now(), text: "" }, x);
  out.text = String(out.text ?? "");
  return out;
}

function normalizeEra(e) {
  const out = Object.assign({
    id: uid(),
    name: "Untitled era",
    becoming: "",
    color: ERA_COLORS[0].c,
    count: 0,
    createdAt: Date.now(),
    graduatedAt: null,
    events: [],
    used: {},
    customLines: [],
    comebackPending: false,
    lastReply: -1
  }, e);
  // Trigger tags this era offers after a flip. Older saves get the defaults.
  out.triggers = Array.isArray(out.triggers)
    ? out.triggers.filter(t => typeof t === "string" && t.trim())
    : TRIGGERS.slice();
  return out;
}

/** Adds a tag to the era. Returns the stored label (existing one if it's a duplicate) or null. */
function addTrigger(era, raw) {
  const label = String(raw || "").trim().replace(/\s+/g, " ").slice(0, TRIGGER_MAX_LEN);
  if (!label) return null;
  const existing = era.triggers.find(t => t.toLowerCase() === label.toLowerCase());
  if (existing) return existing;
  if (era.triggers.length >= MAX_TRIGGERS) {
    toast(`You can have up to ${MAX_TRIGGERS} tags. Remove one first.`);
    return null;
  }
  era.triggers.push(label);
  return label;
}

/** Removes a tag from the list. Past flips keep their tag. */
function removeTrigger(era, label) {
  era.triggers = era.triggers.filter(t => t !== label);
}

let saveChain = Promise.resolve();
function save() {
  saveChain = saveChain
    .then(() => store.set(state))
    .catch(() => toast("Couldn't save. Export a backup soon."));
  return saveChain;
}

/* ---------------- Helpers ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function activeEras() {
  return state.eras.filter(e => !e.graduatedAt);
}

function findEra(id) {
  return state.eras.find(e => e.id === id);
}

function levelIndex(n) {
  let idx = -1;
  LEVELS.forEach((l, i) => { if (n >= l.at) idx = i; });
  return idx;
}

function statusFor(era) {
  if (era._tempStatus) return era._tempStatus;
  const i = levelIndex(era.count);
  return i < 0 ? "NEW ERA" : LEVELS[i].board;
}

function sameDay(a, b) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

function flipsToday(era) {
  const now = Date.now();
  return era.events.filter(ev => ev.type === "flip" && sameDay(ev.t, now)).length;
}

const fmtTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Random pick that never repeats the previous pick for the same key. */
const lastPick = {};
function rotate(key, arr) {
  let i = Math.floor(Math.random() * arr.length);
  if (arr.length > 1 && i === lastPick[key]) i = (i + 1) % arr.length;
  lastPick[key] = i;
  return arr[i];
}

function fill(text, era) {
  return text
    .replaceAll("{b}", era.becoming)
    .replaceAll("{n}", String(era.count))
    .replaceAll("{t}", String(flipsToday(era)));
}

function announce(msg) {
  const el = $("#sr-live");
  el.textContent = "";
  setTimeout(() => { el.textContent = msg; }, 30);
}

let toastTimer = null;
function toast(msg) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2800);
}

/* ---------------- Split-flap renderer ---------------- */

function makeFlap(ch) {
  const f = document.createElement("span");
  f.className = "flap";
  f.setAttribute("aria-hidden", "true");
  f.innerHTML = '<span class="half top"><span></span></span><span class="half bottom"><span></span></span>';
  setFlapStatic(f, ch);
  return f;
}

function glyph(ch) {
  return ch === " " ? "\u00a0" : ch;
}

function setFlapStatic(f, ch) {
  f.querySelector(".top span").textContent = glyph(ch);
  f.querySelector(".bottom span").textContent = glyph(ch);
  f.dataset.ch = ch;
}

function finishFlap(f) {
  clearTimeout(f._t1);
  clearTimeout(f._t2);
  f.querySelectorAll(".fold, .unfold").forEach(n => n.remove());
  if (f._target != null) setFlapStatic(f, f._target);
}

function animateFlap(f, ch, delay) {
  const from = f._target != null ? f._target : f.dataset.ch;
  finishFlap(f);
  if (from === ch) return;
  f._target = ch;
  if (reducedMotion.matches) { setFlapStatic(f, ch); return; }

  f._t1 = setTimeout(() => {
    const ms = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--flip-ms"), 10) || 110;
    f.querySelector(".top span").textContent = glyph(ch);
    f.querySelector(".bottom span").textContent = glyph(from);

    const fold = document.createElement("span");
    fold.className = "half top fold";
    fold.innerHTML = `<span>${esc(glyph(from))}</span>`;
    const unfold = document.createElement("span");
    unfold.className = "half bottom unfold";
    unfold.innerHTML = `<span>${esc(glyph(ch))}</span>`;
    f.append(fold, unfold);

    f._t2 = setTimeout(() => {
      fold.remove();
      unfold.remove();
      setFlapStatic(f, ch);
    }, ms * 2 + 20);
  }, delay);
}

/** Render text into a row of flaps. align: "right" pads left (numbers), "left" pads right (words). */
function renderFlaps(container, text, width, { align = "left", animate = true } = {}) {
  text = String(text).toUpperCase().slice(0, width);
  const padded = align === "right" ? text.padStart(width, " ") : text.padEnd(width, " ");
  if (container.children.length !== width) {
    const prev = container.dataset.text || "";
    container.innerHTML = "";
    for (let i = 0; i < width; i++) {
      const startCh = animate && prev ? " " : padded[i];
      container.appendChild(makeFlap(startCh));
    }
  }
  container.dataset.text = padded;
  [...container.children].forEach((f, i) => {
    if (animate) animateFlap(f, padded[i], i * 28);
    else { finishFlap(f); f._target = null; setFlapStatic(f, padded[i]); }
  });
}

function countWidth(n) {
  return Math.max(3, String(n).length);
}

/* ---------------- Sound ---------------- */

let audioCtx = null;
function ctx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function clack(ac, when) {
  const len = Math.floor(ac.sampleRate * 0.035);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2400;
  bp.Q.value = 0.9;
  const g = ac.createGain();
  g.gain.value = 0.55;
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(when);
}

function playFlipSound(levelUp) {
  if (!state.settings.sound) return;
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;
  clack(ac, t);
  clack(ac, t + 0.07);
  clack(ac, t + 0.13);
  if (levelUp) {
    [659.25, 987.77].forEach((freq, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const start = t + 0.22 + i * 0.12;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      o.connect(g).connect(ac.destination);
      o.start(start);
      o.stop(start + 0.55);
    });
  }
}

/* ---------------- Hype burst ---------------- */

function burstFrom(el, color) {
  if (reducedMotion.matches || !el) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const layer = $("#burst");
  const colors = [color, "#FFCC1A", "#F4F1E8"];
  for (let i = 0; i < 14; i++) {
    const b = document.createElement("span");
    b.className = "chipbit";
    const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
    const dist = 60 + Math.random() * 70;
    b.style.left = `${cx - 5}px`;
    b.style.top = `${cy - 7}px`;
    b.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    b.style.setProperty("--dy", `${Math.sin(angle) * dist - 30}px`);
    b.style.setProperty("--rot", `${(Math.random() * 2 - 1) * 260}deg`);
    b.style.setProperty("--c", colors[i % colors.length]);
    layer.appendChild(b);
    setTimeout(() => b.remove(), 750);
  }
}

/* ---------------- Proof ---------------- */

function proofPool(era, stage) {
  const hasB = Boolean(era.becoming && era.becoming.trim());
  const bank = PROOF[STAGE_KEYS[stage]]
    .map((txt, i) => ({ k: `b${i}`, txt, custom: false }))
    .filter(c => hasB || !c.txt.includes("{b}"));
  const custom = (era.customLines || [])
    .filter(c => c.stage === "any" || Number(c.stage) === stage)
    .map(c => ({ k: `c${c.id}`, txt: c.text, custom: true }));
  return bank.concat(custom);
}

function nextProof(era, stage) {
  const pool = proofPool(era, stage);
  if (!pool.length) return null;
  let used = (era.used && era.used[stage]) || [];
  let avail = pool.filter(c => !used.includes(c.k));
  if (!avail.length) { used = []; avail = pool; }
  const customAvail = avail.filter(c => c.custom);
  const choice = customAvail.length && Math.random() < 0.4 ? pick(customAvail) : pick(avail);
  used.push(choice.k);
  era.used = era.used || {};
  era.used[stage] = used;
  return fill(choice.txt, era);
}

/** Returns { line, kicker } or null. Decides whether a Proof line shows on this flip. */
function proofForFlip(era, prevLevel) {
  const n = era.count;
  const lvl = levelIndex(n);
  const stage = Math.max(0, lvl);
  const levelUp = lvl > prevLevel;
  const kicker = levelUp && n > 1 ? `Level up: ${LEVELS[lvl].label}` : null;

  if (era.comebackPending) {
    era.comebackPending = false;
    return { line: CONTEXT.comeback, kicker };
  }
  if (n === 1) return { line: CONTEXT.firstFlip, kicker: null };

  const milestone = [3, 5, 10].includes(n) || n % 10 === 0;
  if (!levelUp && !milestone && Math.random() >= 0.2) return null;

  if (!levelUp) {
    const r = Math.random();
    const hour = new Date().getHours();
    if (flipsToday(era) >= 3 && r < 0.25) return { line: fill(pick(CONTEXT.busyDay), era), kicker: null };
    if ((hour >= 22 || hour < 5) && r >= 0.25 && r < 0.5) return { line: fill(pick(CONTEXT.lateNight), era), kicker: null };
  }
  return { line: nextProof(era, stage), kicker };
}

/* ---------------- Flipping ---------------- */

const rowRefs = new Map();   // eraId -> { root, count, status, btn }
let detailRefs = null;       // { id, count, status, next }

function flip(id, { silent = false, sourceEl = null } = {}) {
  const era = findEra(id);
  if (!era || era.graduatedAt) return;

  const prevLevel = levelIndex(era.count);
  era.count += 1;
  const ev = { t: Date.now(), type: "flip" };
  era.events.push(ev);
  const newLevel = levelIndex(era.count);
  const levelUp = newLevel > prevLevel && era.count > 1;

  const proof = proofForFlip(era, prevLevel);
  save();

  if (levelUp) flashStatus(era, "LEVEL UP", 1800);
  refreshEraFlaps(era);

  const row = rowRefs.get(id);
  if (row) {
    row.root.classList.remove("just-flipped");
    void row.root.offsetWidth;
    row.root.classList.add("just-flipped");
  }

  if (!silent) playFlipSound(levelUp);
  burstFrom(sourceEl || (row && row.btn), era.color);
  showTray(era, ev, proof);
  announce(`${era.name}: ${plural(era.count, "flip", "flips")}.${proof && proof.line ? " " + proof.line : ""}`);
}

function refreshEraFlaps(era, animate = true) {
  const row = rowRefs.get(era.id);
  const w = countWidth(era.count);
  if (row) {
    renderFlaps(row.count, String(era.count), w, { align: "right", animate });
    row.count.setAttribute("aria-label", plural(era.count, "flip", "flips"));
    renderFlaps(row.status, statusFor(era), STATUS_WIDTH, { animate });
  }
  if (detailRefs && detailRefs.id === era.id) {
    renderFlaps(detailRefs.count, String(era.count), w, { align: "right", animate });
    detailRefs.count.setAttribute("aria-label", plural(era.count, "flip", "flips"));
    renderFlaps(detailRefs.status, statusFor(era), STATUS_WIDTH, { animate });
    detailRefs.next.textContent = nextLevelText(era);
  }
}

function flashStatus(era, text, ms) {
  era._tempStatus = text;
  clearTimeout(era._statusTimer);
  era._statusTimer = setTimeout(() => {
    era._tempStatus = null;
    refreshEraFlaps(era);
  }, ms);
}

function undoFlip(era, ev) {
  const last = era.events[era.events.length - 1];
  if (last !== ev) return;
  era.events.pop();
  era.count = Math.max(0, era.count - 1);
  save();
  era._tempStatus = null;
  refreshEraFlaps(era);
  hideTray();
  toast("Flip undone");
}

/* ---------------- Tray ---------------- */

function showTray(era, ev, proof) {
  const tray = $("#tray");
  tray.classList.remove("leaving");
  tray.hidden = false;
  tray.style.animation = "none";
  void tray.offsetWidth;
  tray.style.animation = "";

  const kicker = $("#tray-kicker");
  kicker.hidden = !(proof && proof.kicker);
  kicker.textContent = (proof && proof.kicker) || "";
  $("#proof-line").textContent = (proof && proof.line) || "";

  renderTrayChips(era, ev, false);

  $("#undo-btn").onclick = () => undoFlip(era, ev);
  document.body.classList.add("tray-open");
}

/** Trigger chips in the tray. editing = remove mode (tap a chip to remove it). */
function renderTrayChips(era, ev, editing, { openAdd = false } = {}) {
  const chips = $("#chips");
  const editBtn = $("#tags-edit");
  chips.innerHTML = "";
  chips.classList.toggle("editing", editing);
  editBtn.textContent = editing ? "Done editing" : "Edit tags";
  editBtn.setAttribute("aria-pressed", String(editing));
  editBtn.hidden = !editing && era.triggers.length === 0;
  editBtn.onclick = () => renderTrayChips(era, ev, !editing);

  era.triggers.forEach(label => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    const text = document.createElement("span");
    text.textContent = label;
    b.appendChild(text);
    if (editing) {
      b.classList.add("removable");
      b.setAttribute("aria-label", `Remove ${label}`);
      b.insertAdjacentHTML("beforeend", '<span class="x" aria-hidden="true">×</span>');
      b.addEventListener("click", () => {
        removeTrigger(era, label);
        save();
        renderTrayChips(era, ev, era.triggers.length > 0);
        toast(`Removed ${label}. Past flips keep it.`);
      });
    } else {
      b.setAttribute("aria-pressed", String(ev.trigger === label));
      b.addEventListener("click", () => {
        const on = ev.trigger !== label;
        ev.trigger = on ? label : undefined;
        chips.querySelectorAll(".chip[aria-pressed]").forEach(c => c.setAttribute("aria-pressed", String(c === b && on)));
        save();
      });
    }
    chips.appendChild(b);
  });

  if (era.triggers.length >= MAX_TRIGGERS) return;

  if (!openAdd) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "chip chip-add";
    add.textContent = "+ New tag";
    add.addEventListener("click", () => renderTrayChips(era, ev, editing, { openAdd: true }));
    chips.appendChild(add);
    return;
  }

  const form = document.createElement("form");
  form.className = "chip-form";
  form.innerHTML = `
    <input type="text" maxlength="${TRIGGER_MAX_LEN}" placeholder="New tag" aria-label="New tag"
      enterkeyhint="done" autocomplete="off" autocapitalize="sentences">
    <button type="submit" class="chip chip-save">Add</button>`;
  const input = $("input", form);
  let committed = false;
  // Saves what's typed (if anything) and closes the field. Safe to call more than once.
  const commit = () => {
    if (committed) return;
    if (input.value.trim()) {
      const label = addTrigger(era, input.value);
      if (!label) { input.focus(); return; } // tag limit reached; toast already shown
      if (!editing) ev.trigger = label; // a tag made for this flip is the answer for this flip
      save();
    }
    committed = true;
    renderTrayChips(era, ev, editing);
  };
  form.addEventListener("submit", e => { e.preventDefault(); commit(); });
  // Keep focus in the field while Add is pressed, so the keyboard doesn't start closing
  // (and move the tray) mid-tap. The tap itself then submits the form as normal.
  $(".chip-save", form).addEventListener("mousedown", e => e.preventDefault());
  // Keyboard "Done", tapping elsewhere, etc.: keep what was typed instead of throwing it away.
  input.addEventListener("blur", () => {
    setTimeout(() => { if (document.contains(form)) commit(); }, 150);
  });
  chips.appendChild(form);
  input.focus();
}

/* Keep the tray above the iPhone keyboard while typing a new tag. */
if (window.visualViewport) {
  const vv = window.visualViewport;
  const placeTray = () => {
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    $("#tray").style.setProperty("--kb", `${Math.round(covered)}px`);
  };
  vv.addEventListener("resize", placeTray);
  vv.addEventListener("scroll", placeTray);
}

function hideTray() {
  const tray = $("#tray");
  if (tray.hidden) return;
  document.body.classList.remove("tray-open");
  if (reducedMotion.matches) { tray.hidden = true; return; }
  tray.classList.add("leaving");
  setTimeout(() => { tray.hidden = true; tray.classList.remove("leaving"); }, 260);
}

$("#tray-done").addEventListener("click", hideTray);

/* ---------------- Views ---------------- */

let currentView = "home";

function showView(name) {
  // Leaving the writing screen any way at all (Back, a quick-flip link...) keeps what was written.
  if (currentView === "write" && name !== "write" && writeCtx) {
    currentView = name;
    closeWrite();
  }
  currentView = name;
  ["home", "era", "hall", "logbook", "write"].forEach(v => { $(`#view-${v}`).hidden = v !== name; });
  if (name !== "era") detailRefs = null;
  window.scrollTo(0, 0);
}

function renderHome() {
  const board = $("#board");
  board.innerHTML = "";
  rowRefs.clear();
  const eras = activeEras();

  if (!eras.length) {
    const empty = document.createElement("div");
    empty.className = "board-empty";
    empty.innerHTML = `
      <p>Every time you say no to an old habit, you flip. The count only goes up.</p>
      <button class="btn primary" type="button" id="first-era">Start your first era</button>`;
    board.appendChild(empty);
    $("#first-era").addEventListener("click", () => openEraSheet());
    return;
  }

  eras.forEach(era => {
    const row = document.createElement("div");
    row.className = "row";
    row.style.setProperty("--era", era.color);
    row.innerHTML = `
      <div class="row-tab"></div>
      <div class="row-body">
        <div class="row-head">
          <button class="row-name" type="button">${esc(era.name)}</button>
          <button class="row-open" type="button" aria-label="Open ${esc(era.name)}">Details</button>
        </div>
        <div class="flaps small status"></div>
        <div class="row-foot">
          <div class="flaps big count" role="img"></div>
          <button class="flip-btn" type="button">Flip it</button>
        </div>
      </div>`;
    board.appendChild(row);
    const refs = {
      root: row,
      count: $(".count", row),
      status: $(".status", row),
      btn: $(".flip-btn", row)
    };
    rowRefs.set(era.id, refs);
    refreshEraFlaps(era, false);
    refs.btn.addEventListener("click", () => flip(era.id, { sourceEl: refs.btn }));
    $(".row-name", row).addEventListener("click", () => openEra(era.id));
    $(".row-open", row).addEventListener("click", () => openEra(era.id));
  });

  const open = MAX_ACTIVE - eras.length;
  if (open > 0) {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "open-slot";
    slot.innerHTML = `<strong>Start an era</strong><span>${plural(open, "slot", "slots")} open</span>`;
    slot.addEventListener("click", () => openEraSheet());
    board.appendChild(slot);
  }
}

function nextLevelText(era) {
  const lvl = levelIndex(era.count);
  const next = LEVELS[lvl + 1];
  if (!next) return `Mythic reached. Still counting.`;
  const need = next.at - era.count;
  return `${plural(need, "flip", "flips")} to ${next.label}`;
}

function openEra(id) {
  const era = findEra(id);
  if (!era) return;
  hideTray();
  showView("era");
  renderEra(era);
}

function timeBucket(t) {
  const h = new Date(t).getHours();
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 17) return "Afternoon";
  if (h >= 17 && h < 22) return "Evening";
  return "Late night";
}

function countBy(list, key) {
  const m = {};
  list.forEach(x => { if (x[key]) m[x[key]] = (m[x[key]] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function statListHTML(rows) {
  return `<ul class="stat-list">${rows.map(([k, v]) => `<li><span>${esc(k)}</span><span>${v}</span></li>`).join("")}</ul>`;
}

function patternsHTML(era) {
  const flips = era.events.filter(e => e.type === "flip");
  const delays = era.events.filter(e => e.type === "delay");
  const resist = countBy(flips, "trigger");
  const getsYou = countBy(delays, "pull");
  const delaysWithPull = delays.filter(d => d.pull).length;
  let html = "";

  if (flips.length >= 5) {
    const buckets = {};
    flips.forEach(f => { const b = timeBucket(f.t); buckets[b] = (buckets[b] || 0) + 1; });
    const topTime = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
    html += `<p>Most of your flips happen in the <strong>${topTime[0].toLowerCase()}</strong> (${topTime[1]} of ${flips.length}).</p>`;
  }

  if (delaysWithPull >= 3) {
    // Side by side only once there's enough to compare.
    html += `<div class="compare">
      <div><h4>What you resist</h4>${resist.length ? statListHTML(resist) : `<p class="muted">Tag a pull after a flip to see this.</p>`}</div>
      <div><h4>What gets you</h4>${statListHTML(getsYou)}</div>
    </div>`;
  } else if (flips.length >= 5) {
    html += resist.length
      ? `<h4 class="sub">What you resist</h4>${statListHTML(resist)}`
      : `<p class="muted">Tap a tag after a flip to see what pulls you most.</p>`;
  }

  return html || `<p class="muted">Patterns show up after 5 flips. Tag what pulled you after a flip to see them here.</p>`;
}

function levelsHTML(era) {
  const flips = era.events.filter(e => e.type === "flip");
  return `<ul class="levels">${LEVELS.map(l => {
    const reached = era.count >= l.at;
    const ev = flips[l.at - 1];
    const when = reached && ev ? fmtDate.format(ev.t) : "";
    return `<li class="${reached ? "" : "locked"}"><span>${esc(l.label)}</span><span>${reached ? esc(when || "Reached") : `${l.at} flips`}</span></li>`;
  }).join("")}</ul>`;
}

function historyHTML(era) {
  const total = era.events.length;
  const evs = era.events.slice(-60).map((ev, i) => ({ ev, idx: total - Math.min(60, total) + i })).reverse();
  if (!evs.length) return `<p class="muted">Your flips and delays will show up here.</p>`;
  const graduated = Boolean(era.graduatedAt);
  let html = "";
  let lastDay = null;
  evs.forEach(({ ev, idx }) => {
    const day = fmtDay.format(ev.t);
    if (day !== lastDay) {
      html += `<li class="day">${esc(sameDay(ev.t, Date.now()) ? "Today" : day)}</li>`;
      lastDay = day;
    }
    if (ev.type === "flip") {
      const reason = graduated
        ? (ev.trigger ? `, ${esc(ev.trigger.toLowerCase())}` : "")
        : `<button class="reason-btn${ev.trigger ? "" : " empty"}" type="button" data-idx="${idx}">${ev.trigger ? esc(ev.trigger) : "Add reason"}</button>`;
      html += `<li class="ev"><time>${esc(fmtTime.format(ev.t))}</time><span class="ev-main"><span class="kind">Flip</span>${reason}</span></li>`;
    } else {
      const bits = [];
      if (ev.pull) bits.push(`Pull: ${esc(ev.pull)}`);
      if (ev.note) bits.push(esc(ev.note));
      if (ev.before) bits.push(`Right before: ${esc(ev.before)}`);
      if (ev.plan) bits.push(`Next time, I'll ${esc(ev.plan)}`);
      if (findEntry(ev.logbookId)) bits.push("Wrote about it in the Logbook");
      const inner = `<span class="kind">Delay</span>${bits.length ? bits.map(b => `<span class="note">${b}</span>`).join("") : `<span class="note">No notes yet</span>`}`;
      html += graduated
        ? `<li class="ev delay"><time>${esc(fmtTime.format(ev.t))}</time><span>${inner}</span></li>`
        : `<li class="ev delay"><time>${esc(fmtTime.format(ev.t))}</time><button class="delay-open" type="button" data-idx="${idx}"><span class="delay-text">${inner}</span><span class="delay-edit">Edit</span></button></li>`;
    }
  });
  const more = era.events.length > 60 ? `<p class="muted">Showing the latest 60. Your backup keeps everything.</p>` : "";
  return `<ul class="history">${html}</ul>${more}`;
}

function quickLink(era) {
  return `${location.origin}${location.pathname}#flip-${era.id}`;
}

function renderEra(era) {
  const root = $("#era-detail");
  const graduated = Boolean(era.graduatedAt);
  root.innerHTML = `
    <div class="detail-head">
      <h2 class="detail-name">${esc(era.name)}</h2>
      ${era.becoming ? `<p class="detail-becoming">Becoming someone who ${esc(era.becoming)}.</p>` : ""}
    </div>

    <div class="detail-board" style="--era:${esc(era.color)}">
      <div class="flaps small status"></div>
      <div class="row-foot">
        <div class="flaps big count" role="img"></div>
        ${graduated ? "" : `<button class="flip-btn" type="button" id="detail-flip">Flip it</button>`}
      </div>
      <p class="next-level"></p>
    </div>

    ${graduated ? `<p class="muted" style="margin-top:14px">Graduated ${esc(fmtDate.format(era.graduatedAt))}.</p>` : `
    <div class="actions" style="margin-top:14px">
      <button class="btn" type="button" id="log-delay">Log a delay</button>
    </div>`}

    <div class="section">
      <h3>Patterns</h3>
      ${patternsHTML(era)}
    </div>

    <div class="section">
      <h3>Level-ups</h3>
      ${levelsHTML(era)}
    </div>

    <div class="section">
      <h3>History</h3>
      ${historyHTML(era)}
    </div>

    ${graduated ? "" : `
    <div class="section">
      <h3>Your own Proof lines</h3>
      <p class="muted">Add lines in your own words. They join the mix for the stage you choose.</p>
      <ul class="custom-lines" id="custom-lines"></ul>
      <div class="field">
        <label for="cl-text">New line</label>
        <input type="text" id="cl-text" maxlength="80" placeholder="I choose my mornings now.">
      </div>
      <div class="field">
        <label for="cl-stage">Show it during</label>
        <select id="cl-stage">
          <option value="any">Any stage</option>
          ${STAGE_LABELS.map((s, i) => `<option value="${i}">${s} (${LEVELS[i].at}+ flips)</option>`).join("")}
        </select>
      </div>
      <button class="btn" type="button" id="cl-add">Add line</button>
    </div>

    <div class="section">
      <h3>Quick flip link</h3>
      <p class="muted">Opening this link adds one flip to this era. Use it in an iOS Shortcut for Control Center, the lock screen, or the Action Button.</p>
      <div class="copy-row">
        <code id="ql">${esc(quickLink(era))}</code>
        <button class="btn" type="button" id="ql-copy">Copy</button>
      </div>
    </div>`}

    <div class="section">
      <h3>Manage</h3>
      <div class="row-actions">
        ${graduated ? `
          <button class="btn" type="button" id="restore-era">Move back to Your Five</button>
        ` : `
          <button class="btn" type="button" id="edit-era">Edit era</button>
          <button class="btn" type="button" id="grad-era">Graduate to Hall of Fame</button>
        `}
        <button class="btn danger" type="button" id="del-era">Delete era</button>
      </div>
    </div>`;

  detailRefs = {
    id: era.id,
    count: $(".count", root),
    status: $(".status", root),
    next: $(".next-level", root)
  };
  refreshEraFlaps(era, false);

  const flipBtn = $("#detail-flip");
  if (flipBtn) flipBtn.addEventListener("click", () => flip(era.id, { sourceEl: flipBtn }));
  const delayBtn = $("#log-delay");
  if (delayBtn) delayBtn.addEventListener("click", () => openDelaySheet(era));

  root.querySelectorAll(".delay-open").forEach(b => b.addEventListener("click", () => {
    const ev = era.events[Number(b.dataset.idx)];
    if (ev && ev.type === "delay") openDelayEditSheet(era, ev);
  }));

  root.querySelectorAll(".reason-btn").forEach(b => b.addEventListener("click", () => {
    const ev = era.events[Number(b.dataset.idx)];
    if (ev && ev.type === "flip") openReasonSheet(era, ev);
  }));

  if (!graduated) {
    renderCustomLines(era);
    $("#cl-add").addEventListener("click", () => {
      const input = $("#cl-text");
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      era.customLines.push({ id: uid(), text, stage: $("#cl-stage").value });
      input.value = "";
      save();
      renderCustomLines(era);
      toast("Line added");
    });
    $("#ql-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(quickLink(era));
        toast("Link copied");
      } catch {
        toast("Press and hold the link to copy it");
      }
    });
    $("#edit-era").addEventListener("click", () => openEraSheet(era));
    $("#grad-era").addEventListener("click", () => confirmGraduate(era));
  } else {
    $("#restore-era").addEventListener("click", () => {
      if (activeEras().length >= MAX_ACTIVE) { toast("Your Five is full. Graduate an era first."); return; }
      era.graduatedAt = null;
      save();
      renderHome();
      renderEra(era);
      toast(`${era.name} is back in Your Five`);
    });
  }
  $("#del-era").addEventListener("click", () => confirmDelete(era));
}

function renderCustomLines(era) {
  const list = $("#custom-lines");
  if (!list) return;
  list.innerHTML = era.customLines.map(c => `
    <li>
      <span>${esc(c.text)} <span class="tag">${c.stage === "any" ? "Any stage" : esc(STAGE_LABELS[Number(c.stage)])}</span></span>
      <button class="link-btn" type="button" data-id="${esc(c.id)}">Remove</button>
    </li>`).join("");
  list.querySelectorAll("button[data-id]").forEach(b => b.addEventListener("click", () => {
    era.customLines = era.customLines.filter(c => c.id !== b.dataset.id);
    save();
    renderCustomLines(era);
  }));
}

function renderHall() {
  const list = $("#hall-list");
  const grads = state.eras.filter(e => e.graduatedAt).sort((a, b) => b.graduatedAt - a.graduatedAt);
  if (!grads.length) {
    list.innerHTML = `<p class="muted">Graduate an era when it's simply part of who you are. It moves here with its full count and frees a slot in Your Five.</p>`;
    return;
  }
  list.innerHTML = grads.map(e => `
    <button class="hall-item" type="button" data-id="${esc(e.id)}">
      <h3>${esc(e.name)}</h3>
      <span class="count">${plural(e.count, "flip", "flips")}</span>
      ${e.becoming ? `<span class="muted">Someone who ${esc(e.becoming)}.</span>` : ""}
      <span class="muted">${esc(fmtDate.format(e.createdAt))} to ${esc(fmtDate.format(e.graduatedAt))}</span>
    </button>`).join("");
  list.querySelectorAll(".hall-item").forEach(b => b.addEventListener("click", () => openEra(b.dataset.id)));
}

/* ---------------- Sheets ---------------- */

let lastFocus = null;

function openSheet(html, onMount) {
  lastFocus = document.activeElement;
  hideTray();
  $("#sheet-body").innerHTML = html;
  $("#scrim").hidden = false;
  $("#sheet").hidden = false;
  $("#sheet").scrollTop = 0;
  if (onMount) onMount($("#sheet-body"));
}

function closeSheet() {
  $("#scrim").hidden = true;
  $("#sheet").hidden = true;
  $("#sheet-body").innerHTML = "";
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

$("#scrim").addEventListener("click", closeSheet);
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

const SUPPORT_HTML = `
  <p class="support">Need support? Call or text <a href="tel:988">988</a>, or call SAMHSA's free helpline at <a href="tel:18006624357">1-800-662-4357</a>.</p>`;

function openEraSheet(era = null) {
  if (!era && activeEras().length >= MAX_ACTIVE) {
    toast("Your Five is full. Graduate an era to free a slot.");
    return;
  }
  const used = activeEras().map(e => e.color);
  let color = era ? era.color : (ERA_COLORS.find(c => !used.includes(c.c)) || ERA_COLORS[0]).c;

  openSheet(`
    <h2>${era ? "Edit era" : "Start an era"}</h2>
    <p class="lead">${era ? "Changes keep your count and history." : "An era is a habit you're changing. Flip counts every time you say no."}</p>
    <div class="field">
      <label for="era-name">Name your era</label>
      <input type="text" id="era-name" maxlength="40" placeholder="No-smoking era" value="${era ? esc(era.name) : ""}">
    </div>
    <div class="field">
      <label for="era-becoming">Who are you becoming?</label>
      <div class="inline-prefix">
        <span>Someone who</span>
        <input type="text" id="era-becoming" maxlength="60" placeholder="doesn't smoke" value="${era ? esc(era.becoming) : ""}">
      </div>
      <p class="hint">Your Proof lines use these words, so write it the way you'd say it.</p>
    </div>
    <div class="field">
      <span class="label" id="color-label">Color</span>
      <div class="swatches" role="radiogroup" aria-labelledby="color-label">
        ${ERA_COLORS.map(c => `<button type="button" class="swatch" role="radio" aria-label="${c.name}" aria-checked="${c.c === color}" data-c="${c.c}" style="--c:${c.c}"></button>`).join("")}
      </div>
    </div>
    <div class="actions">
      <button class="btn primary" type="button" id="era-save">${era ? "Save changes" : "Start era"}</button>
      <button class="btn" type="button" id="era-cancel">Cancel</button>
    </div>`, body => {
    body.querySelectorAll(".swatch").forEach(s => s.addEventListener("click", () => {
      color = s.dataset.c;
      body.querySelectorAll(".swatch").forEach(x => x.setAttribute("aria-checked", String(x === s)));
    }));
    $("#era-cancel").addEventListener("click", closeSheet);
    $("#era-save").addEventListener("click", () => {
      const name = $("#era-name").value.trim();
      let becoming = $("#era-becoming").value.trim().replace(/^someone who\s+/i, "").replace(/[.!]+$/, "");
      if (!name) { $("#era-name").focus(); toast("Give your era a name"); return; }
      if (era) {
        Object.assign(era, { name, becoming, color });
        save();
        closeSheet();
        renderHome();
        if (currentView === "era") renderEra(era);
        toast("Saved");
      } else {
        const fresh = normalizeEra({ id: uid(), name, becoming, color, createdAt: Date.now() });
        state.eras.push(fresh);
        save();
        closeSheet();
        showView("home");
        renderHome();
        toast(`${name} started`);
        requestPersist();
      }
    });
    if (!era) setTimeout(() => $("#era-name").focus(), 250);
  });
}

/* ---------- Shared form pieces (pull chips, plan, "Write it out") ---------- */

function pullChipsHTML(era, selected, id) {
  const list = selected && !era.triggers.includes(selected) ? [...era.triggers, selected] : era.triggers;
  return `<div class="chips" id="${id}" role="group" aria-labelledby="${id}-label">
    ${list.map(t => `<button type="button" class="chip" aria-pressed="${t === selected}" data-t="${esc(t)}">${esc(t)}</button>`).join("")}
  </div>`;
}

/** One-of chips (tap again to clear). Returns a getter for the current value. */
function singleChoice(container) {
  const pressed = container.querySelector('.chip[aria-pressed="true"]');
  let value = pressed ? pressed.dataset.t : undefined;
  container.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
    value = value === c.dataset.t ? undefined : c.dataset.t;
    container.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.t === value)));
  }));
  return () => value;
}

function cleanPlan(v) {
  return String(v || "").trim().replace(/^i'?ll\s+/i, "").replace(/[.!]+$/, "");
}

function planFieldHTML(p, value) {
  return `
    <div class="field">
      <label for="${p}-plan">Next time that happens, I'll… <span class="muted">(optional)</span></label>
      <input type="text" id="${p}-plan" maxlength="120" enterkeyhint="done" value="${esc(value || "")}">
      <div class="chips suggest" aria-label="Suggestions">
        ${PLAN_SUGGESTIONS.map(s => `<button type="button" class="chip small" data-s="${esc(s)}">${esc(s)}</button>`).join("")}
      </div>
    </div>`;
}

function wirePlan(p) {
  const input = $(`#${p}-plan`);
  input.closest(".field").querySelectorAll("[data-s]").forEach(b => b.addEventListener("click", () => {
    input.value = b.dataset.s;
  }));
}

function writeItHTML(p, text, open) {
  return `
    <div class="field">
      <button type="button" class="disclose" id="${p}-write-toggle" aria-expanded="${open}" aria-controls="${p}-write-wrap">
        Write it out <span class="muted">(optional)</span>
      </button>
      <div id="${p}-write-wrap" class="write-wrap"${open ? "" : " hidden"}>
        <textarea id="${p}-write" aria-label="Write it out" placeholder="Write anything. Only you can see this.">${esc(text || "")}</textarea>
        <p class="hint">Saved to your Logbook.</p>
      </div>
    </div>`;
}

function wireWriteIt(p) {
  const toggle = $(`#${p}-write-toggle`);
  const wrap = $(`#${p}-write-wrap`);
  toggle.addEventListener("click", () => {
    const open = wrap.hidden;
    wrap.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) $(`#${p}-write`).focus();
  });
}

function findEntry(id) {
  return id ? state.logbook.find(e => e.id === id) : null;
}

/** The delay a Logbook entry was written with, if it still exists. */
function linkedDelay(entry) {
  if (!entry || entry.delayRef == null) return null;
  const era = findEra(entry.eraId);
  const ev = era && era.events.find(e => e.type === "delay" && e.t === entry.delayRef);
  return ev ? { era, ev } : null;
}

/** Re-render whatever screen is showing after an edit made in a sheet. */
function refreshAfterEdit(era) {
  if (currentView === "era" && era) renderEra(era);
  else if (currentView === "logbook") renderLogbook();
}

function openDelaySheet(era) {
  openSheet(`
    <h2>Log a delay</h2>
    <p class="lead">Your count stays at ${era.count}. Nothing resets.</p>
    <div class="field">
      <span class="label" id="d-pull-label">What was the pull? <span class="muted">(optional)</span></span>
      ${pullChipsHTML(era, undefined, "d-pull")}
    </div>
    ${planFieldHTML("d", "")}
    ${writeItHTML("d", "", false)}
    <div class="actions">
      <button class="btn primary" type="button" id="d-save">Log delay</button>
      <button class="btn" type="button" id="d-cancel">Cancel</button>
    </div>
    ${SUPPORT_HTML}`, () => {
    const getPull = singleChoice($("#d-pull"));
    wirePlan("d");
    wireWriteIt("d");
    $("#d-cancel").addEventListener("click", closeSheet);
    $("#d-save").addEventListener("click", () => {
      const t = Date.now();
      const ev = { t, type: "delay" };
      const pull = getPull();
      const plan = cleanPlan($("#d-plan").value);
      const text = $("#d-write").value.trim();
      if (pull) ev.pull = pull;
      if (plan) ev.plan = plan;
      if (text) {
        const entry = normalizeEntry({ id: uid(), t, text, eraId: era.id, delayRef: t });
        state.logbook.push(entry);
        ev.logbookId = entry.id;
      }
      era.events.push(ev);
      era.comebackPending = true;
      const pool = era.count > 0 ? DELAY_REPLIES : DELAY_REPLIES_ZERO;
      let idx = Math.floor(Math.random() * pool.length);
      if (pool.length > 1 && idx === era.lastReply) idx = (idx + 1) % pool.length;
      era.lastReply = idx;
      save();
      flashStatus(era, "DELAYED", 4000);
      refreshEraFlaps(era);
      showDelayReply(era, fill(pool[idx], era), ev.plan);
    });
  });
}

function showDelayReply(era, reply, plan) {
  openSheet(`
    <div class="delay-board">
      <div class="flaps small" id="db-1"></div>
      <div class="flaps small" id="db-2"></div>
    </div>
    <p class="reply">${esc(reply)}</p>
    ${plan ? `<p class="plan-echo">Your plan for next time: ${esc(plan)}.</p>` : ""}
    <div class="actions">
      <button class="btn primary" type="button" id="d-done">Back to the board</button>
    </div>
    ${SUPPORT_HTML}`, () => {
    const a = $("#db-1"), b = $("#db-2");
    renderFlaps(a, "", 13, { animate: false });
    renderFlaps(b, "", 13, { animate: false });
    setTimeout(() => renderFlaps(a, "DELAYED", 13), 150);
    setTimeout(() => renderFlaps(b, "NOT CANCELLED", 13), 600);
    $("#d-done").addEventListener("click", () => {
      closeSheet();
      refreshAfterEdit(era);
    });
    announce(`Delayed, not cancelled. ${reply}`);
  });
}

function openDelayEditSheet(era, ev) {
  const entry = findEntry(ev.logbookId);
  const hasNote = "note" in ev;
  const hasBefore = "before" in ev;
  openSheet(`
    <h2>Delay</h2>
    <p class="lead">${esc(era.name)}. Logged ${esc(fmtTime.format(ev.t))}, ${esc(sameDay(ev.t, Date.now()) ? "today" : fmtDay.format(ev.t))}. Your count isn't affected.</p>
    <div class="field">
      <span class="label" id="de-pull-label">What was the pull? <span class="muted">(optional)</span></span>
      ${pullChipsHTML(era, ev.pull, "de-pull")}
    </div>
    ${planFieldHTML("de", ev.plan)}
    ${hasNote ? `
    <div class="field">
      <label for="de-note">What happened?</label>
      <textarea id="de-note">${esc(ev.note || "")}</textarea>
    </div>` : ""}
    ${hasBefore ? `
    <div class="field">
      <label for="de-before">What was happening right before?</label>
      <input type="text" id="de-before" maxlength="120" value="${esc(ev.before || "")}">
    </div>` : ""}
    ${writeItHTML("de", entry ? entry.text : "", Boolean(entry))}
    <div class="actions">
      <button class="btn primary" type="button" id="de-save">Save changes</button>
      <button class="btn" type="button" id="de-cancel">Cancel</button>
      <button class="btn danger" type="button" id="de-delete">Delete this delay</button>
    </div>
    ${SUPPORT_HTML}`, () => {
    const getPull = singleChoice($("#de-pull"));
    wirePlan("de");
    wireWriteIt("de");
    $("#de-cancel").addEventListener("click", closeSheet);
    $("#de-save").addEventListener("click", () => {
      const pull = getPull();
      const plan = cleanPlan($("#de-plan").value);
      if (pull) ev.pull = pull; else delete ev.pull;
      if (plan) ev.plan = plan; else delete ev.plan;
      // Old-style fields: keep them editable; an emptied field is removed.
      if (hasNote) { const v = $("#de-note").value.trim(); if (v) ev.note = v; else delete ev.note; }
      if (hasBefore) { const v = $("#de-before").value.trim(); if (v) ev.before = v; else delete ev.before; }

      const text = $("#de-write").value.trim();
      if (entry) {
        if (text || entry.mood) entry.text = text;
        else { state.logbook = state.logbook.filter(e => e !== entry); delete ev.logbookId; }
      } else if (text) {
        const fresh = normalizeEntry({ id: uid(), t: ev.t, text, eraId: era.id, delayRef: ev.t });
        state.logbook.push(fresh);
        ev.logbookId = fresh.id;
      }
      save();
      closeSheet();
      refreshAfterEdit(era);
      toast("Delay updated");
    });
    $("#de-delete").addEventListener("click", () => {
      confirmSheet({
        title: "Delete this delay?",
        body: entry
          ? "It's removed from your history. Your count stays the same. What you wrote stays in your Logbook."
          : "It's removed from your history. Your count stays the same.",
        confirm: "Delete delay",
        danger: true,
        onConfirm: () => {
          const i = era.events.indexOf(ev);
          if (i >= 0) era.events.splice(i, 1);
          if (entry) delete entry.delayRef; // the writing stays, now as a plain entry
          const lastDelay = [...era.events].reverse().find(e => e.type === "delay");
          const lastFlip = [...era.events].reverse().find(e => e.type === "flip");
          if (!lastDelay || (lastFlip && lastFlip.t > lastDelay.t)) era.comebackPending = false;
          save();
          refreshAfterEdit(era);
          toast("Delay deleted");
        }
      });
    });
  });
}

function openReasonSheet(era, ev) {
  openSheet(`
    <h2>What was the pull?</h2>
    <p class="lead">Flip at ${esc(fmtTime.format(ev.t))}, ${esc(sameDay(ev.t, Date.now()) ? "today" : fmtDay.format(ev.t))}.</p>
    <div class="chips" id="reason-chips">
      ${(ev.trigger && !era.triggers.includes(ev.trigger) ? [...era.triggers, ev.trigger] : era.triggers).map(t => `<button type="button" class="chip" aria-pressed="${ev.trigger === t}" data-t="${esc(t)}">${esc(t)}</button>`).join("")}
    </div>
    <div class="actions" style="margin-top:20px">
      ${ev.trigger ? `<button class="btn" type="button" id="reason-clear">Remove reason</button>` : ""}
      <button class="btn" type="button" id="reason-cancel">Cancel</button>
    </div>`, body => {
    body.querySelectorAll("#reason-chips .chip").forEach(c => c.addEventListener("click", () => {
      ev.trigger = c.dataset.t;
      save();
      closeSheet();
      renderEra(era);
      toast("Reason saved");
    }));
    const clear = $("#reason-clear");
    if (clear) clear.addEventListener("click", () => {
      delete ev.trigger;
      save();
      closeSheet();
      renderEra(era);
      toast("Reason removed");
    });
    $("#reason-cancel").addEventListener("click", closeSheet);
  });
}

function confirmSheet({ title, body, confirm, danger = false, onConfirm }) {
  openSheet(`
    <h2>${esc(title)}</h2>
    <p class="lead">${esc(body)}</p>
    <div class="actions">
      <button class="btn ${danger ? "danger" : "primary"}" type="button" id="c-yes">${esc(confirm)}</button>
      <button class="btn" type="button" id="c-no">Cancel</button>
    </div>`, () => {
    $("#c-no").addEventListener("click", closeSheet);
    $("#c-yes").addEventListener("click", () => { closeSheet(); onConfirm(); });
  });
}

function confirmGraduate(era) {
  confirmSheet({
    title: `Graduate ${era.name}?`,
    body: `It moves to the Hall of Fame with its ${plural(era.count, "flip", "flips")} and frees a slot in Your Five.`,
    confirm: "Graduate era",
    onConfirm: () => {
      era.graduatedAt = Date.now();
      save();
      showView("home");
      renderHome();
      toast(`${era.name} graduated to the Hall of Fame`);
    }
  });
}

function confirmDelete(era) {
  confirmSheet({
    title: `Delete ${era.name}?`,
    body: `This erases its ${plural(era.count, "flip", "flips")} and all of its history. It can't be undone. Your Logbook entries stay.`,
    confirm: "Delete era",
    danger: true,
    onConfirm: () => {
      state.eras = state.eras.filter(e => e.id !== era.id);
      state.logbook.forEach(e => { if (e.eraId === era.id) { delete e.eraId; delete e.delayRef; } });
      save();
      showView("home");
      renderHome();
      toast("Era deleted");
    }
  });
}

/* ---------------- Logbook ---------------- */

function moodLabel(m) {
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : "";
}

function eraTagHTML(eraId) {
  const era = eraId && findEra(eraId);
  return era ? `<span class="era-tag" style="--era:${esc(era.color)}">${esc(era.name)}</span>` : "";
}

function dayLabel(t) {
  const now = Date.now();
  if (sameDay(t, now)) return "Today";
  if (sameDay(t, now - 86400000)) return "Yesterday";
  return fmtDay.format(t);
}

/** Logbook entries plus delays from every era that have no writing of their own, newest first. */
function logbookItems() {
  const items = state.logbook.map(entry => ({ t: entry.t, entry }));
  const linked = new Set(state.logbook.filter(e => e.delayRef != null).map(e => `${e.eraId}|${e.delayRef}`));
  state.eras.forEach(era => era.events.forEach(ev => {
    if (ev.type === "delay" && !linked.has(`${era.id}|${ev.t}`)) items.push({ t: ev.t, era, ev });
  }));
  return items.sort((a, b) => b.t - a.t);
}

function openLogbook() {
  hideTray();
  showView("logbook");
  $("#logbook-line").textContent = rotate("header", LOGBOOK.headers);
  const paths = $("#lb-paths");
  paths.hidden = true;
  $("#lb-prompts").setAttribute("aria-expanded", "false");
  paths.innerHTML = LOGBOOK.paths.map(p => `
    <button type="button" class="path-btn" data-path="${esc(p.key)}">
      <strong>${esc(p.title)}</strong>
      <span class="muted">${esc(p.prompts[0])}</span>
    </button>`).join("");
  paths.querySelectorAll(".path-btn").forEach(b => b.addEventListener("click", () => openWrite({ path: b.dataset.path })));
  renderLogbook();
}

function renderLogbook() {
  const list = $("#logbook-list");
  const items = logbookItems();
  if (!items.length) {
    list.innerHTML = `<p class="muted lb-empty">Nothing here yet. Whenever you feel like it, one line is plenty.</p>`;
    return;
  }
  const previews = state.settings.showPreviews;
  let html = "";
  let lastDay = null;
  items.forEach((it, i) => {
    const day = dayLabel(it.t);
    if (day !== lastDay) {
      html += `${lastDay === null ? "" : "</ul>"}<h3 class="lb-day">${esc(day)}</h3><ul class="lb-list">`;
      lastDay = day;
    }
    let kind, meta = "", preview = "";
    if (it.entry) {
      const e = it.entry;
      const path = e.path && LOGBOOK.paths.find(p => p.key === e.path);
      kind = linkedDelay(e) ? "Delay" : path ? path.title : "Entry";
      if (e.mood) meta += `<span class="lb-mood">${esc(moodLabel(e.mood))}</span>`;
      meta += eraTagHTML(e.eraId);
      preview = e.text;
    } else {
      kind = "Delay";
      meta += eraTagHTML(it.era.id);
      preview = it.ev.note || (it.ev.plan ? `Next time, I'll ${it.ev.plan}` : "");
    }
    html += `<li><button type="button" class="lb-row" data-i="${i}">
      <time>${esc(fmtTime.format(it.t))}</time>
      <span class="lb-main">
        <span class="lb-meta"><span class="lb-kind">${esc(kind)}</span>${meta}</span>
        ${previews && preview ? `<span class="lb-preview">${esc(preview)}</span>` : ""}
      </span>
    </button></li>`;
  });
  list.innerHTML = html + "</ul>";
  list.querySelectorAll(".lb-row").forEach(b => b.addEventListener("click", () => {
    const it = items[Number(b.dataset.i)];
    if (it.entry) openWrite({ entry: it.entry });
    else openDelayEditSheet(it.era, it.ev);
  }));
}

/* ---------- Writing screen ---------- */

let writeCtx = null; // { entry, t, path, step, answers, before }

function openWrite({ entry = null, path = null } = {}) {
  closeSheet();
  hideTray();
  const p = path ? LOGBOOK.paths.find(x => x.key === path) : null;
  writeCtx = {
    entry,
    t: entry ? entry.t : Date.now(),
    path: p,
    step: 0,
    answers: p ? p.prompts.map(() => "") : null,
    before: entry ? entrySignature(entry) : null
  };
  showView("write");
  renderWrite();
}

function entrySignature(e) {
  return JSON.stringify([e.text, e.mood || "", e.eraId || ""]);
}

function renderWrite() {
  const c = writeCtx;
  const e = c.entry;
  const link = linkedDelay(e);
  const eras = [...activeEras(), ...state.eras.filter(x => x.graduatedAt)];
  const eraId = e ? e.eraId : undefined;
  const when = `${dayLabel(c.t)}, ${fmtTime.format(c.t)}`;
  $("#write-body").innerHTML = `
    <p class="write-when">${esc(when)}${link ? ` · Written with a delay in ${esc(link.era.name)}` : ""}</p>
    ${c.path ? `
    <div class="prompt-card">
      <p class="prompt-step" id="prompt-step"></p>
      <p class="prompt-text" id="prompt-text"></p>
      <div class="prompt-actions">
        ${c.path.prompts.length > 1 ? `<button class="link-btn" type="button" id="prompt-next">Next prompt</button>` : ""}
        <button class="link-btn" type="button" id="prompt-done">Done</button>
      </div>
    </div>` : ""}
    <textarea id="write-text" class="write-text" aria-label="${c.path ? "Your answer" : "Your entry"}"
      placeholder="${esc(c.path ? "Write as much or as little as you like." : rotate("placeholder", LOGBOOK.placeholders))}">${esc(e ? e.text : "")}</textarea>
    <div class="field">
      <span class="label" id="w-mood-label">Mood <span class="muted">(optional)</span></span>
      <div class="chips" id="w-mood" role="group" aria-labelledby="w-mood-label">
        ${MOODS.map(m => `<button type="button" class="chip" aria-pressed="${Boolean(e && e.mood === m)}" data-t="${m}">${moodLabel(m)}</button>`).join("")}
      </div>
    </div>
    <div class="field">
      <label for="w-era">Era <span class="muted">(optional)</span></label>
      <select id="w-era"${link ? " disabled" : ""}>
        <option value="">None</option>
        ${eras.map(x => `<option value="${esc(x.id)}"${x.id === eraId ? " selected" : ""}>${esc(x.name)}${x.graduatedAt ? " (Hall of Fame)" : ""}</option>`).join("")}
      </select>
    </div>
    ${e ? `<div class="actions"><button class="btn danger" type="button" id="w-delete">Delete entry</button></div>` : ""}`;

  c.getMood = singleChoice($("#w-mood"));
  if (c.path) {
    showPrompt();
    const next = $("#prompt-next");
    if (next) next.addEventListener("click", () => {
      c.answers[c.step] = $("#write-text").value;
      c.step = (c.step + 1) % c.path.prompts.length;
      showPrompt();
      $("#write-text").focus();
    });
    $("#prompt-done").addEventListener("click", closeWrite);
  }
  const del = $("#w-delete");
  if (del) del.addEventListener("click", () => confirmSheet({
    title: "Delete this entry?",
    body: link ? "It can't be undone. The delay stays in your history." : "It can't be undone.",
    confirm: "Delete entry",
    danger: true,
    onConfirm: () => {
      state.logbook = state.logbook.filter(x => x !== e);
      if (link) delete link.ev.logbookId;
      save();
      writeCtx = null;
      showView("logbook");
      renderLogbook();
      toast("Entry deleted");
    }
  }));
}

function showPrompt() {
  const c = writeCtx;
  $("#prompt-step").textContent = `${c.path.title} · ${c.step + 1} of ${c.path.prompts.length}`;
  $("#prompt-text").textContent = c.path.prompts[c.step];
  $("#write-text").value = c.answers[c.step];
}

/** Saves what's on the writing screen. Creates the entry the first time there's something to keep. */
function saveWrite() {
  const c = writeCtx;
  if (!c || !$("#write-text")) return false;
  let text;
  if (c.path) {
    c.answers[c.step] = $("#write-text").value;
    text = c.path.prompts
      .map((q, i) => (c.answers[i].trim() ? `${q}\n${c.answers[i].trim()}` : null))
      .filter(Boolean).join("\n\n");
  } else {
    text = $("#write-text").value.trim();
  }
  const mood = c.getMood();
  const eraSel = $("#w-era");
  if (!c.entry) {
    if (!text && !mood) return false; // nothing to keep
    c.entry = normalizeEntry({ id: uid(), t: c.t, text });
    if (c.path) c.entry.path = c.path.key;
    state.logbook.push(c.entry);
  }
  const e = c.entry;
  e.text = text;
  if (mood) e.mood = mood; else delete e.mood;
  if (!eraSel.disabled) { if (eraSel.value) e.eraId = eraSel.value; else delete e.eraId; }
  save();
  return true;
}

/** Leave the writing screen, keeping whatever was written. */
function closeWrite() {
  const c = writeCtx;
  if (!c) return;
  const saved = saveWrite();
  const changed = saved && (c.before === null || entrySignature(c.entry) !== c.before);
  writeCtx = null;
  if (changed) toast(rotate("saved", LOGBOOK.saved));
  if (currentView === "write") { showView("logbook"); renderLogbook(); }
}

// If Flip is closed or sent to the background mid-entry, keep what's written so far.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && writeCtx && saveWrite()) {
    writeCtx.before = writeCtx.before ?? "new"; // an entry now exists; Done should still thank them
  }
});

/* ---------------- Settings & backup ---------------- */

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function backupAge() {
  const t = state.settings.lastExport;
  if (!t) return "You haven't exported a backup yet.";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 1) return "Last backup: today.";
  return `Last backup: ${plural(days, "day", "days")} ago.`;
}

function openSettings() {
  const standalone = isStandalone();
  openSheet(`
    <h2>Settings</h2>

    <div class="section" style="margin-top:12px">
      <h3>Backup</h3>
      <p>Your counts live only on this phone. Export a backup now and then and save it to Files or iCloud Drive.</p>
      <p class="muted">${esc(backupAge())}</p>
      <div class="actions">
        <button class="btn primary" type="button" id="s-export">Export backup</button>
        <button class="btn" type="button" id="s-import">Import backup</button>
        <input type="file" id="s-file" accept="application/json,.json" hidden>
      </div>
    </div>

    <div class="section">
      <h3>Sound</h3>
      <button class="btn" type="button" id="s-sound" aria-pressed="${state.settings.sound}">Flip sound: ${state.settings.sound ? "On" : "Off"}</button>
    </div>

    <div class="section">
      <h3>Logbook</h3>
      <button class="btn" type="button" id="s-previews" aria-pressed="${state.settings.showPreviews}">Show previews in Logbook: ${state.settings.showPreviews ? "On" : "Off"}</button>
      <p class="muted" style="margin-top:8px">When it's on, the Logbook list shows the start of each entry. Off keeps it private if someone glances at your screen.</p>
    </div>

    <div class="section">
      <h3>Where Flip is running</h3>
      <p>${standalone ? "You're using the Home Screen app." : "You're using Flip in a browser tab."}</p>
      <p class="muted">The Home Screen app and Safari keep separate counts. ${standalone ? "Keep using Flip from your Home Screen so everything stays in one place." : "To install Flip, tap Share, then Add to Home Screen, and use it from there."}</p>
      <p class="muted">Saving: ${store.mode === "idb" ? "on this phone" : store.mode === "local" ? "on this phone (basic storage)" : "not available, counts will be lost"}.</p>
    </div>

    <p class="muted" style="margin-top:24px">Flip ${APP_VERSION}</p>
    <div class="actions"><button class="btn" type="button" id="s-close">Done</button></div>`, () => {
    $("#s-close").addEventListener("click", closeSheet);
    $("#s-export").addEventListener("click", exportBackup);
    $("#s-import").addEventListener("click", () => $("#s-file").click());
    $("#s-file").addEventListener("change", e => importBackup(e.target.files[0]));
    $("#s-previews").addEventListener("click", e => {
      state.settings.showPreviews = !state.settings.showPreviews;
      save();
      e.currentTarget.textContent = `Show previews in Logbook: ${state.settings.showPreviews ? "On" : "Off"}`;
      e.currentTarget.setAttribute("aria-pressed", String(state.settings.showPreviews));
      if (currentView === "logbook") renderLogbook();
    });
    $("#s-sound").addEventListener("click", e => {
      state.settings.sound = !state.settings.sound;
      save();
      e.currentTarget.textContent = `Flip sound: ${state.settings.sound ? "On" : "Off"}`;
      e.currentTarget.setAttribute("aria-pressed", String(state.settings.sound));
    });
  });
}

async function exportBackup() {
  const data = serialize({ app: "flip", exportedAt: new Date().toISOString(), state }, 2);
  const name = `flip-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: "application/json" });
  const markDone = () => {
    state.settings.lastExport = Date.now();
    save();
    toast("Backup exported");
  };
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Flip backup" });
      markDone();
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  markDone();
}

async function importBackup(file) {
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    toast("That file isn't a Flip backup.");
    return;
  }
  const incoming = parsed && parsed.state;
  if (!incoming || !Array.isArray(incoming.eras)) {
    toast("That file isn't a Flip backup.");
    return;
  }
  const flips = incoming.eras.reduce((sum, e) => sum + (Number(e.count) || 0), 0);
  const entries = Array.isArray(incoming.logbook) ? incoming.logbook.length : 0;
  confirmSheet({
    title: "Replace everything with this backup?",
    body: `It has ${plural(incoming.eras.length, "era", "eras")}, ${plural(flips, "flip", "flips")} and ${plural(entries, "Logbook entry", "Logbook entries")}. What's on this phone now will be replaced.`,
    confirm: "Restore backup",
    danger: true,
    onConfirm: () => {
      state = normalize(incoming);
      save();
      showView("home");
      renderHome();
      toast("Backup restored");
    }
  });
}

async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch { /* not supported */ }
}

/* ---------------- Quick flip links ---------------- */

function handleHash() {
  const m = location.hash.match(/^#flip-([a-z0-9]+)$/i);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  const era = findEra(m[1]);
  if (!era || era.graduatedAt) {
    toast("That quick flip link doesn't match an era in Your Five.");
    return;
  }
  closeSheet();
  showView("home");
  renderHome();
  setTimeout(() => flip(era.id, { silent: true }), 250);
}

/* ---------------- Boot ---------------- */

$("#open-settings").addEventListener("click", openSettings);
$("#open-hall").addEventListener("click", () => { hideTray(); showView("hall"); renderHall(); });
$("#era-back").addEventListener("click", () => { showView("home"); renderHome(); });
$("#hall-back").addEventListener("click", () => { showView("home"); renderHome(); });
$("#open-logbook").addEventListener("click", openLogbook);
$("#logbook-back").addEventListener("click", () => { showView("home"); renderHome(); });
$("#lb-new").addEventListener("click", () => openWrite());
$("#lb-prompts").addEventListener("click", e => {
  const paths = $("#lb-paths");
  paths.hidden = !paths.hidden;
  e.currentTarget.setAttribute("aria-expanded", String(!paths.hidden));
});
$("#write-back").addEventListener("click", closeWrite);
$("#write-done").addEventListener("click", closeWrite);
window.addEventListener("hashchange", handleHash);

(async function boot() {
  await store.open();
  try {
    state = normalize(await store.get());
  } catch {
    state = freshState();
  }
  if (store.mode === "memory") $("#storage-warning").hidden = false;
  renderHome();
  handleHash();
  requestPersist();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
