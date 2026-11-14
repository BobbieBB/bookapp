# Legal drafts: status and open items

> **DRAFTS FOR REVIEW. Not legal advice and not in force.** Written for the product owner (PO) and a lawyer. Do not publish, link from the app, or submit to the stores until the items below are closed.

## Files

- `privacy-policy.md`: GDPR privacy notice (controller, data per feature, legal bases, processors, retention, rights, children, transfers, analytics opt-out, security).
- `terms.md`: Terms of Use (eligibility, accounts, content licence, community rules, DSA content moderation, fanfiction stance, our IP, suspension, liability, governing law).

Both were derived from the code at `origin/main` (migrations up to `20261113000000`, `src/lib/analytics.ts`, `legal.ts`, `push*.ts`, `covers.ts`, `sources.ts`, `account.ts`, `safety.ts`, `app/onboarding.tsx`, `app/accept-terms.tsx`, `app/reset-password.tsx`, the moderation and moderation-e-mail migrations) and `docs/DECISIONS.md` / `docs/DATA_MODEL.md`. Every assumption or open question is marked inline as `[TO CONFIRM: ...]`; search the files for that string. Markers "ships with <branch>" (BG: "идва с <branch>") flag app changes the text already describes; drop each when its PR merges. The earlier `[after PR #N merge]` markers (#20 orphan-cover sweep, #23 Moderation screen and chapter-count requests, #24 moderation e-mail via Resend) are gone: all three PRs are merged and the text now states what the code does. The Calm theme/appearance choice is not in the policy on purpose: it is stored only on the phone (`AsyncStorage`, key `livami.appearance`, `src/appearance.tsx`), not on the server.

## Bulgarian versions

`privacy-policy.bg.md` and `terms.bg.md` are working Bulgarian drafts of the two texts (13 Nov 2026), written in plain language with the app's own wording for buttons and screens. Open items are marked `[ЗА ЮРИСТ: ...]` (for the lawyer), `[ЗА PO: ...]` or `[ЗА ЕКИПА: ...]`. The lawyer reviews both languages; suggest that Bulgarian prevails.

## Decided

By the PO (13 Nov 2026):

- Operator: **Boryana Dimitrova**, natural person; contact **support@livami.app** (forwarded to her mailbox, tested).
- Minimum age **16**, self-declared tick.
- Libraries **private by default** (migration `20261113000000_private_library.sql`, run).
- Supabase and Resend in the EU (Ireland, `eu-west-1`); password-reset and moderation e-mail switched on through Resend; open/click tracking off.
- Moderation aim: within 24 hours on a best-effort basis.
- Promise kept in the terms: we never sell readers' content or use it to train AI models.

By the legal review (14 Nov 2026), now written into the drafts, each app change marked "ships with <branch>" until its PR merges:

- Privacy Policy is information, not a term: tick text "I accept the Terms. I have read the Privacy Policy." (`feat/terms-update`); legal basis for the acceptance record is Art. 6(1)(b)/(f); the "cannot be withdrawn" sentence is gone.
- Terms changes: notice, effective date, acceptance from that date, no "continued use" (`feat/terms-update`).
- Explicit works: minimum age stays 16; AO3 warnings and link for Explicit works need a separate "I'm 18 or over" (`feat/explicit-gate`).
- Content moderation (terms section 6) follows the DSA: contact point in Bulgarian and English, notice with art. 16 elements, statement of reasons and notices to author and reporter (`feat/moderation-notices`); the former takedown/"counter-notice" clause is gone and section 9 is only about our own IP.
- Suspension is a reserved power with warning, reason and a way to contest; admins can suspend and unsuspend (`feat/suspend`).
- Deletion: the reader chooses keep or erase, nothing preselected (`feat/delete-choice`).
- Analytics are opt-in, with an unticked box at onboarding; existing readers count as not opted in (`feat/analytics-consent`).
- Accounts that never create a profile are deleted after 30 days (`feat/account-cleanup`).
- No liability cap and no blanket "as is"; liability for foreseeable loss; the service is free.
- Bulgarian text prevails; assignment to a successor with notice; force majeure; how the contract is concluded and stored; EU ODR platform removed, ADR via КЗП and its conciliation committees.
- Apple's standard EULA is used and the terms supplement it.

Follow-up for the team: the profile columns (`terms_version`, `terms_accepted_at`, `age_confirmed`, `is_admin`, `is_suspended`) are hidden from other readers and library visibility is pinned to private in `fix/profile-privacy`; drop the markers when it merges. Before launch, publish `site/terms` and `site/privacy`, set `TERMS_VERSION` to the publication date, and archive old versions at a stable address.

## Open decisions (grouped)

**PO decides**
1. Operator identity: legal name, **address for service** (required), EIK/VAT, contact mailbox (support@livami.app must exist and be monitored). Whether to run Livami through an ЕООД (the terms already allow transfer to a successor).
2. Alternative to the 18+ tick: minimum age 18 for the whole app. Whether Mature works are gated like Explicit. `MIN_AGE = 16` in `src/lib/legal.ts` is a dev default.
3. Retention periods: inactive accounts (none today), feedback (24 months proposed), removal requests, resolved chapter-count requests, moderation e-mails (also at Resend), proof of terms acceptance, logs, backups.
4. Notice period for terms changes (30 days proposed), the time limit to ask us to look at a moderation decision again (6 months proposed), notice before stopping the service.
5. Whether we agree to take part in ADR before the КЗП conciliation committees (text says yes).
6. Promises in the terms: one account per person, 24-hour moderation target.
7. Whether to offer an in-app data export (none today) and deletion of past analytics on opt-out.
8. Test that custom covers lose EXIF: the app resizes to 1200 px and re-encodes as JPEG 0.8 (`CustomCover.tsx`), which very likely drops it.

**Lawyer decides**
1. Capacity of 16 and 17 year olds (free app as an everyday transaction, or a parental-permission line in the tick).
2. GDPR basis for keeping comments as "Deleted reader" and whether erase should be the default; acceptance record on Art. 6(1)(b)/(f).
3. DPO / EU representative need, DPAs with Supabase, Expo and Resend, transfer mechanisms (DPF or SCCs).
4. DSA: that Livami is a hosting service and a micro-enterprise (arts. 19, 11, 12, 14, 16, 17, 18); Copyright Act elements for notices.
5. Liability wording (ЗЗД чл. 82, 94; ЗЗП чл. 143), whether the Digital Content Directive (ЗПЦСЦУПС) applies to the free service, whether 14-day withdrawal wording is needed, and the right to end the contract after a change.
6. Venue (competent Bulgarian court), ADR wording, prevailing language.
7. Use of the "AO3" name (OTW guidelines) and the Open Library data and cover licences and attribution.

**Engineering confirms** (see "Code checks" below)
- Supabase project region (EU?); Supabase log and backup retention.
- Which SMTP service sends the password-reset code (README suggests Resend); if it is not Resend, update the processor table. Check the hosted recovery e-mail template matches `supabase/templates/recovery.html`.
- Settings menu paths quoted in the policy ("Delete my account", "Help us improve the app", "Notifications on this phone").
- No additional SDKs (crash reporting, ads) are added before release.

## Code checks: where the code differed from what the brief expected

- `feedback.device` exists in the schema, but the app writes only `app_version` (`src/lib/safety.ts`). The policy says so.
- `profiles.avatar_url` exists, but no app screen was found that uses it. The policy does not claim avatar uploads.
- No data-export feature was found in the code. The age tick, terms acceptance (`terms_version`, `terms_accepted_at`, `age_confirmed`) and password reset by e-mail code now exist and are described. The account (e-mail, password) is created at sign-up before the terms are ticked at profile creation; the policy says so.
- Library entries now default to private (migration `20261113000000`), but until `fix/profile-privacy` merges the owner can still set `public` through the API and the read policy honours it.
- Open Library's `User-Agent` carries the GitHub project URL, not an e-mail (DECISIONS says "app name and contact email", the dev default says project page). The policy follows the code.
- Moderation e-mail (Resend), the Moderation screen, chapter-count requests and the orphan-cover sweep are in `main` and described without markers. Moderation e-mail is off until `moderation_email_settings.enabled` is set; the text describes it as it will run at launch.
- Reviews can now be reported (`reportReview` in `src/lib/safety.ts`, used by `BookReviews.tsx`).
- Profiles (whole row, until `fix/profile-privacy` merges), per-user book ratings and public library entries are readable by every signed-in reader (`init.sql` profiles_read, ratings_read, library_read).

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
