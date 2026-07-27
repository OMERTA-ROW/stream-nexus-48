// Browser-side live chat adapters.
// Twitch: anonymous IRC over WebSocket (no auth required to read).
// Kick / YouTube / TikTok: placeholders for now (require backend / API keys /
// unofficial scrapers — wired up in later phases).

export type Platform = "twitch" | "youtube" | "kick" | "tiktok" | "facebook" | "snapchat" | "streamlabs";

export type ConnectionStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "failed"
  | "closed";

export interface ConnectionState {
  status: ConnectionStatus;
  retry: number;
  lastMessageAt?: number;
  reason?: string;
}

export interface ChatMessage {
  id: string;
  platform: Platform;
  channel: string;
  author: string;
  color?: string;
  text: string;
  ts: number;
}

export interface ChatSource {
  close: () => void;
  reconnect: () => void;
}

type MessageHandler = (m: ChatMessage) => void;
type StatusHandler = (s: ConnectionState) => void;

function parseIrcTags(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split(";")) {
    const [k, v = ""] = pair.split("=");
    out[k] = v;
  }
  return out;
}

function parseTwitchLine(line: string, channel: string): ChatMessage | null {
  if (!line) return null;
  let rest = line;
  let tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const sp = rest.indexOf(" ");
    tags = parseIrcTags(rest.slice(1, sp));
    rest = rest.slice(sp + 1);
  }
  let prefix = "";
  if (rest.startsWith(":")) {
    const sp = rest.indexOf(" ");
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  const parts = rest.split(" ");
  const command = parts[0];
  if (command !== "PRIVMSG") return null;
  const msgIdx = rest.indexOf(" :");
  if (msgIdx === -1) return null;
  const text = rest.slice(msgIdx + 2);
  const author = tags["display-name"] || prefix.split("!")[0] || "anon";
  return {
    id: tags["id"] || `${Date.now()}-${Math.random()}`,
    platform: "twitch",
    channel,
    author,
    color: tags["color"] || undefined,
    text,
    ts: Date.now(),
  };
}

export function connectTwitch(
  channel: string,
  onMessage: MessageHandler,
  onStatus?: StatusHandler,
): ChatSource {
  const chan = channel.toLowerCase().replace(/^#/, "").trim();
  if (!chan) return { close: () => {}, reconnect: () => {} };
  let closed = false;
  let ws: WebSocket | null = null;
  let retry = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let lastMessageAt: number | undefined;

  const emit = (status: ConnectionStatus, reason?: string) => {
    onStatus?.({ status, retry, lastMessageAt, reason });
  };

  const open = () => {
    if (closed) return;
    emit(retry === 0 ? "connecting" : "reconnecting");
    try {
      ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    } catch (e) {
      emit("failed", e instanceof Error ? e.message : "socket error");
      scheduleRetry();
      return;
    }
    ws.onopen = () => {
      retry = 0;
      ws?.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws?.send(`NICK justinfan${Math.floor(Math.random() * 100000)}`);
      ws?.send(`JOIN #${chan}`);
      emit("live");
    };
    ws.onmessage = (ev) => {
      const data = String(ev.data);
      for (const line of data.split("\r\n")) {
        if (!line) continue;
        if (line.startsWith("PING")) {
          ws?.send(line.replace("PING", "PONG"));
          continue;
        }
        const msg = parseTwitchLine(line, chan);
        if (msg) {
          lastMessageAt = msg.ts;
          emit("live");
          onMessage(msg);
        }
      }
    };
    ws.onclose = () => {
      if (closed) return;
      scheduleRetry();
    };
    ws.onerror = () => {
      emit("reconnecting", "socket error");
      ws?.close();
    };
  };

  const scheduleRetry = () => {
    if (closed) return;
    retry++;
    emit(retry > 5 ? "failed" : "reconnecting");
    const delay = Math.min(1000 * 2 ** Math.min(retry, 4), 15000);
    retryTimer = setTimeout(open, delay);
  };

  open();

  return {
    close: () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
      emit("closed");
    },
    reconnect: () => {
      if (closed) return;
      retry = 0;
      if (retryTimer) clearTimeout(retryTimer);
      try { ws?.close(); } catch { /* ignore */ }
      open();
    },
  };
}
