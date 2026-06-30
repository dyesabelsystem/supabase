create or replace function private.allow_existing_google_profile(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  incoming_email text := lower(trim(event -> 'user' ->> 'email'));
  incoming_provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
begin
  -- User records created deliberately by an administrator use the email
  -- provider. Only self-service Google OAuth signups are restricted here.
  if incoming_provider is distinct from 'google' then
    return '{}'::jsonb;
  end if;

  if incoming_email <> ''
    and exists (
      select 1
      from public.profiles
      where lower(trim(email)) = incoming_email
    )
  then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'No Dyesabel account is associated with that Google account.'
    )
  );
end;
$$;

grant usage on schema private to supabase_auth_admin;
grant execute on function private.allow_existing_google_profile(jsonb)
  to supabase_auth_admin;
revoke execute on function private.allow_existing_google_profile(jsonb)
  from public, anon, authenticated;

grant select on public.profiles to supabase_auth_admin;

create policy "auth hook can check existing profile emails"
on public.profiles for select
to supabase_auth_admin
using (true);
