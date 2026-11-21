# Wren Privacy Policy

**Last revised:** November 20, 2026

**Operator:** Wren's Independent Developer, United States

**Privacy and support contact:** [contact.wrenbot@gmail.com](mailto:contact.wrenbot@gmail.com)

Wren is a standalone Discord bot for writing communities. This policy explains how Wren's Independent Developer (the **Operator**, **we**, **us**, or **our**) handles information to operate its quotes, editorial tracking, announcements, and Contributor role features.

Discord separately processes information under its [Privacy Policy](https://discord.com/privacy). Server administrators also make their own decisions about community records, permissions, and posted content. This policy covers the Discord bot and the Operator's support contact; it does not govern Discord, a server administrator's independent records, or separate data collection by the website hosting this notice.

## 1. Information Wren processes and why

### Quotes

Wren receives quote text and a selected Discord user for attribution. It may fetch that person's server membership to choose a display name, falling back to an available Discord account name. It sends the formatted quote and attribution to the configured quotes channel. Wren does not create a separate local quote database.

### Editorial tracking

Authorized staff can create and update records containing a piece's title, author Discord ID, optional Discord post link, editorial status, assigned editor Discord ID, submitting staff member's Discord ID, creation and update times, and a record identifier allocated by Wren. These records persist locally so the tracker works across restarts. The tracker does not download linked manuscripts or attachments.

Staff may enter information about an author or editor who has not personally invoked Wren. That person can still contact the Operator about their information.

### Announcements and participation

Wren processes staff-provided issue names, announcement titles, descriptions, main message text, and the selected destination channel. It posts the announcement to Discord. Locally, it saves the current issue name, announcement channel and message IDs, whether participation is enabled, and a control version used to reject old buttons or menus. It does not save a separate local copy of the announcement body as an issue record.

Participation controls process the responding member's Discord ID, current roles, and selection to add or remove the Contributor role. A staff reset fetches the server's current members and role information to find and remove that role from its holders. Wren does not maintain a separate persistent local participant roster; role membership is held by Discord. Wren may fetch its own announcement message to disable its controls when participation closes or resets.

### Discord and interaction context

Wren also processes server, channel, role, and message identifiers; account and server display names; membership and permission information; command inputs; button or menu identifiers; and interaction IDs and response tokens needed to answer requests. Its installed configuration includes server and channel identifiers. Response tokens are used for Discord replies and are not fields in the editorial database or current managed operational logs.

Wren uses Discord's server and member APIs. It is not configured to monitor ordinary channel conversations or direct messages, and it does not request Message Content or Presence gateway access. It does receive the content submitted through its commands and can retrieve its own announcement messages as described above.

### Support and privacy correspondence

If you email the contact address, we receive the information you send, such as your email address, message, relevant Discord identifiers, and request details. We use it to respond, verify authority where needed, and handle the request. Do not send passwords, access tokens, identity documents, or unrelated sensitive information.

## 2. Purposes and limits on use

We use information to provide requested features, maintain editorial and issue state, enforce permissions, respond through Discord, protect the Service, troubleshoot operational failures, make recovery backups, and handle support and privacy requests.

We do not use Wren's Discord data for advertising profiles, sale or licensing to data brokers, or AI-model training. The deployed bot has no separate advertising or analytics integration. Wren does not ask for payment information, government identification, health information, or file uploads.

## 3. Who can see information

Quotes and announcements are visible to people with access to their destination channels. Successful editorial replies are posted in the configured staff channel and are visible to people with access there; they are not private to the staff member who ran the command. Editorial and Contributor administrative commands require Manage Roles in the configured staff context, but channel viewers may still see an existing reply without that permission.

Quote confirmations, participation replies, and administrative confirmations are generally private Discord interaction responses. A private response still passes through Discord. Role membership may be visible to other server members under Discord's interface and server settings.

The Operator can access locally stored information and recover authorized backups. Encryption does not prevent the Operator from reading data needed to operate the Service. Server administrators control channel access and moderation; Wren has no separate per-record audience controls within a channel.

## 4. Storage and security

Current active editorial records, issue state, privacy-maintenance metadata, and managed local recovery snapshots use Windows-account-based encryption and restricted file access. The bot token is protected separately from editorial records. Information is decrypted in memory when needed to provide features or perform authorized maintenance and recovery.

Wren limits message and member-profile caching. It still keeps essential server, channel, role, and bot-account state in memory and temporarily handles data needed for a request, including a full member collection during a role reset. Limited caching is not a promise that all data disappears from memory immediately after an interaction.

Current managed operational logs contain timestamps, fixed event names, and bounded numeric error or status codes. They exclude command content, user IDs, account names, request bodies, URLs, interaction tokens, and credentials. Earlier logs preserved in encrypted recovery material may contain more detailed information.

Recovery backups are encrypted locally with Restic before upload to a private Backblaze B2 bucket. Application data and sensitive credential/legacy-log recovery material use separate repository passwords. Retained historical records and logs can be included in those encrypted backups. Connections to Discord and Backblaze use encrypted transport. Restic runs locally; it is not a separate hosted recipient of the backup contents.

A November 20, 2026 cleanup removed 10 identified redundant plaintext record files and 14 identified historical plaintext log files from the Operator's local installations and archives. Equivalent encrypted recovery copies were preserved. This cleanup did not erase their contents from retained encrypted backups or other recovery material.

The host does not currently use full-disk encryption. Removing a file is not a guarantee of forensic erasure from storage, earlier system snapshots, or other copies. Encryption and local cleanup also do not remove information already posted to Discord.

Local Windows-account-based encryption depends on the account and profile. Recovery has been tested under the existing Windows account; recovery after loss of the original profile or the entire PC has not been independently verified. No storage, transmission, backup, or recovery method can be guaranteed completely secure or reliable.

If we learn of unauthorized access to personal information, we will address the incident and provide notifications required by applicable law and our Discord developer obligations.

## 5. Service providers and processing locations

- **Discord:** receives requests, replies, quotes, announcements, and role changes through its API and stores information under its own policies. See [Discord's Privacy Policy](https://discord.com/privacy).
- **Backblaze B2:** stores encrypted recovery backups in the configured United States West region. Backblaze also handles the account and technical metadata necessary to provide storage. See [Backblaze's Privacy Policy](https://www.backblaze.com/company/policy/privacy).
- **Google/Gmail:** provides the contact mailbox and processes email communications under [Google's Privacy Policy](https://policies.google.com/privacy).

The Operator operates from the United States. Discord, Google, and their providers may process information in other countries under their own policies. We do not send Discord records to an unrelated advertising, data-broker, or AI service. We may disclose information where required by law, subject to applicable protections, or when you direct a feature to share it as described in this policy.

## 6. Retention

Retention differs by type of information:

- **Active editorial and issue data:** kept while needed for the configured community tools. There is no automatic inactivity purge. We review and remove information when it is no longer needed or a valid deletion obligation applies. Closing participation or removing a role does not itself erase editorial records.
- **Current managed operational logs:** configured for cleanup after 30 days, with additional file-count and size limits. Cleanup runs while the bot or relevant maintenance process operates; shutdown can delay it. Copies captured in backups can remain longer.
- **Managed local recovery snapshots, encrypted rollback archives, and protected recovery spools and test restores:** do not have a universal automatic expiry. They require Operator review and are part of the scope to consider for deletion requests. Temporary recovery material is not automatically removed by routine cloud-backup cleanup.
- **Routine cloud recovery sets:** scheduled cleanup selects eligible complete sets older than 30 days. The pinned initial baseline, preexisting material, and latest successful set are excluded. Hidden cloud-object versions can remain after routine cleanup. These exceptions mean that 30 days is not a maximum for every copy, and manual action can be required.
- **Historical record and log contents:** can remain in encrypted recovery material after the identified plaintext files have been removed. Local cleanup does not automatically rewrite or remove those retained copies.
- **Deletion-protection metadata:** an encrypted fingerprint derived from a Discord user ID, deletion generations, and identifier-allocation metadata may be retained to prevent old backups from reversing a deletion or reusing record identifiers. A fingerprint is not a guarantee of anonymization. The implementation has no automatic expiry for this metadata.
- **Support and privacy correspondence:** kept as needed to handle the request, document its resolution, and meet applicable legal obligations; the bot does not automatically purge the contact mailbox.

Backups or historical status are not a blanket exception to deletion obligations. We will delete Discord API data when it is no longer needed, when a valid user or Discord deletion request applies, when required by law, or when the Operator stops operating Wren, except where applicable law requires retention. Handling retained copies can require separate manual work. This policy does not promise that those copies are erased automatically or instantly.

Messages and role information held by Discord remain subject to Discord's and the server's practices. Deleting a local record does not automatically delete a Discord message, and deleting a Discord message does not automatically delete a local record.

## 7. Access, correction, and deletion requests

Email **[contact.wrenbot@gmail.com](mailto:contact.wrenbot@gmail.com)** to request access to information about you, correction, or deletion. Include your Discord user ID, a relevant record identifier, or a message link if available. Avoid unnecessary personal information. We may ask for proportionate confirmation that you are the affected person or authorized to act for them.

Requests are handled by the Operator; there is no self-service deletion slash command. We will review requests without unnecessary delay, comply with applicable response deadlines, and explain any lawful limitation or additional information needed.

For a verified deletion request, the maintenance tools can remove editorial records authored by the person and clear that person's editor or submitting-staff references from other authors' records. They also apply the change to recognized managed local backups, including original-byte recovery payloads. Applying those tools requires verified scope and a maintenance window; they do not establish that all copies everywhere are gone.

Retained historical record and log contents, free-text references, rollback archives, cloud snapshots and versions, protected spools and test restores, and other unregistered copies require separate review. The local deletion tool does not automatically erase them. A fresh recovery checkpoint and the current deletion record are needed so an older backup is not accepted as authority to restore erased information. Later legitimate use can create new records; an earlier request does not create a permanent account ban or prevent a later request.

Quotes, announcements, channel replies, and roles on Discord may need separate action by the Operator or server moderators. Wren's maintenance tools cannot erase Discord's independent records or override server permissions. If a request concerns Discord's own processing, contact Discord as well.

## 8. Age requirements and sensitive information

Wren is intended for people permitted to use Discord under its applicable minimum-age rules. It is not designed to knowingly collect information from children prohibited from using Discord. Contact the Operator if you believe such information has been processed so it can be reviewed and removed where appropriate. Server administrators may impose additional age rules.

Do not submit confidential manuscripts, financial or health information, passwords, or other sensitive personal information through bot commands. Use only the information appropriate for the requested community feature and its audience.

## 9. Your legal rights

Depending on your location and applicable law, you may have rights to access, correct, delete, restrict, or object to processing, obtain a portable copy, or complain to a relevant data-protection authority. Contact the privacy address to exercise applicable rights. This policy does not waive legal rights or make every listed right applicable in every jurisdiction.

## 10. Changes and contact

We will revise this policy when Wren's information practices materially change and update the date above. Where practicable, we will provide notice of material changes through an appropriate Discord channel or another reasonable means. A new function does not necessarily require a change unless it changes the practices described here.

For privacy inquiries, support, or data-deletion requests, contact **[contact.wrenbot@gmail.com](mailto:contact.wrenbot@gmail.com)**. See also the [Wren Terms of Service](https://vtmnarchive.com/wren/terms).
