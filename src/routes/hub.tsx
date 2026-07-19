import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radio, X, Plus, MessagesSquare, Filter, Camera, Video, Users, RotateCw, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { connectTwitch, type ChatMessage, type ConnectionState, type Platform } from "@/lib/chat-sources";

type HealthLevel = "live" | "connecting" | "degraded" | "failed" | "idle";
interface Health {
  level: HealthLevel;
  label: string;
  detail?: string;
  lastAt?: number;
}
const HEALTH_COLORS: Record<HealthLevel, string> = {
  live: "#22c55e",
  connecting: "#f59e0b",
  degraded: "#f59e0b",
  failed: "#ef4444",
  idle: "#6b7280",
};
function healthFromChat(s: ConnectionState | undefined): Health {
  if (!s) return { level: "connecting", label: "Connecting" };
  const stale = s.lastMessageAt && Date.now() - s.lastMessageAt > 90_000;
  if (s.status === "live") {
    return stale
      ? { level: "degraded", label: "Quiet", detail: "No messages for 90s+", lastAt: s.lastMessageAt }
      : { level: "live", label: "Live", lastAt: s.lastMessageAt };
  }
  if (s.status === "connecting") return { level: "connecting", label: "Connecting" };
  if (s.status === "reconnecting")
    return { level: "degraded", label: `Reconnecting${s.retry ? ` (${s.retry})` : ""}`, detail: s.reason };
  if (s.status === "failed") return { level: "failed", label: "Failed", detail: s.reason };
  return { level: "idle", label: "Closed" };
}

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

type SourceKind = Platform | "camera";

interface Channel {
  id: string;
  platform: SourceKind;
  handle: string;
  // camera-only: deviceId label for display
  label?: string;
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
    embed: () => null,
  },
};

const CAMERA_META = {
  label: "Camera",
  color: "#22d3ee",
  short: "CAM",
};

function metaFor(k: SourceKind) {
  if (k === "camera") {
    return { label: CAMERA_META.label, color: CAMERA_META.color, short: CAMERA_META.short };
  }
  return PLATFORM_META[k];
}

const PLATFORMS: Platform[] = ["twitch", "youtube", "kick", "tiktok"];

function Hub() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [platform, setPlatform] = useState<Platform>("twitch");
  const [handle, setHandle] = useState("");
  const [filter, setFilter] = useState<Platform | "all">("all");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const createRoom = async () => {
    setCreatingRoom(true);
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code =
      Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("") +
      "-" +
      Array.from({ length: 2 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    const { error } = await supabase.from("rooms").insert({ code });
    setCreatingRoom(false);
    if (error) {
      console.error(error);
      return;
    }
    navigate({ to: "/r/$code", params: { code } });
  };

  const [chatHealth, setChatHealth] = useState<Record<string, Health>>({});
  const [tileHealth, setTileHealth] = useState<Record<string, Health>>({});
  const chatSourcesRef = useRef<Record<string, { reconnect: () => void }>>({});
  const reconnectTileRef = useRef<Record<string, () => void>>({});

  const setTileHealthFor = useCallback((id: string, h: Health) => {
    setTileHealth((prev) => (prev[id]?.level === h.level && prev[id]?.label === h.label ? prev : { ...prev, [id]: h }));
  }, []);
  const registerTileReconnect = useCallback((id: string, fn: () => void) => {
    reconnectTileRef.current[id] = fn;
    return () => { delete reconnectTileRef.current[id]; };
  }, []);

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

  useEffect(() => {
    const map: Record<string, { reconnect: () => void }> = {};
    const sources = channels
      .filter((c) => c.platform === "twitch")
      .map((c) => {
        const src = connectTwitch(
          c.handle,
          (m) =>
            setMessages((prev) => {
              const next = [...prev, m];
              return next.length > 500 ? next.slice(-500) : next;
            }),
          (state) => setChatHealth((prev) => ({ ...prev, [c.id]: healthFromChat(state) })),
        );
        map[c.id] = src;
        return src;
      });
    chatSourcesRef.current = map;
    return () => sources.forEach((s) => s.close());
  }, [channels]);

  // Freshness sweep — mark any 'live' chat as 'degraded' after 90s of silence.
  useEffect(() => {
    const t = setInterval(() => {
      setChatHealth((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [id, h] of Object.entries(prev)) {
          if (h.level === "live" && h.lastAt && Date.now() - h.lastAt > 90_000) {
            next[id] = { ...h, level: "degraded", label: "Quiet", detail: "No messages for 90s+" };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 15_000);
    return () => clearInterval(t);
  }, []);

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

  const addCamera = (deviceId: string, label: string) => {
    setChannels((prev) => [
      ...prev,
      { id: `camera:${deviceId}:${Date.now()}`, platform: "camera", handle: deviceId, label },
    ]);
    setCameraOpen(false);
  };

  const removeChannel = (id: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
    setChatHealth((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setTileHealth((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setMessages((prev) =>
      prev.filter((m) => {
        const c = channels.find((x) => x.id === id);
        return !c || c.platform === "camera" || !(m.platform === c.platform && m.channel === c.handle.toLowerCase());
      }),
    );
  };

  const reconnectChannel = (id: string) => {
    chatSourcesRef.current[id]?.reconnect();
    reconnectTileRef.current[id]?.();
  };
  const reconnectAll = () => {
    Object.values(chatSourcesRef.current).forEach((s) => s.reconnect());
    Object.values(reconnectTileRef.current).forEach((fn) => fn());
  };

  const combinedHealth = (id: string, platform: SourceKind): Health => {
    if (platform === "camera") return tileHealth[id] ?? { level: "connecting", label: "Starting" };
    if (platform === "twitch") {
      const chat = chatHealth[id];
      const tile = tileHealth[id];
      // Chat health takes precedence when worse than tile.
      const rank: Record<HealthLevel, number> = { live: 0, connecting: 1, degraded: 2, failed: 3, idle: 4 };
      const chatH = chat ?? { level: "connecting" as const, label: "Connecting" };
      const tileH = tile ?? { level: "connecting" as const, label: "Loading" };
      return rank[chatH.level] >= rank[tileH.level] ? chatH : tileH;
    }
    return tileHealth[id] ?? { level: "connecting", label: "Loading" };
  };

  const degradedCount = channels.filter((c) => {
    const h = combinedHealth(c.id, c.platform);
    return h.level === "degraded" || h.level === "failed";
  }).length;


  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-display text-base font-semibold">
          <span className="on-air-dot" aria-hidden />
          OmniCast
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={createRoom}
            disabled={creatingRoom}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/60 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
            title="Create a shared room and pair other devices"
          >
            <Users className="h-3.5 w-3.5" />
            {creatingRoom ? "Creating…" : "Create shared room"}
          </button>
          {channels.length > 0 && (
            <button
              onClick={reconnectAll}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                degradedCount > 0
                  ? "border-amber-500/60 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 animate-pulse"
                  : "border-border bg-background/60 text-muted-foreground hover:bg-accent"
              }`}
              title={degradedCount > 0 ? `${degradedCount} feed${degradedCount === 1 ? "" : "s"} degraded — click to reconnect all` : "All feeds healthy — force reconnect"}
            >
              <Activity className="h-3.5 w-3.5" />
              {degradedCount > 0 ? `${degradedCount} degraded` : "All healthy"}
            </button>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Radio className="h-3.5 w-3.5" />
            {channels.length} channel{channels.length === 1 ? "" : "s"}
          </div>
        </div>
      </header>


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
          <button
            onClick={() => setCameraOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-accent"
            title="Connect a camera on this device"
          >
            <Camera className="h-4 w-4" /> Camera
          </button>
        </div>
        {channels.length > 0 && (
          <div className="mx-auto mt-2 flex max-w-6xl flex-wrap gap-1.5">
            {channels.map((c) => {
              const m = metaFor(c.platform);
              const h = combinedHealth(c.id, c.platform);
              return (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs"
                  title={`${h.label}${h.detail ? ` — ${h.detail}` : ""}`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: m.color }}
                  />
                  {m.short} · {c.label ?? c.handle}
                  <StatusDot level={h.level} />
                  {(h.level === "degraded" || h.level === "failed") && (
                    <button
                      onClick={() => reconnectChannel(c.id)}
                      className="rounded p-0.5 text-amber-400 hover:bg-amber-500/20"
                      aria-label="Reconnect"
                      title="Reconnect this feed"
                    >
                      <RotateCw className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => removeChannel(c.id)}
                    className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

      </div>

      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="flex-1 p-4">
          {channels.length === 0 ? (
            <EmptyState onCamera={() => setCameraOpen(true)} />
          ) : (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.min(channels.length, 2)}, minmax(0, 1fr))`,
              }}
            >
              {channels.map((c) =>
                c.platform === "camera" ? (
                  <CameraTile key={c.id} channel={c} />
                ) : (
                  <StreamTile key={c.id} channel={c} />
                ),
              )}
            </div>
          )}
        </div>

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

      {cameraOpen && (
        <CameraPicker onClose={() => setCameraOpen(false)} onPick={addCamera} />
      )}
    </div>
  );
}

function EmptyState({ onCamera }: { onCamera: () => void }) {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
      <div>
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Radio className="h-5 w-5" />
        </div>
        <h3 className="font-display text-lg font-semibold">No streams loaded</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Pick a platform up top and drop in a channel handle, or connect a live camera on this device.
        </p>
        <button
          onClick={onCamera}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm font-semibold hover:bg-accent"
        >
          <Camera className="h-4 w-4" /> Connect a camera
        </button>
      </div>
    </div>
  );
}

function StreamTile({ channel }: { channel: Channel }) {
  const meta = PLATFORM_META[channel.platform as Platform];
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

function CameraTile({ channel }: { channel: Channel }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: channel.handle } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setLive(true);
        }
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Camera unavailable");
      }
    })();
    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [channel.handle]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black/60">
      <div className="flex items-center justify-between border-b border-border/60 bg-card/60 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CAMERA_META.color }} />
          <span className="font-semibold">Camera</span>
          <span className="text-muted-foreground">· {channel.label ?? "device"}</span>
        </div>
        {live && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-500">
            <span className="on-air-dot" aria-hidden /> Live
          </span>
        )}
      </div>
      <div className="relative aspect-video">
        {err ? (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
            {err}
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
    </div>
  );
}

function CameraPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (deviceId: string, label: string) => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        // Prompt for permission first so device labels populate.
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list.filter((d) => d.kind === "videoinput"));
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Camera access denied");
      } finally {
        setLoading(false);
        if (stream) stream.getTracks().forEach((t) => t.stop());
      }
    })();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">Connect a camera</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Pick which camera on this device to stream. Switching sources per stream keeps the feed stable.
        </p>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Requesting camera access…</p>
        ) : err ? (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {err}
          </p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cameras detected on this device.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {devices.map((d, i) => (
              <li key={d.deviceId || i}>
                <button
                  onClick={() => onPick(d.deviceId, d.label || `Camera ${i + 1}`)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-primary" />
                    {d.label || `Camera ${i + 1}`}
                  </span>
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
