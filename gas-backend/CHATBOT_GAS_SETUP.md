# Direct GAS Chatbot Setup

The public website sends chatbot inference and diagnostic requests directly to
the DYESABEL Apps Script web app. Gemini API keys remain server-side and must
never be added to Vercel or any `VITE_*` environment variable.

## 1. Update the Apps Script project

1. Replace the deployed project's code with `Dyesabel_DriveImages.gs`.
2. Replace its manifest with `appsscript.drive.json` (rename it to
   `appsscript.json` in Apps Script when needed).
3. Save the project and authorize the new external-request permission.

To authorize it, select `setupChatbotBackend` from the function menu, click
**Run**, choose **Review permissions**, and approve the requested access. The
function immediately performs a Gemini diagnostic after authorization.

## 2. Add the Gemini keys

Open **Project Settings > Script Properties** and add:

```text
GEMINI_API_KEYS = key1,key2,key3
```

Start with one verified working Gemini Auth key. Additional keys are optional
and must be separated by commas.

## 3. Redeploy the web app

Create a new web-app version with:

- Execute as: **Me**
- Who has access: **Anyone**

Keep the `/exec` deployment URL. Update `VITE_CHATBOT_GAS_URL` in local and
Vercel environments only if the deployment URL changed. The frontend falls
back to `VITE_DRIVE_IMAGE_API_URL` when `VITE_CHATBOT_GAS_URL` is empty.

## 4. Verify

Restart or redeploy the frontend, open the chatbot, and enter:

```text
/dyesabel-debug
```

Healthy output uses code `CB-000` and reports this path:

```text
Browser -> Google Apps Script web app -> Gemini
```

## Security note

The GAS chatbot endpoint is intentionally public because browsers cannot keep
a shared secret. Gemini keys never leave GAS, payload sizes are bounded, and a
best-effort per-client rate limit is applied. Client identifiers can be changed
by callers, so this is not strong abuse prevention; monitor Apps Script and
Gemini quotas.
