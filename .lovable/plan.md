# OmniCast — one stream out, one chat in

## What you're asking for, and the honest constraint

You want two things:

1. **One stream out to many platforms** — you go live once, and Twitch, YouTube Live, Kick, and TikTok Live all receive the same synced broadcast.
2. **One chat in from many platforms** — viewers on any of those platforms type in their native chat, and you (and optionally your viewers) see it all in a single merged chat box.

Part 2 is fully doable in a web app. **Part 1 is not** — and any tool telling you otherwise is glossing over how live streaming works.

To restream a single live feed to multiple platforms you need an **RTMP ingest + fan-out server** running 24/7 (something like nginx-rtmp, MediaMTX, or a hosted service like Restream.io / Castr). Your OBS pushes one RTMP stream to that server, and the server re-pushes it to each platform's RTMP endpoint. A browser cannot open outbound RTMP sockets, and Cloudflare Workers (our backend runtime) cannot host a persistent RTMP relay either. TikTok Live is worse: they don't publicly issue RTMP keys — you need Live Studio access or an approved partner (Restream, Streamlabs).

So the plan below builds the **web control plane**: a dashboard where you paste each platform's stream key, and we generate the config + instructions to point either (a) your own self-hosted relay or (b) a third-party service at all destinations at once. The unified chat is fully implemented in-app.

## Scope of this build

**Phase 1 — Unified chat hub (fully working in-app)**
- Enter Twitch, YouTube, Kick, TikTok channel handles → embedded player grid + merged live chat.
- Read-only chat first: no login needed to watch.
  - Twitch: anonymous IRC WebSocket (`irc-ws.chat.twitch.tv`).
  - Kick: public Pusher WebSocket.
  - YouTube Live: poll `liveChatMessages` via YouTube Data API (needs API key — Lovable Cloud secret).
  - TikTok Live: unofficial WebSocket scrape (fragile; may break — clearly labeled beta).
- Merged chat column with per-platform color badges, timestamps, filter toggles.

**Phase 2 — Streamer login + send-to-chat**
- Sign in with Lovable Cloud (email + Google).
- Per-user OAuth via App User Connectors so you can *send* messages back:
  - Twitch (`user:write:chat` scope).
  - YouTube Live chat insert.
  - Kick (no official write API — send disabled with a tooltip).
- Save connections encrypted per user.

**Phase 3 — Multistream broadcast control plane**
- Dashboard to store your RTMP stream keys per platform (encrypted, Lovable Cloud).
- Generate an `nginx.conf` / MediaMTX config you can deploy on a $5 VPS that fans one input to all destinations, and a copy-paste OBS setup guide.
- Optional: integrate with a hosted restream provider via their API if you have an account (we can wire this in Phase 3.5 once you pick one).
- **We will not** claim the browser itself is doing the restreaming.

**"Other search site"** — noted, but I need one line from you: search *what* across platforms? (streamers by name, live categories, clips?) I'll implement it in Phase 1 once you say.

## Tech

- TanStack Start (already scaffolded).
- Lovable Cloud for auth, encrypted key storage, per-user connections.
- Standard connectors gateway for Twitch (Helix), TikTok, YouTube.
- Client-side WebSockets for Twitch IRC + Kick Pusher (no server round-trip needed for read).
- Design system: dark broadcast-console aesthetic, dense multi-panel layout (stream grid left, chat right, controls bottom). Not purple.

## Deliverable order

1. Design system + landing page explaining the product honestly.
2. Phase 1 chat hub at `/hub` — no login, enter channels, watch + merged chat.
3. Auth + Phase 2 connections.
4. Phase 3 restream control panel + config generator.

## Decisions I need from you before building

- **Search site** — search for what?
- **Third-party restream provider** — do you already use Restream.io, Castr, or similar? If yes, we can integrate their API in Phase 3 instead of generating a self-hosted config.
- **Start with Phase 1 only, or full plan?** Phase 1 alone is ~1 build cycle and gives you a real working multi-chat immediately.
