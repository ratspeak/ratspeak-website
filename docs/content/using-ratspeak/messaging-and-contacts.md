# Messaging & Contacts

Ratspeak's Messages tab is a full conversation view: threaded chats, search, attachments, and per-message delivery state. This page walks through day-to-day messaging, how to manage your address book, and what the small details on each message mean.

## Sending a message

Open the Messages tab. If you have an existing conversation, tap the thread to open it and start typing in the composer at the bottom. To start a new conversation, tap the new-message button and either pick a saved contact or paste an LXMF address (the long hex hash that uniquely identifies a destination on the network).

A faster path: open the Peers tab. Anyone the network has heard about shows up there. Tap a peer to open their detail panel — from there you can start a conversation immediately, or save them as a contact for later.

Press send and the message hands off to Ratspeak's transport layer. From your side, that's it — the rest is automatic.

## Conversations

The thread list shows every conversation you've had, most-recent first. Each row shows the contact name (or address, if they're not saved), a one-line preview of the last message, the time, and any unread count.

Inside a thread, your messages appear on the right and theirs on the left, in classic chat layout. Long messages wrap; short ones stay short. Scroll up to read older messages. Tap and hold (or right-click on desktop) any message to copy, reply to it, or delete it from your local view.

You can hide a thread you're done with — it disappears from the list but the messages aren't deleted. If you want it back, sending or receiving a message in that conversation brings it back to the top of the list.

## Attachments

Use the paperclip icon in the composer to attach a file. Ratspeak supports any file type and asks the backend for the current protocol limit before sending. If a file is too large, the app shows the file size and asks you to pick something smaller. Large attachments may take a long time, and Offline Inbox delivery can be limited by the propagation node you use, so keep files small when the path might include LoRa or another slow link.

For images specifically, Ratspeak shows an inline preview in the message bubble. Other attachments appear as a download chip with the filename and size.

## Delivery states

Every outgoing message gets a small status indicator that tells you what happened to it.

- **Sending** — the message is in flight. Ratspeak is actively trying to reach the recipient.
- **Delivered** — Ratspeak has positive proof the recipient received it. This is the strongest state.
- **Sent** — the message left your node, but no delivery confirmation has come back yet. This is normal for some delivery modes (see below).
- **Stored in Offline Inbox** — the message was accepted by an LXMF propagation node for later pickup. This proves the inbox node received the encrypted message; it is not the same as end-to-end recipient delivery.
- **Failed** — delivery did not succeed. The most common cause is that the destination is currently unreachable. You can resend.

Ratspeak sends in Auto mode by default. Auto prefers Direct for normal messages because it gives delivery proof. If Offline Inbox is enabled and the recipient has not been seen recently, Auto can store the message on a reachable inbox node instead. If no inbox node is reachable yet, Ratspeak asks the mesh for a path and tells you it is still looking instead of silently sending into a dead store.

The underlying LXMF delivery modes are:

- **Direct** uses an encrypted live link to the recipient — fastest, with end-to-end delivery confirmation. Best when both sides are online.
- **Opportunistic** sends the message as a single packet without setting up a link. It's lightweight and works well over slow radios, but only fits messages up to **295 bytes** of content, and there's no delivery proof — just confirmation that the packet was transmitted.
- **Offline Inbox** is Ratspeak's name for LXMF propagated delivery. It hands the encrypted message to a propagation node, which holds it until the recipient asks for waiting mail.

Most users do not have to choose a mode by hand. The state icon on each message reflects which path was used.

## Searching your messages

The search box at the top of the Messages tab does a full-text search across every message you've ever sent or received, in every conversation. Type a word or phrase and matching messages surface immediately, grouped by conversation. Tap a result to jump straight to that message in its thread, with the matched text briefly highlighted.

Search is local — it runs against the database on your own device. Nothing is sent to a server, and there's no network round-trip.

## Contacts

The Contacts tab is your address book. Each contact has a name (or nickname) you choose, the LXMF address itself, and an avatar. Tap a contact to open their detail panel, where you can start a conversation, edit their name, or remove them.

There are three ways to add a contact:

- **From the Peers tab** — open any peer's detail panel and tap "Save as contact." Their address fills in automatically; just give them a name.
- **From a conversation** — open a thread with someone unsaved and use the "Save to contacts" action.
- **Manually** — tap the add button in the Contacts tab and paste an address.

Names are local to your device. The other side has no idea what you've named them, and they can name you whatever they like on their end.

## Avatars

Every Ratspeak identity has an automatic, deterministic avatar called an identicon, derived from the cryptographic hash of the identity itself. The same identity always produces the same avatar — on every device, for every observer — so you can recognize a contact at a glance even before you've named them.

The pattern is generated by an algorithm called LXMFace. Two different identities will essentially never produce the same identicon, which makes them a useful sanity check: if a contact's avatar suddenly changes, the address you're talking to has changed too. That's worth noticing.

You can't upload a custom avatar, and that's by design. Identicons can't be spoofed and don't require any trust in a profile-picture server. Your visual identity is your cryptographic identity.

## Voice calls (experimental)

Ratspeak ships an experimental voice surface built on [rsLXST](../products/rslxst), the Rust LXST telephony stack. Calls run as a peer-to-peer Reticulum link directly between the two devices — no relay servers, no media gateway, no fallback through propagation nodes. Treat the feature as a beta while the rsLXST stack stabilizes.

### Placing a call

Open the conversation with the contact you want to call. The call button sits in the conversation header on Messages and only appears when:

- the binary you are running was built with the `lxst-voice` Cargo feature (the default for public builds);
- the other side is a saved contact;
- no other call is currently in progress.

Tap the call button to dial. The first time, your OS will prompt for microphone access — grant it. While the call is ringing, an outgoing call strip appears at the top of the app with the contact's name and status. If the other side does not pick up within roughly 25 seconds, the ring gives up automatically and a short timeout cue plays.

Tap the same button (now styled as a hang-up button) at any time to end the call.

### Receiving a call

Incoming calls open a global call strip across the top of every view, plus a dedicated incoming-call sheet on mobile, with the caller's contact name (or LXMF address if they are not saved) and Answer / Reject buttons. Both surfaces are tappable — tapping the strip navigates you straight to that conversation.

Tap **Answer** to pick up. The OS prompts for microphone access on first use, then audio starts as soon as the link finishes negotiating. Tap **Reject** to drop the call without ringing further. Tap **Hang up** during an active call to end it.

### Who can ring you

The app enforces a few privacy rules on top of the Reticulum link layer:

- **Contacts, or direct neighbors only.** Inbound calls are allowed if the caller is in your contacts, or if Reticulum currently has a zero-hop path to them — typically a peer on the same LAN, BLE link, or other local interface. Calls from non-contacts that would require routing through a transport node are dropped before any audio path opens. The caller receives a short "only accepting calls from contacts" notice over LXMF.
- **Blocked contacts are blackholed.** A call from a contact you have blocked is rejected and the caller is added to the network blackhole list so further attempts are dropped at the transport layer.
- **Auto-blackhole on persistent rejection.** A non-contact whose calls have been rejected ten times in a row is automatically blackholed for rate-limit reasons. The device stops ringing on their behalf even if they keep dialing.
- **Network blackhole short-circuit.** Identities already on the network blackhole list cannot ring the device at all; the call is dropped before any policy evaluation runs.

You do not configure any of this — it is on by default and applies to every voice call.

### Audio details

Voice uses the Opus codec and starts at the Medium Quality profile. The underlying rsLXST profile matrix supports Medium, High, Super High, Low Latency, and Ultra Low Latency, with active profile switching while the call is established.

Microphone and speaker access goes through the normal OS permission model: `RECORD_AUDIO` plus `MODIFY_AUDIO_SETTINGS` on Android, `NSMicrophoneUsageDescription` on macOS and iOS, the system default audio device on Linux and Windows. There is no in-app device picker yet — the call uses your OS default input and output.

### What is not in voice yet

Voice is intentionally narrow in the first release. There is no group call, no voicemail, no Offline Inbox fallback for missed calls, no call recording, no in-app device switching, and no echo cancellation or noise suppression beyond what the platform audio stack provides. Codec quality, ringtones, and platform audio routing are subject to change as rsLXST stabilizes.

If you need to opt out entirely — for example because you are building Ratspeak from source on a machine without the `rsLXST` sibling checkout — build with `cargo tauri dev --no-default-features`. The whole voice surface compiles out and the call button never appears.
