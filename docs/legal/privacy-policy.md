# Livami Privacy Policy

> **DRAFT FOR REVIEW. NOT LEGAL ADVICE, NOT YET IN FORCE.** Prepared for the product owner and a qualified lawyer (Bulgarian/EU data protection). Every assumption and open question is marked inline as "[TO CONFIRM: ...]". Statements about what the app does were derived from the code and docs in this repository (migrations up to `20261020000000`, `src/lib/*`, `docs/DECISIONS.md`, `docs/DATA_MODEL.md`) and must be re-checked against the release build.
>
> **Bulgarian version:** this is the English draft only. A lawyer-reviewed Bulgarian version is required before launch (the app has a Bulgarian UI, and consumer-facing terms and privacy information must be available in a language users understand). Do not machine-translate this text.

**Last updated:** [TO CONFIRM: date of publication]
**Applies to:** the Livami mobile app (iOS and Android) and the Livami support address.

## 1. Who we are

The controller of your personal data is:

[TO CONFIRM: legal name of the operator (a natural person or a company? "Boryana ..." / "... EOOD"), registered address, company ID (EIK) if any]

Contact for all privacy questions: **support@livami.app** [TO CONFIRM: that this mailbox exists and is monitored; whether a separate privacy@ address is wanted].

Data protection officer: [TO CONFIRM: a DPO is probably not required for a project of this size; confirm with counsel].
EU representative: not needed while the operator is established in the EU [TO CONFIRM].

## 2. The short version

- Livami is a reading app. We keep what you need to use it: your account, your library, your reading progress, what you post.
- We do **not** show ads, do **not** sell your data and do **not** share it for advertising.
- Our analytics are our own, record which features are used (never what you write or read), and you can switch them off in Profile ("Help us improve the app").
- You can delete your account inside the app. You choose whether your comments stay (without your name) or are erased.
- We do not host fanfiction text. We keep metadata and a link to the work on AO3.

## 3. What we collect, and why

| Feature | Data | Why (GDPR legal basis, Art. 6) |
|---|---|---|
| **Account** | E-mail address and password (the password is handled by Supabase Auth and stored hashed; we never see it). Your account ID and sign-up time. | Contract: to provide your account. |
| **Profile** | Your unique Name (letters, numbers, underscore), whether you read books and/or fanfiction, favourite genres and fandoms. Your Name is shown to other signed-in readers. | Contract. |
| **Library and progress** | The stories you added to your library, their status (e.g. reading, finished, DNF, on hold), the last chapter you finished, an optional page number, favourite flag, start and finish dates. Your progress decides which discussions you may open. | Contract. |
| **Visibility of your library** | Each library entry carries a visibility setting. In the database the default is "public", which lets other signed-in readers read that entry. | Contract. [TO CONFIRM: whether the app currently shows other readers' libraries anywhere and whether any screen lets you change this setting. The code searched has no screen that sets it; if nothing displays libraries, state that plainly here; if something does, the default must probably be private for GDPR "data protection by default".] |
| **Stories you add** | Title, author, fandom, chapter counts, AO3 link and similar details you type or paste. Stories are shared with other readers; we record who added a story. | Contract; legitimate interests (running a shared catalogue). |
| **Comments, replies, reactions** | The text you write, when, where (story and chapter), emoji reactions, @mentions. Visible to readers who have unlocked that chapter. | Contract. |
| **Book ratings and reviews** | Star rating, review text, "contains spoilers" flag. Visible to other signed-in readers. | Contract. |
| **Reports and blocks** | Whom/what you reported, the reason and optional details (up to 2000 characters); whom you blocked. | Legitimate interests (keeping the community safe); legal obligation where it applies [TO CONFIRM: DSA notice-and-action duties; see terms]. |
| **Author removal requests** | The AO3 work link, a message, and **the contact details you give** (e-mail or other way to reach you), so we can check the request with you. | Legitimate interests (respecting authors' rights); legal obligation where it applies. |
| **Feedback** | Your message, its type (problem, idea, other) and the app version. The database also has a "device" field, but the app currently does not fill it in. | Legitimate interests (fixing and improving the app). |
| **Notifications in the app** | Records that someone replied, mentioned or reacted, and who. **Never the comment text.** | Contract. |
| **Push notifications** (only if you switch them on) | Your device's push token (issued by Expo), the platform (iOS/Android) and the app language. A push says who replied, in which story and chapter, **never the comment text**. Several replies within 10 minutes are bundled into one push. | Consent (you accept your phone's permission prompt; you can withdraw it in Profile or in phone settings). |
| **Custom covers** (optional) | An image you upload (JPEG, PNG or WebP, up to 5 MB) and which story it belongs to. It is stored in a private bucket in a folder named after your account ID. Only you can see it; we do not show it to others. Image files may contain hidden metadata such as location (EXIF); [TO CONFIRM: whether the app strips metadata before upload; the code read does not appear to]. | Contract (you ask for the feature). |
| **Analytics** | Event name from a fixed list (for example app opened, sign-up, chapter finished, comment posted, language changed), a few short non-content values (such as kind, language, count), app version, platform, time. Linked to your account so we can see whether people come back. **Never** titles, comment text or other people's IDs. Limited to 300 events per hour per reader. | Legitimate interests (understanding which features work). You have the right to object, and we give a switch (section 9). [TO CONFIRM: legitimate interests vs. consent. Under the ePrivacy Directive, storing or reading information on your device may need consent. Here events are sent from the app to our server rather than cookies, but counsel should decide; the safer choice is opt-in.] |
| **Technical data** | Our hosting provider and the services below see your IP address and basic request data when the app connects. | Legitimate interests (security, operation). [TO CONFIRM: Supabase log retention.] |
| **Searches for books** | See section 5 (Open Library). | Contract. |

We do **not** collect: your real name, phone number, contact list, precise location, advertising ID, payment data, or the text of any fanfiction. [TO CONFIRM: no crash-reporting or other SDKs are added before release; none were found in `package.json`.]

## 4. Who receives your data (processors and others)

| Recipient | Role | What | Where |
|---|---|---|---|
| **Supabase** (database, authentication, file storage, realtime) | Processor | Everything in section 3 | [TO CONFIRM: hosting region of the Supabase project; ideally an EU region, e.g. Frankfurt. Not stated in the repo.] |
| **Expo** (push notification service, `exp.host`) | Processor | Push token, and the push message (title "Livami", who replied, story, chapter, link). Only if you enabled pushes. | [TO CONFIRM: Expo is US-based; see section 7] |
| **Apple (APNs) and Google (FCM)** | Independent controllers for delivery to your phone | The push message, via Expo | Worldwide |
| **Resend** (e-mail) [after PR #24 merge] | Processor | We send moderation e-mails **to ourselves**. They contain report details (what was reported, reason, details you wrote) and an author's contact details from removal requests. They do **not** contain reader e-mail addresses. | [TO CONFIRM: Resend region and DPA] |
| **Apple App Store / Google Play** | Independent controllers | Their own data about your download and purchases, under their own policies. We do not get your Apple/Google identity. | Worldwide |
| Authorities, courts | As required by law | Only where legally required | |

We have data processing agreements with processors [TO CONFIRM: sign and keep the DPAs of Supabase, Expo and Resend].

## 5. Open Library (books you search for)

When you search for a book, the app sends your **search text** (title, author or ISBN) directly from your phone to **Open Library** (openlibrary.org, run by the Internet Archive, a US non-profit). Your phone's IP address is visible to them in the usual way. The request identifies the app as `Livami/<version>` with a link to the project page, **not** with your name, account or e-mail address. Searches start after you type 3 characters and pause. Book cover images shown from Open Library are loaded from `covers.openlibrary.org` in the same way. Open Library is a separate controller under its own policy: https://openlibrary.org/ [TO CONFIRM: link to its current privacy policy].

We never contact AO3 from the app. When you paste an AO3 link, it is only tidied up and looked up in our own database; the details are read from text you paste yourself.

[TO CONFIRM: the project-page link in the User-Agent currently points to a GitHub repository page. Decide whether that is still the intended public identifier and whether the repository is public.]

## 6. How long we keep data

| Data | Kept |
|---|---|
| Account, profile, library, progress, ratings, reactions, follows, blocks, notifications, reports you filed, analytics events and opt-out, push tokens, custom covers | Until you delete your account, then deleted. [TO CONFIRM: are inactive accounts ever deleted automatically? Nothing in the code does this. Consider a retention rule, e.g. after 24 months of inactivity.] |
| Comments and reviews | Until you delete them or your account (see section 8) |
| Feedback | Kept without your name after account deletion; the text stays. [TO CONFIRM: retention period, e.g. 24 months.] |
| Author removal requests | Kept after deletion without the requester's link to an account; contact details are removed on account deletion. [TO CONFIRM: how long we keep a request and the decision on it, to prove we hid the work; suggest a fixed period.] |
| Reports about someone's comments | Stay with the comment. Reports you filed, or about you as a reader, are deleted with your account. [TO CONFIRM: moderation e-mails already sent to the operator's mailbox are not deleted automatically; set a retention period.] |
| Stories you added | Stay (other readers have them), without your name as the creator. |
| Notifications other readers received from you | Stay, signed "Deleted reader". |
| Cover files | Removed by the app when you delete your account. If that step fails, leftovers are removed by a daily clean-up. [after PR #20 merge] |
| Backups | [TO CONFIRM: Supabase backup retention. Deleted data may remain in backups for a limited time.] |
| Server logs | [TO CONFIRM] |

## 7. Transfers outside the EU/EEA

Some recipients are in, or may access data from, the United States or elsewhere: Expo, Apple, Google, Open Library (Internet Archive), and possibly Supabase and Resend depending on the region chosen. Where a recipient is outside the EEA, we rely on the EU-US Data Privacy Framework (if the recipient is certified) or the EU Standard Contractual Clauses. [TO CONFIRM: for each of Supabase, Expo, Resend: DPF certification or SCCs, and the transfer impact assessment, if needed.] You can ask us for a copy of the safeguards.

## 8. Deleting your account, and what happens to your content

Go to **Profile > Delete account** [TO CONFIRM: exact menu path and wording in the final build]. Before you confirm, the screen tells you what stays and what goes. **Deletion cannot be undone.**

**Always deleted:** your profile, library and progress, ratings, reactions, follows, blocks, notifications, reports you filed, custom covers (including the files), analytics events and opt-out record, and push tokens. All your sessions are ended.

**Comments and reviews, your choice:**
- *Default:* they stay, shown as written by "Deleted reader", with no avatar and no link to a profile, so other readers' replies still make sense.
- *If you choose "Also delete all my comments":* the text of each comment is erased (the place in the thread stays, showing "This comment was deleted"), and your reviews are deleted.

**Kept without your name:** stories you added (shared with other readers), feedback you sent (its text), author removal requests you sent (their contact details are removed), notifications others received from you (signed "Deleted reader").

**Anonymisation note.** Comments kept as "Deleted reader" no longer show your name or account link. If a comment's text itself identifies you, choose the erase option. [TO CONFIRM: with counsel, whether keeping comment text after deletion is acceptable as anonymised data, or whether it is better to default to erasure. Under GDPR Art. 17, a user can ask to have their comments erased; the in-app option and the contact address cover this.]

If you cannot use the app, write to support@livami.app from the e-mail address of your account and we will delete it. [TO CONFIRM: identity check procedure.]

## 9. Your rights and how to use them

Under the GDPR you have the right to: access your data; correct it; erase it; restrict processing; receive a copy in a portable format; object to processing based on legitimate interests; and withdraw consent at any time. You also have the right to complain to a supervisory authority. For Bulgaria this is the **Commission for Personal Data Protection (КЗЛД / CPDP)**, 2 Prof. Tsvetan Lazarov Blvd., Sofia 1592, www.cpdp.bg [TO CONFIRM: address and contact details]. You may complain to the authority in your own EU country instead.

How to use them:
- **Delete your account:** in the app (section 8).
- **Switch analytics off:** Profile > "Help us improve the app". When it is off, nothing is recorded; the setting is saved on your account and follows you to other devices. A device that has not yet picked up the change is still blocked by the database from recording anything. Past events are deleted when you delete your account [TO CONFIRM: also offer deletion of past events on opt-out, or on request].
- **Turn off push notifications:** in Profile or in your phone settings.
- **Correct your Name, genres, fandoms:** in Profile.
- **Everything else (access, copy, correction, restriction, objection):** write to support@livami.app. We reply within one month (GDPR Art. 12). [TO CONFIRM: there is no in-app data export today. Decide whether to build one or fulfil requests by hand.]

We do not make decisions about you by automated means that have legal or similar effects.

## 10. Children

Livami is not for children. You must be at least **[TO CONFIRM: 16 / 14 / 13 years old]** to create an account. In Bulgaria the age of digital consent under GDPR Art. 8 is **14** [TO CONFIRM: with counsel; do not rely on this line]. The current app has **no age check at sign-up** (e-mail and password only); [TO CONFIRM: add an age confirmation at sign-up and decide whether to ask for a date of birth].

Fanfiction on AO3 can be rated General, Teen, Mature or Explicit. Livami links to those works and shows AO3's rating and archive warnings, but does not host the text. Content ratings do not make Livami suitable for children. If we learn that a child under the minimum age has an account, we delete it. Parents can contact support@livami.app. [TO CONFIRM: whether adult-rated fandom discussion needs a higher minimum age (e.g. 16 or 18) or an age gate for Mature/Explicit works; also App Store and Google Play age-rating questionnaires.]

## 11. Security

Data is sent over encrypted connections. Access to each table is controlled in the database by Row Level Security: anonymous visitors have no access, and you can read other readers' content only as the app's rules allow (for example, comments in a chapter only after you finished it). Your custom covers are in a private bucket and only reachable by short-lived signed links (valid for one hour). The service key for e-mail sending stays only in Supabase and is not in the app. No system is perfectly secure. If a breach puts your rights at risk, we will notify you and the authority as the law requires (GDPR Arts. 33-34). [TO CONFIRM: breach procedure and responsible person; admin accounts use strong sign-in/2FA.]

## 12. Ads, selling, tracking

No advertising, no ad networks, no sale or sharing of personal data for advertising, no cross-app tracking, no profiling for marketing. [TO CONFIRM: for California-style "do not sell" wording, not needed for EU-only launch; revisit if you launch elsewhere. For Apple's privacy "nutrition labels" and Google's Data safety form, use the table in section 3. Declare: contact info (e-mail), user ID, user content, usage data (analytics), device ID (push token), app version; all linked to the user; none used for tracking.]

## 13. Content that is public inside the app

Your Name, comments, reviews and ratings can be seen by other signed-in readers. Everything is behind login and is not meant to be indexed by search engines. Please do not post personal information about yourself or others.

## 14. Changes to this policy

We will update this policy when the app changes. For material changes we will tell you in the app (or by e-mail) before they apply [TO CONFIRM: notice period, e.g. 30 days]. The date at the top shows the current version; older versions are kept on request.

## 15. Contact

support@livami.app
[TO CONFIRM: postal address of the operator; required in some jurisdictions and expected in an Art. 13 notice.]
