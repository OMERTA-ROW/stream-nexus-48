// Browser-side live chat adapters.
// Twitch: anonymous IRC over WebSocket (no auth required to read).
// Kick / YouTube / TikTok: placeholders for now (require backend / API keys /
// unofficial scrapers — wired up in later phases).

export type Platform = "twitch" | "youtube" | "kick" | "tiktok";

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
}

type Handler = (m: ChatMessage) => void;

function parseIrcTags(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split(";")) {
    const [k, v = ""] = pair.split("=");
    out[k] = v;
  }
  return out;
}

// Parse a single IRC line from Twitch. Returns null if it's not a chat message.
function parseTwitchLine(line: string, channel: string): ChatMessage | null {
  if (!line) return null;
  let rest = line;
  let tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const sp = rest.indexOf(" ");
    tags = parseIrcTags(rest.slice(1, sp));
    rest = rest.slice(sp + 1);
  }
  // prefix
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

export function connectTwitch(channel: string, onMessage: Handler): ChatSource {
  const chan = channel.toLowerCase().replace(/^#/, "").trim();
  if (!chan) return { close: () => {} };
  let closed = false;
  let ws: WebSocket | null = null;
  let retry = 0;

  const open = () => {
    if (closed) return;
    ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    ws.onopen = () => {
      retry = 0;
      ws?.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws?.send(`NICK justinfan${Math.floor(Math.random() * 100000)}`);
      ws?.send(`JOIN #${chan}`);
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
        if (msg) onMessage(msg);
      }
    };
    ws.onclose = () => {
      if (closed) return;
      const delay = Math.min(1000 * 2 ** retry++, 15000);
      setTimeout(open, delay);
    };
    ws.onerror = () => ws?.close();
  };
  open();

  return {
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}
