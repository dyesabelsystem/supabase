alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'editor', 'pillar_editor', 'chapter_head', 'member'));

alter table public.profiles
  add column pillar_id text;

create index profiles_pillar_id_idx on public.profiles (pillar_id)
  where pillar_id is not null;

create or replace function private.is_pillar_editor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'pillar_editor'
    and nullif(trim((select auth.jwt()) -> 'app_metadata' ->> 'pillar_id'), '') is not null;
$$;

create or replace function private.restrict_pillar_editor_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller_role text := coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '');
  assigned_pillar_id text := nullif(trim((select auth.jwt()) -> 'app_metadata' ->> 'pillar_id'), '');
  item_index integer;
  old_item jsonb;
  new_item jsonb;
  found_assigned_pillar boolean := false;
begin
  if caller_role <> 'pillar_editor' then
    return new;
  end if;

  if new.content_key <> 'pillars' or old.content_key <> 'pillars' then
    raise exception 'Pillar editors can only update their assigned pillar.';
  end if;

  if assigned_pillar_id is null then
    raise exception 'No pillar is assigned to this editor.';
  end if;

  if jsonb_typeof(old.data) <> 'array'
    or jsonb_typeof(new.data) <> 'array'
    or jsonb_array_length(old.data) <> jsonb_array_length(new.data) then
    raise exception 'Pillar editors cannot add or remove pillars.';
  end if;

  if jsonb_array_length(old.data) > 0 then
    for item_index in 0..jsonb_array_length(old.data) - 1 loop
      old_item := old.data -> item_index;
      new_item := new.data -> item_index;

      if old_item ->> 'id' is distinct from new_item ->> 'id' then
        raise exception 'Pillar editors cannot reorder or replace pillars.';
      end if;

      if old_item ->> 'id' = assigned_pillar_id then
        if found_assigned_pillar then
          raise exception 'The assigned pillar ID is duplicated.';
        end if;
        found_assigned_pillar := true;
      elsif old_item is distinct from new_item then
        raise exception 'Pillar editors cannot change unassigned pillars.';
      end if;
    end loop;
  end if;

  if not found_assigned_pillar then
    raise exception 'The assigned pillar no longer exists.';
  end if;

  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.is_pillar_editor() from public, anon;
grant execute on function private.is_pillar_editor() to authenticated;
revoke all on function private.restrict_pillar_editor_update() from public, anon, authenticated;

drop trigger if exists restrict_pillar_editor_update on public.site_content;
create trigger restrict_pillar_editor_update
before update on public.site_content
for each row
execute function private.restrict_pillar_editor_update();

create policy "assigned pillar editors can update pillars"
on public.site_content for update
to authenticated
using (
  content_key = 'pillars'
  and (select private.is_pillar_editor())
)
with check (
  content_key = 'pillars'
  and (select private.is_pillar_editor())
);

-- Profiles mirror authorization metadata but must not be a client-writable
-- privilege-escalation path. Profile changes flow through Supabase Auth/admin.
revoke update on public.profiles from authenticated;
grant update (username, email) on public.profiles to authenticated;

create or replace function private.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_username text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  next_role text := nullif(trim(new.raw_app_meta_data ->> 'role'), '');
begin
  update public.profiles
  set
    email = lower(trim(new.email)),
    username = coalesce(next_username, username),
    role = case
      when next_role in ('admin', 'editor', 'pillar_editor', 'chapter_head', 'member') then next_role
      else role
    end,
    chapter_id = case
      when next_role in ('admin', 'editor', 'pillar_editor', 'chapter_head', 'member')
        then nullif(trim(new.raw_app_meta_data ->> 'chapter_id'), '')
      else chapter_id
    end,
    pillar_id = case
      when next_role in ('admin', 'editor', 'pillar_editor', 'chapter_head', 'member')
        then nullif(trim(new.raw_app_meta_data ->> 'pillar_id'), '')
      else pillar_id
    end,
    updated_at = now()
  where auth_user_id = new.id;

  return new;
end;
$$;

revoke all on function private.sync_profile_from_auth_user() from public, anon, authenticated;
