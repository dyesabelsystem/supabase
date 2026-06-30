create table public.image_upload_audit (
  id bigint generated always as identity primary key,
  uploaded_at timestamptz,
  legacy_user_id text,
  username text,
  drive_file_id text not null,
  file_name text not null,
  folder_name text,
  created_at timestamptz not null default now()
);

create unique index image_upload_audit_drive_file_id_idx
  on public.image_upload_audit (drive_file_id);
create index image_upload_audit_legacy_user_id_idx
  on public.image_upload_audit (legacy_user_id)
  where legacy_user_id is not null;

alter table public.image_upload_audit enable row level security;

create policy "admins can read image upload audit"
on public.image_upload_audit for select
to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');

grant select on public.image_upload_audit to authenticated;
