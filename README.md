# AmritaCollab
Equipment booking · faculty mentoring · team requests · resource sharing.
React + TypeScript · Vite · Tailwind · Lucide · Supabase (Postgres, Auth, Storage, RLS) · deploy on Vercel / Cloudflare Pages.

## Setup
1. Create a Supabase project. SQL Editor → run `supabase/schema.sql` (tables, RLS, RPCs, storage buckets, seed equipment + faculty).
2. `cp .env.example .env` and fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
3. `npm install && npm run dev`
4. Students self-register. **Staff**: Dashboard → Authentication → Users → add user (Auto Confirm). Faculty must use the email stored in the `faculty` table. Then run `supabase/staff-setup.sql` (set the lab assistant's email in it).
5. Optional: Authentication → Providers → Email → turn off "Confirm email" for instant sign-up while testing.

## Upgrading an existing database
After `schema.sql`, run `supabase/migration-2-edit-remove.sql` once (edit/cancel pending requests, remove/leave teammates, per-role department rules, custom roles, edit resources).

## Deploy
- Vercel: import the GitHub repo, add the two env vars (`vercel.json` handles SPA routing).
- Cloudflare Pages: build `npm run build`, output `dist` (`public/_redirects` handles routing).

## Security model
Roles live in `profiles.role` (signup is always `student`; users cannot edit it). RLS: students see only their own bookings/requests; lab sees all bookings; faculty see only requests addressed to them. Slot double-booking is blocked by unique partial indexes; accept-team-role and offer-resource run as RPCs; contact emails are only revealed to people in the same team/offer. Decision emails are delivered to the in-app Inbox (realtime).

## AI assistant (students)
A floating **Ask AI** button (students only) opens a chat that covers all four modules — equipment booking, mentor requests, team requests and resources. Say what you need in plain words; the assistant picks the best option, checks availability, and shows a **confirmation card**. Nothing is booked until you press **Confirm** (it then performs the same insert/RPC as the normal pages, so all RLS rules and triggers still apply).

- **Quick test mode (browser → OpenRouter directly):** copy `.env.example` to `.env`, set `VITE_OPENROUTER_KEY` (and optionally `VITE_AI_MODEL`), restart `npm run dev`. ⚠️ A `VITE_` key is bundled into the website and visible to anyone who opens it — use a throwaway key with a low credit limit and delete it afterwards. For a real deployment use a server-side option below.
- **AI mode (server-side, recommended for real use):** uses any tool-calling model through [OpenRouter](https://openrouter.ai). Deploy the Edge Function once:
  ```
  supabase functions deploy ai-agent
  supabase secrets set OPENROUTER_API_KEY=sk-or-...
  supabase secrets set AI_MODEL=google/gemini-2.5-flash     # optional, this is the default
  ```
  Pick a model whose openrouter.ai page lists **tools** under supported parameters (avoid `:free` models — tool calling is unreliable there). The key lives only in Supabase secrets — never in the browser or `.env`. The function only *proposes* actions; the browser re-validates every proposal against live data before showing the card. If something is wrong, the browser console shows `[assistant] AI unavailable, using basic mode: <reason>`.
- **Basic mode:** if the function isn't deployed (or the key is missing/fails), the assistant automatically falls back to a built-in keyword understanding that uses the app's own matching/priority logic. The panel header shows which mode is active.
