-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- The page uses the public "anon" key, so these rules ARE the security: anyone may read visible
-- drawings and add new ones, and nobody using the anon key can edit or delete anything.

-- ---- Table ----
create table if not exists public.drawings (
  id           uuid primary key default gen_random_uuid(),
  legacy_id    text unique,                        -- old Google Drive file id (set by the migration only)
  artist       text not null check (char_length(btrim(artist)) between 1 and 40),
  inktober_day smallint not null check (inktober_day between 1 and 31),
  image_path   text not null check (image_path ~ '^[0-9]{1,2}/[A-Za-z0-9._-]+$'),
  hidden       boolean not null default false,     -- set to true in the dashboard to take a drawing down
  created_at   timestamptz not null default now()
);

-- Optional caption, shown on the card instead of the date. Safe to run even if you added it already.
alter table public.drawings
  add column if not exists caption text check (caption is null or char_length(caption) between 1 and 140);

alter table public.drawings enable row level security;

drop policy if exists "anyone can view visible drawings" on public.drawings;
create policy "anyone can view visible drawings"
  on public.drawings for select to anon
  using (not hidden);

drop policy if exists "anyone can submit a drawing" on public.drawings;
create policy "anyone can submit a drawing"
  on public.drawings for insert to anon
  with check (not hidden and legacy_id is null);

-- Column-level limits: the page may read everything it needs and insert only these four fields.
revoke all on public.drawings from anon;
grant select (id, artist, inktober_day, image_path, caption, created_at) on public.drawings to anon;
grant insert (artist, inktober_day, image_path, caption)       on public.drawings to anon;

-- ---- Image storage ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drawings', 'drawings', true, 15 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can add a file in the expected "day/filename" shape. There is no read, update or delete
-- policy for anon: files are served through the bucket's public URLs and can't be listed or replaced.
drop policy if exists "anyone can upload drawings" on storage.objects;
create policy "anyone can upload drawings"
  on storage.objects for insert to anon
  with check (bucket_id = 'drawings' and name ~ '^[0-9]{1,2}/[A-Za-z0-9._-]+$');

-- ---- Emoji reactions ----
-- Each browser has a random anonymous id. The table is locked: the page can't read or write it directly,
-- it can only call the two functions below, which check everything first.
create table if not exists public.reactions (
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  emoji      text not null check (emoji in ('❤️', '🔥', '😍', '👏', '🎃')),  -- keep in step with REACTIONS in config.js
  reactor    uuid not null,
  created_at timestamptz not null default now(),
  primary key (drawing_id, emoji, reactor)
);
alter table public.reactions enable row level security; -- no policies on purpose: anon can't touch the table
revoke all on public.reactions from anon;

-- Counts for every visible drawing, plus which ones this browser has reacted to. One value, so no row cap.
create or replace function public.reaction_summary(p_reactor uuid default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('drawing_id', t.drawing_id, 'emoji', t.emoji, 'n', t.n, 'mine', t.mine)), '[]'::jsonb)
  from (
    select r.drawing_id, r.emoji, count(*)::int as n, coalesce(bool_or(r.reactor = p_reactor), false) as mine
    from public.reactions r
    join public.drawings d on d.id = r.drawing_id and not d.hidden
    group by r.drawing_id, r.emoji
  ) t;
$$;

-- Adds your reaction, or removes it if you already reacted. Returns true if it is now added.
create or replace function public.toggle_reaction(p_drawing uuid, p_emoji text, p_reactor uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.drawings where id = p_drawing and not hidden) then
    raise exception 'unknown drawing';
  end if;
  delete from public.reactions where drawing_id = p_drawing and emoji = p_emoji and reactor = p_reactor;
  if found then return false; end if;
  if (select count(*) from public.reactions where reactor = p_reactor) >= 300 then
    raise exception 'too many reactions';  -- a simple ceiling per browser
  end if;
  insert into public.reactions (drawing_id, emoji, reactor) values (p_drawing, p_emoji, p_reactor);
  return true;
end;
$$;

revoke all on function public.reaction_summary(uuid), public.toggle_reaction(uuid, text, uuid) from public;
grant execute on function public.reaction_summary(uuid), public.toggle_reaction(uuid, text, uuid) to anon;
