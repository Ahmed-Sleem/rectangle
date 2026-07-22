# Collaboration — Chat, Realtime, Notifications, Messaging Bridges

## 1. In-app realtime

| Tool | Mode | Notes |
|------|------|-------|
| **Socket.IO** | EMBED | Classic rooms; chat presence |
| **ws** / **uWebSockets** | EMBED | Raw WebSocket |
| **SSE** | EMBED | One-way notifications simpler |
| **PartyKit** / **Cloudflare Durable Objects** | managed | |
| **Supabase Realtime** | INTEGRATE | Postgres changes |
| **Liveblocks** | commercial | Collab presence |
| **Ably** / **Pusher** | commercial | |

**Pattern:** project room + thread room; message store in Postgres; fanout via Redis pub/sub.

---

## 2. Full chat platforms (integrate vs embed)

| Platform | Mode | Notes |
|----------|------|-------|
| **Matrix + Element / Tuwunel** | INTEGRATE | True OSS federation; bridges to WhatsApp/Telegram via mautrix |
| **Rocket.Chat** | INTEGRATE | Open-core drift — verify edition |
| **Mattermost** | INTEGRATE | Same caution on open-core |
| **Revolt** | INTEGRATE | Discord-like OSS |
| **Zulip** | INTEGRATE | Topics |
| **LiveKit** | INTEGRATE | **A/V meetings**, not text chat SoR |

**Recommendation:** Build **lightweight project chat** in-app (Tornix style). Use **Matrix bridges** only if customer demands federation. Don’t embed full Rocket.Chat for v1.

### WhatsApp (MENA critical)
| Path | Notes |
|------|-------|
| **WhatsApp Cloud API** (Meta) | Official business API — not OSS but mandatory integrate |
| **mautrix-whatsapp** | Bridge via Matrix |
| **Waha** / community stacks | Self-host WA automations — legal/ToS risk; prefer official API |

### Telegram
| | |
|--|--|
| **Bot API** | Official, easy |
| **MTProto clients** | Userbots — ToS risk |
| Tornix already mentions Telegram push — replicate with Bot API + deep links |

### Slack / Teams
- Official Bolt SDKs · Microsoft Graph  
- n8n connectors for low-code  

---

## 3. Push notifications

| Channel | Tool |
|---------|------|
| Mobile | Firebase Cloud Messaging · APNs · OneSignal (freemium) · ntfy (OSS self-host) |
| Web push | web-push library |
| Email | **Postal**, **Mailu**, **Listmonk** (campaigns), or SES/Postmark/Resend |
| SMS | Twilio · Vonage · local MENA providers |

---

## 4. Collaborative editing realtime

| Tool | Mode | Notes |
|------|------|-------|
| **Yjs** | EMBED | CRDT |
| **Hocuspocus** | INTEGRATE | Yjs WebSocket backend (TipTap ecosystem) |
| **Automerge** | EMBED | CRDT alt |
| **Loro** | EMBED | Newer CRDT |
| OpenProject uses Hocuspocus for Documents | REFERENCE |

---

## 5. Calendar

| Tool | Mode |
|------|------|
| **FullCalendar** | EMBED (premium plugins paid) |
| **Schedule-X** | EMBED MIT modern |
| **react-big-calendar** | EMBED |
| **Temporal API** polyfills | dates |
| CalDAV | **Baikal**, **Radicale** servers |
| Google/MS Graph | calendar sync INTEGRATE |

---

## 6. Email-in / mail
| Tool | Notes |
|------|-------|
| inbound parse | Postmark · Mailgun · self-host haraka |
| **Postal** | OSS mail server |
| Link messages to `project_id` via plus-addressing `proj+ID@mail.domain` |
