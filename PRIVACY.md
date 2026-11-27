# Privacy Policy

> This document is an English translation of the Korean original.
>
> **This policy has not been reviewed by a legal professional.** It was written from the examples in the Personal Information Protection Commission's "Guidelines for Preparing a Privacy Policy" (April 2026), to match the service's features as of November 4, 2026 (Google login (#2), location evidence (#7), room creation and invite links (#4), Firestore storage (#3)).
>
> Source: Personal Information Protection Commission, "Guidelines for Preparing a Privacy Policy", April 2026.

The team that operates the service “Bill:ION” (the "Team") establishes and publishes the following privacy policy under Article 30 of the Personal Information Protection Act (the "Act"), to protect the personal information of data subjects and to handle related grievances promptly and smoothly.

## At a glance

| | |
|---|---|
| Information collected | Google account information (at login), expense records, receipt photos, receiving account (bank, account number, account holder), dispute content, location summary (only times, and only when you upload a timeline while disputing and choose that expense and send it), agent memory sentences, agent rules and their change history, demo SEQ scores (anonymous), access logs (IP etc.) |
| Information not collected | Phone number, resident registration number, location coordinates, routes, place names. The timeline file is read only inside the user's browser |
| Where it is stored | Google Cloud database (Firestore) and file storage (Cloud Storage), Tokyo, Japan. It remains after a server restart, and the Team keeps no separate backup |
| Where information goes | Google (server, database, login, Gemini AI), GitHub (front end), Foundata GmbH (QR images) |
| Who may use it | Age 18 or older |

### Important for this demonstration version

- **Only people logged in with a Google account can enter rooms they belong to.** Even so, because this is a demonstration version, we recommend not entering real account numbers or real receipts.
- **Location is used only when disputing, and only for expenses the user chooses and sends.** If you upload a Google Maps Timeline file while writing a dispute, the service finds and preselects expenses paid after you had left. Anything you deselect is not sent, and what is sent is one line per expense with the time you left ([Article 2](#article-2-items-of-personal-information-processed)).
- **Google Gemini reads receipt photos.** Please cover parts not needed for settlement, such as card numbers and names, before uploading ([Article 8](#article-8-use-of-generative-ai-gemini)).
- **This service does not hold or move money.** Users make transfers themselves in their own Toss app.

## Article 1. Purposes of processing personal information

The Team processes personal information for the following purposes. Personal information being processed is not used for any other purpose, and if the purpose of use changes, the Team will take the necessary measures, such as obtaining separate consent under Article 18 of the Act.

1. **Settlement:** expense records, reading receipts, splitting by who had each menu item, sending invoices, handling invoices by user-set rules, mediating disputes
2. **Transfer guidance:** showing the receiving account to the parties to a transfer; creating Toss transfer links with the account and amount filled in, and QR codes that hand over from a computer to a phone
3. **Preventing misuse:** limiting the number of AI calls from the same IP or the same person
4. **Account management:** Google login, display name and profile color, my room list, account deletion
5. **Dispute evidence:** showing the location summary a user sent with a dispute to the other party to the dispute and to the mediation AI
6. **Improving the demo:** collecting scores for how easy each demo task was (SEQ), showing per-task and overall averages on the demo screens, and using them to improve the screens

## Article 2. Items of personal information processed

The Team processes the following items of personal information.

<!-- Needs review: legal basis for processing. Following the guideline example, it is stated as Article 15(1)(4) (entering into and performing a contract), but there are currently no terms of use and no consent screen -->
<!-- Needs review: the separate consent switch for the location summary was removed. Uploading a timeline for a dispute, seeing the notice right above the send button (what goes to whom), and then sending is treated as consent. Is this sufficient as consent "obtained after informing in a clearly recognizable way" under Article 22? -->
- Legal basis: Article 15(1)(4) of the Act (entering into and performing a contract). The location summary relies on consent obtained when disputing (Article 15(1)(1)): uploading a timeline for a dispute, checking right above the send button what goes to whom, and then choosing that expense and sending it is treated as consent

<!-- Needs review: whether the location summary (time of leaving) is personal location information under the Act on the Protection and Use of Location Information, and if so, the required filing and consent procedures -->

**Information users enter directly**

| Item | Content | When | Who can see it |
|---|---|---|---|
| Expense records | Title, amount, date and time, payer, payment method, people present, menu lines | When recording an expense | People in the same room |
| Receipt photo | One photo. It may show the store name, payment time, part of a card number and so on | When recording an expense from a receipt | People in the same room |
| Receiving account | Bank, account number, account holder | When registering an account | Only people who have a transfer to send to me |
| Google account | Account ID, display name. Email and profile photo are kept by Firebase Authentication, which handles login, and are not stored on the service server | At login | The user |
| Profile | Display name shown in rooms (up to 40 characters), profile color | When changed on the account screen. Creating a room or joining by invite link also enters the room with this profile | People in the same room |
| Invite link | One unguessable token per room, expiry time (7 days later), the person who created the link | When a room member creates an invite link. Creating a new one immediately stops the previous link from opening | Anyone with the link can see, without logging in, the room name, dates, exchange rate policy and members' display names. Expenses, agent memories and accounts are not shown |
| Dispute content | Sentences written when raising a dispute | When raising a dispute | People in the same room |
| Location summary | Within the time window of the disputed expense (first order to payment): "the time you left the place you were at for the first order" and the time of arrival at the next place (including whether it is home). The timeline file, coordinates and place names are not received | When, while disputing, the user uploads a timeline file and sends without deselecting an expense that was found to be paid after they left and was preselected | The other party to the dispute (the person who paid the expense) and the person who raised it. Other participants see only that a summary is attached |
| Agent memory sentences | Up to 5 per person, 60 characters or fewer | When adding a memory in "My agent" | The user. Only sentences shared with the room (by default shared with all rooms; can be turned off per room) are used in AI requests for that room's menu split and dispute mediation. Split reasons do not include the sentence; only when mediating a dispute may it be quoted as evidence in a mediation proposal |
| Values entered in the demo | Expenses, agent settings and memories left in the demo | When using the demo without logging in | Not sent to the server. Kept only in this browser tab and gone when the tab is closed. The SEQ score below is the only exception |
| Demo SEQ score | The ease score chosen for each task (1 very hard to 7 very easy), a random demo id the browser creates for each demo, the time received. No name, account or IP is stored with it | When pressing a score after finishing a demo task. It can be skipped | Anyone sees only per-task and overall averages and response counts. Only the Team sees individual scores |
| Agent rules | Auto-accept limit, send timing, dispute handling, notification level, rule change history (last 50) | When setting rules in "My agent" | The user. The fact that a rule was applied (for example, accepted because within the limit) stays in the agent log and is visible to people in the same room, but the limit amount is not included |

**Information generated automatically while using the service**

| Item | Content | Use |
|---|---|---|
| Access logs | IP address, request time, request address, browser information | Rate limiting, server and front-end operation records |
| Login verification information | Google login token (verified on every request and not stored) | Checking who made the request and whether they are a member of the room |

## Article 3. Children under 14 and age of use

The Team does not process the personal information of children under 14. This service is intended for people aged 18 or older, because the terms of the Google Gemini API used by the service do not allow the Gemini API to be used in services that people under 18 use or are likely to use. However, the service does not currently verify users' ages.

## Article 4. Processing and retention periods

The Team processes and retains personal information only for as long as needed for the processing purposes. There is no information that laws require to be preserved separately.

<!-- Needs review: the retention limit for room and expense records (for example, bulk deletion after the demonstration ends) has not been decided yet -->
<!-- Needs review: the retention limit for demo SEQ scores (for example, deletion after the demonstration results are compiled) has not been decided yet -->

| Information | Where stored | Period |
|---|---|---|
| Expenses, receipt photos, receiving accounts, agent memories, agent rules and change history, disputes, invoices, transfer records | Google Cloud Firestore (Tokyo, Japan). Receipt photos in Google Cloud Storage (Tokyo, Japan) | Until deleted or the account is deleted. Remains after a server restart or redeploy. Deleting an expense also deletes its receipt photo, and on account deletion the data is deleted or anonymized under [Article 5](#article-5-procedure-and-method-of-destruction) ③ |
| AI split results | Service server memory | Up to 24 hours |
| Token of the QR code handing over to a phone | Service server memory | 15 minutes |
| Account ID, display name, profile color | Google Cloud Firestore | Until account deletion |
| Invite link | Google Cloud Firestore | Does not open after expiry (7 days); overwritten when recreated. If the creator deletes their account, the link to the account is cut and the link is kept for the remaining members |
| Google login account (email, name, photo) | Google (Firebase Authentication) | Deleted on account deletion |
| Demo SEQ scores | Google Cloud Firestore (Tokyo, Japan) | Until the Team deletes them. Choosing again in the same demo overwrites the earlier score |
| Location summary | Google Cloud Firestore (encrypted) | 7 days after it is attached. Deleted immediately if you delete it on the dispute screen or delete your account |
| Deletion marker (account ID) | Google Cloud Firestore | Used only to block re-entry after account deletion and to retry deletion |
| IP and call times for rate limiting | Service server memory | Only the last 10 minutes are used for decisions; records are erased when the server shuts down |
| Copies of information the server reads often | Service server memory | Up to 60 seconds. Accounts and location summaries stay encrypted |
| Server request logs (IP, request address, time) | Google Cloud Logging | 30 days |
| Content sent to Gemini and its responses | Google | See [Article 8](#article-8-use-of-generative-ai-gemini) |
| Front-end access logs (IP) | GitHub | According to GitHub's policy. GitHub does not state a period |
| Browser storage | User's browser | Until the user deletes it ([Article 10](#article-10-installation-operation-and-refusal-of-automatic-collection-devices)) |

## Article 5. Procedure and method of destruction

① When personal information becomes unnecessary, for example because the retention period has passed or the processing purpose has been achieved, the Team destroys it without delay.

② Information in Firestore and Cloud Storage is erased on the spot when deleted, and the Team keeps no separate copy (backup) from which it could be restored. However, complete erasure from Google's internal systems may take time under Google Cloud's data deletion process. Information in service server memory (AI split results, QR tokens, rate-limit records, read copies) disappears after the periods in [Article 4](#article-4-processing-and-retention-periods) or when the server shuts down. Expenses a user deletes, and their receipt photos, are erased on the spot.

③ While logged in, you can delete your account via My account → Profile → Delete account. It cannot be undone, so you are asked to confirm once more. Account deletion erases your profile, agent settings, location summaries and the receipt photos you uploaded; amounts settled together are kept under a different anonymous ID in each room. No information linking the original account to the anonymous IDs is kept. QR codes and account copies already created are also erased.

④ The Team does not process personal information on paper.

## Article 6. Provision of personal information to third parties

<!-- Needs review: whether what is visible to people in the same room and to transfer counterparts, and the link passed to Toss, count as provision to a third party -->
The Team does not provide personal information to third parties. However, because of the nature of the service, the following information is visible to other users within the service or passes from the user's phone to another app.

- Expense records, receipt photos and dispute content are visible to people in the same room.
- A person who receives an invite link sees the room name, dates and members' display names (and, for a foreign-currency room, the currency and exchange rate policy) even before joining. So please send the link only to people you will settle with.
- Even after you leave or are removed from a room, the expenses, transfer records and display name you left there remain visible to those who stay. The person who left can no longer see the room. To erase the name from these records too, delete your account ([Article 5](#article-5-procedure-and-method-of-destruction) ③; records in rooms you left are also anonymized).
- A receiving account is visible only to people who have a transfer to send to that person.
- Only the user sees their agent memory sentences and auto-accept limit amount. People in the same room see only who each share was assigned to and the fact that a rule was applied. However, when a dispute is mediated, memories shared with that room may be quoted as evidence in the mediation proposal.
- The location summary is visible only to the other party to the dispute (the person who paid the expense) and the person who raised it, and is sent to the mediation AI as evidence. Other participants in the same room see only that a summary is attached.
- Dispute content is visible to all participants in the same room. So when "what doesn't match" is prefilled from a timeline, it lists only the names of menu items ordered after you left, not the time you left or where you arrived. Anything you edit and write yourself is shown as is.
- When a sender opens Toss from the transfer screen, a link containing the recipient's bank, account number and the amount passes from the sender's phone to the Toss app. The Team does not exchange information with Toss directly.

## Article 7. Outsourcing of processing and overseas transfer

① To process personal information smoothly, the Team outsources processing tasks as follows.

| Processor | Outsourced task |
|---|---|
| Google LLC | Running the service server (Cloud Run), data storage (Firestore, Cloud Storage), storing server request logs (Cloud Logging), storing encryption keys and API keys (Secret Manager) |
| Google LLC | Reading receipts, splitting menu items, creating dispute mediation proposals (Gemini API) |
| Google LLC | Google login and storing login accounts (Firebase Authentication) |
| GitHub, Inc. | Serving front-end files (GitHub Pages) |
| Foundata GmbH | Creating the QR images shown on computer screens (api.qrserver.com) |

② If the outsourced tasks or processors change, we will disclose this through this privacy policy without delay.

③ All of the above processors are located outside Korea, so using the service transfers personal information overseas. Under Article 28-8(1)(3) of the Act ("overseas outsourcing of processing and storage for performance of a contract"), the Team discloses the matters in paragraph 2 of that article as follows.

<!-- Needs review: whether Article 28-8(1)(3) can be the basis for the overseas transfer -->

| Recipient (contact) | Country | Items transferred | When and how | Purpose of use | Retention and use period |
|---|---|---|---|---|---|
| Google LLC (Cloud Run, Firestore, Cloud Storage, Cloud Logging, Secret Manager) · [Google Cloud Data Protection Team](https://support.google.com/cloud/contact/dpo) | Japan (Tokyo) | All items in Article 2 | Sent over the internet (HTTPS) each time the service is used | Running the service server, data storage, request logs | Same as Article 4 |
| Google LLC (Gemini API) · [Google Cloud Data Protection Team](https://support.google.com/cloud/contact/dpo) | Countries where Google or its agents operate facilities | Receipt photos, menu lines, display names of people in the room, agent memory sentences, dispute content and evidence summaries | Sent from the server over HTTPS when receipt reading, splitting or mediation is requested | Receiving AI processing results | See [Article 8](#article-8-use-of-generative-ai-gemini) |
| Google LLC (Firebase Authentication) · [Google Cloud Data Protection Team](https://support.google.com/cloud/contact/dpo) | The United States and other countries where Google operates facilities | Email, name, profile photo, account ID, login records | Sent over HTTPS at login | Login and account verification | Until account deletion |
| GitHub, Inc. · 88 Colin P. Kelly Jr. St., San Francisco, CA 94107, USA · dpo[at]github[dot]com | The United States and elsewhere | Access logs such as the IP address of the device that opened the page | Sent over HTTPS when a page is opened | Serving front-end files, security | According to GitHub's policy |
| Foundata GmbH (goQR.me) · Steinhäuserstraße 20, 76135 Karlsruhe, Deutschland · info@goqr.me | Germany | The computer's IP address, browser information, referring page, time. It states that it does not store or log the QR content (a token address usable for only 15 minutes) | Sent over HTTPS when the transfer screen is opened on a computer | Creating QR images | Images are cached for about 30 seconds. It does not state a period for access logs |

④ If you do not want overseas transfer, you may choose not to use the service. Both the server and the front end of the service are outside Korea, so if you refuse the transfer you cannot use the service. However, the QR image is not created when the transfer screen is opened on a phone.

## Article 8. Use of generative AI (Gemini)

The Team uses the Gemini API, Google's generative AI, to read receipts, split menu items and mediate disputes.

① **What is sent**

| Function | Sent to Gemini |
|---|---|
| Reading receipts | Receipt photo, the currency used in the room |
| Splitting menu items | Menu lines, display names of the people present, agent memory sentences shared with the room |
| Dispute mediation | Menu lines, display names, dispute content, evidence summary (including the location summary times if sent), agent memory sentences shared with the room |

② **How results are handled.**
- Sentences written by users are sent marked so that they are not followed as instructions to the AI.
- Only AI answers that pass the required format and code checks are applied; if the AI fails, the result is computed by rules.
- Splits and mediation proposals from the AI are suggestions. They are confirmed by a person, or according to rules in the agent settings (for example, auto-accepting invoices up to a set amount).
- The Team does not train AI models on user information.

<!-- Needs review: whether AI splitting and rule-based auto-acceptance are "automated decisions" under Article 37-2 of the Act -->

③ **How Google handles this content.** The Team uses the Gemini API on the paid tier with billing enabled (Paid Services). Under the paid services terms in the Google Gemini API Additional Terms, it is handled as follows.
- Google does not use the content sent or the responses to improve its products. Processing follows Google's Data Processing Addendum.
- Google logs the content sent and the responses for a limited period. These logs are used only to detect prohibited use and to make disclosures required by law.

④ Users must take particular care not to include sensitive information about themselves or others (resident registration numbers, passport numbers, medical information, credit card numbers and so on) in receipt photos or dispute content.

## Article 9. Measures to secure personal information

The Team takes the following measures to keep personal information secure.

1. **Encryption of accounts and location summaries:** receiving accounts and transfer links, and location summaries attached to disputes (including dispute evidence and mediation proposals that copy the summary), are encrypted with AES-256-GCM when stored. The key is kept only in Google Secret Manager and not in the repository (GitHub).
2. **Limited visibility:** receiving accounts and transfer links are sent only to the sender and recipient of that transfer.
3. **Encryption in transit:** all traffic between the front end and the server, and between the server and Gemini, uses HTTPS.
4. **Rate limits:** the server allows browser requests only from the Team's front-end address. AI calls are limited to 30 per 10 minutes per IP or user.
5. **QR tokens:** the QR code that hands over from a computer to a phone contains not the account but a token that expires after 15 minutes.
6. **Protection against AI prompt injection:** as in [Article 8](#article-8-use-of-generative-ai-gemini) ②.

7. **Login verification:** every request's Google login token is checked, and whether the token has been revoked is checked with Google once every 5 minutes per person (deleting your account in this service blocks it immediately). Room information is sent only to members of that room.
8. **Location files never leave the browser:** the timeline file is read only inside the user's browser, and the server checks again that the times received fall within the expense's time window.
9. **Database access limits:** only the server can write to the database and file storage. Security rules allow the front end to read the database directly only for members of that room (transfers only for the sender and recipient, profiles only for the user); receipt photos, disputes and agent settings can be seen only through the server.

## Article 10. Installation, operation and refusal of automatic collection devices

① The Team does not use cookies. Instead, it stores the following in browser storage (localStorage).

| Name | Content | Use |
|---|---|---|
| Firebase login state | Information that keeps the Google login (Firebase stores it in IndexedDB) | Keeps you logged in when you reopen |
| `agent-settlement.uid` | ID of the person chosen in a development room | Used only on development screens |
| `agent-settlement.last-expense.<room ID>` | Currency, payer, payment method and people present of the last expense recorded | Prefills the next expense entry. Not sent to the server |
| `agent-settlement.seen.<room ID>.<person ID>` | How far you have read the agent log | Marks new entries. Not sent to the server |
| `agent-settlement.timeline.<room ID>.<person ID>` | From the Google Maps Timeline the user uploaded: start and end times, confidence and whether it is home, for visits overlapping the settlement's expense time windows (no coordinates or place names) | Finds mismatched expenses when disputing without choosing the file again. Not sent to the server. Deleted after 7 days, when you press delete, or when you log out |
| `agent-settlement.demo.seq` | The demo's random demo id, the SEQ scores I chose and the tasks I skipped. Created on the first answer | Shows my scores on the home screen, does not ask answered tasks again and does not count the same person twice. Only scores and the demo id are sent to the server. Remains until the user clears browser data |

② Data subjects can delete this site's data or block storage in browser settings. If blocked, the person chosen in a room is not remembered, so you must choose again each time you enter.

③ The Team uses no advertising or usage analytics tools and does not allow third parties to collect behavioral information.

## Article 11. Rights and duties of data subjects and legal representatives, and how to exercise them

① A data subject may at any time ask the Team for access, transmission, correction, deletion or suspension of processing of personal information, or withdraw consent ("exercise of rights").

② Rights may be exercised toward the Team by email or similar means under Article 41(1) of the Enforcement Decree of the Act, and the Team will act without delay.

③ Rights may also be exercised through an agent, such as the data subject's legal representative or an authorized person.

④ What can be done directly on screen now, and what requires contacting us, is as follows.
- **Access:** you can see the information you left on the room screen.
- **Deletion:** deleting an expense also deletes its receipt photo. Delete a location summary with the "delete my location summary" control on the dispute screen, and your account with "Delete account" on the account screen.
- **Correction:** change your display name and profile color on the account screen; change agent memories and rules and the receiving account in "My agent" (your chip at the top of the room screen, or your profile menu at the top right). Agent memories can also be deleted there.
- **Deleting a receiving account and other requests:** there is no screen for these yet, so please make the request using the contact in [Article 12](#article-12-chief-privacy-officer).

⑤ The Team will respond within 10 days of receiving a request to exercise rights.

## Article 12. Chief privacy officer

① The Team has overall responsibility for personal information processing, and designates a chief privacy officer as below to handle data subjects' complaints and remedies related to processing.

<!-- Fill in on the demo day. The repository is public, so anyone can see the contact written here; a shared team email is recommended -->
▶ Chief privacy officer
- Name: [to be decided by the Team]
- Position: [to be decided by the Team]
- Contact: [email]

② Data subjects may direct any privacy inquiries, complaints, remedy requests and so on arising from use of the service to the chief privacy officer.

## Article 13. Remedies for infringement of rights

Data subjects who want dispute resolution, counseling or other remedies for a privacy infringement may file a report or ask for counseling with the following bodies.

1. Personal Information Dispute Mediation Committee: 1833-6972 (no area code) (www.kopico.go.kr)
2. Personal Information Infringement Report Center: 118 (no area code) (privacy.kisa.or.kr)
3. Korean National Police Agency: 182 (no area code) (ecrm.police.go.kr)

## Article 14. Matters that do not apply

The Team does not process the following personal information, or the following do not apply.

- Sensitive information, pseudonymized information
- Additional use or provision
- Fixed or mobile video information processing devices
- Designation of a domestic agent

## Article 15. Changes to this privacy policy

① This privacy policy applies from November 6, 2026.

② Previous privacy policies can be found in this repository's change history.

③ When a feature that newly processes personal information, such as login or location records, is added, this policy will be updated before the feature is released.

## References

This document cites or follows the materials below (checked November 2–3, 2026).

- Personal Information Protection Commission, ["Guidelines for Preparing a Privacy Policy" (revised April 2026)](https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=D010030000&nttId=12018)
- Personal Information Protection Act [Article 30](https://www.law.go.kr/법령/개인정보보호법/제30조) (privacy policy), [Article 26](https://www.law.go.kr/법령/개인정보보호법/제26조) (outsourcing), [Article 28-8](https://www.law.go.kr/법령/개인정보보호법/제28조의8) (overseas transfer), [Enforcement Decree Article 31](https://www.law.go.kr/법령/개인정보보호법시행령/제31조)
- Google, [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) (data use in paid services, age of use), [Gemini API Usage Policies](https://ai.google.dev/gemini-api/docs/usage-policies)
- Google Cloud, [Cloud Data Processing Addendum](https://cloud.google.com/terms/data-processing-addendum), [Cloud Run logging](https://cloud.google.com/run/docs/logging), [Cloud Logging retention](https://cloud.google.com/logging/quotas), [Data deletion on Google Cloud](https://cloud.google.com/docs/security/deletion)
- GitHub, [Data collection by GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
- goQR.me, [Privacy and security](https://goqr.me/privacy-safety-security/), [Company information](https://goqr.me/de/rechtliches/impressum.html)
