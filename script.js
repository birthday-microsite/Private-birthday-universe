/* ==========================================================================
   Birthday Microsite — Public Site Logic
   Reads PUBLISHED content only (enforced by Supabase Row Level Security).
   ========================================================================== */

// ---------------------------------------------------------------------------
// 1. CONFIG — fill these in with your own Supabase project's values.
//    Project Settings → API → Project URL / anon public key.
//    The anon key is safe to expose publicly; RLS does the real protecting.
// ---------------------------------------------------------------------------
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------------
// 2. LOAD PUBLISHED CONTENT
// ---------------------------------------------------------------------------
async function loadSite() {
  const isPreview = new URLSearchParams(location.search).get("preview") === "1";
  let settings = null;
  let ownerId = null;

  if (isPreview) {
    const { data: sessionData } = await sb.auth.getSession();
    const session = sessionData && sessionData.session;
    if (session) {
      ownerId = session.user.id;
      const { data } = await sb.from("settings").select("*").eq("owner_id", ownerId).maybeSingle();
      settings = data;
      if (settings && !settings.published) showDraftBanner();
    }
  }

  if (!settings) {
    const { data, error } = await sb.from("settings").select("*").eq("published", true).limit(1).maybeSingle();
    if (error || !data) {
      showEmptyState();
      return;
    }
    settings = data;
    ownerId = settings.owner_id;
  }

  const [{ data: profile }, { data: memories }, { data: timelineEvents }, { data: messages }, { data: music }] =
    await Promise.all([
      sb.from("profiles").select("*").eq("owner_id", ownerId).maybeSingle(),
      sb.from("memories").select("*").eq("owner_id", ownerId).order("sort_order", { ascending: true }),
      sb.from("timeline_events").select("*").eq("owner_id", ownerId).order("sort_order", { ascending: true }),
      sb.from("messages").select("*").eq("owner_id", ownerId).maybeSingle(),
      sb.from("music").select("*").eq("owner_id", ownerId).maybeSingle(),
    ]);

  if (!profile) {
    showEmptyState();
    return;
  }

  applyDesignSettings(settings);
  renderIntro(profile);
  renderStory(profile, timelineEvents || []);
  renderGallery(memories || []);
  renderNotes(messages);
  renderLetter(messages);
  renderSurprise(settings, messages, profile);
  renderFinale(messages, profile);
  renderMusic(music);

  document.getElementById("loading-state").hidden = true;
  document.getElementById("app").hidden = false;

  initParticles(settings);
  initScrollReveal();
  initGalleryModal();
  initFinaleObserver();
}

function showDraftBanner() {
  const banner = document.createElement("div");
  banner.textContent = "Draft preview — this isn't published yet";
  banner.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:900;background:#2B231D;color:#F4EBE3;text-align:center;font:600 0.8rem/1 'Inter',sans-serif;padding:0.6rem;letter-spacing:0.02em;";
  document.body.appendChild(banner);
}

function showEmptyState() {
  document.getElementById("loading-state").hidden = true;
  document.getElementById("empty-state").hidden = false;
}

// ---------------------------------------------------------------------------
// 3. DESIGN SETTINGS
// ---------------------------------------------------------------------------
function applyDesignSettings(settings) {
  const root = document.documentElement;
  if (settings.accent && settings.accent !== "honey") root.setAttribute("data-accent", settings.accent);
  if (settings.mood && settings.mood !== "daylight") root.setAttribute("data-mood", settings.mood);
  if (settings.typography && settings.typography !== "editorial") root.setAttribute("data-typography", settings.typography);

  const body = document.body;
  if (settings.grain_enabled === false) body.classList.add("no-grain");
  if (settings.particles_enabled === false) body.classList.add("no-particles");
  if (settings.animations_enabled === false || prefersReducedMotion) body.classList.add("reduce-motion");
}

// ---------------------------------------------------------------------------
// 4. INTRO
// ---------------------------------------------------------------------------
function renderIntro(profile) {
  const displayName = profile.nickname || profile.name || "you";
  document.getElementById("intro-name").textContent = displayName + ".";
  document.getElementById("intro-sub").textContent =
    profile.short_intro || "Before you scroll… this little corner of the internet was made just for you.";

  document.getElementById("open-btn").addEventListener("click", () => {
    document.getElementById("story-section").scrollIntoView({ behavior: "smooth" });
  });
}

// ---------------------------------------------------------------------------
// 5. RELATIONSHIP STORY / TIMELINE
// ---------------------------------------------------------------------------
const RELATIONSHIP_FALLBACKS = {
  "best friend": "A friendship that's carried a lot of good days (and gotten us through the rest).",
  friend: "A friendship worth celebrating today.",
  sibling: "The kind of bond you don't get to choose — and wouldn't want to.",
  cousin: "Family, and a good time, all in one.",
  partner: "A story still being written, one good day at a time.",
  classmate: "It started somewhere ordinary and became something else.",
  teammate: "Built on showing up for each other, on and off the field.",
  "family member": "Family, in the best sense of the word.",
};

function renderStory(profile, events) {
  const type = (profile.relationship_type || "").toLowerCase();
  document.getElementById("story-description").textContent =
    profile.relationship_description || RELATIONSHIP_FALLBACKS[type] || "A story worth telling.";

  const list = document.getElementById("story-timeline");
  if (!events.length) {
    document.getElementById("story-section").hidden = true;
    return;
  }

  list.innerHTML = events
    .map(
      (ev) => `
      <li class="timeline-item">
        <span class="timeline-dot" aria-hidden="true"></span>
        <span class="timeline-date">${formatDate(ev.event_date)}</span>
        <h3 class="timeline-title">${escapeHtml(ev.icon ? ev.icon + " " : "")}${escapeHtml(ev.title || "")}</h3>
        <p class="timeline-story">${escapeHtml(ev.story || "")}</p>
        ${ev.photo_url ? `<div class="timeline-photo"><img src="${escapeAttr(ev.photo_url)}" alt="${escapeAttr(ev.title || "a moment from our story")}" loading="lazy"></div>` : ""}
      </li>`
    )
    .join("");
}

// ---------------------------------------------------------------------------
// 6. MEMORY GALLERY
// ---------------------------------------------------------------------------
let galleryMemories = [];

function renderGallery(memories) {
  galleryMemories = memories;
  const gallery = document.getElementById("gallery");

  if (!memories.length) {
    document.getElementById("gallery-section").hidden = true;
    return;
  }

  gallery.innerHTML = memories
    .map(
      (m, i) => `
      <button class="polaroid" type="button" data-index="${i}" aria-label="Open memory: ${escapeAttr(m.title || "")}">
        ${
          m.photo_url
            ? `<img class="polaroid-photo" src="${escapeAttr(m.photo_url)}" alt="${escapeAttr(m.title || "a memory")}" loading="lazy">`
            : `<div class="polaroid-photo"></div>`
        }
        <p class="polaroid-caption">${escapeHtml(m.title || "")}</p>
        <p class="polaroid-date">${formatDate(m.memory_date)}</p>
      </button>`
    )
    .join("");
}

function initGalleryModal() {
  const modal = document.getElementById("photo-modal");
  const photo = document.getElementById("modal-photo");
  const caption = document.getElementById("modal-caption");
  const note = document.getElementById("modal-note");

  document.getElementById("gallery").addEventListener("click", (e) => {
    const card = e.target.closest(".polaroid");
    if (!card) return;
    const m = galleryMemories[Number(card.dataset.index)];
    if (!m) return;
    photo.src = m.photo_url || "";
    photo.alt = m.title || "";
    caption.textContent = m.title || "";
    note.textContent = [m.description, m.location, m.emotional_note].filter(Boolean).join(" · ");
    modal.classList.add("is-open");
  });

  function close() {
    modal.classList.remove("is-open");
  }
  document.getElementById("modal-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

// ---------------------------------------------------------------------------
// 7. INSIDE JOKES / NOTES
// ---------------------------------------------------------------------------
function renderNotes(messages) {
  const jokes = (messages && messages.inside_jokes) || [];
  if (!jokes.length) return;

  document.getElementById("notes-section").hidden = false;
  document.getElementById("notes").innerHTML = jokes
    .map(
      (joke) => `
      <button class="note-chip" type="button">
        ${escapeHtml(typeof joke === "string" ? joke : joke.text || "")}
        <span class="note-reveal">${escapeHtml(typeof joke === "object" ? joke.reveal || "" : "")}</span>
      </button>`
    )
    .join("");

  document.getElementById("notes").addEventListener("click", (e) => {
    const chip = e.target.closest(".note-chip");
    if (chip) chip.classList.toggle("is-open");
  });
}

// ---------------------------------------------------------------------------
// 8. LETTER
// ---------------------------------------------------------------------------
function renderLetter(messages) {
  const letter = (messages && messages.long_letter) || "";
  if (!letter) {
    document.getElementById("letter-section").hidden = true;
    return;
  }
  document.getElementById("letter-body").textContent = letter;
  document.getElementById("letter-sign").textContent = "— with love";
}

// ---------------------------------------------------------------------------
// 9. SURPRISE / INTERACTION
// ---------------------------------------------------------------------------
function renderSurprise(settings, messages, profile) {
  const type = settings.interaction_type || "none";
  if (type === "none") return;

  const section = document.getElementById("surprise-section");
  const mount = document.getElementById("surprise-mount");
  const hint = document.getElementById("surprise-hint");
  const messageEl = document.getElementById("surprise-message");
  const revealText = (messages && messages.special_notes) || `Happy birthday, ${profile.name || "you"}! 🎉`;

  section.hidden = false;

  function reveal() {
    messageEl.textContent = revealText;
    messageEl.classList.add("is-shown");
  }

  if (type === "candles") {
    hint.textContent = "tap each candle to light it, then make a wish";
    mount.innerHTML = candleSvg();
    const candles = mount.querySelectorAll(".candle");
    candles.forEach((c) =>
      onActivate(c, () => {
        c.classList.add("lit");
        if ([...candles].every((x) => x.classList.contains("lit"))) {
          setTimeout(reveal, 500);
        }
      })
    );
  } else if (type === "envelope") {
    hint.textContent = "tap the envelope to open it";
    mount.innerHTML = envelopeSvg();
    const envelope = mount.querySelector(".envelope");
    onActivate(envelope, () => {
      if (envelope.classList.contains("open")) return;
      envelope.classList.add("open");
      setTimeout(reveal, 650);
    });
  }
}

function onActivate(el, fn) {
  el.addEventListener("click", fn);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      fn();
    }
  });
}

function candleSvg() {
  const positions = [40, 70, 100];
  const candles = positions
    .map(
      (x) => `
    <g class="candle" data-x="${x}" tabindex="0" role="button" aria-label="Light candle">
      <rect x="${x - 4}" y="60" width="8" height="26" rx="2" fill="var(--blush)"/>
      <g class="candle-flame">
        <ellipse cx="${x}" cy="52" rx="4" ry="9" fill="var(--accent)"/>
        <ellipse cx="${x}" cy="55" rx="2" ry="5" fill="#FFF3D6"/>
      </g>
    </g>`
    )
    .join("");
  return `<svg class="cake" viewBox="0 0 140 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="15" y="60" width="110" height="32" rx="8" fill="var(--paper-deep)" stroke="var(--paper-deepest)"/>
    <rect x="25" y="86" width="90" height="10" rx="4" fill="var(--paper-deepest)"/>
    ${candles}
  </svg>`;
}

function envelopeSvg() {
  return `<svg class="envelope" viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg" role="button" tabindex="0" aria-label="Open envelope">
    <rect class="envelope-letter" x="18" y="14" width="124" height="80" rx="4" fill="#FFF9EE" stroke="var(--paper-deepest)"/>
    <rect x="10" y="30" width="140" height="66" rx="6" fill="var(--blush)"/>
    <path d="M10 30 L80 74 L150 30" fill="none" stroke="var(--blush-deep)" stroke-width="2"/>
    <path class="envelope-flap" d="M10 30 L80 74 L150 30 L150 30 L80 8 L10 30 Z" fill="var(--blush-deep)" style="transform-box: fill-box;"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// 10. FINALE
// ---------------------------------------------------------------------------
let finaleData = null;

function renderFinale(messages, profile) {
  finaleData = {
    line1: (messages && messages.short_wishes) || "Okay… one last thing.",
    line2: (messages && messages.birthday_message) || "I hope you know how much you mean to the people around you.",
    name: `Happy Birthday, ${profile.name || "you"} 🎂`,
  };
  document.getElementById("finale-line-1").textContent = finaleData.line1;
  document.getElementById("finale-line-2").textContent = finaleData.line2;
  document.getElementById("finale-name").textContent = finaleData.name;
}

function initFinaleObserver() {
  const finale = document.getElementById("finale");
  let played = false;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !played) {
          played = true;
          playFinaleSequence();
          observer.unobserve(finale);
        }
      });
    },
    { threshold: 0.6 }
  );
  observer.observe(finale);
}

function playFinaleSequence() {
  const line1 = document.getElementById("finale-line-1");
  const line2 = document.getElementById("finale-line-2");
  const name = document.getElementById("finale-name");
  const step = prefersReducedMotion || document.body.classList.contains("reduce-motion") ? 0 : 1400;

  line1.classList.add("is-shown");
  setTimeout(() => {
    line1.classList.remove("is-shown");
    line2.classList.add("is-shown");
  }, step);
  setTimeout(() => {
    line2.classList.remove("is-shown");
    name.classList.add("is-shown");
    fireConfetti();
  }, step * 2);
}

function fireConfetti() {
  if (prefersReducedMotion || document.body.classList.contains("reduce-motion")) return;
  const canvas = document.getElementById("finale-canvas");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  ctx.scale(dpr, dpr);

  const colors = ["#D9A441", "#E3A9A0", "#7C8B5A", "#F4EBE3"];
  const pieces = Array.from({ length: 70 }, () => ({
    x: rect.width / 2,
    y: rect.height * 0.35,
    vx: (Math.random() - 0.5) * 9,
    vy: Math.random() * -7 - 3,
    size: Math.random() * 5 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    spin: (Math.random() - 0.5) * 10,
  }));

  let frame = 0;
  function tick() {
    frame++;
    ctx.clearRect(0, 0, rect.width, rect.height);
    pieces.forEach((p) => {
      p.vy += 0.18;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    if (frame < 130) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, rect.width, rect.height);
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// 11. MUSIC
// ---------------------------------------------------------------------------
function renderMusic(music) {
  if (!music || !music.enabled || !music.url) return;

  const player = document.getElementById("music-player");
  const toggle = document.getElementById("music-toggle");
  const muteBtn = document.getElementById("music-mute");
  const audio = document.getElementById("bg-audio");
  const note = document.getElementById("music-note");
  const label = document.getElementById("music-label");

  audio.src = music.url;
  label.textContent = music.track_title ? `${music.track_title}${music.artist ? " — " + music.artist : ""}` : "Music";
  player.hidden = false;

  toggle.addEventListener("click", () => {
    if (audio.paused) {
      audio.play().catch(() => {});
      note.classList.add("is-playing");
      toggle.setAttribute("aria-pressed", "true");
      toggle.setAttribute("aria-label", "Pause music");
    } else {
      audio.pause();
      note.classList.remove("is-playing");
      toggle.setAttribute("aria-pressed", "false");
      toggle.setAttribute("aria-label", "Play music");
    }
  });

  muteBtn.addEventListener("click", () => {
    audio.muted = !audio.muted;
    muteBtn.textContent = audio.muted ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-pressed", String(audio.muted));
    muteBtn.setAttribute("aria-label", audio.muted ? "Unmute music" : "Mute music");
  });
}

// ---------------------------------------------------------------------------
// 12. AMBIENT PARTICLES
// ---------------------------------------------------------------------------
function initParticles(settings) {
  if (settings.particles_enabled === false) return;
  if (prefersReducedMotion) return;

  const field = document.getElementById("intro-particles");
  const count = 14;
  let html = "";
  for (let i = 0; i < count; i++) {
    const left = Math.random() * 100;
    const duration = 9 + Math.random() * 8;
    const delay = Math.random() * 10;
    const drift = Math.random() * 60 - 30;
    html += `<span class="particle" style="left:${left}%; animation-duration:${duration}s; animation-delay:${delay}s; --drift:${drift}px;"></span>`;
  }
  field.innerHTML = html;
}

// ---------------------------------------------------------------------------
// 13. SCROLL REVEAL
// ---------------------------------------------------------------------------
function initScrollReveal() {
  const items = document.querySelectorAll(".reveal");
  if (prefersReducedMotion || document.body.classList.contains("reduce-motion")) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  items.forEach((el) => observer.observe(el));
}

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}

loadSite();
