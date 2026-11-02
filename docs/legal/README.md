# Legal drafts: status and open items

> **DRAFTS FOR REVIEW. Not legal advice and not in force.** Written for the product owner (PO) and a lawyer. Do not publish, link from the app, or submit to the stores until the items below are closed.

## Files

- `privacy-policy.md`: GDPR privacy notice (controller, data per feature, legal bases, processors, retention, rights, children, transfers, analytics opt-out, security).
- `terms.md`: Terms of Use (eligibility, accounts, content licence, community rules, moderation, fanfiction stance, IP/takedown, termination, liability, governing law).

Both were derived from the code at `origin/main` (migrations up to `20261020000000`, `src/lib/analytics.ts`, `push*.ts`, `covers.ts`, `sources.ts`, `account.ts`, `safety.ts`) and `docs/DECISIONS.md` / `docs/DATA_MODEL.md`. Every assumption or open question is marked inline as `[TO CONFIRM: ...]`; search the files for that string. Markers: `[after PR #24 merge]` (moderation e-mail via Resend) and `[after PR #20 merge]` (daily orphan-cover sweep), must be resolved at merge time: remove them if the PR merges as described, or delete the passages if it does not.

## Bulgarian versions

Not translated on purpose. A **lawyer-reviewed Bulgarian version of both documents is required** before launch, because the app has a Bulgarian UI. Decide which version prevails in a conflict.

## Open decisions (grouped)

**PO decides**
1. Operator identity: legal name, address, EIK/VAT, contact mailbox (support@livami.app must exist and be monitored).
2. Minimum age (13/14/16) and whether an age confirmation or date of birth is added at sign-up (none exists now). Whether Mature/Explicit AO3 works need a higher age or gate.
3. Retention periods: inactive accounts, feedback, removal requests, moderation e-mails, logs, backups.
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
- Settings menu paths quoted in the policy ("Delete account", "Help us improve the app", push switch).
- No additional SDKs (crash reporting, ads) are added before release.

## Code checks: where the code differed from what the brief expected

- `feedback.device` exists in the schema, but the app writes only `app_version` (`src/lib/safety.ts`). The policy says so.
- `profiles.avatar_url` exists, but no app screen was found that uses it. The policy does not claim avatar uploads.
- No age check, no password-reset flow and no data-export feature were found in the code.
- Library entries default to `visibility = public` and the RLS lets any signed-in reader read public entries; no screen that changes it was found.
- Open Library's `User-Agent` carries the GitHub project URL, not an e-mail (DECISIONS says "app name and contact email", the dev default says project page). The policy follows the code.
- Moderation e-mail (Resend, PR #24), the Moderation screen and chapter-count requests (PR #23) and the orphan-cover sweep (PR #20) are not in `main`, so they are marked.
- Reviews cannot be reported yet (`src/lib/safety.ts` has `reportComment` and `reportUser` only); a fix is planned.
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
- Also link them inside the app (sign-up screen, Profile > About) [TO CONFIRM: not present today].
- Keep the URLs stable; update the text in place and keep dated older versions.
- Fill in Apple's privacy "nutrition label" and Google's Data safety form from section 3 of the privacy policy, and the age-rating questionnaires from the minimum-age decision.
