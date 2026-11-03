import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Radio,
  X,
  Plus,
  MessagesSquare,
  Filter,
  Camera,
  Video,
  Grid2x2,
  MonitorPlay,
  Copy,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { connectTwitch, type ChatMessage, type Platform } from "@/lib/chat-sources";

export const Route = createFileRoute("/r/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Room ${params.code} — OmniCast` },
      { name: "description", content: "Shared multi-device stream + chat room." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoomPage,
});

type LayoutMode = "both" | "video" | "chat";
type SourceKind = Platform | "camera";

interface RoomChannelRow {
  id: string;
  room_code: string;
  platform: string;
  handle: string;
}

interface LocalChannel {
  id: string;
  platform: SourceKind;
  handle: string;
  label?: string;
  remote: boolean; // synced from cloud vs local-only (cameras)
}

const PLATFORM_META: Record<
  Platform,
  { label: string; color: string; short: string; embed: (h: string) => string | null }
> = {
  twitch: {
    label: "Twitch",
    color: "var(--color-twitch)",
    short: "TW",
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
    embed: (h) =>
      `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(h)}&autoplay=1&mute=1`,
  },
  kick: {
    label: "Kick",
    color: "var(--color-kick)",
    short: "KK",
    embed: (h) => `https://player.kick.com/${encodeURIComponent(h)}?muted=true&autoplay=true`,
  },
  tiktok: {
    label: "TikTok",
    color: "var(--color-tiktok)",
    short: "TT",
    embed: () => null,
  },
  facebook: {
    label: "Facebook",
    color: "var(--color-facebook)",
    short: "FB",
    embed: (h) => `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(`https://www.facebook.com/${h}/live`)}&show_text=false&autoplay=true&mute=1`,
  },
  snapchat: {
    label: "Snapchat",
    color: "var(--color-snapchat)",
    short: "SC",
    embed: () => null,
  },
  streamlabs: {
    label: "Streamlabs",
    color: "var(--color-streamlabs)",
    short: "SL",
    embed: () => null,
  },
};

const CAMERA_META = { label: "Camera", color: "#22d3ee", short: "CAM" };
const PLATFORMS: Platform[] = ["twitch", "youtube", "kick", "tiktok", "facebook", "snapchat", "streamlabs"];

function metaFor(k: SourceKind) {
  if (k === "camera") return CAMERA_META;
  return PLATFORM_META[k];
}

function RoomPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const [remoteChannels, setRemoteChannels] = useState<LocalChannel[]>([]);
  const [cameraChannels, setCameraChannels] = useState<LocalChannel[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [platform, setPlatform] = useState<Platform>("twitch");
  const [handle, setHandle] = useState("");
  const [filter, setFilter] = useState<Platform | "all">("all");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>("both");
  const [focusedTile, setFocusedTile] = useState<string | "all">("all");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Layout is per-device (localStorage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`omnicast:room:${code}:layout`);
      if (raw === "video" || raw === "chat" || raw === "both") setLayout(raw);
      const focus = localStorage.getItem(`omnicast:room:${code}:focus`);
      if (focus) setFocusedTile(focus);
    } catch { /* ignore */ }
  }, [code]);
  useEffect(() => {
    try {
      localStorage.setItem(`omnicast:room:${code}:layout`, layout);
    } catch { /* ignore */ }
  }, [code, layout]);
  useEffect(() => {
    try {
      localStorage.setItem(`omnicast:room:${code}:focus`, focusedTile);
    } catch { /* ignore */ }
  }, [code, focusedTile]);

  // Cameras are per-device (localStorage), never synced
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`omnicast:room:${code}:cameras`);
      if (raw) setCameraChannels(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [code]);
  useEffect(() => {
    try {
      localStorage.setItem(`omnicast:room:${code}:cameras`, JSON.stringify(cameraChannels));
    } catch { /* ignore */ }
  }, [code, cameraChannels]);

  // Load channels + subscribe realtime. Room creation happens in /hub for
  // signed-in owners; here we only read/join.
  useEffect(() => {
    let cancelled = false;
    let authSub: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        const { data: roomRow, error: roomErr } = await supabase
          .from("rooms")
          .select("code, owner_id")
          .eq("code", code)
          .maybeSingle();
        if (cancelled) return;
        if (roomErr) throw roomErr;
        if (!roomRow) {
          setError("Room not found. Ask the room owner for a fresh link.");
          return;
        }
        const { data: userData } = await supabase.auth.getSession();
        if (cancelled) return;
        setCanManage(userData.session?.user.id === roomRow.owner_id);
        authSub = supabase.auth.onAuthStateChange((_e, session) => {
          if (!cancelled) setCanManage(session?.user.id === roomRow.owner_id);
        }).data.subscription;
        const { data, error } = await supabase
          .from("room_channels")
          .select("*")
          .eq("room_code", code);
        if (cancelled) return;
        if (error) throw error;
        setRemoteChannels(
          (data ?? []).map((r: RoomChannelRow) => ({
            id: r.id,
            platform: r.platform as Platform,
            handle: r.handle,
            remote: true,
          })),
        );
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load room");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; authSub?.unsubscribe(); };
  }, [code]);


  useEffect(() => {
    const channel = supabase
      .channel(`room:${code}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_channels", filter: `room_code=eq.${code}` },
        (payload) => {
          const r = payload.new as RoomChannelRow;
          setRemoteChannels((prev) =>
            prev.some((c) => c.id === r.id)
              ? prev
              : [...prev, { id: r.id, platform: r.platform as Platform, handle: r.handle, remote: true }],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "room_channels", filter: `room_code=eq.${code}` },
        (payload) => {
          const r = payload.old as { id: string };
          setRemoteChannels((prev) => prev.filter((c) => c.id !== r.id));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [code]);

  // Merge channels for display
  const channels = useMemo(
    () => [...remoteChannels, ...cameraChannels],
    [remoteChannels, cameraChannels],
  );

  // Twitch chat subscriptions
  useEffect(() => {
    const sources = remoteChannels
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
  }, [remoteChannels]);

  useEffect(() => {
    if (!stickToBottom.current || !scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages]);

  const filtered = useMemo(
    () => (filter === "all" ? messages : messages.filter((m) => m.platform === filter)),
    [messages, filter],
  );

  const addChannel = async () => {
    if (!canManage) return;
    const h = handle.trim().replace(/^@/, "");
    if (!h) return;
    const { error } = await supabase.from("room_channels").insert({
      room_code: code,
      platform,
      handle: h,
    });
    if (error) {
      setError("Could not add that channel. Please try again.");
      return;
    }
    setError(null);
    setHandle("");
  };

  const addCamera = (deviceId: string, label: string) => {
    setCameraChannels((prev) => [
      ...prev,
      { id: `camera:${deviceId}:${Date.now()}`, platform: "camera", handle: deviceId, label, remote: false },
    ]);
    setCameraOpen(false);
  };

  const removeChannel = async (c: LocalChannel) => {
    if (c.remote) {
      if (!canManage) return;
      const { error } = await supabase.from("room_channels").delete().eq("id", c.id);
      if (error) setError("Could not remove that channel. Please try again.");
    } else {
      setCameraChannels((prev) => prev.filter((x) => x.id !== c.id));
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const visibleTiles = useMemo(() => {
    if (focusedTile !== "all") {
      const t = channels.find((c) => c.id === focusedTile);
      return t ? [t] : channels;
    }
    return channels;
  }, [channels, focusedTile]);

  const showVideo = layout !== "chat";
  const showChat = layout !== "video";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-display text-base font-semibold">
          <span className="on-air-dot" aria-hidden />
          OmniCast
        </Link>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-card/60 px-2.5 py-1 font-mono text-xs uppercase tracking-widest">
            Room · {code} · {canManage ? "Owner" : "Viewer"}
          </span>
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1 text-xs hover:bg-accent"
            title="Copy room link to open on another device"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {(["both", "video", "chat"] as LayoutMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setLayout(m)}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider ${
                layout === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
              title={`This device: ${m}`}
            >
              {m === "both" && <Grid2x2 className="h-3 w-3" />}
              {m === "video" && <MonitorPlay className="h-3 w-3" />}
              {m === "chat" && <MessagesSquare className="h-3 w-3" />}
              {m}
            </button>
          ))}
        </div>
      </header>

      {showVideo && (
        <div className="border-b border-border/60 bg-card/40 px-4 py-3">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            {canManage ? (<>
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
            </>) : (
              <p className="flex-1 text-xs text-muted-foreground">
                Viewer mode · Channels are managed by the room owner. You can still add your own camera.
              </p>
            )}
            <button
              onClick={() => setCameraOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm font-semibold hover:bg-accent"
            >
              <Camera className="h-4 w-4" /> Camera
            </button>
          </div>

          {channels.length > 0 && (
            <div className="mx-auto mt-2 flex max-w-6xl flex-wrap items-center gap-1.5">
              <button
                onClick={() => setFocusedTile("all")}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  focusedTile === "all"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background/60 text-muted-foreground hover:bg-accent"
                }`}
              >
                All tiles
              </button>
              {channels.map((c) => {
                const m = metaFor(c.platform);
                const active = focusedTile === c.id;
                return (
                  <span
                    key={c.id}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                      active ? "border-primary bg-primary/10" : "border-border bg-background/60"
                    }`}
                  >
                    <button
                      onClick={() => setFocusedTile(c.id)}
                      className="flex items-center gap-1.5"
                      title="Focus this tile on this device only"
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                      {m.short} · {c.label ?? c.handle}
                    </button>
                    {(!c.remote || canManage) && (
                      <button
                        onClick={() => void removeChannel(c)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-center text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-1 flex-col lg:flex-row">
        {showVideo && (
          <div className="flex-1 p-4">
            {loading ? (
              <p className="mt-20 text-center text-sm text-muted-foreground">Joining room…</p>
            ) : visibleTiles.length === 0 ? (
              <EmptyState
                onCamera={() => setCameraOpen(true)}
                onSolo={() => navigate({ to: "/hub" })}
              />
            ) : (
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(visibleTiles.length, 2)}, minmax(0, 1fr))`,
                }}
              >
                {visibleTiles.map((c) =>
                  c.platform === "camera" ? (
                    <CameraTile key={c.id} channel={c} />
                  ) : (
                    <StreamTile key={c.id} channel={c} />
                  ),
                )}
              </div>
            )}
          </div>
        )}

        {showChat && (
          <aside
            className={`flex w-full flex-col border-t border-border/60 bg-card/40 ${
              showVideo ? "lg:w-96 lg:border-l lg:border-t-0" : "flex-1"
            }`}
          >
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
              style={{ maxHeight: showVideo ? "70vh" : undefined }}
            >
              {filtered.length === 0 ? (
                <p className="mt-8 text-center text-xs text-muted-foreground">
                  {remoteChannels.some((c) => c.platform === "twitch")
                    ? "Waiting for the first message…"
                    : "Add a Twitch channel to see live merged chat."}
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
              Synced live · Layout is per-device
            </div>
          </aside>
        )}
      </div>

      {cameraOpen && (
        <CameraPicker onClose={() => setCameraOpen(false)} onPick={addCamera} />
      )}
    </div>
  );
}

function EmptyState({ onCamera, onSolo }: { onCamera: () => void; onSolo: () => void }) {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
      <div>
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Radio className="h-5 w-5" />
        </div>
        <h3 className="font-display text-lg font-semibold">Empty room</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {"The room owner can add a channel, and every joined device will pick it up in real time. Share the link to pair a phone, tablet or TV."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={onCamera}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Camera className="h-4 w-4" /> Connect camera
          </button>
          <button
            onClick={onSolo}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          >
            Solo hub instead
          </button>
        </div>
      </div>
    </div>
  );
}

function StreamTile({ channel }: { channel: LocalChannel }) {
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

function CameraTile({ channel }: { channel: LocalChannel }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">Connect a camera</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Camera streams stay on this device only — they aren't shared to other devices in the room.
        </p>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Requesting camera access…</p>
        ) : err ? (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{err}</p>
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
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
