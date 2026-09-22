# Birthday Microsite

A private, personalized birthday page with a secure admin editor. Frontend is
plain HTML/CSS/JS (GitHub Pages compatible); the backend is Supabase
(Postgres + Auth + Storage).

```
/
├── index.html          the public site
├── style.css
├── script.js            ← put your Supabase URL/key here
├── admin/
│   ├── index.html        the private editor
│   ├── admin.css
│   └── admin.js          ← and here too (same values)
├── assets/
└── README.md
```

Only one thing works out of the box right now: nothing. You need to create a
Supabase project and connect it before either page will do anything. That
takes about 15 minutes — follow the steps below in order.

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Pick a name, a database password (save it somewhere), and a region close
   to where the birthday person lives.
3. Wait for it to finish provisioning (~2 minutes).

## 2. Create the database tables

In your project, open **SQL Editor → New query**, paste the block below, and
click **Run**.

```sql
create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default '',
  nickname text default '',
  short_intro text default '',
  relationship_type text default 'best friend',
  relationship_description text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text default '',
  memory_date date,
  description text default '',
  photo_url text,
  location text default '',
  emotional_note text default '',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table timeline_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text default '',
  event_date date,
  story text default '',
  photo_url text,
  icon text default '✨',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  short_wishes text default '',
  birthday_message text default '',
  long_letter text default '',
  special_notes text default '',
  inside_jokes jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  caption text default '',
  sort_order int default 0,
  created_at timestamptz default now()
);

create table music (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  track_title text default '',
  artist text default '',
  url text default '',
  enabled boolean default false,
  updated_at timestamptz default now()
);

create table settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  published boolean default false,
  accent text default 'honey',
  mood text default 'daylight',
  typography text default 'editorial',
  interaction_type text default 'candles',
  particles_enabled boolean default true,
  grain_enabled boolean default true,
  animations_enabled boolean default true,
  updated_at timestamptz default now()
);
```

## 3. Lock it down with Row Level Security

Still in the SQL Editor, run this next block. It enables RLS on every table
and applies the same rule everywhere: **the owner can always read/write their
own rows; the public can only read rows once `settings.published = true`.**

```sql
alter table profiles enable row level security;
alter table memories enable row level security;
alter table timeline_events enable row level security;
alter table messages enable row level security;
alter table photos enable row level security;
alter table music enable row level security;
alter table settings enable row level security;

-- Owner: full access to their own rows, on every table
create policy "owner all profiles" on profiles for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner all memories" on memories for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner all timeline_events" on timeline_events for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner all messages" on messages for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner all photos" on photos for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner all music" on music for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner all settings" on settings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Public: read-only, and only when published
create policy "public read profiles" on profiles for select using (
  exists (select 1 from settings s where s.owner_id = profiles.owner_id and s.published = true)
);
create policy "public read memories" on memories for select using (
  exists (select 1 from settings s where s.owner_id = memories.owner_id and s.published = true)
);
create policy "public read timeline_events" on timeline_events for select using (
  exists (select 1 from settings s where s.owner_id = timeline_events.owner_id and s.published = true)
);
create policy "public read messages" on messages for select using (
  exists (select 1 from settings s where s.owner_id = messages.owner_id and s.published = true)
);
create policy "public read music" on music for select using (
  exists (select 1 from settings s where s.owner_id = music.owner_id and s.published = true)
);
create policy "public read settings" on settings for select using (published = true);
```

(`photos` has no public-read policy — it's only ever read by the logged-in
owner. See the note on Media in section 8 below.)

## 4. Create the storage bucket

1. **Storage → New bucket** → name it exactly `photos` → toggle **Public
   bucket** on → Create.
   ("Public" here just means anyone with the exact file URL can view it —
   nobody can list or guess the folder contents, and only the owner can
   upload/delete. That's what makes it work without a server to sign URLs.)
2. Open **SQL Editor** again and run:

```sql
create policy "owner upload own photos" on storage.objects
  for insert with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owner update own photos" on storage.objects
  for update using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owner delete own photos" on storage.objects
  for delete using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "public read photos bucket" on storage.objects
  for select using (bucket_id = 'photos');
```

## 5. Turn off public sign-ups and create the one owner account

This app is designed for exactly one editor — you.

1. **Authentication → Providers → Email** → turn **Allow new users to sign
   up** OFF. (There's no sign-up form in this app anyway, but this closes the
   API route too.)
2. **Authentication → Users → Add user → Create new user.** Enter your email
   and a password, and check **Auto Confirm User**.
3. That's your login for `admin/index.html`.

## 6. Connect the frontend

1. In Supabase, go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key (not the
   `service_role` key — never put that one in frontend code).
3. Open `script.js` and `admin/admin.js`, and near the top of each, replace:

```js
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

   with your real values — the same two values in both files.

The anon key is meant to be public (it ships in every Supabase frontend); the
Row Level Security policies from step 3 are what actually keep the data safe,
not secrecy of that key.

## 7. Try it locally

Open `admin/index.html` in your browser (or serve the folder with any static
file server — e.g. `npx serve .`) and log in with the account from step 5.
Fill in a name at least, then go to **Publish → Publish site**. Open
`index.html` and you should see it live.

## 8. Using the editor

| Admin section | Shows up on the site as |
|---|---|
| **Profile** → name / nickname | The opening screen greeting |
| **Profile** → short intro | The line under the opening headline |
| **Profile** → relationship type / description | The intro paragraph above the timeline |
| **Timeline** | The "How it all started" story timeline |
| **Memories** | The polaroid memory gallery |
| **Messages** → short wishes | First line of the birthday finale |
| **Messages** → birthday message | Second line of the finale, just before the name |
| **Messages** → long letter | The full letter section |
| **Messages** → special note | Revealed after the candles/envelope interaction |
| **Messages** → inside jokes | The tap-to-reveal note chips |
| **Design** → surprise interaction | Candles, envelope, or none |
| **Music** | The floating music button (never autoplays) |
| **Publish** | The single switch that makes the site visible to anyone |

**A note on Media vs. Memories/Timeline:** the **Media** section is a general
photo library (upload once, reuse the URL anywhere). **Memories** and
**Timeline** each have their own **Photo** field with its own direct upload —
they don't automatically pull from the Media library. If you want a photo in
both places, upload it once via Media, then paste that same photo's public
URL into the Memory/Timeline photo field. I split it this way to keep each
section simple and self-contained; if you'd rather have a "choose from
library" picker instead of pasting URLs, that's a reasonable follow-up and I
can add it.

**Draft preview:** the **Preview site** / **Preview draft** links open the
public page with `?preview=1`. While you're logged in, that shows your
current unpublished content (with a small "Draft preview" banner). Signed-out
visitors never see this — they only ever get the published version.

## 9. Deploy to GitHub Pages

1. Create a new GitHub repo and push this whole folder to it (make sure
   `script.js` and `admin/admin.js` already have your real Supabase values
   committed — GitHub Pages just serves static files, so there's no
   server-side env var step here).
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch:
   `main` (or whichever you used), folder `/ (root)` → Save.
3. GitHub gives you a URL like `https://yourname.github.io/repo-name/`. The
   admin editor is at `.../admin/`.
4. In Supabase, go to **Authentication → URL Configuration** and add that
   GitHub Pages URL to the allowed **Site URL** / **Redirect URLs** list.

## 10. Backing up and updating content later

Everything lives in your Supabase project, not in these files, so updating
content is just logging into `/admin/` again — no redeploying needed. To back
up your data: **Supabase → Database → Backups** (automatic on most plans), or
export any table's rows from **Table Editor → ⋯ → Export data**.

---

## Testing checklist

I can't run a live browser against a real Supabase project from where I
built this, so please run through this list yourself once it's connected:

- [ ] **Public visitor flow** — open `index.html` signed out, confirm it shows
      only published content (or the "not ready yet" state if unpublished)
- [ ] **Login flow** — correct and incorrect credentials on `admin/`
- [ ] **Logout flow** — session actually clears, refresh returns to login
- [ ] **Add / edit / delete** — one full pass through Memories, Timeline,
      Messages, Media, Music, Design
- [ ] **Image upload** — upload a photo, confirm it appears on the public
      site after publishing, and that deleting it removes the storage file
- [ ] **Mobile responsiveness** — both pages on an actual phone, not just a
      resized browser window
- [ ] **Database permissions** — while logged out (or in an incognito
      window), try querying the Supabase REST API directly for an
      unpublished table row and confirm it's rejected
- [ ] **Unauthorized access** — confirm `admin/index.html` redirects to the
      login form with no session, and that a second Supabase user (if you
      create one to test) can't see or edit the first owner's rows
- [ ] **GitHub Pages** — the deployed URL, not just localhost, once step 9 is
      done

---

## Scope notes (things I decided so I could actually finish this — flag any
you'd rather change)

- **Surprise interaction:** built "light the candles" and "open the
  envelope," selectable per the Design section. The spec mentioned five
  possible interactions as examples; I picked two rather than building all
  five speculatively.
- **Reordering** (Memories, Timeline, Media) uses ↑ / ↓ buttons rather than
  drag-and-drop, so it stays keyboard-accessible without extra dependencies.
- **Deleting** uses the browser's native confirm dialog rather than a custom
  modal — functional, no extra UI to maintain.
- **Photos bucket is public-read.** This is the standard, low-complexity
  Supabase pattern for a static-hosted frontend with no server to sign URLs.
  Only published rows ever expose these URLs to the public.
