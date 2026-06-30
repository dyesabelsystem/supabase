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
      when next_role in ('admin', 'editor', 'chapter_head', 'member') then next_role
      else role
    end,
    chapter_id = case
      when next_role in ('admin', 'editor', 'chapter_head', 'member')
        then nullif(trim(new.raw_app_meta_data ->> 'chapter_id'), '')
      else chapter_id
    end,
    updated_at = now()
  where auth_user_id = new.id;

  return new;
end;
$$;

revoke all on function private.sync_profile_from_auth_user() from public, anon, authenticated;

drop trigger if exists sync_profile_from_auth_user on auth.users;
create trigger sync_profile_from_auth_user
after update of email, raw_user_meta_data, raw_app_meta_data on auth.users
for each row
execute function private.sync_profile_from_auth_user();

-- Supabase Auth is the source of truth for login email and account metadata.
-- Repair pre-existing drift before all future changes are synchronized by the trigger.
update public.profiles as profile
set
  email = lower(trim(auth_user.email)),
  username = coalesce(
    nullif(trim(auth_user.raw_user_meta_data ->> 'username'), ''),
    profile.username
  ),
  role = case
    when auth_user.raw_app_meta_data ->> 'role' in ('admin', 'editor', 'chapter_head', 'member')
      then auth_user.raw_app_meta_data ->> 'role'
    else profile.role
  end,
  chapter_id = case
    when auth_user.raw_app_meta_data ->> 'role' in ('admin', 'editor', 'chapter_head', 'member')
      then nullif(trim(auth_user.raw_app_meta_data ->> 'chapter_id'), '')
    else profile.chapter_id
  end,
  updated_at = now()
from auth.users as auth_user
where auth_user.id = profile.auth_user_id
  and (
    profile.email is distinct from lower(trim(auth_user.email))
    or profile.username is distinct from coalesce(
      nullif(trim(auth_user.raw_user_meta_data ->> 'username'), ''),
      profile.username
    )
    or profile.role is distinct from coalesce(
      nullif(trim(auth_user.raw_app_meta_data ->> 'role'), ''),
      profile.role
    )
    or profile.chapter_id is distinct from nullif(
      trim(auth_user.raw_app_meta_data ->> 'chapter_id'),
      ''
    )
  );
