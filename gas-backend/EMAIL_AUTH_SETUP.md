# DYESABEL email setup

The browser still asks Supabase Auth to create OTP/recovery tokens. Supabase's
Send Email Hook replaces its built-in delivery and forwards verified events to
this existing Google Apps Script project.

The `application-email` Edge Function uses the same GAS deployment for
newsletter confirmations, support-ticket confirmations, internal support
alerts, and reusable administrator-triggered donation, partnership, and general
notifications.

1. Replace the Apps Script project code and manifest with
   `Dyesabel_DriveImages.gs` and `appsscript.drive.json`. Authorize the new
   `script.send_mail` scope and deploy a new web-app version.
2. Add the Apps Script property `AUTH_EMAIL_GAS_SECRET`. Use a long random value
   that is different from `DRIVE_CRUD_SECRET`.
3. Deploy the Supabase Edge Function:

   ```sh
   supabase functions deploy send-auth-email --no-verify-jwt
   supabase functions deploy application-email --no-verify-jwt
   ```

4. In Supabase Authentication > Hooks, create/enable the **Send Email** hook
   and select the deployed `send-auth-email` Edge Function. Copy its generated
   signing secret.
5. Configure these Supabase Edge Function secrets:

   ```sh
   supabase secrets set \
     SEND_EMAIL_HOOK_SECRET="v1,whsec_..." \
     AUTH_EMAIL_GAS_URL="https://script.google.com/macros/s/.../exec" \
     AUTH_EMAIL_GAS_SECRET="the-same-value-as-the-script-property"
   ```

6. Keep the Supabase Email provider enabled. With the Send Email Hook enabled,
   the hook sends auth mail and Supabase SMTP is not used.
7. Request a password reset from the sign-in modal and inspect the
   `send-auth-email` function logs plus Apps Script executions. Confirm that the
   link opens `/reset-password` and can be used only once.
8. Subscribe a new test address in the website footer and submit one chatbot
   support ticket. Confirm the visitor receives a confirmation and the
   organization support inbox receives the internal ticket alert.

The GAS endpoint rejects browser requests without its server-only secret. The
Edge Function rejects requests without a valid Supabase Standard Webhooks
signature.

Public application events are restricted to fixed templates and destinations:
newsletter addresses are unique, and support tickets are limited to three per
address per hour. Donation receipts, partnership confirmations, and general
notifications require an authenticated administrator or editor.
