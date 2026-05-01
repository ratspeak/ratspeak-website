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

Use the paperclip icon in the composer to attach a file. Ratspeak supports any file type, but **attachments are capped at 500 KB**. The cap is intentional: messages travel over a mesh network where bandwidth is precious, and oversized files can take a long time — or fail outright — over slow links like LoRa radios. If you try to attach a file over the limit, Ratspeak will tell you the file size and ask you to pick something smaller.

For images specifically, Ratspeak shows an inline preview in the message bubble. Other attachments appear as a download chip with the filename and size.

## Delivery states

Every outgoing message gets a small status indicator that tells you what happened to it.

- **Sending** — the message is in flight. Ratspeak is actively trying to reach the recipient.
- **Delivered** — Ratspeak has positive proof the recipient received it. This is the strongest state.
- **Sent** — the message left your node, but no delivery confirmation has come back yet. This is normal for some delivery modes (see below).
- **Failed** — delivery did not succeed. The most common cause is that the destination is currently unreachable. You can resend.

Ratspeak picks one of three delivery modes automatically, based on what it knows about the recipient and the network:

- **Direct** uses an encrypted live link to the recipient — fastest, with end-to-end delivery confirmation. Best when both sides are online.
- **Opportunistic** sends the message as a single packet without setting up a link. It's lightweight and works well over slow radios, but only fits messages up to **295 bytes** of content, and there's no delivery proof — just confirmation that the packet was transmitted.
- **Propagated** hands the message to a propagation node, which holds it and forwards it to the recipient when they next come online. This is the store-and-forward mode for offline contacts.

You don't have to choose; Ratspeak picks the right mode for the situation. The state icon on each message reflects which mode was used.

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
