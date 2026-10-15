# Applicator

A private workspace for internships and jobs: experience bank, factual resume tailoring, PDF exports, application tracking, automatic cloud saving, and light/dark/system appearance. The owner manages invitations and shared provider allowances. Members see personal account controls.

## Owner setup (once)

1. Use your existing Supabase **Free** project. Run **supabase/multi-user.sql** in its SQL Editor. **schema.sql** now contains the same current migration. Both can be rerun safely and preserve existing workspace rows. The migration adds membership, revisions, quotas, and a shared search cache.
2. In **Supabase Authentication → Users**, create your owner email/password user with Auto Confirm enabled, or use an existing app user. This is an application account, separate from the account used to sign into the Supabase dashboard. Copy its user UUID.
3. Fill these server variables in the **.env file inside this app folder**, keeping your existing Gemini entries. See **.env.example** for placeholders:

| Variable | Where to get it |
| --- | --- |
| SUPABASE_URL | Project Settings → API |
| SUPABASE_PUBLISHABLE_KEY | Publishable key, or the legacy anon public key |
| SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY | Server secret key, or legacy service_role key; never a VITE_ variable |
| ADMIN_USER_ID | Owner UUID in Authentication → Users; never an email |
| GEMINI_API_KEY | Your AI Studio key, configured only on the server |
| GEMINI_MODEL | Defaults to gemini-3.5-flash-lite |

4. Keep **Confirm email** enabled in Supabase's Email provider settings and configure custom SMTP for signup confirmations. Supabase's default sender restricts recipients to your project team. See **docs/email-setup.md** for a free Brevo SMTP setup. No application reminder emails are implemented.
5. Set Supabase Auth Site URL and allowed Redirect URLs to your app origin (http://127.0.0.1:8787 locally, also http://127.0.0.1:5173 during Vite development).
6. Restart the server and sign in as the owner. **Email signup is open by default**: users choose Create account, confirm their email, and sign in to their private workspace without an invitation. Owner controls can pause new registrations and revoke or restore member access. Existing members and the fixed owner can still sign in while registration is paused.

Invitations are optional for admitting new users while public registration is paused. Add a friend's email in Owner controls, then copy and share the generated link yourself. It expires in seven days, matches that email, and can be accepted once. **Creating a link does not send an email or create an Auth account.** Signup confirmation emails are sent separately by Supabase through your configured SMTP sender. Existing membership is checked before any stored invitation, so expired or mismatched links cannot block an owner or member who already has access.

Google sign-in is optional: configure Google in Supabase Authentication → Providers, then set GOOGLE_AUTH_ENABLED=true. It is hidden until you enable it.

## Bring your existing data

The old personal workspace in browser storage is not deleted or automatically assigned to a new account. After signing in as the owner, open **Account & appearance → Import previous personal workspace**, review it, export your current cloud backup if needed, and confirm import. Exported JSON backups can also be imported into the signed-in account. The profile, saved jobs, resume snapshots and tracking data are retained.

## Saving and account privacy

Changes save automatically to Supabase after a short debounce. A per-user device recovery copy keeps interrupted edits; signing into another account does not load the previous account's cache. Cloud revisions reject stale concurrent saves. When sync pauses, export your current work and use Load cloud version before continuing. Save now and JSON export/import remain available. Backups should stay below 3.5 MB; original uploaded PDF/DOCX binaries are not stored, but extracted text is part of the workspace.

Supabase verifies session tokens on the server. API operations use the verified ID, not a submitted user ID or editable role metadata. Database row-level security limits direct reads to active members' own workspaces. Private tables and write functions are server-only. The fixed ADMIN_USER_ID grants owner controls; normal members cannot change credentials or read setup SQL through the API. Provider secrets are never sent to browsers. The owner controls the database infrastructure, but the owner interface does not list members' resumes.

## Job discovery

- **Company boards:** automatically checks the maintained Greenhouse/Lever catalog. Search and combined filters run on the complete cached listing snapshot, with 24 results per page. Employer details are rechecked on first open/save. Titles infer career level; unknown arrangements and unavailable boards are shown honestly. The catalog is still limited to its listed companies.
- **Broader US search:** uses Adzuna's multi-employer US index; it does not require entering company board names. Register at https://developer.adzuna.com/signup and add ADZUNA_APP_ID plus ADZUNA_APP_KEY to the server environment. Search, location/company parameters, OR career keywords, remote/hybrid/on-site keywords, newest/relevance sorting and pagination are supported. Results are not guaranteed to cover every US opening.
- Adzuna's API supplies **description snippets**. Open the provider application link, paste the full requirements in Edit details, and confirm completeness before AI tailoring. The app preserves Adzuna links and displays attribution. Keyword filters can return related positions; check the actual advertisement.
- Shared Adzuna results are cached in Supabase for 15 minutes across Vercel instances. The app conservatively limits new provider requests to 20/minute, 200/day, 800/week and 2,000/month. Its published default limits and terms can change: https://developer.adzuna.com/docs/terms_of_service . Publishing listings requires attribution; other uses may need permission. No paid API fallback is enabled.

Opening an unsaved discovery result shows a temporary, read-only preview with the requirements and application link. It does not add a saved job or application-tracker entry. Use the bookmark or **Save opportunity** to add it explicitly; saving from the preview then opens its resume/tracking workspace. Existing saved opportunities open their current workspace without replacing notes or resumes.

**Department** defaults to All departments. Company boards offer Software Engineering, Data & AI, IT & Cybersecurity, Engineering, Healthcare, Product & Design, and other broad groups. Groups are inferred from public employer department labels and job titles, so a role can belong to more than one; these are navigation aids rather than exact employer classifications. Broader US search loads Adzuna's actual US categories, puts IT-related categories first, and applies the selected category at the provider before pagination. Categories are cached for 15 minutes and their fetches count against the existing shared provider allowance. If the categories endpoint is unavailable, searching All departments still works. Department filters combine with career/company/location/work filters and profile sorting; changing source or resetting filters clears the department selection. No department is selected automatically, so other majors remain supported. Saved jobs preserve department metadata; older workspaces receive empty defaults without a SQL migration.

**Relevant to my profile** sorts discovery using the signed-in account's saved skills, project/experience text, summary, and education. Explicit skill matches receive more weight than general keywords, with matched terms shown on cards. Company boards rank all filtered listings before pagination; broader US search ranks only the returned Adzuna page. Ranking uses available titles, departments and listing descriptions: some company feeds expose only metadata, and Adzuna supplies snippets. It is a keyword comparison, not an eligibility or hiring-probability assessment. Save experience-bank changes before refreshing this sort. Ranking uses no Gemini request and sends no profile to job providers; personalized results are kept out of shared provider caches.

Manual public job-link import and pasted advertisements remain available. Some websites block reading or require login; paste the description in that case.

## AI and resumes

Only explicit organization/tailoring actions send text to Google. Source entry IDs restore factual titles, employers and dates, and unverified skills are removed and flagged. AI prose still requires review before download. The owner sets per-member and global daily request allowances; they are reserved atomically in the database and reset at midnight UTC. Submitted requests count even if the provider fails. Google's own limits can be lower. For free-only use, use an AI Studio project without paid billing. No automatic paid fallback or generation retry is used.

AI tailoring explicitly asks for supported skills in strongest job-requirement match order. Grounding removes unverified skills while preserving that generated order. Manual resumes retain the order entered in the profile.

PDF exports run locally, embed Noto Sans, and preserve the submitted resume version. Dark mode changes the application while keeping the resume preview on white paper.

## Run locally

Use Node 22. After installing dependencies:

    npm install
    npm run build
    npm start

Open http://127.0.0.1:8787. For source development use npm run dev and open http://127.0.0.1:5173. Start Applicator.cmd can launch the included build; rebuild after source changes. Windows launch scripts use system certificate trust without disabling TLS checks.

## Vercel handoff

The Vite frontend and **api/index.mjs** function are configured in vercel.json. An explicit **/api/:path*** rewrite sends all API paths, including nested job-detail and owner routes, to that shared Express function. Next.js-style catch-all filenames do not provide catch-all routing in this Vite app. Job details fetch their single employer posting directly even on a cold function instance. Use this app folder as the project root. Set the same server environment variables in Vercel, set APP_URL to the final HTTPS origin, and add that origin to Supabase Auth Site/Redirect URLs. Never upload .env; .gitignore/.vercelignore exclude it. Secrets are read at runtime, while only the public Supabase URL/key are returned as browser configuration. The migration must be run before accounts work. After source/configuration fixes, deploy a new version; restarting or redeploying an old commit will not include them. Deployment itself and authentication email delivery remain owner setup tasks.

## Checks and code guide

    npm test
    npm run build
    npm run format

Tests use an in-memory PostgreSQL engine to execute the actual SQL migration, RLS policies, invitation claims, quota functions and stale-save checks. API tests cover verified identities and owner restrictions; adapter tests cover US provider requests, cache sharing, snippets and secret redaction. See VERIFICATION.md for results and live-test limits.

- server/app.mjs: authenticated routes used locally and on Vercel
- server/platform.mjs: verified accounts and privileged Supabase operations
- server/workspace.mjs: complete workspace and owner-setting validation
- server/openings.mjs and adzuna.mjs: company catalog and broader provider search
- server/security.mjs: public-link validation, DNS pinning and redirect checks
- server/domain.mjs and gemini.mjs: factual resume grounding and structured generation
- src/Auth.tsx: sign-in, invitations and membership gate
- src/useWorkspace.ts and workspaceSync.mjs: automatic saving and conflict recovery
- src/AdminView.tsx and SettingsView.tsx: owner controls and member preferences
- src/theme.css and useTheme.ts: appearance and document-preview colors

Supabase Free has resource limits and can pause inactive projects; retain exported backups. No paid database add-on or email reminder service is required by this build.
