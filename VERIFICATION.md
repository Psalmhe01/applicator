# Verification

## October 12, 2026: automatic opportunity discovery

Discovery now automatically checks a catalog of 39 public Greenhouse/Lever boards. Metadata search, combined career/company/location/work-arrangement filters, sorting, and server pagination return 24 results per page. Full requirements are retrieved from the employer on first open/save, so the saved job has the full description rather than the listing excerpt. Unknown work arrangements and missing timestamps are preserved. Cached snapshots are shared for 15 minutes, refresh is limited to once a minute, concurrent initial searches share one fetch, and partial board outages do not retain old vacancies in the new snapshot.

All 12 regression tests passed, including normalization, combined filters, sorting/pagination, partial failures, cache sharing, closed-job rechecks and total outages. TypeScript strict checking passed. A live check reached all 39 boards in about 23 seconds, returned 14,983 jobs from 38 companies with listings, including 417 early-career roles and 249 internships, and verified remote/company filters and a 4,752-character full description. These counts are a point-in-time check, not a promised minimum. No profile, application, database or AI key was changed by this check.


The final production bundle built successfully; TypeScript strict checking passed after the UI changes. React server rendering verified the automatic discovery controls and each filter/sort field. Full browser interaction and visual layout checks remain unverified.

The Desktop copy received the tested source and compiled UI, with replaced files backed up and its `.env` verified unchanged. Detached server launches timed out on local HTTP checks in this environment; a retained local process resolved this. The running Desktop server then passed health, compiled-asset, internship/all-role/company/remote filters, second-page, and full-description checks. Its later snapshot reached 37 of 39 boards (Palantir and Veeva unavailable), returning 13,740 roles, including 311 early-career openings and 201 internships. Its AI health configuration remained connected with `gemini-3.5-flash-lite`. The server is left running for the user on port 8787. These checks did not save any jobs or change the user's profile.

## October 12, 2026: Gemini request fix

Reproduced the generic rejection on the running app's resume-organization endpoint using a short fictional resume. The running copy was on the user's OneDrive Desktop. A direct diagnostic using its saved configuration revealed HTTP 404: Google reported `gemini-2.5-flash` was no longer available to new users. No API key was printed.

The provider schema now includes structural fields and enums while omitting nested collection/string bounds that can make constrained output too complex. Original Zod limits still validate the returned result. Bad-request errors now include Google's reason, with API keys redacted, and model-not-found errors are distinguished from other bad requests.

All eight regression tests passed. Gemini 3.8 Flash returned a temporary 503 high-demand error. Gemini 3.5 Flash-Lite, documented as having a free tier, returned HTTP 200 with a valid organized profile. The Desktop copy's `.env` and server defaults were updated to `gemini-3.5-flash-lite`, preserving its key, and the local server was restarted.

After restart, both `/api/parse-resume` and `/api/tailor` succeeded using a fictional profile through the actual running app. The profile was not saved into the user's workspace.

## Initial build

Checks performed October 11, 2026 (America/Chicago).

- All six Node tests passed: restricted-address URL rejection, JobPosting JSON extraction, factual experience identifiers and unsupported-skill filtering, Gemini structured request/response validation, quota/invalid-output handling without retries, and local API request protection.
- TypeScript strict checking passed. Production bundle built successfully with Vite. Non-fatal annotation warnings originate in the installed Zod package.
- The development server returned HTTP 200.
- The production server returned HTTP 200 and served the compiled app HTML. React's server renderer also rendered the empty dashboard and expected navigation/card components without errors; this does not replace browser interaction testing.
- The live Greenhouse feed returned 31 matching internship/early-career listings from Cloudflare, Databricks, and Figma, with no failed boards at the time of the check. Counts change as openings are posted/removed.
- The link reader imported a real Cloudflare job advertisement, returning its title and 7,233 characters of description.
- The actual client PDF export function produced a one-page sample resume and a seven-page stress-test resume. Reopened PDFs retained searchable text, the accented name Zoë Martínez, expected projects/experience, and US Letter page dimensions. Both were rendered with Poppler and visually inspected. Page-break handling was revised to keep ordinary paragraphs/bullets together and keep section headings with their content.
- The actual TXT resume reader accepted text and rejected an unsupported file extension. PDF and DOCX extraction code was built successfully, but real uploaded-file extraction in the browser has not been exercised here.
- Manual resume construction includes Education bank entries when the separate education field is empty. Application recording defaults to the resume version currently selected in the studio.

Limits of verification:

- The Codex in-app browser failed to attach on three attempts, including the compiled production app. Full browser interaction, mobile layout, focus behavior, and visual UI verification remain unconfirmed. The app was not tested through another uncontrolled browser automation path.
- No real Gemini key was provided. The Gemini request contract, validation, and error behavior were tested with mocked responses; real generation, model availability for your account, and Google billing/free-tier access remain to be checked with your key.
- No Supabase project URL/public key or account was provided. Connection UI, client calls, and owner-only SQL policies are prepared. Actual authentication, cloud backup/load, and database execution remain to be verified after you configure your project.
- No paid service or hosting was enabled. No personal profile was fabricated or preloaded into your workspace.
