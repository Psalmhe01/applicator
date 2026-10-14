# Applicator

A personal internship/job workspace. Import an opening, choose relevant experience, review a tailored resume, download a PDF, and record your application and follow-up date.

This first version runs on your computer. It requires no paid hosting or job API. Supabase is optional and can use your existing Free project. Gemini is optional; manual resume creation works without it.

## Start

Requires Node.js 22.16 or later and npm.

```powershell
cd "C:\Users\omoso\Documents\Codex\2026-10-11\so\outputs\applicator"
npm install
npm run build
npm start
```

Open **http://127.0.0.1:8787**. Leave the terminal running while using the app. After the first install/build, `npm start` is enough.

For development, use `npm run dev` and open **http://127.0.0.1:5173**. The development server proxies API requests to the loopback server on port 8787.

On Windows, double-click `Start Applicator.cmd` to install if necessary and launch the app using the included compiled build. It builds only if `dist/index.html` is missing. Run `npm run build` yourself after editing source files. The server uses Windows/system certificate trust; it never disables TLS validation.

## Gemini

1. Get a key at https://aistudio.google.com/apikey. For free-only use, use a project without paid billing. The app cannot inspect or control Google billing on your behalf. Paste the key in **Settings → Gemini → Use key for this session** to keep it only in the local server's memory. It is cleared on restart. For a persistent setup, follow the remaining steps.
2. Copy `.env.example` to `.env` inside this app folder.
3. Set `GEMINI_API_KEY=your_key`. The default is `gemini-3.5-flash-lite`, documented as having a free tier and verified with a live profile-extraction request. Set `GEMINI_MODEL` to another compatible available model if needed. The original `gemini-2.5-flash` default is no longer available to new users.
4. Restart the app. Settings will show Connected.

The key is server-only: no `VITE_` prefix, no browser storage, no API response, no exported backup. One request is made per explicit AI action; no paid fallback or automatic retry. Google free-tier quotas and data-use terms apply. Resume text is sent to Google only when you choose Organize with AI; profile/job data is sent when you choose Tailor my resume. Upload extraction and PDF creation run locally.

AI selects actual source experience IDs; source titles, employers, dates, links, and contact details are restored from your profile on the server. Skills outside your bank are removed and flagged. AI can still misstate facts in rewritten summaries/bullets: review all text before checking the accuracy box and downloading.

## Free Supabase setup

1. Create/use a project in an organization on the **Free** plan. Do not upgrade or enable paid add-ons.
2. Run `supabase/schema.sql` in that project's SQL Editor. The SQL is also available in the app's Settings screen.
3. Enter the project URL and **publishable key** (or legacy **anon public key**) in Settings → Supabase connection. Never use a secret/service-role key.
4. Create an email/password account for this project, confirm the email if required, then sign in.
5. In Supabase Authentication → URL Configuration, set the Site URL to `http://127.0.0.1:8787` and allow this URL (and `http://127.0.0.1:5173` for development) as redirect URLs for email confirmation. Configure your Auth email provider if default signup emails are unavailable/rate-limited.
6. Use **Save to Supabase** after changes. On another device, connect to the same project/account and choose **Load from Supabase**.

This app's project Auth account is separate from the account you use to log in to the Supabase dashboard. Create the app account with the Settings screen's Create account button.

Saved data is JSON in a private `applicator_workspaces` row keyed by your authenticated user ID. Row-level security allows only the owner to read/write it; the anonymous role has no access. No storage bucket or paid database extension is needed. Cloud save/load are manual and replace the saved snapshot; coordinate changes if using multiple devices. The app does not promise automatic or conflict-free multi-device sync.

Profile details, extracted resume text, saved jobs, notes, and generated resume snapshots are included in local/cloud backups. Original uploaded binary files are not retained. Keep an exported JSON backup before clearing browser data or replacing a workspace. Local data remains on the device after Supabase sign-out.

Supabase Free currently includes a 500 MB database and 1 GB file storage; this app only needs the database. Free projects may pause after inactivity. Check your dashboard if a cloud backup fails; local work continues. See https://supabase.com/pricing and https://supabase.com/docs/guides/platform/billing-on-supabase for current limits.

## Use it

1. **Experience bank**: fill the profile, upload/paste a resume, and add factual projects/experience. Profile changes save automatically on your device; Save profile commits immediately. Optional AI organization lets you review extracted content before replacing your bank.
2. **Opportunities**: paste a link and click Read link, or paste the advertisement description. Review imported text and complete missing company/location details before saving.
3. **Discover openings**: openings load automatically across a maintained catalog of 39 public Greenhouse and Lever company boards. Search role/company/team keywords, filter by career level, company, city/country, and work arrangement, then sort by employer update, company, or title. Results are paginated (24 per page). Early career is the default; choose All roles for experienced positions. Career level is inferred from title keywords; an unlabelled junior-friendly role can appear under Other roles. Work arrangements are shown only when explicitly provided or mentioned in the location; unknown locations are not assumed to be on site. Keyword search covers listing metadata, not the full requirements. Full requirements are fetched and the listing is rechecked with its employer when you first open/save it. Greenhouse dates are employer updates, not original posting dates; Lever jobs without a date sort after dated jobs. A shared 15-minute memory cache refreshes automatically while Discover stays open; the Refresh button can recheck once a minute. Unavailable boards are reported, and stale vacancies from them are omitted from successful refreshes. The catalog is editable in `server/openings.mjs`; applicants do not need to enter board names. Coverage currently favors technology companies and is not a comprehensive Indeed/Handshake index. No paid search API or database is used for discovery.
4. **Resume studio**: create an AI or manual draft. Edit summary, skills, and bullets; add/remove/reorder entries. Review facts and check the accuracy box, then download a searchable PDF. Each new draft is a separate saved version.
5. **Apply**: open the company's application page and submit there. Applicator does not submit applications for you. Then click Mark applied and record the version used. That submitted snapshot becomes read-only; duplicate it to edit.
6. **Application tracker**: update statuses, dates, and notes. Follow-ups appear on Overview. Export CSV for a spreadsheet copy. Follow-up dates are in-app reminders; no email/background notifications are sent.

Some advertisements block automated reading or require JavaScript/login. Paste their text instead. Scanned/image PDFs need pasted text or DOCX; OCR is not included. Noto Sans is embedded in PDFs for Latin accents, Greek, and Cyrillic; scripts outside its coverage may need a different font/template.

## Checks

```powershell
npm test
npm run build
```

Tests cover private-address job-link blocking, structured job extraction, grounding experience IDs and skills, Gemini structured-response validation/quota errors, local API request protection, multi-provider normalization, combined discovery filters/pagination, cache sharing/refresh, partial outages, and closed-job rechecks. See `VERIFICATION.md` for the checks actually performed on this build.

## Project layout

- `src/`: React UI, device saving, Supabase connection, local extraction and PDF export
- `server/`: loopback Express API, safe URL reading, public board feed, Gemini integration
- `supabase/schema.sql`: authenticated workspace table and ownership policies
- `tests/`: meaningful server/domain tests
- `.env.example`: server-only configuration template
- `THIRD_PARTY_NOTICES.md`: Watermelon UI and font attribution

This loopback server is designed for personal local use. A public hosted release would need a deployment-specific authentication/rate-limit boundary around the AI API. Do not expose this server to the public internet by binding it to all network interfaces.
