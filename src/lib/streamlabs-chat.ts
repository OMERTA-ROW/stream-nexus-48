import { io, type Socket } from "socket.io-client";
import type { ChatMessage, ConnectionState } from "./chat-sources";

// Subscribe to a Streamlabs socket.io feed. Emits merged chat + tip/follow events.
export function connectStreamlabs(
  socketToken: string,
  onMessage: (m: ChatMessage) => void,
  onStatus: (s: ConnectionState) => void,
) {
  let closed = false;
  onStatus({ status: "connecting", retries: 0, lastMessageAt: null });

  const socket: Socket = io(`https://sockets.streamlabs.com?token=${encodeURIComponent(socketToken)}`, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
  });

  let retries = 0;
  let lastMessageAt: number | null = null;

  socket.on("connect", () => {
    retries = 0;
    onStatus({ status: "live", retries, lastMessageAt });
  });
  socket.on("disconnect", () => {
    if (closed) return;
    onStatus({ status: "connecting", retries: ++retries, lastMessageAt });
  });
  socket.on("connect_error", () => {
    if (closed) return;
    onStatus({ status: "failed", retries: ++retries, lastMessageAt });
  });

  socket.on("event", (payload: { type?: string; for?: string; message?: unknown[] }) => {
    if (!payload || !Array.isArray(payload.message)) return;
    const platform = (payload.for as string | undefined) ?? "streamlabs";
    for (const raw of payload.message) {
      const item = raw as Record<string, unknown>;
      const text =
        (item.message as string) ??
        (item.raw_message as string) ??
        (item.formatted_amount ? `Tipped ${item.formatted_amount}` : "") ??
        "";
      const user =
        (item.from as string) ??
        (item.name as string) ??
        (item.display_name as string) ??
        (item.username as string) ??
        "streamlabs";
      if (!text) continue;
      const id = String(item._id ?? item.id ?? `${Date.now()}-${Math.random()}`);
      onMessage({
        id: `sl-${id}`,
        platform: "streamlabs",
        channel: platform,
        user: String(user),
        text: String(text),
        ts: Date.now(),
      });
      lastMessageAt = Date.now();
    }
  });

  return () => {
    closed = true;
    socket.close();
    onStatus({ status: "idle", retries: 0, lastMessageAt });
  };
}
