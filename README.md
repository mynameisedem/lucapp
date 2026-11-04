# Luca – offline baby tracker

See `SPEC.md` for the spec and `CLAUDE.md` for commands.

## Google Drive sync setup (once)

Sync uses a Google **service account** key, so the phones never sign in to Google.

1. Go to https://console.cloud.google.com → your project (e.g. "Luca").
2. **APIs & Services → Library** → make sure **Google Drive API** is enabled.
3. **IAM & Admin → Service accounts → Create service account** (e.g. `luca-sync`). No roles needed.
4. Open it → **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
5. In Google Drive (your own account) share **`luca-data.json`** with the service account's email (`luca-sync@<project>.iam.gserviceaccount.com`) as **Editor**.
   No file yet? Create an empty text file named `luca-data.json` in your Drive and share that. (A service account has no storage, so it can't create the file itself.)
6. Copy the key file to both phones and pick it in **More → Google Drive sync** (on a fresh install: on the welcome screen).

The key only reaches files shared with that service account. If a phone is lost, delete the key in step 4's Keys tab and make a new one.
The old OAuth client (Credentials → OAuth client ID) and the repo variable `VITE_GOOGLE_CLIENT_ID` are no longer used and can be deleted.
