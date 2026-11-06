# Livami Privacy Policy

> **DRAFT FOR REVIEW. NOT LEGAL ADVICE, NOT YET IN FORCE.** Prepared for the product owner and a qualified lawyer (Bulgarian/EU data protection). Every assumption and open question is marked inline as "[TO CONFIRM: ...]". Statements about what the app does were derived from the code and docs in this repository (migrations up to `20261103000000`, `src/lib/*`, `app/onboarding.tsx`, `app/accept-terms.tsx`, `app/reset-password.tsx`, `docs/DECISIONS.md`, `docs/DATA_MODEL.md`) and must be re-checked against the release build.
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
- Other signed-in readers can see your Name and the rest of your profile (what you read, favourite genres and fandoms, join date), your book ratings, and, by default, your library (section 13). Nothing is public to people who are not signed in.
- We do **not** show ads, do **not** sell your data and do **not** share it for advertising.
- Our analytics are our own, record which features are used (never what you write or read), and you can switch them off in Profile ("Help us improve the app").
- You can delete your account inside the app. You choose whether your comments stay (without your name) or are erased.
- We do not host fanfiction text. We keep metadata and a link to the work on AO3.

## 3. What we collect, and why

| Feature | Data | Why (GDPR legal basis, Art. 6) |
|---|---|---|
| **Account** | E-mail address and password (the password is handled by Supabase Auth and stored hashed; we never see it). Your account ID and sign-up time. | Contract: to provide your account. |
| **Password reset** | If you choose "Forgot password", we use your e-mail address to send you a 6-digit code, valid for one hour, which you type into the app with your new password. The e-mail is sent through the e-mail service connected to our authentication provider (section 4). | Contract (access to your account); legitimate interests (account security). [TO CONFIRM: whether the auth provider keeps reset-request logs and for how long.] |
| **Acceptance of the terms and age confirmation** | When you create your profile you tick two boxes: "I accept the Terms and the Privacy Policy" and "I'm at least [TO CONFIRM: minimum age; the app uses 16 as a development default]". We store on your profile: the version of the terms you accepted (`terms_version`), the time of acceptance (`terms_accepted_at`, set by our server, not by your phone) and a yes/no that you ticked the age box (`age_confirmed`). **We do not ask for or store a date of birth, and we do not verify age.** If we publish a new version of the terms, the app asks you to accept again before it opens, and updates the stored version and time. You cannot withdraw an acceptance; leaving means deleting your account. | Legal obligation / legitimate interests (proof that you accepted the terms and confirmed your age); contract. [TO CONFIRM: basis with counsel.] |
| **Profile** | Your unique Name (letters, numbers, underscore), whether you read books and/or fanfiction, favourite genres and fandoms. The whole profile row (Name, whether you read books/fanfiction, favourite genres and fandoms, join date and a suspension flag) can be read by any signed-in reader. Your Name is shown everywhere. | Contract. |
| **Library and progress** | The stories you added to your library, their status (e.g. reading, finished, DNF, on hold), the last chapter you finished, an optional page number, favourite flag, start and finish dates. Your progress decides which discussions you may open. | Contract. |
| **Visibility of your library** | Each library entry carries a visibility setting. In the database the default is "public", which lets other signed-in readers read that entry. | Contract. [TO CONFIRM: whether the app currently shows other readers' libraries anywhere and whether any screen lets you change this setting. The code searched has no screen that sets it; if nothing displays libraries, state that plainly here; if something does, the default must probably be private for GDPR "data protection by default".] |
| **Stories you add** | Title, author, fandom, chapter counts, AO3 link and similar details you type or paste. Stories are shared with other readers; we record who added a story. | Contract; legitimate interests (running a shared catalogue). |
| **Comments, replies, reactions** | The text you write, when, where (story and chapter), emoji reactions, @mentions. Visible to readers who have unlocked that chapter. | Contract. |
| **Book ratings and reviews** | Star rating, review text, "contains spoilers" flag. Visible to other signed-in readers. | Contract. |
| **Reports and blocks** | Whom/what you reported (a comment, a review or a reader), the reason and optional details (up to 2000 characters), the status of the report (open, actioned or dismissed) and when; whom you blocked. | Legitimate interests (keeping the community safe); legal obligation where it applies [TO CONFIRM: DSA notice-and-action duties; see terms]. |
| **Author removal requests** | The AO3 work link, a message, **the contact details you give** (e-mail or other way to reach you) and a status (open, actioned or dismissed), so we can check the request with you. The link, your message and your contact details are also sent to our moderation mailbox (section 4). | Legitimate interests (respecting authors' rights); legal obligation where it applies. |
| **Feedback** | Your message, its type (problem, idea, other), the app version and a status (open or done) that only moderators change. The database also has a "device" field, but the app currently does not fill it in. | Legitimate interests (fixing and improving the app). |
| **Notifications in the app** | Records that someone replied, mentioned or reacted, and who. **Never the comment text.** | Contract. |
| **Push notifications** (only if you switch them on) | Your device's push token (issued by Expo), the platform (iOS/Android) and the app language. A push says who replied, in which story and chapter, **never the comment text**. Several replies within 10 minutes are bundled into one push. | Consent (you accept your phone's permission prompt; you can withdraw it in Profile ("Notifications on this phone") or in phone settings). |
| **Custom covers** (optional) | An image you choose from your photo library (the app asks for photo-library permission) and which story it belongs to. Before upload the app resizes it to 1200 px wide and re-encodes it as a JPEG (quality 0.8), so what is stored is always a JPEG. It is stored in a private bucket in a folder named after your account ID (the bucket also accepts PNG/WebP up to 5 MB). Only you can see it; we do not show it to others. Re-encoding very likely removes hidden metadata such as location (EXIF) [TO CONFIRM: by a test on iOS and Android]. | Contract (you ask for the feature). |
| **Analytics** | Event name from a fixed list (for example app opened, sign-up, chapter finished, comment posted, language changed), a few short non-content values (such as kind, language, count), app version, platform, time. Linked to your account so we can see whether people come back. **Never** titles, comment text or other people's IDs. Limited to 300 events per hour per reader. | Legitimate interests (understanding which features work). You have the right to object, and we give a switch (section 9). [TO CONFIRM: legitimate interests vs. consent. Under the ePrivacy Directive, storing or reading information on your device may need consent. Here events are sent from the app to our server rather than cookies, but counsel should decide; the safer choice is opt-in.] |
| **Technical data** | Our hosting provider and the services below see your IP address and basic request data when the app connects. | Legitimate interests (security, operation). [TO CONFIRM: Supabase log retention.] |
| **Chapter counts** | The first reader to add a book enters its chapter count (the database function `set_book_chapter_count`); it is stored with the book and visible to all readers. Once a book has a count, only a moderator changes it. If you see a wrong one, "Wrong chapter count?" lets you propose a number: we store who asked, the proposed number, the story, the time and the status (open, actioned or dismissed); deleted with your account. | Contract; legitimate interests (a correct shared catalogue). |
| **Moderation** | Moderators (today the product owner) see, in an admin-only screen, the open reports, removal requests, feedback and chapter-count requests with their text. Reports show the reason and your details text; the screen shows how many readers reported the same item. Moderators can hide a comment, review or fic, dismiss a report, accept a chapter count or mark feedback done. | Legitimate interests (keeping the community safe); legal obligation where it applies. |
| **Searches for books** | See section 5 (Open Library). | Contract. |

We do **not** collect: your real name, phone number, contact list, precise location, advertising ID, payment data, or the text of any fanfiction. [TO CONFIRM: no crash-reporting or other SDKs are added before release; none were found in `package.json`.]

## 4. Who receives your data (processors and others)

| Recipient | Role | What | Where |
|---|---|---|---|
| **Supabase** (database, authentication, file storage, realtime) | Processor | Everything in section 3 | [TO CONFIRM: hosting region of the Supabase project; ideally an EU region, e.g. Frankfurt. Not stated in the repo.] |
| **Expo** (push notification service, `exp.host`) | Processor | Push token, and the push message (title "Livami", who replied, story, chapter, link). Only if you enabled pushes. | [TO CONFIRM: Expo is US-based; see section 7] |
| **Apple (APNs) and Google (FCM)** | Independent controllers for delivery to your phone | The push message, via Expo | Worldwide |
| **Resend** (e-mail) | Processor | (a) Moderation e-mails **to ourselves** (sent by our database through Resend's API to our support mailbox). Immediate e-mails: for a report, the kind (comment, review or reader), the reason, the story title and the first 500 characters of the details the reporter wrote (**never who reported**); for an author removal request, the story title, the work link, the contact the author gave and the first 500 characters of the message. A daily digest at 07:00 UTC: feedback (type and the first 160 characters of the text) and chapter-count requests (story title, proposed and current count). Control characters in reader text are replaced by spaces. Reader account e-mail addresses are **not** included. At most one report e-mail is sent per reported item while an earlier one is open. (b) Password-reset code e-mails to **your** account address, if our authentication provider is set to send through Resend [TO CONFIRM: the README suggests Resend as the SMTP service; confirm what is configured at launch, and if another service is used, list it here]. | [TO CONFIRM: Resend region and DPA] |
| **Apple App Store / Google Play** | Independent controllers | Their own data about your download and purchases, under their own policies. We do not get your Apple/Google identity. | Worldwide |
| Authorities, courts | As required by law | Only where legally required | |

We have data processing agreements with processors [TO CONFIRM: sign and keep the DPAs of Supabase, Expo and Resend].

## 5. Open Library (books you search for)

When you search for a book, the app sends your **search text** (title, author or ISBN) directly from your phone to **Open Library** (openlibrary.org, run by the Internet Archive, a US non-profit). Your phone's IP address is visible to them in the usual way. The request identifies the app as `Livami/<version>` with a link to the project page, **not** with your name, account or e-mail address. Searches start after you type 3 characters and pause. Book cover images shown from Open Library are loaded from `covers.openlibrary.org` in the same way. Open Library is a separate controller under its own policy: https://openlibrary.org/ [TO CONFIRM: link to its current privacy policy].

The app makes no network calls to AO3. When you paste an AO3 link, it is only tidied up and looked up in our own database; the details are read from text you paste yourself. If you tap an AO3 link, it opens AO3 in your browser, and AO3 then handles your data under its own policy.

[TO CONFIRM: the project-page link in the User-Agent currently points to a GitHub repository page. Decide whether that is still the intended public identifier and whether the repository is public.]

## 6. How long we keep data

| Data | Kept |
|---|---|
| Account, profile, library, progress, ratings, reactions, follows, blocks, notifications, reports you filed, analytics events and opt-out, push tokens, custom covers | Until you delete your account, then deleted. [TO CONFIRM: are inactive accounts ever deleted automatically? Nothing in the code does this. Consider a retention rule, e.g. after 24 months of inactivity.] |
| Comments and reviews | Until you delete them or your account (see section 8) |
| Feedback | Kept without your name after account deletion; the text stays. [TO CONFIRM: retention period, e.g. 24 months.] |
| Author removal requests | Kept after deletion without the requester's link to an account; contact details are removed on account deletion. [TO CONFIRM: how long we keep a request and the decision on it, to prove we hid the work; suggest a fixed period.] |
| Reports about someone's comments | Stay with the comment, with their status (open, actioned, dismissed). Reports you filed, or about you as a reader, are deleted with your account. [TO CONFIRM: moderation e-mails already sent to the operator's mailbox (and held by Resend) are not deleted automatically; set a retention period.] |
| Stories you added | Stay (other readers have them), without your name as the creator. |
| Notifications other readers received from you | Stay, signed "Deleted reader". |
| Cover files | Removed by the app when you delete your account. If that step fails, leftovers are removed by a daily clean-up. |
| Chapter-count requests | Deleted with your account. [TO CONFIRM: resolved requests stay until then; set a period if wanted.] |
| Terms acceptance record (version, time, age yes/no) | Kept on your profile until you delete your account. [TO CONFIRM: whether proof of acceptance must be kept longer for legal claims; if so, say how and for how long.] |
| Password-reset codes | Valid for one hour, and used up once a password is set. |
| Moderation e-mail log (request ID, kind, delivery status, linked report; no content) | 30 days |
| Backups | [TO CONFIRM: Supabase backup retention. Deleted data may remain in backups for a limited time.] |
| Server logs | [TO CONFIRM] |

## 7. Transfers outside the EU/EEA

Some recipients are in, or may access data from, the United States or elsewhere: Expo, Apple, Google, Open Library (Internet Archive), and possibly Supabase and Resend depending on the region chosen. Where a recipient is outside the EEA, we rely on the EU-US Data Privacy Framework (if the recipient is certified) or the EU Standard Contractual Clauses. [TO CONFIRM: for each of Supabase, Expo, Resend: DPF certification or SCCs, and the transfer impact assessment, if needed.] You can ask us for a copy of the safeguards.

## 8. Deleting your account, and what happens to your content

Go to **Profile > "Delete my account"** (Bulgarian: "Изтрий акаунта ми"). [TO CONFIRM: menu path in the final build.] Before you confirm, the screen tells you what stays and what goes. **Deletion cannot be undone.**

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
- **Switch analytics off:** Profile > "Help us improve the app" (Bulgarian: "Помогни ни да подобрим приложението"). When it is off, nothing is recorded; the setting is saved on your account and follows you to other devices. A device that has not yet picked up the change is still blocked by the database from recording anything. Past events are deleted when you delete your account [TO CONFIRM: also offer deletion of past events on opt-out, or on request].
- **Turn off push notifications:** in Profile ("Notifications on this phone") or in your phone settings.
- **Correct your Name, genres, fandoms:** in Profile.
- **Everything else (access, copy, correction, restriction, objection):** write to support@livami.app. We reply within one month (GDPR Art. 12). [TO CONFIRM: there is no in-app data export today. Decide whether to build one or fulfil requests by hand.]

We do not make decisions about you by automated means that have legal or similar effects.

## 10. Children

Livami is not for children. You must be at least **[TO CONFIRM: 16 / 14 / 13 years old; the app currently uses 16 as a development default]** to use it. In Bulgaria the age of digital consent under GDPR Art. 8 is **14** [TO CONFIRM: with counsel; do not rely on this line]. When you create your profile, the app asks you to tick "I'm at least [age]" next to a note that Livami is for readers of that age and over. This is a **self-declaration**: we do not check it, we do not ask for or store a date of birth, and we keep only the fact that you ticked it (section 3). Readers who joined before this step must tick it, and accept the terms, before the app opens again. Your e-mail address and password are collected when you sign up, **before** you reach this step; if you do not accept, the account has no profile, and you can sign out or delete it [TO CONFIRM: whether accounts without a profile are cleaned up automatically; nothing in the code does this]. [TO CONFIRM: whether a self-declared tick is enough for the chosen age, or a stronger check is needed].

Fanfiction on AO3 can be rated General, Teen, Mature or Explicit. Livami links to those works and shows AO3's rating and archive warnings, but does not host the text. Content ratings do not make Livami suitable for children. If we learn that a child under the minimum age has an account, we delete it. Parents can contact support@livami.app. [TO CONFIRM: whether adult-rated fandom discussion needs a higher minimum age (e.g. 16 or 18) or an age gate for Mature/Explicit works; also App Store and Google Play age-rating questionnaires.]

## 11. Security

Data is sent over encrypted connections. Access to each table is controlled in the database by Row Level Security: anonymous visitors have no access, and you can read other readers' content only as the app's rules allow (for example, comments in a chapter only after you finished it). Your Name, profile, book ratings and (by default) library entries are readable by every signed-in reader, by design (section 13). Your custom covers are in a private bucket and only reachable by short-lived signed links (valid for one hour). The service key for e-mail sending stays only in Supabase and is not in the app. No system is perfectly secure. If a breach puts your rights at risk, we will notify you and the authority as the law requires (GDPR Arts. 33-34). [TO CONFIRM: breach procedure and responsible person; admin accounts use strong sign-in/2FA.]

## 12. Ads, selling, tracking

No advertising, no ad networks, no sale or sharing of personal data for advertising, no cross-app tracking, no profiling for marketing. [TO CONFIRM: for California-style "do not sell" wording, not needed for EU-only launch; revisit if you launch elsewhere. For Apple's privacy "nutrition labels" and Google's Data safety form, use the table in section 3. Declare: contact info (e-mail), user ID, user content, usage data (analytics), device ID (push token), app version; all linked to the user; none used for tracking.]

## 13. Content that is public inside the app

Other signed-in readers can see: your Name and whole profile (what you read, favourite genres and fandoms, join date); your comments (in chapters they unlocked), reviews and **individual book ratings**; and your **library**, because each library entry is public by default in the database (status, progress, favourite flag, dates). No screen was found that lets you change this [TO CONFIRM: privacy-by-default; make libraries private by default, or show an in-app setting, before launch]. Fanfiction ratings are private to the rater. Everything is behind login and is not meant to be indexed by search engines. Please do not post personal information about yourself or others.

## 14. Changes to this policy

We will update this policy when the app changes. For material changes we will tell you in the app (or by e-mail) before they apply [TO CONFIRM: notice period, e.g. 30 days]. The date at the top shows the current version; older versions are kept on request.

## 15. Contact

support@livami.app
[TO CONFIRM: postal address of the operator; required in some jurisdictions and expected in an Art. 13 notice.]
