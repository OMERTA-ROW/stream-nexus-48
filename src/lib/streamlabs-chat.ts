import { io, type Socket } from "socket.io-client";
import type { ChatMessage, ChatSource, ConnectionState, ConnectionStatus } from "./chat-sources";

// Subscribe to a Streamlabs socket.io feed. Emits merged chat + tip/follow events.
export function connectStreamlabs(
  socketToken: string,
  onMessage: (m: ChatMessage) => void,
  onStatus?: (s: ConnectionState) => void,
): ChatSource {
  let closed = false;
  let retry = 0;
  let lastMessageAt: number | undefined;

  const emit = (status: ConnectionStatus, reason?: string) =>
    onStatus?.({ status, retry, lastMessageAt, reason });

  emit("connecting");

  const socket: Socket = io(`https://sockets.streamlabs.com?token=${encodeURIComponent(socketToken)}`, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
  });

  socket.on("connect", () => {
    retry = 0;
    emit("live");
  });
  socket.on("disconnect", () => {
    if (closed) return;
    retry++;
    emit("reconnecting");
  });
  socket.on("connect_error", (err: Error) => {
    if (closed) return;
    retry++;
    emit(retry > 5 ? "failed" : "reconnecting", err?.message);
  });

  socket.on("event", (payload: { type?: string; for?: string; message?: unknown[] }) => {
    if (!payload || !Array.isArray(payload.message)) return;
    const src = (payload.for as string | undefined) ?? "streamlabs";
    for (const raw of payload.message) {
      const item = raw as Record<string, unknown>;
      const text =
        (item.message as string | undefined) ??
        (item.raw_message as string | undefined) ??
        (item.formatted_amount ? `Tipped ${String(item.formatted_amount)}` : "");
      const author =
        (item.from as string | undefined) ??
        (item.name as string | undefined) ??
        (item.display_name as string | undefined) ??
        (item.username as string | undefined) ??
        "streamlabs";
      if (!text) continue;
      const id = String(item._id ?? item.id ?? `${Date.now()}-${Math.random()}`);
      const ts = Date.now();
      lastMessageAt = ts;
      onMessage({
        id: `sl-${id}`,
        platform: "streamlabs",
        channel: src,
        author: String(author),
        text: String(text),
        ts,
      });
    }
  });

  return {
    close: () => {
      closed = true;
      socket.close();
      emit("closed");
    },
    reconnect: () => {
      if (closed) return;
      retry = 0;
      socket.disconnect();
      socket.connect();
    },
  };
}
