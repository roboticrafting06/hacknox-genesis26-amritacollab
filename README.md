# AmritaCollab

Website: https://amritacollab2.vercel.app/

login credentials for testing :

faculty login :
id : s_rammohan@cb.amrita.edu
pass : Faculty@123

lab assistant login :
id : lab@amritacollab.test
pass : Lab@12345


**A campus collaboration platform for students, faculty, and laboratory staff at Amrita.**

AmritaCollab brings equipment booking, faculty mentorship requests, project-team formation, and resource sharing into one place. Students can discover opportunities and submit requests; staff can review requests through role-specific workflows.

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Configure Supabase](#configure-supabase)
- [User roles and staff setup](#user-roles-and-staff-setup)
- [AI assistant](#ai-assistant)
- [Deploy](#deploy)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)

## Features

### Equipment booking
- Browse campus equipment and its listed location.
- Submit a booking request with a purpose, date, and time slot.
- Lab staff can review requests and accept or reject them.
- Accepted bookings reserve the equipment slot; the database prevents duplicate accepted bookings.
- Students can manage eligible requests while they are pending.

### Faculty mentorship
- Browse faculty profiles, research interests, and background.
- Submit a mentorship request with a title, description, and preferred meeting time.
- Faculty can review requests and accept or reject them, selecting a meeting time when accepting.
- Students receive decision notifications in the app.

### Project team formation
- Create a team request with a project description and the roles or specializations needed.
- Other students can discover opportunities and request to join open roles.
- The database checks role eligibility and prevents a student from filling multiple roles in the same team.
- Team creators can manage eligible team roles and members.

### Resource sharing
- Post a request for a resource to rent or buy, including specifications.
- Other students can respond if they can provide the requested resource.
- Offers and related contact details are handled through the application's request workflow.
- Listings have expiry rules, including a defined end date for rentals.

### AI assistant
- Ask for help with the platform in natural language.
- The assistant can suggest actions for equipment, mentorship, team, and resource workflows.
- Review the proposed action before confirming it. The assistant is not a substitute for the app's database validation or authorization rules.
- If the server-side AI integration is unavailable, the app can fall back to its built-in basic mode.

## Technology stack

- **Frontend:** React, TypeScript, Vite
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Backend services:** Supabase
  - PostgreSQL database
  - Authentication
  - Row Level Security (RLS)
  - Storage
  - Database functions and triggers
- **Optional AI:** OpenRouter through a Supabase Edge Function
- **Deployment:** Vercel or Cloudflare Pages

## Requirements

- Node.js and npm
- A Supabase project
- Git, if cloning the repository

## Run locally

1. Clone the repository and enter the project directory:

   ```bash
   git clone <YOUR_REPOSITORY_URL>
   cd <PROJECT_DIRECTORY>
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a local environment file from the example:

   **Windows CMD**
   ```cmd
   copy .env.example .env
   ```

   **macOS / Linux**
   ```bash
   cp .env.example .env
   ```

4. Open `.env` and set the Supabase values:

   ```env
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-SUPABASE-PUBLISHABLE-OR-ANON-KEY
   ```

   Use the project URL and publishable/anon key from your Supabase project's API settings. Do not put a database password, service-role key, or JWT secret in this file.

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open the local URL printed by Vite in the terminal.

Useful commands:

```bash
npm run typecheck
npm run build
npm run preview
```

## Configure Supabase

Run the SQL scripts in the Supabase Dashboard's **SQL Editor** in the order below.

### 1. Create the schema

Run:

```text
supabase/schema.sql
```

This creates the main tables, functions, triggers, RLS policies, storage buckets, and initial equipment/faculty records.

### 2. Configure staff accounts

Create the relevant staff accounts in **Supabase Dashboard → Authentication → Users**. For testing, use the dashboard's email-confirmation options as appropriate.

- **Faculty:** the authentication email must match the corresponding email in `public.faculty`.
- **Lab assistant:** create the account, then edit the lab email in `supabase/staff-setup.sql` to match that account.

Then run:

```text
supabase/staff-setup.sql
```

The script links matching faculty profiles to faculty records and assigns the `faculty` and `lab` roles. Review the script and change its placeholder lab email before running it.

If a faculty member's email is incorrect in the seeded data, update `public.faculty.email` to the verified address before linking the account. Do not invent an email address for a real faculty member.

### 3. Apply the optional feature migration

For an existing database that has already run `schema.sql`, run:

```text
supabase/migration-2-edit-remove.sql
```

This migration adds support for editing or cancelling eligible pending requests, team-role and member management, and resource-request updates. Review SQL changes before running them against a production database.

**Important:** Do not repeatedly re-run the initial schema script against a live database unless you have reviewed its effects. Back up production data before applying database changes.

## User roles and staff setup

The app uses these profile roles:

| Role | Intended access |
|---|---|
| `student` | Create equipment and mentorship requests, form teams, and use resource sharing |
| `faculty` | Review mentorship requests assigned to the faculty account |
| `lab` | Review equipment booking requests |

New sign-ups are assigned the `student` role by the database trigger. Staff roles should be assigned only through the trusted setup process, not through a public sign-up form.

For local testing, use test accounts and non-sensitive data. Do not publish demo passwords or share production staff credentials in this README.

## AI assistant

The AI assistant supports two configurations.

### Basic mode

Basic mode uses the app's built-in matching logic and does not require an OpenRouter API key. If the Edge Function is not deployed or cannot be used, the app can fall back to this mode.

### Server-side AI mode (recommended)

The repository includes a Supabase Edge Function at:

```text
supabase/functions/ai-agent/
```

Deploy it using the Supabase CLI after linking the correct Supabase project:

```bash
supabase functions deploy ai-agent
supabase secrets set OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
```

Optionally set a model supported by OpenRouter tool calling:

```bash
supabase secrets set AI_MODEL=google/gemini-2.5-flash
```

Choose a model that supports tool/function calling. Keep the OpenRouter key in Supabase secrets; do not commit it to Git or place it in client-side code.

### Browser-only testing mode

The `.env.example` file also documents `VITE_OPENROUTER_KEY` for quick testing. **Any variable prefixed with `VITE_` is bundled into the client-side app and can be viewed by users.** Use this only with a disposable, restricted key and never for production.

## Deploy

### Vercel

1. Import the GitHub repository into Vercel.
2. Set the framework preset to **Vite**.
3. Use the build command:

   ```bash
   npm run build
   ```

4. Set the output directory to:

   ```text
   dist
   ```

5. Add these environment variables in the Vercel project settings:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

6. Deploy. The included `vercel.json` provides SPA routing configuration.

### Cloudflare Pages

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Pages environment settings.
- The repository includes `public/_redirects` for SPA routing.

After deployment, confirm the app's URL is configured correctly in Supabase Authentication settings if your authentication flow requires allowed redirect URLs.

## Security notes

- Keep `.env` out of version control. The repository's `.gitignore` should exclude local environment files and build output.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, database credentials, or `POSTGRES_PASSWORD` in frontend code or public repository files.
- A Supabase publishable/anon key is intended for client applications only when RLS and policies are correctly configured. It is not a replacement for authorization.
- Review RLS policies, SQL functions, and storage policies before production use.
- Staff accounts must be assigned roles through trusted administrative steps.
- Treat the AI assistant's output as a proposal; validate all actions through the application's normal permission and database checks.
- Use strong, unique passwords for staff accounts and rotate any credential that was accidentally exposed.

## Troubleshooting

**The app says Supabase is not configured**
- Confirm `.env` exists in the project root.
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are spelled correctly.
- Restart `npm run dev` after changing environment variables.

**A staff account signs in but has student access**
- Confirm that a matching row exists in `public.profiles`.
- Check that the email matches the corresponding row in `public.faculty` for faculty accounts.
- Review and run the staff setup SQL with the correct lab email.

**The AI assistant uses basic mode**
- This can happen when the Edge Function is not deployed, the server-side secret is missing, or the model/API request fails.
- Check the Supabase Edge Function logs and configured secrets.

**Build fails**
- Run `npm install`, then `npm run typecheck` and `npm run build`.
- Read the first TypeScript or Vite error reported in the terminal.

---

Built for campus collaboration at Amrita.
