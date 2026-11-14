# Livami Terms of Use

> **DRAFT FOR REVIEW. NOT LEGAL ADVICE, NOT YET IN FORCE.** Prepared for the product owner and a qualified lawyer. Every assumption and open question is marked inline as "[TO CONFIRM: ...]". Statements about the app were derived from the code and docs in this repository and must be re-checked against the release build.
>
> **Reading the markers.** Where a fix depends on a decision by the PO or the lawyer, the text below is our recommended wording and the alternative sits in the marker. Where the text describes an app change that is being built on its own branch, the sentence is written as if the change exists and carries "[TO CONFIRM: ships with <branch>]"; the team drops the marker when that PR merges, and the sentence must be reworded if the change does not ship before launch.
>
> **Bulgarian version:** `terms.bg.md` is a working Bulgarian draft of this text for the lawyer. Both must be reviewed before launch. Recommended: Bulgarian prevails (section 16).
>
> **Decided by the PO on 13 Nov 2026:** operator Boryana Dimitrova (natural person); minimum age 16; contact support@livami.app; moderation "within 24 hours on a best-effort basis".

**Last updated:** [TO CONFIRM: date of publication; this date also becomes the terms version]

## 1. Who we are and what these terms cover

Livami (the "app", "we") is a social reading app for books and fanfiction, run by **Boryana Dimitrova**, a natural person in Bulgaria. Address for service: [TO CONFIRM: address for service (a correspondence address is enough)]. [TO CONFIRM: if Livami is run through a company (for example an ЕООД), its name, seat and company number (ЕИК) replace this line; see section 16, "Transfer to a successor".]

You accept these terms explicitly. When you create your profile the app asks you to tick a box that reads "I accept the Terms. I have read the Privacy Policy." (with links to both) and you cannot continue without it. [TO CONFIRM: ships with feat/terms-update. Today the box reads "I accept the Terms and the Privacy Policy" (`src/i18n/messages/legal.ts:6`), and the terms version is bumped with the change.] We record the version you accepted and the time. When we publish a new version, you are asked to accept it in the app (section 15); if you do not agree, you can sign out or delete your account instead. You can end this contract at any time by deleting your account.

How we handle personal data is explained in the Privacy Policy. It is information for you, not a term of this contract.

Contact: **support@livami.app**.

## 2. Who can use Livami

You must be at least **16** years old (see the Privacy Policy, "Children") and able to enter this contract under the law where you live. When you create your profile you confirm your age by ticking "I'm at least 16". This is your own statement: we do not check your age or ask for a date of birth, and by ticking you state that it is true. The app is aimed at users in the European Union [TO CONFIRM: other countries? Store availability settings].

[TO CONFIRM: capacity of minors, for the lawyer. A Bulgarian minor aged 14 to 17 (непълнолетен) needs consent for contracts other than everyday ones. Option A (the wording above): counsel confirms that a free reading app is an everyday transaction, so no parental line is needed. Option B: the tick text also says the reader has a parent's or guardian's permission if under 18, and this paragraph says so. The age of digital consent for data in Bulgaria is 14 (ЗЗЛД чл. 25в), so 16 is above it.]

**Mature and Explicit works.** Some fanfiction that readers add is rated Mature or Explicit on AO3. Livami links to those works but does not host them (section 8). For works rated **Explicit**, the app hides the archive warnings and the AO3 link until you tick a separate "I'm 18 or over". You set this in Profile, we store only a yes or no (never a date of birth), and it is your own statement, like the age tick above. The discussion rooms of Explicit works are closed in the same way: readers who have not ticked it cannot open them. [TO CONFIRM: ships with feat/explicit-gate. Today every reader can open those discussion rooms, and the app shows the AO3 rating, the archive warnings and the link to every reader (`app/story/[id].tsx:317-332`). Decide whether Mature works are gated too; the gate covers Explicit only.]

[TO CONFIRM: alternative, PO decides: raise the minimum age of the whole app to 18. This removes the need for the extra tick but loses younger readers; if chosen, change the age above, the tick text, `MIN_AGE`, the Privacy Policy section 10 and the store age ratings, and drop the paragraph above.]

## 3. Your account

- You sign up with an e-mail address and a password (at least 8 characters). Keep them secret and give us true contact information. If you forget the password, "Forgot password" sends a 6-digit code to your e-mail address, which you type in the app to choose a new one. Do not share the code.
- You choose one unique **Name** (3 to 30 letters, numbers or underscores). It is shown everywhere in the app, and it is the only name the app uses. Do not impersonate others or choose a Name that is offensive or misleading. [TO CONFIRM: if a display name is ever used, this rule must cover it too.]
- One person, one account [TO CONFIRM].
- You are responsible for what happens on your account. Tell us at once if you think someone else is using it.
- You can delete your account at any time in the app. What happens to your content is explained in the Privacy Policy, section 8.

## 4. Your content and the licence you give us

"Your content" means what you post: comments, replies, reactions, book reviews and ratings, stories and details you add, feedback, and any custom cover image.

- **You keep ownership** of your content. Post only what you wrote yourself or have the right to share.
- **Licence.** You give us a non-exclusive, worldwide, royalty-free licence to store, display and technically process your content, only for these purposes: running the app (for example, showing your comment to readers who unlocked that chapter); keeping the service safe, including showing content to a moderator and keeping records of moderation decisions (section 6); and keeping backups. The licence for comments and reviews lasts as long as the content stays in the app, and afterwards only for as long as backups keep a copy (the Privacy Policy says how long [TO CONFIRM: Supabase backup retention]). We do not use your content for any other purpose.
- **After you delete your account,** the delete screen makes you choose between "Keep my comments as 'Deleted reader'" and "Erase them", with no answer preselected. If you keep them, they stay without your name and the licence continues for those comments and reviews. [TO CONFIRM: ships with feat/delete-choice. Today the screen starts with "keep" selected (`app/delete-account.tsx:16`, `erase` is false). The lawyer may prefer erase as the default; this also touches GDPR Art. 17.]
- **Custom covers** are private: only you see them, and we do not show them to others. Use only images you have the right to use. Do not upload other people's art that you do not have permission to use.
- We will not sell your content or use it to train AI models.
- You are responsible for your content. We do not check it before it is posted.

## 5. Community rules

Be kind. Do not:
- harass, threaten, hate on, or dox anyone, or post sexual content involving minors, or illegal content;
- post spam, advertising, scams, or malware;
- impersonate someone or misuse another person's work;
- try to get around the spoiler wall or the app's technical limits, scrape the app, or harm the service;
- flood the app (the app limits reports, feedback and requests per hour and day).

**Spoiler etiquette.** Discussions are locked until you finish the chapter. The Epilogue opens only when you finish the whole story. There is no manual unlock. Do not reveal spoilers outside the right room, and mark book reviews that contain spoilers with the spoiler flag.

**Fandom etiquette.**
- Books and fanfiction live in separate sections.
- Fanfiction is not rated with public stars. Recommendations, kudos and comments for a fic belong to its author on AO3, and we encourage you to leave them there.
- Do not reproduce, paste or share fanfiction text in the app, and do not post other people's fanart without permission. Credit is not permission.
- Respect ships, fandoms and readers who like something different. Criticise the work or idea, not the person.

## 6. Reporting, blocking and content moderation

This section is also our notice-and-action procedure for illegal content under the Digital Services Act ("DSA"). It replaces the former takedown clause in section 9. [TO CONFIRM: lawyer to confirm that Livami is a hosting service and, as a micro-enterprise, is exempt from DSA arts. 20 to 28 (art. 19) but not from arts. 11, 12, 14, 16, 17 and 18.]

**6.1 Contact point (DSA arts. 11 and 12).** Authorities and users can reach us at **support@livami.app**, in **Bulgarian or English**. This is our single contact point for notices, questions and requests about content.

**6.2 What we may restrict, and how.** We may restrict content that is illegal or that breaks section 5. The restrictions we use are: hiding a comment, hiding a book review and, in serious cases, suspending an account (section 10). We can also hide a fic entry, but today only when its author asks us to remove it (section 8). Other notices about a fic entry are handled by e-mail. [TO CONFIRM: a moderator tool to hide a fic entry on any valid notice is not built yet.] Hidden content is no longer shown to other readers. We do not rank or demote content.

**6.3 Who decides.** A person decides every restriction. We do not use automated tools to decide what is hidden. The app's per-hour and per-day limits (section 5) only slow down floods; they do not judge content.

**6.4 Reporting inside the app, and blocking.** You can **report** any comment, book review or reader that breaks these rules. You can **block** a reader: you no longer see their comments, reviews or reactions, and neither of you can reply to or notify the other.

**6.5 Notifying us of illegal content (DSA art. 16).** You can also write to support@livami.app. A notice should contain:
- an explanation of why you think the content is illegal;
- where it is: the story, the chapter, a link or a screenshot;
- your name and e-mail address (not needed for notices about child sexual abuse material or other offences listed in Directive 2011/93/EU);
- a statement that you believe in good faith that the information in your notice is accurate and complete.

This is also the route for copyright or other rights claims about content posted by readers. [TO CONFIRM: lawyer to check the Bulgarian Copyright Act for any extra elements.] We do not use a US-style "counter-notice". If you posted content that was hidden and you disagree, use section 6.8.

**6.6 What we do with a report or notice.** We look at reports and author removal requests as fast as we can and aim to act **within 24 hours, on a best-effort basis**; it may take longer at weekends and holidays. If you notify us by e-mail, we confirm that we received your notice and tell you our decision. If you report inside the app, you get an in-app notice that your report was reviewed, with the outcome (hidden or dismissed). [TO CONFIRM: ships with feat/moderation-notices. Today the app sends nothing back to a reader who reports, and the moderation e-mail never says who reported. DSA art. 16(4) and (5).]

**6.7 Statement of reasons (DSA art. 17).** When we hide your content or suspend your account, we tell you in the app: what we did; the reason (the facts we relied on and the rule in the law or in these terms); that a person decided it; and how to ask us to look again: "write to support@livami.app to ask us to look again" (section 6.8). [TO CONFIRM: ships with feat/moderation-notices (hidden comment, review or fic) and feat/suspend (suspension). Today nobody is told, and there is no appeal channel.]

**6.8 Ask us to look again.** If you disagree with a decision, write to support@livami.app within [TO CONFIRM: 6 months] and say why. A person reviews it, and where possible not the person who first decided. We answer with a reasoned reply. This is a voluntary step: the formal complaint system of DSA art. 20 does not apply to us as a micro-enterprise. It does not take away your right to go to a court (section 13). [TO CONFIRM: lawyer to confirm that a dispute about moderation is a matter for the courts and not a consumer-protection matter for the КЗП, and whether any out-of-court route applies.]

**6.9 Threats to life or safety (DSA art. 18).** If we learn of information that gives rise to a suspicion that a crime involving a threat to a person's life or safety has happened, is happening or is likely to happen, we pass it to the authorities concerned.

**6.10 Personal data.** Reports and notices may contain personal data; see the Privacy Policy.

## 7. Notifications

If you switch them on, we send push notifications for replies to you and @mentions. They show who replied, the story and the chapter, never the comment text. You can turn them off at any time. Reactions appear in the app only.

## 8. Fanfiction: what Livami is and is not

Livami is built on a simple belief: every fic is a gift. We try to protect it.

- Livami **does not host, copy, scrape or sell fanfiction.** For a fic we keep only basic details (title, author, fandom, chapters, ship, AO3 rating and archive warnings), and a **link to the work on AO3** (Archive of Our Own). We do not fetch anything from AO3. The details you add come from you.
- We send readers back to AO3 to read, and to leave kudos and comments. Fanfiction is never sold or paywalled in Livami.
- Livami is an independent project and is **not affiliated with, endorsed by or sponsored by** AO3 or the Organization for Transformative Works. We use those names only to say what a link points to. [TO CONFIRM: check against OTW's trademark guidelines; nominative use plus this disclaimer is usually enough.]
- **Authors are welcome here and can ask for their work to be removed at any time.** Use the author request in the app ("Authors are welcome here" page) or write to support@livami.app, giving the AO3 link and a way to reach you, so we can check that you are the author. Once confirmed, we hide the fic everywhere in the app. [TO CONFIRM: whether a fic can also be hidden at the request of someone who is not the author, e.g. a translator or a co-author.]
- Books come from Open Library's public data. Book covers shown to everyone are loaded by your phone straight from `covers.openlibrary.org`. Open Library material is subject to its own terms, and we credit Open Library as the source. [TO CONFIRM: Open Library data and cover licensing and the exact attribution wording; some cover images may be copyrighted and used under the service's terms.]
- Reader-added details of a fic (title, author name, and so on) are facts, not the work. If you think something we show infringes your rights, see sections 6.5 and 9.

## 9. Our intellectual property

This section is only about our own rights. How to notify us of content that infringes yours is in section 6.5.

The Livami name, logo, design and software belong to us or our licensors. These terms do not give you any rights in them, except to use the app as intended. [TO CONFIRM: ownership of name and logo; no trademark is registered yet (docs/NAMING_AND_TRADEMARK.md).]

## 10. Suspension and termination

- **You** can stop using the app and delete your account at any time.
- **We** may remove content, or suspend or close an account, if you seriously or repeatedly break these terms or the law, or if required by law. This is a power we reserve. We use it in steps: (1) a warning that says what the problem is, unless the case is serious (for example illegal content or a risk to others); (2) a clear reason for any suspension (section 6.7); (3) a way to contest the decision (section 6.8). A suspended reader can still read but cannot post, and sees an in-app notice with the reason and how to contest it. An administrator can lift a suspension. [TO CONFIRM: ships with feat/suspend (admins suspend or unsuspend a reader from Moderation, with a reason). Today the database has an `is_suspended` flag that blocks a suspended reader (`supabase/migrations/20261012000000_init.sql:46,61`) but nothing can set it.]
- We may stop the service as a whole with reasonable notice [TO CONFIRM: notice period].
- After termination, sections that by nature continue (4, 9, 11, 12, 13) stay in force.

## 11. What we promise, and what we cannot

- **Price.** Livami is free, with no ads. You can stop at any time by deleting your account. [TO CONFIRM: if paid features are ever added, these terms change first. Lawyer to confirm whether the 14-day withdrawal wording of the Consumer Rights Directive is needed for a free service.]
- **What we promise.** We provide the app with reasonable care and skill, as it is described in the app and in these terms, and we try to fix problems you report. Your rights as a consumer to digital content and services that conform to the contract, and your remedies if they do not, apply and are not limited by these terms. [TO CONFIRM: lawyer to confirm that the Bulgarian act implementing Directive (EU) 2019/770 (ЗПЦСЦУПС) applies to a free service where personal data is used beyond what is needed to provide it, for example analytics.]
- **What we cannot promise.** We cannot promise that the app will always be available or error-free. Spoiler locking cannot be perfect (a reader may mark a chapter finished without reading it). Information from other readers or from Open Library (chapter counts, editions, and so on) may be wrong.
- **Other people's content and sites.** We are not responsible for what other readers write, or for external sites such as AO3, Open Library or the app stores. Once we know that content is illegal, we act on it (section 6). Reading recommendations and information are not professional advice.

## 12. Our liability

We are liable under the law. We do not limit or exclude liability for death or personal injury, intentional wrongdoing or gross negligence, fraud, or anything else that cannot be limited under mandatory law, including consumer protection law. For other breaches of these terms, we are liable for the loss that we could foresee when you accepted the terms. We are not liable for loss that could not be foreseen. There is no fixed monetary cap. [TO CONFIRM: lawyer to confirm this wording against ЗЗД чл. 82 and чл. 94 and ЗЗП чл. 143 (unfair terms). The earlier draft's cap and blanket "loss of data" exclusion were removed because they are likely void against consumers.]

## 13. Governing law and disputes

These terms are governed by the laws of **Bulgaria**. This does not take away the protection that mandatory consumer law of the country where you live gives you.

**Courts.** If you are a consumer, you may bring a claim against us either in the courts of Bulgaria or in the courts of the country where you live. We may bring a claim against you only in the courts of the country where you live. [TO CONFIRM: the competent Bulgarian court.]

Please write to us first at support@livami.app so we can try to settle a problem. As a consumer you can also turn to the Bulgarian Consumer Protection Commission (КЗП) and to its conciliation committees for consumer disputes (помирителни комисии) for out-of-court resolution. We are willing to take part in such a procedure. [TO CONFIRM: PO decides whether we agree to take part; if not, say "we are not willing" instead, because the law requires us to state our position (ЗЗП). The EU online dispute resolution (ODR) platform closed on 20 July 2025 (Regulation (EU) 2024/3228) and is no longer mentioned.]

## 14. App stores

Apple and Google are not party to these terms and are not responsible for the app or for support. If you use the iOS app, **Apple's standard Licensed Application End User Licence Agreement (EULA)** applies, and these terms supplement it. [TO CONFIRM: select Apple's standard EULA in App Store Connect. If the team prefers a custom EULA, it must contain Apple's minimum terms, including Apple as a third-party beneficiary.] If you use the Android app, Google Play's terms apply.

## 15. Changes

We may change these terms, for example when the app gets new features or the law changes. For material changes we will tell you in the app (or by e-mail) at least [TO CONFIRM: 30] days before they apply, and the notice will state the date from which the new version applies. The new version applies from that date, when you accept it in the app. Using the app after that date is not by itself acceptance. If you do not agree, you can delete your account.

If a change makes the service worse for you in more than a minor way, you may end the contract free of charge (by deleting your account) within [TO CONFIRM: 30] days of the notice or of the change, whichever is later. [TO CONFIRM: lawyer to confirm against Directive (EU) 2019/770 art. 19.]

[TO CONFIRM: ships with feat/terms-update: an effective date in `src/lib/legal.ts`; before it, a dismissible notice "Our terms change on {date}" with a link; from that date, acceptance is required. Today the app asks every reader to accept as soon as the terms version changes, with no effective date and no advance notice (`app/_layout.tsx:65`).]

## 16. General

- **Language.** These terms are written in Bulgarian and English. If they differ, the Bulgarian text prevails. [TO CONFIRM: lawyer; recommended Bulgarian.]
- **Parts that are invalid.** If a part of these terms is invalid, the rest stays valid. Not enforcing a term at once does not waive it.
- **Whole agreement.** These terms are the whole agreement between you and us about the app, together with, on iOS, Apple's standard EULA (section 14). You cannot transfer your account to someone else.
- **Transfer to a successor.** We may transfer this contract and the app to a successor, for example a company set up to run Livami, if it takes over our duties to you. We will tell you in the app or by e-mail [TO CONFIRM: 30] days before. If you do not agree, you can delete your account.
- **Events beyond our control.** We are not in breach if we cannot perform because of an event beyond our reasonable control (for example a power or network failure, an outage at our hosting provider, a strike or a government order), for as long as it lasts. This does not affect your mandatory rights.
- **How the contract is concluded and stored.** The contract is concluded in the app, in these steps: you sign up with e-mail and password; you create your profile; you tick the box to accept the Terms and the age box; you continue. Before that you can open the Terms from the link next to the box. We store the version you accepted and the time. The current text is at https://livami.app/terms and you can save or print it. Old versions are archived at a stable address. [TO CONFIRM: the pages at `TERMS_URL` and `PRIVACY_URL` are still placeholders (`site/terms`, `site/privacy`) and must be live before a build reaches readers who have to accept; the archive of old versions does not exist yet.]

## 17. Contact

Boryana Dimitrova, support@livami.app
[TO CONFIRM: address for service.]
