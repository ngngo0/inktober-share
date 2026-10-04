"use strict";

/* ==========================================================================
   Inktober 2026 gallery
   Settings live in config.js.
   Sections: config, state, data, derived values, templates, views,
             render, viewer, collage, actions, init
   ========================================================================== */

/* ---- Config (edit config.js) ---- */
const { SUPABASE, YEAR, MONTH, PROMPTS, ARTIST_COLORS, DEFAULT_COLORS, UPLOAD, REACTIONS } = CONFIG;

/* ---- Helpers ---- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const dayOf = (x) => parseInt(String(x.inktoberDay).replace(/\D/g, ""), 10) || 0;
const newestFirst = (a, b) => dayOf(b) - dayOf(a) || a.artist.localeCompare(b.artist);
const oldestFirst = (a, b) => dayOf(a) - dayOf(b);
const dateLabel = (x) => x.title.split(" - ").slice(1).join(" - ") || `Day ${dayOf(x)}`;
const endOfMonth = () => new Date(YEAR, MONTH, 31, 23, 59);
const isOver = () => new Date() > endOfMonth();

/* ---- State ---- */
const params = new URLSearchParams(location.search);
const state = {
  all: [],       // every drawing
  shown: [],     // drawings after the artist filter, newest first
  artists: [],   // sorted artist names
  days: new Map(), // artist -> Set of days posted
  colors: new Map(), // artist -> CSS color
  reactions: {},     // drawing id -> { emoji: { n: count, mine: did this browser react } }
  today: 0,
  view: params.get("view") || "gallery",
  picked: new Set((params.get("artist") || "").split(",").filter(Boolean)),
  viewerIndex: 0,
};

/* ---- Data ---- */
function calendarToday() {
  if (params.get("today")) return +params.get("today"); // ?today=12 for testing
  const now = new Date();
  if (now.getFullYear() === YEAR && now.getMonth() === MONTH) return now.getDate();
  return isOver() ? 31 : 0;
}

function makeDemoData() {
  const names = ["Morgan", "Riley", "Sam"], colors = ["#ff7a1a", "#8fb339", "#b36bff"];
  const last = calendarToday() || 8, items = [];
  for (let day = 1; day <= last; day++) {
    names.forEach((artist, i) => {
      if ((day + i) % 7 === 0 || (day === last && i === 1)) return; // a few gaps; Riley "hasn't posted today"
      const w = (day * 37 + i * 11) % 60;
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'><rect width='300' height='300' fill='#f3e6c8'/><g fill='none' stroke='#1a1020' stroke-width='5' stroke-linecap='round'><path d='M40 ${220 - w} Q150 ${40 + w} 260 ${220 - w}'/><circle cx='150' cy='${160 + w / 3}' r='${50 + w / 2}' stroke='${colors[i]}'/></g><text x='150' y='285' font-size='22' text-anchor='middle' font-family='Georgia'>${PROMPTS[day - 1] || ""}</text></svg>`;
      items.push({ id: `demo${day}-${i}`, title: `${artist} - Oct ${day}, 2026`, artist, inktoberDay: String(day), imageUrl: "data:image/svg+xml," + encodeURIComponent(svg) });
    });
  }
  return items;
}

const LIVE = Boolean(SUPABASE.URL); // no project configured = demo mode

const supabaseFetch = (path, options = {}) => fetch(SUPABASE.URL + path, {
  ...options,
  headers: { apikey: SUPABASE.ANON_KEY, Authorization: `Bearer ${SUPABASE.ANON_KEY}`, ...options.headers },
});
const publicUrl = (path) => `${SUPABASE.URL}/storage/v1/object/public/${SUPABASE.BUCKET}/${path}`;
const toItem = (row) => ({ // database row -> the shape the rest of the app uses
  id: row.id,
  title: `${row.artist} - Oct ${row.inktober_day}, ${YEAR}`,
  artist: row.artist,
  caption: row.caption || "",
  inktoberDay: String(row.inktober_day),
  imageUrl: publicUrl(row.image_path),
});

async function loadData() {
  if (!LIVE) return makeDemoData();
  const rows = [], PAGE = 1000; // the API caps each response, so read in pages
  for (let offset = 0; ; offset += PAGE) {
    const res = await supabaseFetch(`/rest/v1/drawings?select=id,artist,inktober_day,image_path,caption&order=created_at,id&limit=${PAGE}&offset=${offset}`);
    if (!res.ok) throw new Error(res.status);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows.map(toItem);
}

function indexData(items) {
  state.all = items;
  state.artists = [...new Set(items.map((x) => x.artist))].sort((a, b) => a.localeCompare(b));
  state.days = new Map(state.artists.map((a) => [a, new Set(items.filter((x) => x.artist === a).map(dayOf))]));
  state.today = calendarToday() || Math.max(0, ...items.map(dayOf));
  assignColors();
}

/* ---- Derived values ---- */
const normalize = (name) => name.trim().toLowerCase();

function assignColors() { // configured colors first; everyone else cycles through DEFAULT_COLORS
  const chosen = Object.fromEntries(Object.entries(ARTIST_COLORS).map(([name, color]) => [normalize(name), color]));
  const unassigned = state.artists.filter((a) => !chosen[normalize(a)]);
  state.colors = new Map(state.artists.map((a) => [a, chosen[normalize(a)] || DEFAULT_COLORS[unassigned.indexOf(a) % DEFAULT_COLORS.length]]));
}

function readableOn(color) { // dark or light text for a hex background
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(color);
  if (!m) return "var(--ink)";
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#14110f" : "#fffaf0";
}

const tint = (artist) => { const c = state.colors.get(artist); return `style="--c:${esc(c)};--on:${readableOn(c)}"`; }; // attribute string
const accent = (n) => `class="x${n}"`;
const hasPosted = (artist, day) => state.days.get(artist).has(day);
const isLate = (artist) => !isOver() && state.today > 0 && !hasPosted(artist, state.today);

function currentStreak(artist) { // run ending today, or yesterday if today isn't posted yet
  let day = hasPosted(artist, state.today) ? state.today : state.today - 1, run = 0;
  while (day > 0 && hasPosted(artist, day--)) run++;
  return run;
}

function longestStreak(artist) {
  let best = 0, run = 0, prev = -9;
  for (const day of [...state.days.get(artist)].sort((a, b) => a - b)) {
    run = day === prev + 1 ? run + 1 : 1;
    prev = day;
    best = Math.max(best, run);
  }
  return best;
}

function groupByDay() { // Map day -> [[drawing, index in state.shown]]
  const groups = new Map();
  state.shown.forEach((x, i) => {
    const day = dayOf(x);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push([x, i]);
  });
  return groups;
}

/* ---- Templates ---- */
const image = (x, alt = "") => `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(x.imageUrl)}" alt="${esc(alt)}">`;

const cardHtml = (x, i) => `
  <article class="card" ${tint(x.artist)}>
    <button class="card-open" data-action="open" data-index="${i}" aria-label="Open ${esc(x.title)}">
      ${image(x, `Drawing by ${x.artist}, day ${dayOf(x)}`)}
      <strong>${esc(x.artist)}</strong><span>${esc(x.caption || dateLabel(x))}</span>
    </button>
    <div class="reactions" data-id="${esc(x.id)}" role="group" aria-label="Reactions">${reactionButtons(x.id)}</div>
  </article>`;

const statHtml = (value, label, colorAttr) => `<div ${colorAttr}><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;

function chipHtml(artist) {
  const streak = currentStreak(artist), late = isLate(artist);
  return `<button class="chip${late ? " late" : ""}" ${tint(artist)} data-action="pick" data-artist="${esc(artist)}"
    aria-pressed="${state.picked.has(artist)}"${late ? ' title="No drawing yet today"' : ""}>${esc(artist)}${streak > 1 ? `<i>🔥${streak}</i>` : ""}</button>`;
}

/* ---- Views (each returns an HTML string) ---- */
function spotlightHtml(artist) {
  const count = state.all.filter((x) => x.artist === artist).length;
  return `<section class="panel" ${tint(artist)}><h3>${esc(artist)}</h3>
    <div class="stats">
      ${statHtml(count, "drawings", accent(0))}${statHtml(currentStreak(artist), "day streak now", accent(1))}${statHtml(longestStreak(artist), "longest streak", accent(2))}
    </div>
    <button class="no-print" data-action="download">Download my month</button></section>`;
}

function daySectionHtml(day, entries) {
  const isToday = day === state.today && !isOver();
  const empty = `<p class="empty-day">No submissions yet${state.picked.size ? ` from ${[...state.picked].map(esc).join(", ")}` : ""}</p>`;
  return `<section class="day x${day % 5}${isToday ? " today" : ""}" id="day-${day}">
    <h2>${day > 0 ? "Day " + day : "Undated"}${isToday ? '<span class="badge">Today</span>' : ""}${PROMPTS[day - 1] ? `<span class="prompt">${esc(PROMPTS[day - 1])}</span>` : ""}
      ${entries.length ? `<small>${plural(entries.length, "drawing")}</small>` : ""}</h2>
    ${entries.length ? `<div class="grid">${entries.map(([x, i]) => cardHtml(x, i)).join("")}</div>` : empty}</section>`;
}

function galleryView() {
  const spotlight = state.picked.size === 1 ? spotlightHtml([...state.picked][0]) : "";
  const groups = groupByDay();
  const showToday = !isOver() && state.today >= 1 && state.today <= 31; // today always gets a section, even when empty
  if (showToday && !groups.has(state.today)) groups.set(state.today, []);
  const days = [...groups.keys()].sort((a, b) => b - a);
  if (!days.length) return spotlight + `<p class="empty">No drawings match these artists. Try showing everyone.</p>`;
  return spotlight + days.map((day) => daySectionHtml(day, groups.get(day))).join("");
}

function promptsView() {
  const groups = groupByDay();
  const promptCard = (day) => {
    const entries = groups.get(day) || [], word = PROMPTS[day - 1] || "";
    const isToday = day === state.today && !isOver(), upcoming = day > state.today;
    const thumbs = entries.slice(0, 4).map(([x, i]) =>
      `<button class="tb" data-action="open" data-index="${i}" aria-label="Open ${esc(x.artist)}'s drawing for ${esc(word)}">${image(x)}</button>`).join("");
    return `<article class="pr x${day % 5}${isToday ? " now" : ""}${upcoming ? " soon" : ""}">
      <span class="day-label">Day ${day}${isToday ? " (today)" : ""}</span><h3>${esc(word) || "No prompt"}</h3>
      <p>${entries.length ? plural(entries.length, "drawing") : upcoming ? "Coming up" : "No drawings yet"}</p>
      <div class="thumbs">${thumbs}</div>
      ${entries.length ? `<button class="link" data-action="goto" data-day="${day}">See all in gallery</button>` : ""}</article>`;
  };
  const range = (from, to) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  const past = range(1, Math.min(state.today, 31)).reverse(), coming = range(state.today + 1, 31);
  return `<div class="prs">${past.map(promptCard).join("")}</div>` +
    (coming.length ? `<h2 class="coming-up">Coming up</h2><div class="prs">${coming.map(promptCard).join("")}</div>` : "");
}

function calendarView() {
  const firstWeekday = new Date(YEAR, MONTH, 1).getDay();
  const artists = state.picked.size ? state.artists.filter((a) => state.picked.has(a)) : state.artists;
  const cal = (artist) => {
    const cells = ["S", "M", "T", "W", "T", "F", "S"].map((d) => `<span class="weekday">${d}</span>`).join("") + "<span></span>".repeat(firstWeekday);
    const days = Array.from({ length: 31 }, (_, i) => {
      const day = i + 1, now = day === state.today && !isOver() ? " now" : "";
      return hasPosted(artist, day)
        ? `<button class="cd on${now}" data-action="jump" data-artist="${esc(artist)}" data-day="${day}" title="${esc(PROMPTS[i] || "")}" aria-label="${esc(artist)}, day ${day}: view drawing">${day}</button>`
        : `<span class="cd${day > state.today ? " upcoming" : ""}${now}" aria-label="Day ${day}: ${day > state.today ? "upcoming" : "no drawing"}">${day}</span>`;
    }).join("");
    return `<section class="cal" ${tint(artist)}><h3>${esc(artist)}<small>${state.days.get(artist).size} of ${Math.min(state.today, 31)} days</small></h3>
      <div class="cal-grid">${cells}${days}</div></section>`;
  };
  return `<div class="cals">${artists.map(cal).join("")}</div><p class="nudge">Filled circles are drawings. Click one to jump to it.</p>`;
}

function recapView() {
  if (!state.all.length) return `<p class="empty">Nothing to recap yet.</p>`;
  const best = (score) => state.artists.map((a) => [a, score(a)]).sort((a, b) => b[1] - a[1])[0];
  const [topArtist, topCount] = best((a) => state.days.get(a).size);
  const [streakArtist, streakLen] = best(longestStreak);
  const perDay = {};
  state.all.forEach((x) => (perDay[dayOf(x)] = (perDay[dayOf(x)] || 0) + 1));
  const [busyDay, busyCount] = Object.entries(perDay).sort((a, b) => b[1] - a[1])[0];
  const pictures = state.all.slice().sort(oldestFirst).slice(0, 60);
  return `<section class="panel"><h3>${isOver() ? "Inktober 2026 recap" : "Inktober 2026 so far"}</h3>
    <div class="stats">
      ${statHtml(state.all.length, "drawings", accent(0))}${statHtml(state.artists.length, "artists", accent(1))}
      ${statHtml(topArtist, `most drawings (${topCount})`, tint(topArtist))}
      ${statHtml(streakArtist, `longest streak (${streakLen} days)`, tint(streakArtist))}
      ${statHtml("Day " + busyDay, `busiest day (${busyCount})`, accent(4))}
    </div>
    <div class="mini">${pictures.map((x) => image(x, `${x.artist}, day ${dayOf(x)}`)).join("")}</div>
    <p><button class="no-print" data-action="download">Download collage</button></p></section>`;
}

/* ---- Render ---- */
const views = { gallery: galleryView, prompts: promptsView, grid: calendarView, recap: recapView, submit: submitView };

function syncUrl() {
  const next = new URLSearchParams();
  if (state.picked.size) next.set("artist", [...state.picked].join(","));
  if (state.view !== "gallery") next.set("view", state.view);
  try { history.replaceState(null, "", next.toString() ? "?" + next : location.pathname); }
  catch { /* sandboxed previews block this; shared links still work on a real host */ }
}

function render() {
  const { picked, view } = state;
  state.shown = state.all.filter((x) => !picked.size || picked.has(x.artist)).sort(newestFirst);

  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === view));
  $("today").hidden = view !== "gallery";
  $("filters").hidden = view === "submit";
  $("reset").hidden = !picked.size;
  $("count").textContent = view === "gallery" || view === "prompts" ? plural(state.shown.length, "drawing") : "";
  $("tags").innerHTML = state.artists.map(chipHtml).join("");

  const late = isOver() ? [] : state.artists.filter(isLate);
  $("nudge").textContent = !state.today ? "" : late.length ? `Still to post for Day ${state.today}: ${late.join(", ")}` : `Everyone has posted for Day ${state.today}.`;

  $("main").innerHTML = (views[view] || galleryView)();
  syncUrl();
}

function showDay(day) {
  state.view = "gallery";
  render();
  (document.getElementById("day-" + day) || document.querySelector(".day"))?.scrollIntoView({ block: "start" });
}

/* ---- Reactions ---- */
function reactorId() { // an anonymous id kept in this browser; it's how one person's reaction is told from another's
  try {
    let id = localStorage.getItem("inktober-reactor");
    if (!id) localStorage.setItem("inktober-reactor", (id = crypto.randomUUID()));
    return id;
  } catch { return (reactorId.fallback ||= crypto.randomUUID()); }
}

const reactionOf = (id, emoji) => (state.reactions[id] || {})[emoji] || { n: 0, mine: false };

function reactionButtons(id) {
  return REACTIONS.map((emoji) => {
    const { n, mine } = reactionOf(id, emoji);
    return `<button type="button" class="react" data-action="react" data-id="${esc(id)}" data-emoji="${emoji}"
      aria-pressed="${mine}" aria-label="${emoji}: ${plural(n, "reaction")}">${emoji}${n ? `<span>${n}</span>` : ""}</button>`;
  }).join("");
}

function refreshReactions(id) { // redraw the reaction buttons for one drawing (or all), on the card and in the viewer
  document.querySelectorAll(id ? `.reactions[data-id="${id}"]` : ".reactions").forEach((bar) => {
    const focused = bar.contains(document.activeElement) ? document.activeElement.dataset.emoji : null;
    bar.innerHTML = reactionButtons(bar.dataset.id);
    if (focused) [...bar.children].find((b) => b.dataset.emoji === focused)?.focus();
  });
}

async function loadReactions() {
  state.reactions = {};
  if (!LIVE) return;
  const res = await supabaseFetch("/rest/v1/rpc/reaction_summary", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_reactor: reactorId() }),
  });
  if (!res.ok) return; // reactions are optional: the gallery works without them
  for (const row of await res.json()) (state.reactions[row.drawing_id] ||= {})[row.emoji] = { n: row.n, mine: row.mine };
}

function setReaction(id, emoji, mine) {
  const { n } = reactionOf(id, emoji);
  (state.reactions[id] ||= {})[emoji] = { n: Math.max(0, n + (mine ? 1 : -1)), mine };
  refreshReactions(id);
}

const pendingReactions = new Set(); // ignore double-clicks while a request is in flight
async function toggleReaction(id, emoji) {
  const key = id + emoji;
  if (pendingReactions.has(key)) return;
  pendingReactions.add(key);
  const mine = !reactionOf(id, emoji).mine;
  setReaction(id, emoji, mine); // update right away; undo below if the server says no
  try {
    if (LIVE) {
      const res = await supabaseFetch("/rest/v1/rpc/toggle_reaction", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_drawing: id, p_emoji: emoji, p_reactor: reactorId() }),
      });
      if (!res.ok) throw new Error(res.status);
      if ((await res.json()) !== mine) { await loadReactions(); refreshReactions(); } // out of sync (e.g. another tab): trust the server
    }
  } catch { setReaction(id, emoji, !mine); }
  finally { pendingReactions.delete(key); }
}

/* ---- Viewer (native <dialog>: focus trap, Escape and focus return come built in) ---- */
const viewer = $("viewer");

function openViewer(index) {
  const n = state.shown.length;
  if (!n) return;
  state.viewerIndex = (index + n) % n;
  const x = state.shown[state.viewerIndex], day = dayOf(x), word = PROMPTS[day - 1];
  const img = $("viewer-img");
  img.classList.remove("loaded");
  img.onload = () => img.classList.add("loaded");
  img.src = x.imageUrl;
  img.alt = `Drawing by ${x.artist} for day ${day}${word ? ", " + word : ""}`;
  $("viewer-word").textContent = word || "Day " + day;
  $("viewer-meta").textContent = `Day ${day} by ${x.artist}`;
  const bar = $("viewer-reactions");
  bar.dataset.id = x.id;
  bar.innerHTML = reactionButtons(x.id);
  $("viewer-artist").textContent = `More from ${x.artist}`;
  $("viewer-artist").dataset.artist = x.artist;
  $("viewer-full").href = x.imageUrl;
  $("viewer-count").textContent = `${state.viewerIndex + 1} of ${n}`;
  [-1, 1].forEach((step) => { new Image().src = state.shown[(state.viewerIndex + step + n) % n].imageUrl; }); // preload neighbors
  if (!viewer.open) viewer.showModal();
}

const stepViewer = (step) => openViewer(state.viewerIndex + step);

viewer.addEventListener("click", (e) => { if (e.target === viewer) viewer.close(); }); // backdrop click
viewer.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") stepViewer(-1);
  if (e.key === "ArrowRight") stepViewer(1);
});
let touchStartX = null;
viewer.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
viewer.addEventListener("touchend", (e) => {
  if (touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  touchStartX = null;
  if (Math.abs(dx) > 60) stepViewer(dx < 0 ? 1 : -1);
});

/* ---- Collage download (falls back to print if the image host blocks canvas export) ---- */
async function downloadCollage(items, filename) {
  const cell = 300, cols = Math.ceil(Math.sqrt(items.length)), rows = Math.ceil(items.length / cols);
  const canvas = Object.assign(document.createElement("canvas"), { width: cols * cell, height: rows * cell });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#14110f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await Promise.all(items.map((x, i) => new Promise((done) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => { ctx.drawImage(img, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell); done(); };
    img.onerror = done;
    img.src = x.imageUrl;
  })));
  try {
    Object.assign(document.createElement("a"), { href: canvas.toDataURL("image/png"), download: filename + ".png" }).click();
  } catch {
    alert("Your browser blocked saving these images, so the page will open the print dialog. Choose Save as PDF.");
    print();
  }
}

/* ---- Submit view ---- */
const wordFor = (day) => PROMPTS[day - 1] || "";

function submitView() {
  const maxDay = Math.min(Math.max(state.today, 1), 31);
  const options = Array.from({ length: maxDay }, (_, i) => maxDay - i) // newest first, so today is the default
    .map((day) => `<option value="${day}">Day ${day}${wordFor(day) ? ": " + esc(wordFor(day)) : ""}${day === state.today && !isOver() ? " (today)" : ""}</option>`).join("");
  return `<section class="panel x0"><h3>Submit your artwork</h3>
    <p>Prompt: <span class="prompt x0" id="submit-word">${esc(wordFor(maxDay))}</span></p>
    <form class="form" id="submit-form">
      <label>Your name <input name="artist" list="artist-names" required maxlength="40" autocomplete="name"></label>
      <datalist id="artist-names">${state.artists.map((a) => `<option value="${esc(a)}">`).join("")}</datalist>
      <label>Day <select name="day">${options}</select></label>
      <label>Your drawing <input type="file" name="image" accept="image/jpeg,image/png,image/webp" required></label>
      <img class="upload-preview" id="upload-preview" alt="Preview of your drawing" hidden>
      <label>Caption (optional) <input name="caption" maxlength="140" autocomplete="off"></label>
      <label>Super Secret Code <input name="code" required></label>

      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="primary" type="submit">Submit drawing</button>
      <p class="status" id="submit-status" role="status"></p>
    </form></section>`;
}

let previewUrl = null;
function showPreview(file) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = file ? URL.createObjectURL(file) : null;
  const img = $("upload-preview");
  img.hidden = !file;
  if (file) img.src = previewUrl;
}

function setStatus(html, isError = false) {
  const el = $("submit-status");
  el.innerHTML = html;
  el.classList.toggle("error", isError);
}

const UPLOAD_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const readFile = (file) => new Promise((resolve, reject) => { // demo mode only: the original file as a data URL
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error("Couldn't read that file."));
  reader.readAsDataURL(file);
});

async function uploadDrawing({ code, artist, day, file, caption }) {
  // Phase 1: Quick verification call to check passcode before uploading
  const verifyRes = await supabaseFetch("/rest/v1/rpc/validate_code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: code })
  });

  if (!verifyRes.ok) {
    const errData = await verifyRes.json().catch(() => ({}));
    throw new Error(errData.message || "Invalid access code. Upload aborted.");
  }

  // Phase 2: Upload file (Only reached if Phase 1 succeeded)
  const path = `${day}/${crypto.randomUUID()}.${UPLOAD_TYPES[file.type]}`;
  const upload = await supabaseFetch(`/storage/v1/object/${SUPABASE.BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file
  });

  if (!upload.ok) {
    throw new Error("The file upload failed. Please try again.");
  }

  // Phase 3: Submit artwork row to drawings table via RPC
  const saveRes = await supabaseFetch("/rest/v1/rpc/submit_artwork", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_code: code,
      p_artist: artist,
      p_day: day,
      p_caption: caption || null,
      p_image_path: path
    })
  });

  if (!saveRes.ok) {
    throw new Error("Drawing uploaded, but saving to gallery failed.");
  }

}


async function submitArtwork({ artist, day, file, caption = "", code }) {
  if (!file || !(file.type in UPLOAD_TYPES)) throw new Error("Please choose a JPEG, PNG or WebP image.");
  if (file.size > UPLOAD.MAX_FILE_MB * 1024 * 1024) throw new Error(`Please choose an image under ${UPLOAD.MAX_FILE_MB} MB.`);
  if (LIVE) {
    await uploadDrawing({ artist, day, file, caption, code });
    indexData(await loadData());
    return;
  }
  const imageUrl = await readFile(file); // demo mode: add it locally so you can see the whole flow
  indexData([...state.all, { id: `local-${Date.now()}`, title: `${artist} - Oct ${day}, ${YEAR}`, artist, caption, inktoberDay: String(day), imageUrl }]);
}



async function handleSubmit(form) {
  const data = new FormData(form);
  if (data.get("website")) return; // honeypot: bots fill in hidden fields, people don't
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  setStatus("Uploading your drawing…");
  try {
    await submitArtwork({ artist: data.get("artist").trim(), day: +data.get("day"), file: data.get("image"), caption: data.get("caption").trim(), code: data.get("code")});
    showPreview(null);
    render(); // refreshes the artist tags; the form comes back empty
    setStatus('Thank you! Your drawing is in. <button type="button" class="link" data-action="view" data-view="gallery">See the gallery</button>');
  } catch (err) {
    setStatus(esc(err.message || "Something went wrong. Please try again."), true);
  } finally {
    button.disabled = false;
  }
}

/* ---- Actions: one click listener, driven by data-action attributes ---- */
const actions = {
  open: (el) => openViewer(+el.dataset.index),
  react: (el) => toggleReaction(el.dataset.id, el.dataset.emoji),
  goto: (el) => showDay(+el.dataset.day),
  jump: (el) => { state.picked = new Set([el.dataset.artist]); showDay(+el.dataset.day); },
  pick: (el) => { const a = el.dataset.artist; state.picked.has(a) ? state.picked.delete(a) : state.picked.add(a); render(); },
  reset: () => { state.picked.clear(); render(); },
  view: (el) => { state.view = el.dataset.view; render(); scrollTo(0, 0); },
  today: () => showDay(state.today),
  download: () => {
    const artist = state.picked.size === 1 ? [...state.picked][0] : null;
    const items = (artist ? state.all.filter((x) => x.artist === artist) : state.all).slice().sort(oldestFirst);
    downloadCollage(items, "inktober-2026" + (artist ? "-" + artist : ""));
  },
  share: async (el) => {
    try {
      await navigator.clipboard.writeText(location.href);
      el.textContent = "Link copied";
      setTimeout(() => (el.textContent = "Copy link"), 1800);
    } catch { prompt("Copy this link:", location.href); }
  },
  prev: () => stepViewer(-1),
  next: () => stepViewer(1),
  close: () => viewer.close(),
  "viewer-artist": (el) => { state.picked = new Set([el.dataset.artist]); state.view = "gallery"; viewer.close(); render(); scrollTo(0, 0); },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (el) actions[el.dataset.action]?.(el);
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "submit-form") { e.preventDefault(); handleSubmit(e.target); }
});
document.addEventListener("change", (e) => {
  if (e.target.name === "image") showPreview(e.target.files[0]);
  if (e.target.name === "day") $("submit-word").textContent = wordFor(+e.target.value);
});

/* ---- Init ---- */
loadData()
  .then(async (items) => { indexData(items); await loadReactions().catch(() => {}); if (isOver() && !params.get("view")) state.view = "recap"; render(); })
  .catch(() => { $("main").innerHTML = `<p class="empty">The gallery couldn't load. Check the SUPABASE settings in config.js and reload the page.</p>`; });
