/* ==========================================================================
   Birthday Microsite — Admin Logic
   Keep these two values in sync with the ones at the top of ../script.js
   ========================================================================== */
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let ownerId = null;
let dirty = false;
const state = {
  profile: null,
  memories: [],
  timelineEvents: [],
  messages: null,
  photos: [],
  music: null,
  settings: null,
};

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
async function init() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    await enterDashboard(data.session.user.id);
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById("login-view").hidden = false;
  document.getElementById("dashboard-view").hidden = true;
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.hidden = true;

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = "Couldn't log in — check the email and password.";
    errorEl.hidden = false;
    return;
  }
  await enterDashboard(data.user.id);
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await sb.auth.signOut();
  location.reload();
});

// ---------------------------------------------------------------------------
// DASHBOARD BOOTSTRAP
// ---------------------------------------------------------------------------
async function enterDashboard(uid) {
  ownerId = uid;
  document.getElementById("login-view").hidden = true;
  document.getElementById("dashboard-view").hidden = false;

  await ensureDefaults();
  await loadAll();
  renderProfile();
  renderMemories();
  renderTimeline();
  renderMessages();
  renderMedia();
  renderMusic();
  renderDesign();
  renderPublish();
  bindNav();
  bindDirtyTracking();
}

async function ensureDefaults() {
  const { data: profile } = await sb.from("profiles").select("id").eq("owner_id", ownerId).maybeSingle();
  if (!profile) await sb.from("profiles").insert({ owner_id: ownerId, name: "" });

  const { data: messages } = await sb.from("messages").select("id").eq("owner_id", ownerId).maybeSingle();
  if (!messages) await sb.from("messages").insert({ owner_id: ownerId, inside_jokes: [] });

  const { data: music } = await sb.from("music").select("id").eq("owner_id", ownerId).maybeSingle();
  if (!music) await sb.from("music").insert({ owner_id: ownerId, enabled: false });

  const { data: settings } = await sb.from("settings").select("id").eq("owner_id", ownerId).maybeSingle();
  if (!settings) await sb.from("settings").insert({ owner_id: ownerId });
}

async function loadAll() {
  const [profile, memories, timelineEvents, messages, photos, music, settings] = await Promise.all([
    sb.from("profiles").select("*").eq("owner_id", ownerId).maybeSingle(),
    sb.from("memories").select("*").eq("owner_id", ownerId).order("sort_order"),
    sb.from("timeline_events").select("*").eq("owner_id", ownerId).order("sort_order"),
    sb.from("messages").select("*").eq("owner_id", ownerId).maybeSingle(),
    sb.from("photos").select("*").eq("owner_id", ownerId).order("sort_order"),
    sb.from("music").select("*").eq("owner_id", ownerId).maybeSingle(),
    sb.from("settings").select("*").eq("owner_id", ownerId).maybeSingle(),
  ]);
  state.profile = profile.data;
  state.memories = memories.data || [];
  state.timelineEvents = timelineEvents.data || [];
  state.messages = messages.data;
  state.photos = photos.data || [];
  state.music = music.data;
  state.settings = settings.data;
}

// ---------------------------------------------------------------------------
// NAV
// ---------------------------------------------------------------------------
function bindNav() {
  document.getElementById("sidebar").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item");
    if (!btn) return;
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("is-active"));
    btn.classList.add("is-active");
    const view = btn.dataset.view;
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === view));
  });
  document.querySelector('.view[data-view="profile"]').classList.add("is-active");
}

function bindDirtyTracking() {
  document.querySelectorAll(".panel input, .panel select, .panel textarea").forEach((el) => {
    el.addEventListener("input", () => setDirty(true));
  });
}

function setDirty(value) {
  dirty = value;
  document.getElementById("save-indicator").hidden = !value;
}

window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toast.hidden = true), 2200);
}

// ---------------------------------------------------------------------------
// PROFILE
// ---------------------------------------------------------------------------
function renderProfile() {
  const p = state.profile || {};
  document.getElementById("p-name").value = p.name || "";
  document.getElementById("p-nickname").value = p.nickname || "";
  document.getElementById("p-short-intro").value = p.short_intro || "";
  document.getElementById("p-relationship-type").value = p.relationship_type || "best friend";
  document.getElementById("p-relationship-description").value = p.relationship_description || "";
}

document.getElementById("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    owner_id: ownerId,
    name: document.getElementById("p-name").value.trim(),
    nickname: document.getElementById("p-nickname").value.trim(),
    short_intro: document.getElementById("p-short-intro").value.trim(),
    relationship_type: document.getElementById("p-relationship-type").value,
    relationship_description: document.getElementById("p-relationship-description").value.trim(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("profiles").update(payload).eq("owner_id", ownerId);
  if (error) return showToast("Couldn't save profile.");
  showToast("Profile saved.");
  setDirty(false);
});

// ---------------------------------------------------------------------------
// MEMORIES
// ---------------------------------------------------------------------------
function renderMemories() {
  const list = document.getElementById("memory-list");
  list.innerHTML = state.memories
    .map(
      (m, i) => `
    <li class="item-card" data-id="${m.id}">
      <div class="item-card-head">
        <span class="item-card-title">${escapeHtml(m.title || "Untitled memory")}</span>
        <div class="item-card-actions">
          <button class="btn btn--icon" data-action="up" ${i === 0 ? "disabled" : ""} type="button" aria-label="Move up">↑</button>
          <button class="btn btn--icon" data-action="down" ${i === state.memories.length - 1 ? "disabled" : ""} type="button" aria-label="Move down">↓</button>
          <button class="btn btn--icon btn--danger" data-action="delete" type="button" aria-label="Delete">✕</button>
        </div>
      </div>
      <div class="form-grid">
        <label class="field"><span>Title</span><input type="text" data-field="title" value="${escapeAttr(m.title || "")}"></label>
        <label class="field"><span>Date</span><input type="date" data-field="memory_date" value="${m.memory_date || ""}"></label>
        <label class="field field--wide"><span>Description</span><textarea rows="2" data-field="description">${escapeHtml(m.description || "")}</textarea></label>
        <label class="field"><span>Location (optional)</span><input type="text" data-field="location" value="${escapeAttr(m.location || "")}"></label>
        <label class="field"><span>Emotional note (optional)</span><input type="text" data-field="emotional_note" value="${escapeAttr(m.emotional_note || "")}"></label>
        <div class="field field--wide">
          <span>Photo</span>
          ${m.photo_url ? `<img class="item-thumb" src="${escapeAttr(m.photo_url)}" alt="">` : ""}
          <input type="file" accept="image/*" data-field="photo_upload">
          <input type="hidden" data-field="photo_url" value="${escapeAttr(m.photo_url || "")}">
        </div>
        <div class="form-actions"><button class="btn btn--sm" data-action="save" type="button">Save memory</button></div>
      </div>
    </li>`
    )
    .join("");
}

document.getElementById("add-memory-btn").addEventListener("click", async () => {
  const nextOrder = state.memories.length;
  const { data, error } = await sb
    .from("memories")
    .insert({ owner_id: ownerId, title: "New memory", sort_order: nextOrder })
    .select()
    .single();
  if (error) return showToast("Couldn't add memory.");
  state.memories.push(data);
  renderMemories();
});

document.getElementById("memory-list").addEventListener("click", (e) => onItemListClick(e, "memories", state.memories, renderMemories));

// ---------------------------------------------------------------------------
// TIMELINE
// ---------------------------------------------------------------------------
function renderTimeline() {
  const list = document.getElementById("event-list");
  list.innerHTML = state.timelineEvents
    .map(
      (ev, i) => `
    <li class="item-card" data-id="${ev.id}">
      <div class="item-card-head">
        <span class="item-card-title">${escapeHtml(ev.title || "Untitled event")}</span>
        <div class="item-card-actions">
          <button class="btn btn--icon" data-action="up" ${i === 0 ? "disabled" : ""} type="button" aria-label="Move up">↑</button>
          <button class="btn btn--icon" data-action="down" ${i === state.timelineEvents.length - 1 ? "disabled" : ""} type="button" aria-label="Move down">↓</button>
          <button class="btn btn--icon btn--danger" data-action="delete" type="button" aria-label="Delete">✕</button>
        </div>
      </div>
      <div class="form-grid">
        <label class="field"><span>Title</span><input type="text" data-field="title" value="${escapeAttr(ev.title || "")}"></label>
        <label class="field"><span>Date</span><input type="date" data-field="event_date" value="${ev.event_date || ""}"></label>
        <label class="field"><span>Icon (emoji)</span><input type="text" data-field="icon" value="${escapeAttr(ev.icon || "")}" maxlength="4"></label>
        <label class="field field--wide"><span>Story</span><textarea rows="3" data-field="story">${escapeHtml(ev.story || "")}</textarea></label>
        <div class="field field--wide">
          <span>Photo</span>
          ${ev.photo_url ? `<img class="item-thumb" src="${escapeAttr(ev.photo_url)}" alt="">` : ""}
          <input type="file" accept="image/*" data-field="photo_upload">
          <input type="hidden" data-field="photo_url" value="${escapeAttr(ev.photo_url || "")}">
        </div>
        <div class="form-actions"><button class="btn btn--sm" data-action="save" type="button">Save event</button></div>
      </div>
    </li>`
    )
    .join("");
}

document.getElementById("add-event-btn").addEventListener("click", async () => {
  const nextOrder = state.timelineEvents.length;
  const { data, error } = await sb
    .from("timeline_events")
    .insert({ owner_id: ownerId, title: "New event", icon: "✨", sort_order: nextOrder })
    .select()
    .single();
  if (error) return showToast("Couldn't add event.");
  state.timelineEvents.push(data);
  renderTimeline();
});

document.getElementById("event-list").addEventListener("click", (e) => onItemListClick(e, "timeline_events", state.timelineEvents, renderTimeline));

// ---------------------------------------------------------------------------
// Shared item-list handling (memories + timeline share this shape)
// ---------------------------------------------------------------------------
async function onItemListClick(e, table, arr, rerender) {
  const card = e.target.closest(".item-card");
  if (!card) return;
  const id = card.dataset.id;
  const action = e.target.dataset.action;
  if (!action) return;

  const index = arr.findIndex((x) => String(x.id) === String(id));
  if (index === -1) return;

  if (action === "delete") {
    if (!confirm("Delete this? This can't be undone.")) return;
    const item = arr[index];
    if (item.photo_url) await deleteStorageObjectByUrl(item.photo_url);
    const { error } = await sb.from(table).delete().eq("id", id);
    if (error) return showToast("Couldn't delete.");
    arr.splice(index, 1);
    await resequence(table, arr);
    rerender();
    showToast("Deleted.");
    return;
  }

  if (action === "up" || action === "down") {
    const swapWith = action === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= arr.length) return;
    [arr[index], arr[swapWith]] = [arr[swapWith], arr[index]];
    await resequence(table, arr);
    rerender();
    return;
  }

  if (action === "save") {
    const fields = card.querySelectorAll("[data-field]");
    const payload = {};
    let fileInput = null;
    fields.forEach((f) => {
      if (f.dataset.field === "photo_upload") {
        if (f.files && f.files[0]) fileInput = f;
      } else {
        payload[f.dataset.field] = f.value;
      }
    });

    if (fileInput) {
      const url = await uploadImage(fileInput.files[0], table === "memories" ? "memories" : "timeline");
      if (url) payload.photo_url = url;
    }

    const { error } = await sb.from(table).update(payload).eq("id", id);
    if (error) return showToast("Couldn't save.");
    Object.assign(arr[index], payload);
    rerender();
    showToast("Saved.");
  }
}

async function resequence(table, arr) {
  await Promise.all(arr.map((item, i) => sb.from(table).update({ sort_order: i }).eq("id", item.id)));
  arr.forEach((item, i) => (item.sort_order = i));
}

// ---------------------------------------------------------------------------
// MESSAGES
// ---------------------------------------------------------------------------
function renderMessages() {
  const m = state.messages || {};
  document.getElementById("m-short-wishes").value = m.short_wishes || "";
  document.getElementById("m-birthday-message").value = m.birthday_message || "";
  document.getElementById("m-long-letter").value = m.long_letter || "";
  document.getElementById("m-special-notes").value = m.special_notes || "";
  renderJokes(m.inside_jokes || []);
}

function renderJokes(jokes) {
  const container = document.getElementById("jokes-list");
  container.innerHTML = jokes
    .map(
      (j, i) => `
    <div class="joke-row" data-index="${i}">
      <input type="text" data-joke="text" placeholder="Tap-to-reveal line" value="${escapeAttr(typeof j === "string" ? j : j.text || "")}">
      <input type="text" data-joke="reveal" placeholder="What it reveals (optional)" value="${escapeAttr(typeof j === "object" ? j.reveal || "" : "")}">
      <button class="btn btn--icon btn--danger" type="button" data-action="remove-joke" aria-label="Remove">✕</button>
    </div>`
    )
    .join("");
}

document.getElementById("add-joke-btn").addEventListener("click", () => {
  const jokes = collectJokes();
  jokes.push({ text: "", reveal: "" });
  renderJokes(jokes);
  setDirty(true);
});

document.getElementById("jokes-list").addEventListener("click", (e) => {
  if (e.target.dataset.action === "remove-joke") {
    const jokes = collectJokes();
    const index = Number(e.target.closest(".joke-row").dataset.index);
    jokes.splice(index, 1);
    renderJokes(jokes);
    setDirty(true);
  }
});

function collectJokes() {
  return [...document.querySelectorAll(".joke-row")].map((row) => ({
    text: row.querySelector('[data-joke="text"]').value.trim(),
    reveal: row.querySelector('[data-joke="reveal"]').value.trim(),
  }));
}

document.getElementById("messages-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    owner_id: ownerId,
    short_wishes: document.getElementById("m-short-wishes").value.trim(),
    birthday_message: document.getElementById("m-birthday-message").value.trim(),
    long_letter: document.getElementById("m-long-letter").value.trim(),
    special_notes: document.getElementById("m-special-notes").value.trim(),
    inside_jokes: collectJokes().filter((j) => j.text),
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("messages").update(payload).eq("owner_id", ownerId);
  if (error) return showToast("Couldn't save messages.");
  state.messages = { ...state.messages, ...payload };
  showToast("Messages saved.");
  setDirty(false);
});

// ---------------------------------------------------------------------------
// MEDIA LIBRARY
// ---------------------------------------------------------------------------
function renderMedia() {
  const list = document.getElementById("media-list");
  list.innerHTML = state.photos
    .map(
      (p, i) => `
    <li class="media-item" data-id="${p.id}">
      <img src="${escapeAttr(p.url)}" alt="">
      <div class="media-item-foot">
        <input type="text" data-field="caption" placeholder="Caption" value="${escapeAttr(p.caption || "")}">
        <div class="media-item-row">
          <button class="btn btn--icon" data-action="up" ${i === 0 ? "disabled" : ""} type="button" aria-label="Move earlier">↑</button>
          <button class="btn btn--icon" data-action="down" ${i === state.photos.length - 1 ? "disabled" : ""} type="button" aria-label="Move later">↓</button>
          <button class="btn btn--icon btn--danger" data-action="delete" type="button" aria-label="Delete">✕</button>
        </div>
      </div>
    </li>`
    )
    .join("");
}

document.getElementById("media-upload").addEventListener("click", (e) => e.currentTarget.querySelector("input").click());
document.getElementById("media-input").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  for (const file of files) {
    const url = await uploadImage(file, "media");
    if (!url) continue;
    const { data, error } = await sb
      .from("photos")
      .insert({ owner_id: ownerId, url, sort_order: state.photos.length })
      .select()
      .single();
    if (!error) state.photos.push(data);
  }
  renderMedia();
  e.target.value = "";
});

document.getElementById("media-list").addEventListener("click", async (e) => {
  const item = e.target.closest(".media-item");
  if (!item) return;
  const id = item.dataset.id;
  const action = e.target.dataset.action;
  const index = state.photos.findIndex((p) => String(p.id) === String(id));
  if (index === -1) return;

  if (action === "delete") {
    if (!confirm("Delete this photo? This can't be undone.")) return;
    await deleteStorageObjectByUrl(state.photos[index].url);
    const { error } = await sb.from("photos").delete().eq("id", id);
    if (error) return showToast("Couldn't delete.");
    state.photos.splice(index, 1);
    await resequence("photos", state.photos);
    renderMedia();
    showToast("Deleted.");
  } else if (action === "up" || action === "down") {
    const swapWith = action === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= state.photos.length) return;
    [state.photos[index], state.photos[swapWith]] = [state.photos[swapWith], state.photos[index]];
    await resequence("photos", state.photos);
    renderMedia();
  }
});

document.getElementById("media-list").addEventListener(
  "change",
  debounce(async (e) => {
    if (e.target.dataset.field !== "caption") return;
    const item = e.target.closest(".media-item");
    const id = item.dataset.id;
    const caption = e.target.value.trim();
    await sb.from("photos").update({ caption }).eq("id", id);
    const p = state.photos.find((x) => String(x.id) === String(id));
    if (p) p.caption = caption;
    showToast("Caption saved.");
  }, 300)
);

// ---------------------------------------------------------------------------
// MUSIC
// ---------------------------------------------------------------------------
function renderMusic() {
  const m = state.music || {};
  document.getElementById("mu-title").value = m.track_title || "";
  document.getElementById("mu-artist").value = m.artist || "";
  document.getElementById("mu-url").value = m.url || "";
  document.getElementById("mu-enabled").checked = !!m.enabled;
}

document.getElementById("music-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    owner_id: ownerId,
    track_title: document.getElementById("mu-title").value.trim(),
    artist: document.getElementById("mu-artist").value.trim(),
    url: document.getElementById("mu-url").value.trim(),
    enabled: document.getElementById("mu-enabled").checked,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("music").update(payload).eq("owner_id", ownerId);
  if (error) return showToast("Couldn't save music.");
  state.music = { ...state.music, ...payload };
  showToast("Music saved.");
  setDirty(false);
});

// ---------------------------------------------------------------------------
// DESIGN
// ---------------------------------------------------------------------------
function renderDesign() {
  const s = state.settings || {};
  document.getElementById("d-accent").value = s.accent || "honey";
  document.getElementById("d-mood").value = s.mood || "daylight";
  document.getElementById("d-typography").value = s.typography || "editorial";
  document.getElementById("d-interaction").value = s.interaction_type || "candles";
  document.getElementById("d-particles").checked = s.particles_enabled !== false;
  document.getElementById("d-grain").checked = s.grain_enabled !== false;
  document.getElementById("d-animations").checked = s.animations_enabled !== false;
}

document.getElementById("design-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    accent: document.getElementById("d-accent").value,
    mood: document.getElementById("d-mood").value,
    typography: document.getElementById("d-typography").value,
    interaction_type: document.getElementById("d-interaction").value,
    particles_enabled: document.getElementById("d-particles").checked,
    grain_enabled: document.getElementById("d-grain").checked,
    animations_enabled: document.getElementById("d-animations").checked,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("settings").update(payload).eq("owner_id", ownerId);
  if (error) return showToast("Couldn't save design.");
  state.settings = { ...state.settings, ...payload };
  showToast("Design saved.");
  setDirty(false);
});

// ---------------------------------------------------------------------------
// PUBLISH
// ---------------------------------------------------------------------------
function renderPublish() {
  const published = !!(state.settings && state.settings.published);
  document.getElementById("publish-status").textContent = published
    ? "🟢 Live — visitors can see this page."
    : "⚪️ Draft — only you can see this (use Preview draft).";
  document.getElementById("publish-toggle-btn").textContent = published ? "Unpublish" : "Publish site";
  document.getElementById("publish-btn").textContent = published ? "Unpublish" : "Publish";
}

async function togglePublish() {
  const next = !(state.settings && state.settings.published);
  if (next && !state.profile.name) {
    showToast("Add a name in Profile before publishing.");
    return;
  }
  const { error } = await sb.from("settings").update({ published: next }).eq("owner_id", ownerId);
  if (error) return showToast("Couldn't update publish status.");
  state.settings.published = next;
  renderPublish();
  showToast(next ? "Published!" : "Unpublished.");
}

document.getElementById("publish-toggle-btn").addEventListener("click", togglePublish);
document.getElementById("publish-btn").addEventListener("click", togglePublish);

// ---------------------------------------------------------------------------
// STORAGE HELPERS
// ---------------------------------------------------------------------------
async function uploadImage(file, folder) {
  const path = `${ownerId}/${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
  const { error } = await sb.storage.from("photos").upload(path, file, { upsert: false });
  if (error) {
    showToast("Upload failed.");
    return null;
  }
  const { data } = sb.storage.from("photos").getPublicUrl(path);
  return data.publicUrl;
}

async function deleteStorageObjectByUrl(url) {
  if (!url) return;
  const marker = "/object/public/photos/";
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(url.slice(idx + marker.length));
  await sb.storage.from("photos").remove([path]);
}

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

init();
