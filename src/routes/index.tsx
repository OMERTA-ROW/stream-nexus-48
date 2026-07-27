import { createFileRoute, Link } from "@tanstack/react-router";
import { Radio, MessagesSquare, Grid2x2, ShieldAlert, Check } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

const platforms = [
  { name: "Twitch", color: "var(--color-twitch)" },
  { name: "YouTube Live", color: "var(--color-youtube)" },
  { name: "Kick", color: "var(--color-kick)" },
  { name: "TikTok Live", color: "var(--color-tiktok)" },
  { name: "Facebook Live", color: "var(--color-facebook)" },
  { name: "Snapchat", color: "var(--color-snapchat)" },
];

function Landing() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <span className="on-air-dot" aria-hidden />
            OmniCast
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <a href="#how" className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground">
              How it works
            </a>
            <a href="#pricing" className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground">
              Pricing
            </a>
            <a href="#truth" className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground">
              What's real
            </a>
            <Link
              to="/hub"
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open hub
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="scanline absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-24 md:grid-cols-[1.15fr_1fr] md:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
              <span className="on-air-dot" aria-hidden /> On air
            </div>
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              One stream out.<br />
              <span className="text-primary">One chat in.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base text-muted-foreground md:text-lg">
              Pull every live platform into a single grid and merge their chats
              into one feed. Twitch, YouTube Live, Kick, TikTok — one control
              room.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/hub"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow hover:bg-primary/90"
              >
                <Radio className="h-4 w-4" /> Launch the hub
              </Link>
              <a
                href="#truth"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-5 py-3 text-sm font-medium hover:bg-accent"
              >
                <ShieldAlert className="h-4 w-4" /> Read the fine print
              </a>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {platforms.map((p) => (
                <div key={p.name} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                </div>
              ))}
            </div>
          </div>

          {/* Console mock */}
          <div className="relative rounded-2xl border border-border bg-card/70 p-3 shadow-glow">
            <div className="mb-2 flex items-center justify-between px-2 text-xs text-muted-foreground">
              <span className="font-mono">omnicast://control-room</span>
              <span className="flex items-center gap-1.5"><span className="on-air-dot" /> LIVE</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {platforms.map((p) => (
                <div
                  key={p.name}
                  className="scanline aspect-video rounded-lg border border-border/70 bg-background/60 p-3"
                >
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    {p.name}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-border/70 bg-background/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                <MessagesSquare className="h-3 w-3" /> Merged chat
              </div>
              <div className="space-y-1.5 font-mono text-xs">
                <div><span style={{ color: "var(--color-twitch)" }}>[tw]</span> mikey_: first!</div>
                <div><span style={{ color: "var(--color-youtube)" }}>[yt]</span> Sara: audio is 🔥</div>
                <div><span style={{ color: "var(--color-kick)" }}>[kk]</span> jax: LFG</div>
                <div><span style={{ color: "var(--color-tiktok)" }}>[tt]</span> lila: 👋👋</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How */}
      <section id="how" className="border-t border-border/60 bg-card/30">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-20 md:grid-cols-3">
          {[
            { icon: Grid2x2, title: "Grid every stream", body: "Enter channel handles and get a live tile per platform, side by side." },
            { icon: MessagesSquare, title: "Merge every chat", body: "One unified feed with per-platform color tags, so nothing gets lost." },
            { icon: Radio, title: "Broadcast control room", body: "Save your RTMP keys once and generate a fan-out config to go live everywhere." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border bg-background/60 p-6">
              <Icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Truth */}
      <section id="truth" className="border-t border-border/60">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs uppercase tracking-widest text-destructive">
            <ShieldAlert className="h-3 w-3" /> The honest bit
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            A browser can't restream by itself.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Sending one live video feed to Twitch, YouTube, Kick and TikTok at
            once needs an RTMP fan-out server running 24/7 — browsers can't
            open outbound RTMP sockets. OmniCast handles everything a web app
            actually can:
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex gap-3"><span className="text-primary">▸</span> Live multi-platform stream grid + merged chat, in the browser, right now.</li>
            <li className="flex gap-3"><span className="text-primary">▸</span> A control room for your platform stream keys, encrypted per account.</li>
            <li className="flex gap-3"><span className="text-primary">▸</span> A generated <span className="font-mono text-foreground">nginx-rtmp</span> config you deploy on a $5 VPS to fan one input out to every platform.</li>
            <li className="flex gap-3"><span className="text-primary">▸</span> TikTok Live requires their approved streaming access — we can't magic that in.</li>
          </ul>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border/60 bg-card/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-10 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
              Pricing
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Pick your booth.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Start free. Upgrade when you need more channels and the multistream relay.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                name: "Free",
                price: "$0",
                cadence: "forever",
                highlight: false,
                cta: "Open hub",
                features: [
                  "Up to 2 stream tiles",
                  "Merged Twitch chat (read-only)",
                  "1 local camera source",
                  "Community support",
                ],
              },
              {
                name: "Creator",
                price: "$5",
                cadence: "/ month",
                highlight: true,
                cta: "Start Creator",
                features: [
                  "Up to 6 stream tiles",
                  "Merged chat: Twitch + YouTube + Kick",
                  "Save channel presets to your account",
                  "Send-to-chat (Phase 2)",
                  "Email support",
                ],
              },
              {
                name: "Broadcaster",
                price: "$10",
                cadence: "/ month",
                highlight: false,
                cta: "Go Broadcaster",
                features: [
                  "Unlimited stream tiles",
                  "All Creator features",
                  "Multistream relay config generator",
                  "Encrypted RTMP key vault",
                  "TikTok Live integration (where approved)",
                  "Priority support",
                ],
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  tier.highlight
                    ? "border-primary bg-background shadow-glow"
                    : "border-border bg-background/60"
                }`}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
                    Most popular
                  </span>
                )}
                <div className="font-display text-lg font-semibold">{tier.name}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold">{tier.price}</span>
                  <span className="text-sm text-muted-foreground">{tier.cadence}</span>
                </div>
                <ul className="mt-6 flex-1 space-y-2 text-sm">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-foreground/90">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/hub"
                  className={`mt-6 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold ${
                    tier.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-border bg-card/60 hover:bg-accent"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        OmniCast · Broadcast to every stage from a single desk.
      </footer>
    </main>
  );
}
