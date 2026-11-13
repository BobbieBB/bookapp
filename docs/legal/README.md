# Legal drafts: status and open items

> **DRAFTS FOR REVIEW. Not legal advice and not in force.** Written for the product owner (PO) and a lawyer. Do not publish, link from the app, or submit to the stores until the items below are closed.

## Files

- `privacy-policy.md`: GDPR privacy notice (controller, data per feature, legal bases, processors, retention, rights, children, transfers, analytics opt-out, security).
- `terms.md`: Terms of Use (eligibility, accounts, content licence, community rules, moderation, fanfiction stance, IP/takedown, termination, liability, governing law).

Both were derived from the code at `origin/main` (migrations up to `20261103000000`, `src/lib/analytics.ts`, `legal.ts`, `push*.ts`, `covers.ts`, `sources.ts`, `account.ts`, `safety.ts`, `app/onboarding.tsx`, `app/accept-terms.tsx`, `app/reset-password.tsx`, the moderation and moderation-e-mail migrations) and `docs/DECISIONS.md` / `docs/DATA_MODEL.md`. Every assumption or open question is marked inline as `[TO CONFIRM: ...]`; search the files for that string. The earlier `[after PR #N merge]` markers (#20 orphan-cover sweep, #23 Moderation screen and chapter-count requests, #24 moderation e-mail via Resend) are gone: all three PRs are merged and the text now states what the code does. The Calm theme/appearance choice is not in the policy on purpose: it is stored only on the phone (`AsyncStorage`, key `livami.appearance`, `src/appearance.tsx`), not on the server.

## Bulgarian versions

`privacy-policy.bg.md` and `terms.bg.md` are working Bulgarian drafts of the two texts (13 Nov 2026), written in plain language with the app's own wording for buttons and screens. Open items are marked `[ЗА ЮРИСТ: ...]` (for the lawyer), `[ЗА PO: ...]` or `[ЗА ЕКИПА: ...]`. The lawyer reviews both languages; suggest that Bulgarian prevails.

## Decided by the PO (13 Nov 2026)

- Operator: **Boryana Dimitrova**, natural person; contact **support@livami.app** (forwarded to her mailbox, tested).
- Minimum age **16**, self-declared tick.
- Libraries **private by default** (migration `20261113000000_private_library.sql`, run).
- Analytics on, with the opt-out in Profile.
- Supabase and Resend in the EU (Ireland, `eu-west-1`); password-reset and moderation e-mail switched on through Resend; open/click tracking off.
- Moderation aim: within 24 hours on a best-effort basis.

Follow-up for the team: other readers can technically read the whole `profiles` row, including `terms_version`, `terms_accepted_at`, `age_confirmed` and `is_admin`, which no screen shows; hide these columns from other readers before launch.

## Open decisions (grouped)

**PO decides**
1. Operator identity: legal name, address, EIK/VAT, contact mailbox (support@livami.app must exist and be monitored).
2. Minimum age (13/14/16): `MIN_AGE = 16` in `src/lib/legal.ts` is a dev default. The app now stores a self-declared yes/no tick (`age_confirmed`), never a birth date; decide whether that suffices. Whether Mature/Explicit AO3 works need a higher age or gate. Publish the pages at `TERMS_URL` / `PRIVACY_URL` and set `TERMS_VERSION` to match the published text (bumping it makes every reader accept again).
3. Retention periods: inactive accounts, feedback, removal requests, resolved chapter-count requests, moderation e-mails (also at Resend), accounts that never reach the profile step, proof of terms acceptance, logs, backups.
4. Library visibility: the database default is "public" and no screen sets it. Decide the product behaviour (private by default is safer).
5. Analytics basis: legitimate interests with opt-out (as in DECISIONS) vs. opt-in consent.
6. Promises in the terms: no AI training on user content, one account per person, 24-hour moderation target.
7. Whether to offer an in-app data export (none today) and deletion of past analytics on opt-out.
8. Test that custom covers lose EXIF: the app resizes to 1200 px and re-encodes as JPEG 0.8 (`CustomCover.tsx`), which very likely drops it.

**Lawyer decides**
1. GDPR basis for analytics and for keeping comments as "Deleted reader" after deletion; the age of digital consent in Bulgaria (understood to be 14; verify).
2. DPO / EU representative need, DPAs with Supabase, Expo and Resend, transfer mechanisms (DPF or SCCs).
3. DSA duties for a hosting service (notice-and-action, statement of reasons, contact point, complaints) and takedown wording.
4. Liability limits and disclaimers against Bulgarian/EU consumer law; governing law and venue; ADR/ODR wording.
5. Terms-change mechanism enforceable against consumers; Apple EULA vs. custom EULA.
6. Use of the "AO3" name and the Open Library data and cover licences.

**Engineering confirms** (see "Code checks" below)
- Supabase project region (EU?); Supabase log and backup retention.
- Which SMTP service sends the password-reset code (README suggests Resend); if it is not Resend, update the processor table. Check the hosted recovery e-mail template matches `supabase/templates/recovery.html`.
- Settings menu paths quoted in the policy ("Delete my account", "Help us improve the app", "Notifications on this phone").
- No additional SDKs (crash reporting, ads) are added before release.

## Code checks: where the code differed from what the brief expected

- `feedback.device` exists in the schema, but the app writes only `app_version` (`src/lib/safety.ts`). The policy says so.
- `profiles.avatar_url` exists, but no app screen was found that uses it. The policy does not claim avatar uploads.
- No data-export feature was found in the code. The age tick, terms acceptance (`terms_version`, `terms_accepted_at`, `age_confirmed`) and password reset by e-mail code now exist and are described. The account (e-mail, password) is created at sign-up before the terms are ticked at profile creation; the policy says so.
- Library entries default to `visibility = public` and the RLS lets any signed-in reader read public entries; no screen that changes it was found.
- Open Library's `User-Agent` carries the GitHub project URL, not an e-mail (DECISIONS says "app name and contact email", the dev default says project page). The policy follows the code.
- Moderation e-mail (Resend), the Moderation screen, chapter-count requests and the orphan-cover sweep are in `main` and described without markers. Moderation e-mail is off until `moderation_email_settings.enabled` is set; the text describes it as it will run at launch.
- Reviews can now be reported (`reportReview` in `src/lib/safety.ts`, used by `BookReviews.tsx`).
- Profiles, per-user book ratings and public library entries are readable by every signed-in reader (`init.sql` profiles_read, ratings_read, library_read).

## Sign-off

| Who | What |
|---|---|
| PO (Boryana) | Facts about the operator, product behaviour, retention, promises, final wording in plain language |
| Lawyer (Bulgarian/EU data protection and consumer law) | Both documents, the BG versions, DPAs and transfers, liability and governing law |
| Engineering | Every claim in the policy against the release build (see list above) |

Suggested review cadence: before each store submission, whenever a feature that collects or shares data ships (new SDK, new processor, new field), and at least once a year.

## Where to host (for the store listings)

Both stores need a **public URL** for the privacy policy, reachable without login. The app itself is behind login, so these pages must live outside it.

- Host on the owned domain **livami.app**, for example `https://livami.app/privacy` and `https://livami.app/terms` [TO CONFIRM: a static page or small site on that domain; DNS is at Porkbun]. Serve English and Bulgarian versions (for example `/bg/privacy`, `/bg/terms`).
- Required places for the URL: App Store Connect (App Privacy: Privacy Policy URL, required; Terms URL optional or in the description/EULA field) and Google Play Console (Store listing and the Data safety form: Privacy policy URL, required).
- The app links to them at profile creation and on the "Our terms have changed" screen (`TermsConsent`, using `TERMS_URL` / `PRIVACY_URL`); a link in Profile > About was not found [TO CONFIRM: add one].
- Keep the URLs stable; update the text in place and keep dated older versions.
- Fill in Apple's privacy "nutrition label" and Google's Data safety form from section 3 of the privacy policy, and the age-rating questionnaires from the minimum-age decision.
