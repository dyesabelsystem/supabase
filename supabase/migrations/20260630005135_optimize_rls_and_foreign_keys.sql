create index chapters_updated_by_idx on public.chapters (updated_by)
  where updated_by is not null;
create index site_content_updated_by_idx on public.site_content (updated_by)
  where updated_by is not null;

drop policy if exists "admins can manage subscribers"
  on public.newsletter_subscribers;
create policy "admins can read subscribers"
on public.newsletter_subscribers for select to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');
create policy "admins can update subscribers"
on public.newsletter_subscribers for update to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin')
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');
create policy "admins can delete subscribers"
on public.newsletter_subscribers for delete to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');

drop policy if exists "admins can manage support tickets"
  on public.chatbot_tickets;
create policy "admins can read support tickets"
on public.chatbot_tickets for select to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');
create policy "admins can update support tickets"
on public.chatbot_tickets for update to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin')
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');
create policy "admins can delete support tickets"
on public.chatbot_tickets for delete to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');
