# Luca – offline baby tracker

See `SPEC.md` for the spec and `CLAUDE.md` for commands.

## Google Drive sync setup (once)

1. Go to https://console.cloud.google.com → create a project (e.g. "Luca").
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform) → External → app name "Luca", your email. Under **Audience**, keep it in **Testing** and add your Google account as a test user.
4. **Credentials / Clients → Create OAuth client ID** → type **Web application**:
   - Authorized JavaScript origins: `http://localhost:4173`
   - Authorized redirect URIs: `http://localhost:4173/`
5. Copy the client ID into `.env.local` in this folder:
   ```
   VITE_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```
6. `npm run build`, serve, update both phones.

Both phones sign in with **the same Google account** (the app only sees files it created: `luca-data.json` in that Drive).
On the second phone, install fresh and choose **Sign in to Google** on the welcome screen instead of adding the baby again.
