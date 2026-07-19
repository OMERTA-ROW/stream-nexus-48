import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Radio, X, Plus, MessagesSquare, Filter } from "lucide-react";
import { connectTwitch, type ChatMessage, type Platform } from "@/lib/chat-sources";

export const Route = createFileRoute("/hub")({
  head: () => ({
    meta: [
      { title: "Hub — OmniCast" },
      {
        name: "description",
        content: "Watch every live platform in one grid with a single merged chat.",
      },
    ],
  }),
  component: Hub,
});

interface Channel {
  id: string;
  platform: Platform;
  handle: string;
}

const PLATFORM_META: Record<
  Platform,
  { label: string; color: string; short: string; canReadChat: boolean; embed: (h: string) => string | null }
> = {
  twitch: {
    label: "Twitch",
    color: "var(--color-twitch)",
    short: "TW",
    canReadChat: true,
    embed: (h) => {
      if (typeof window === "undefined") return null;
      const parent = window.location.hostname;
      return `https://player.twitch.tv/?channel=${encodeURIComponent(h)}&parent=${parent}&muted=true`;
    },
  },
  youtube: {
    label: "YouTube",
    color: "var(--color-youtube)",
    short: "YT",
    canReadChat: false,
    // Live stream by channel handle/name — YouTube's live_stream endpoint
    embed: (h) =>
      `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(h)}&autoplay=1&mute=1`,
  },
  kick: {
    label: "Kick",
    color: "var(--color-kick)",
    short: "KK",
    canReadChat: false,
    embed: (h) => `https://player.kick.com/${encodeURIComponent(h)}?muted=true&autoplay=true`,
  },
  tiktok: {
    label: "TikTok",
    color: "var(--color-tiktok)",
    short: "TT",
    canReadChat: false,
    // TikTok Live has no supported iframe embed — link out.
    embed: () => null,
  },
};

const PLATFORMS: Platform[] = ["twitch", "youtube", "kick", "tiktok"];

function Hub() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [platform, setPlatform] = useState<Platform>("twitch");
  const [handle, setHandle] = useState("");
  const [filter, setFilter] = useState<Platform | "all">("all");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Persist channels
  useEffect(() => {
    try {
      const raw = localStorage.getItem("omnicast:channels");
      if (raw) setChannels(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("omnicast:channels", JSON.stringify(channels));
    } catch { /* ignore */ }
  }, [channels]);

  // Wire up chat sources
  useEffect(() => {
    const sources = channels
      .filter((c) => c.platform === "twitch")
      .map((c) =>
        connectTwitch(c.handle, (m) =>
          setMessages((prev) => {
            const next = [...prev, m];
            return next.length > 500 ? next.slice(-500) : next;
          }),
        ),
      );
    return () => sources.forEach((s) => s.close());
  }, [channels]);

  // Auto-scroll
  useEffect(() => {
    if (!stickToBottom.current || !scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages]);

  const filtered = useMemo(
    () => (filter === "all" ? messages : messages.filter((m) => m.platform === filter)),
    [messages, filter],
  );

  const addChannel = () => {
    const h = handle.trim().replace(/^@/, "");
    if (!h) return;
    setChannels((prev) => [
      ...prev,
      { id: `${platform}:${h}:${Date.now()}`, platform, handle: h },
    ]);
    setHandle("");
  };

  const removeChannel = (id: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
    // drop that channel's messages
    setMessages((prev) =>
      prev.filter((m) => {
        const c = channels.find((x) => x.id === id);
        return !c || !(m.platform === c.platform && m.channel === c.handle.toLowerCase());
      }),
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-display text-base font-semibold">
          <span className="on-air-dot" aria-hidden />
          OmniCast
        </Link>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Radio className="h-3.5 w-3.5" />
          {channels.length} channel{channels.length === 1 ? "" : "s"} loaded
        </div>
      </header>

      {/* Add channel bar */}
      <div className="border-b border-border/60 bg-card/40 px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  platform === p ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-accent"
                }`}
              >
                {PLATFORM_META[p].label}
              </button>
            ))}
          </div>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addChannel()}
            placeholder={`${PLATFORM_META[platform].label} channel name…`}
            className="min-w-0 flex-1 rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={addChannel}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {channels.length > 0 && (
          <div className="mx-auto mt-2 flex max-w-6xl flex-wrap gap-1.5">
            {channels.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: PLATFORM_META[c.platform].color }}
                />
                {PLATFORM_META[c.platform].short} · {c.handle}
                <button
                  onClick={() => removeChannel(c.id)}
                  className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Layout */}
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Stream grid */}
        <div className="flex-1 p-4">
          {channels.length === 0 ? (
            <EmptyState />
          ) : (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.min(channels.length, 2)}, minmax(0, 1fr))`,
              }}
            >
              {channels.map((c) => (
                <StreamTile key={c.id} channel={c} />
              ))}
            </div>
          )}
        </div>

        {/* Chat column */}
        <aside className="flex w-full flex-col border-t border-border/60 bg-card/40 lg:w-96 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2 font-display text-sm font-semibold">
              <MessagesSquare className="h-4 w-4" /> Merged chat
            </div>
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as Platform | "all")}
                className="rounded-md border border-border bg-input px-2 py-0.5 text-xs outline-none"
              >
                <option value="all">all</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{PLATFORM_META[p].label.toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>
          <div
            ref={scrollerRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
            className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[13px] leading-snug"
            style={{ maxHeight: "70vh" }}
          >
            {filtered.length === 0 ? (
              <p className="mt-8 text-center text-xs text-muted-foreground">
                {channels.some((c) => c.platform === "twitch")
                  ? "Waiting for the first message…"
                  : "Add a Twitch channel to see live merged chat.\nYouTube / Kick / TikTok chat land in Phase 2."}
              </p>
            ) : (
              filtered.map((m) => (
                <div key={m.id} className="mb-1.5 break-words">
                  <span
                    className="mr-1 rounded px-1 text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor: `color-mix(in oklch, ${PLATFORM_META[m.platform].color} 25%, transparent)`,
                      color: PLATFORM_META[m.platform].color,
                    }}
                  >
                    {PLATFORM_META[m.platform].short}
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: m.color || PLATFORM_META[m.platform].color }}
                  >
                    {m.author}
                  </span>
                  <span className="text-muted-foreground">: </span>
                  <span className="text-foreground">{m.text}</span>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-border/60 px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Read-only · Sign-in send arrives in Phase 2
          </div>
        </aside>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
      <div>
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Radio className="h-5 w-5" />
        </div>
        <h3 className="font-display text-lg font-semibold">No streams loaded</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Pick a platform up top and drop in a channel handle. Add as many as you want — they'll tile automatically.
        </p>
      </div>
    </div>
  );
}

function StreamTile({ channel }: { channel: Channel }) {
  const meta = PLATFORM_META[channel.platform];
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    setSrc(meta.embed(channel.handle));
  }, [channel.handle, channel.platform, meta]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black/60">
      <div className="flex items-center justify-between border-b border-border/60 bg-card/60 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
          <span className="font-semibold">{meta.label}</span>
          <span className="text-muted-foreground">· {channel.handle}</span>
        </div>
      </div>
      <div className="relative aspect-video">
        {src ? (
          <iframe
            title={`${meta.label} ${channel.handle}`}
            src={src}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 p-4 text-center text-sm text-muted-foreground">
            {meta.label} Live has no embeddable player.{" "}
            <a
              className="ml-1 text-primary underline"
              href={`https://www.tiktok.com/@${channel.handle}/live`}
              target="_blank"
              rel="noreferrer"
            >
              Open on {meta.label} →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
