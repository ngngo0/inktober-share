"use strict";

/* ==========================================================================
   Inktober 2026 gallery
   Settings live in config.js.
   Sections: config, state, data, derived values, templates, views,
             render, viewer, collage, actions, init
   ========================================================================== */

/* ---- Config (edit config.js) ---- */
const { API_URL, YEAR, MONTH, PROMPTS, ARTIST_COLORS, DEFAULT_COLORS } = CONFIG;

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

async function loadData() {
  if (!API_URL) return makeDemoData();
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(res.status);
  const json = await res.json();
  return Array.isArray(json) ? json : json.galleryData || json.data || [];
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
  <button class="card" ${tint(x.artist)} data-action="open" data-index="${i}" aria-label="Open ${esc(x.title)}">
    ${image(x, `Drawing by ${x.artist}, day ${dayOf(x)}`)}
    <strong>${esc(x.artist)}</strong><span>${esc(x.caption)}</span>
  </button>`;

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

function galleryView() {
  const spotlight = state.picked.size === 1 ? spotlightHtml([...state.picked][0]) : "";
  if (!state.shown.length) return spotlight + `<p class="empty">No drawings match these artists. Try showing everyone.</p>`;
  const groups = groupByDay();
  const sections = [...groups.keys()].sort((a, b) => b - a).map((day) => {
    const entries = groups.get(day), isToday = day === state.today && !isOver();
    return `<section class="day x${day % 5}${isToday ? " today" : ""}" id="day-${day}">
      <h2>${day > 0 ? "Day " + day : "Undated"}${isToday ? '<span class="badge">Today</span>' : ""}${PROMPTS[day - 1] ? `<span class="prompt">${esc(PROMPTS[day - 1])}</span>` : ""}
        <small>${plural(entries.length, "drawing")}</small></h2>
      <div class="grid">${entries.map(([x, i]) => cardHtml(x, i)).join("")}</div></section>`;
  });
  return spotlight + sections.join("");
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
const views = { gallery: galleryView, prompts: promptsView, grid: calendarView, recap: recapView };

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

/* ---- Actions: one click listener, driven by data-action attributes ---- */
const actions = {
  open: (el) => openViewer(+el.dataset.index),
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

/* ---- Init ---- */
loadData()
  .then((items) => { indexData(items); if (isOver() && !params.get("view")) state.view = "recap"; render(); })
  .catch(() => { $("main").innerHTML = `<p class="empty">The gallery couldn't load. Check the API_URL and reload the page.</p>`; });
