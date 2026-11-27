# Supabase authentication

Login is at `/login`; registration is at `/register`. Supabase verifies email/password. The application database determines roles, so registering does not grant admin access.

## Admin

The single admin account is `admin@coastwatch.local`. Its Supabase account and application admin mapping are provisioned directly; no bootstrap variable is needed.

After signing in, `/admin` shows all workspaces. Open port operations, a logistics company, any truck, or any vessel. The server verifies that the caller is an active admin before allowing workspace switching, and retains the admin's identity for audit records. Ordinary users remain restricted to their assigned role and scope.

## Environment

`frontend/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`backend/.env`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

Keep the secret key on the backend only. Preserve the existing MongoDB settings. Restart the backend after environment changes.

Email sign-in and signups are enabled on the connected Supabase project, with email confirmation required. Registration confirmation redirects to `/login`; the app URL must be in Supabase's redirect allowlist. Hosted redirect settings have not been changed.

A Supabase personal access token is only needed if asking the agent to change hosted project settings; it is not required for this admin account to sign in.

## Checks

Backend: `../.venv/Scripts/python.exe -m pytest -q` from `backend`.
Frontend: `npm run lint`, `npm run build`, and `node --test tests/*.test.js` from `frontend`.