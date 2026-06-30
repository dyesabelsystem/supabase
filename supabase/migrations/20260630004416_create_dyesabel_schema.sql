create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  legacy_user_id text unique,
  username text not null unique,
  email text not null unique,
  role text not null check (role in ('admin', 'editor', 'chapter_head', 'member')),
  chapter_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_auth_user_id_idx on public.profiles (auth_user_id)
  where auth_user_id is not null;
create index profiles_chapter_id_idx on public.profiles (chapter_id)
  where chapter_id is not null;

create table private.legacy_user_credentials (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  password_hash text not null,
  imported_at timestamptz not null default now(),
  migrated_at timestamptz
);

create table public.site_content (
  content_key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.chapters (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index chapters_sort_order_idx on public.chapters (sort_order, id);

create table public.newsletter_subscribers (
  id text primary key,
  email text not null,
  email_normalized text not null unique,
  status text not null default 'active',
  source text not null default 'Website',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index newsletter_subscribers_status_idx
  on public.newsletter_subscribers (status, created_at desc);

create table public.chatbot_tickets (
  id bigint generated always as identity primary key,
  tracking_number text not null unique,
  email text not null,
  messages jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chatbot_tickets_status_created_idx
  on public.chatbot_tickets (status, created_at desc);

create table public.chatbot_unknown_questions (
  id bigint generated always as identity primary key,
  question text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function private.is_content_editor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select auth.jwt()) -> 'app_metadata' ->> 'role',
    ''
  ) in ('admin', 'editor');
$$;

create or replace function private.can_edit_chapter(target_chapter_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
    or (
      coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'editor'
      and nullif((select auth.jwt()) -> 'app_metadata' ->> 'chapter_id', '') is null
    )
    or (
      coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('editor', 'chapter_head')
      and (select auth.jwt()) -> 'app_metadata' ->> 'chapter_id' = target_chapter_id
    );
$$;

alter table public.profiles enable row level security;
alter table public.site_content enable row level security;
alter table public.chapters enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.chatbot_tickets enable row level security;
alter table public.chatbot_unknown_questions enable row level security;

create policy "users can read their profile"
on public.profiles for select
to authenticated
using (
  (select auth.uid()) = auth_user_id
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
);

create policy "users can update their basic profile"
on public.profiles for update
to authenticated
using (
  (select auth.uid()) = auth_user_id
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
)
with check (
  (select auth.uid()) = auth_user_id
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
);

create policy "site content is publicly readable"
on public.site_content for select
to anon, authenticated
using (true);

create policy "editors can insert site content"
on public.site_content for insert
to authenticated
with check ((select private.is_content_editor()));

create policy "editors can update site content"
on public.site_content for update
to authenticated
using ((select private.is_content_editor()))
with check ((select private.is_content_editor()));

create policy "editors can delete site content"
on public.site_content for delete
to authenticated
using ((select private.is_content_editor()));

create policy "chapters are publicly readable"
on public.chapters for select
to anon, authenticated
using (true);

create policy "authorized users can insert chapters"
on public.chapters for insert
to authenticated
with check ((select private.can_edit_chapter(id)));

create policy "authorized users can update chapters"
on public.chapters for update
to authenticated
using ((select private.can_edit_chapter(id)))
with check ((select private.can_edit_chapter(id)));

create policy "authorized users can delete chapters"
on public.chapters for delete
to authenticated
using ((select private.can_edit_chapter(id)));

create policy "anyone can subscribe once"
on public.newsletter_subscribers for insert
to anon, authenticated
with check (
  email_normalized = lower(trim(email))
  and status = 'active'
);

create policy "admins can manage subscribers"
on public.newsletter_subscribers for all
to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin')
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');

create policy "anyone can create a support ticket"
on public.chatbot_tickets for insert
to anon, authenticated
with check (status = 'open');

create policy "admins can manage support tickets"
on public.chatbot_tickets for all
to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin')
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');

create policy "anyone can log an unknown question"
on public.chatbot_unknown_questions for insert
to anon, authenticated
with check (true);

create policy "admins can read unknown questions"
on public.chatbot_unknown_questions for select
to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');

grant usage on schema public to anon, authenticated;
grant select on public.site_content, public.chapters to anon, authenticated;
grant insert on public.newsletter_subscribers, public.chatbot_tickets,
  public.chatbot_unknown_questions to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.site_content,
  public.chapters, public.newsletter_subscribers, public.chatbot_tickets,
  public.chatbot_unknown_questions to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_content_editor() to authenticated;
grant execute on function private.can_edit_chapter(text) to authenticated;

insert into public.site_content (content_key, data)
values
  ('org_settings', '{}'::jsonb),
  ('landing_page', '{}'::jsonb),
  ('pillars', '[]'::jsonb),
  ('partners', '[]'::jsonb),
  ('founders', '[]'::jsonb),
  ('executive_officers', '[]'::jsonb),
  ('stories', '[]'::jsonb),
  ('donations', '{}'::jsonb)
on conflict (content_key) do nothing;
