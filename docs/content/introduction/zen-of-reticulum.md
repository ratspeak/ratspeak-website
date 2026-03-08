# Zen of Reticulum

Reticulum is built on a set of philosophical principles that double as architectural constraints. Every protocol decision traces back to one of these ideas.

> **Tip**: This page is optional background reading. If you'd rather get hands-on first, skip ahead to [Choosing Your Setup](../getting-started/choosing-your-setup).

---

## 1. The Illusion of the Center

<div class="pull-quote">There is no cloud — only other people's computers.</div>

The Client-Server model is the primary obstacle to understanding Reticulum. There is no central registry, no privileged infrastructure, no hierarchy to hijack.

Reticulum aims for **uncentralizability** — a structural property that makes hierarchy impossible by design, not just by policy. Every peer is potentially hostile. Transport Nodes forward packets blindly based on cryptographic proofs. No node has special authority.

Most critically, Reticulum abolishes the link between **Identity** and **Location**. Your address is derived from your cryptographic key, not from where you connect. Your destination hash stays the same whether you're on WiFi, LoRa, or packet radio on the other side of the world.

---

## 2. Physics of Trust

<div class="pull-quote">Encryption is not a feature — it is gravity. The fundamental force allowing the network to exist.</div>

Every environment must be assumed hostile. Stripping encryption from Reticulum wouldn't just remove privacy — it would break routing itself, because the randomness of encrypted packets is what makes the routing logic work.

Reticulum replaces institutional trust with cryptographic proof. Trust is binary, mathematical, absolute. You don't trust a server because someone told you to. You verify a signature because mathematics compels it.

---

## 3. Merits of Scarcity

<div class="pull-quote">5 bits per second is a valid speed. Every byte is energy, time, and spectrum.</div>

Reticulum treats bandwidth as precious. Establishing a link takes 3 small packets totaling 297 bytes. A destination hash fits in 16 bytes. The entire maximum packet size is 500 bytes.

This scarcity-aware design means Reticulum works everywhere — from a LoRa radio pushing 300 bits per second across mountaintops to a fiber link carrying gigabits. If your protocol can't handle 5 bps, it can't handle the real world.

Reticulum also embraces asynchronous time. Store and Forward is a primary mode, not a fallback. Designing for delay means designing for resilience.

---

## 4. Sovereignty Through Infrastructure

<div class="pull-quote">You can own the house.</div>

Networking complexity is largely bureaucratic, not technical. Reticulum runs on hardware costing the price of a dinner, on free-to-use radio spectrum. A Raspberry Pi with an RNode radio is a complete, sovereign network node.

When you run your own infrastructure, the network becomes a space you inhabit rather than a service you rent. Sovereignty is the ability to survive the cut — when the internet goes down, when services are revoked, when someone decides you don't get to communicate anymore.

---

## 5. Identity and Nomadism

<div class="pull-quote">Your identity is a mathematical signature existing independently of the physical world.</div>

A Reticulum identity is a cryptographic key — 512 bits that define who you are on the network. Your destination hash stays the same regardless of medium or location. WiFi one moment, LoRa mesh the next — your identity follows.

Reticulum replaces surveillance with Announces: you broadcast a cryptographic proof of your presence. You choose when to announce and when to disappear. There is no always-on location tracking, no connection logs at a central server, no metadata to harvest.

---

## 6. Ethics of the Tool

<div class="pull-quote">Architecture is politics.</div>

The Reticulum protocol specification is in the **Public Domain** — it belongs to humanity, free of all restrictions. Anyone can implement it, in any language, for any purpose.

The reference implementation (the actual code) carries the Reticulum License, which adds two guardrails: it prohibits use in systems designed to harm humans, and it prohibits use in AI/ML training designed to replace the people who built the commons.

This isn't an afterthought. The decision about who can use the network and how is baked into the protocol's legal structure from the beginning.

---

## 7. Design Patterns for Post-IP Systems

<div class="pull-quote">Send. Continue living. Receive when it arrives.</div>

Building on Reticulum means thinking differently about communication.

**Store and Forward**: Messages don't need instant delivery. You send a message, continue what you were doing, and the recipient receives it when they come online. This is how resilient communication works — more like postal mail than a phone call.

> In code, this looks like `Send()` then later `Receive()`. There is no persistent connection to maintain.

**Naming Is Power**: In conventional networks, someone controls the domain name system. In Reticulum, your address is derived from your cryptographic key — no one controls the namespace. Applications should present contacts as keyrings, not URL bars.

> Instead of looking up `example.com` through a hierarchy of servers, you hold a destination hash that points directly to a cryptographic identity.

**The Interface Is the Medium**: Applications write to a single API, not to specific hardware. One call sends data regardless of whether the underlying medium is LoRa, TCP, or serial. The transport layer figures out the path.

> Your code stays the same whether the message crosses a continent on radio or moves between processes on localhost.

---

## 8. Fabric of the Independent

<div class="pull-quote">The revolution is not televised. It is packetized.</div>

The protocol is in the public domain — a gift to humanity. The source code is distributed on hundreds of thousands of devices. No single entity can revoke it, shut it down, or control it.

Reticulum is the fabric from which independent, resilient communication networks are woven. Each node is both a thread and a weaver.

---

## What's Next

- [What is Reticulum?](../introduction/what-is-reticulum) — the technical overview
- [Key Concepts](../introduction/key-concepts) — essential terminology
- [Security Model](../understanding/security-model) — how these principles become code
