<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1zSel277jS2ZW4VPGV9FfCB4Bu4psU_-H

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `VITE_CHATBOT_GAS_URL` in [.env.local](.env.local) to the deployed GAS web-app URL (it falls back to `VITE_DRIVE_IMAGE_API_URL` when both services share one GAS deployment).
3. Store `GEMINI_API_KEYS` in the GAS project's Script Properties. Never place Gemini keys in a `VITE_*` variable.
4. Run the app:
   `npm run dev`
