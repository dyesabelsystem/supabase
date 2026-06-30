# Supabase migration TODO

- [x] Connect Codex to Supabase project `rtmpjojqzfrggmmlseam`
- [x] Create the initial database schema and RLS policies
- [x] Import chapters, user profiles, and newsletter subscribers
- [x] Import founders, executive officers, pillars, pillar activities, and chapter activities
- [ ] Import remaining datasets if non-empty exports become available
- [x] Provision and link Supabase Auth identities for all imported profiles
- [ ] Replace synthetic `@legacy.invalid` addresses for the three profiles without valid legacy email addresses
- [ ] Have migrated users set passwords through Supabase password recovery
- [x] Replace admin user-management operations with a protected Edge Function
- [x] Replace the GAS chatbot endpoint with a Supabase Edge Function
- [ ] Configure `GEMINI_API_KEY` in Supabase Edge Function secrets
- [x] Add and deploy the protected Supabase Drive proxy Edge Function
- [x] Add the dedicated GAS Drive image CRUD source and Drive OAuth manifest
- [ ] Paste the new GAS files into the supplied Apps Script project, set `DRIVE_CRUD_SECRET`, authorize Drive, and redeploy
- [ ] Set the matching `DRIVE_CRUD_SECRET` in Supabase Edge Function secrets
- [ ] Run `?action=check&write=1` successfully against the redeployed GAS URL
- [x] Remove all obsolete non-image GAS sources and documentation
- [ ] Run end-to-end editor, authentication, donation, newsletter, and chatbot tests
