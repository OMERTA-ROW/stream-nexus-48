import { createFileRoute } from "@tanstack/react-router";

const TOKEN_URL = "https://streamlabs.com/api/v2.0/token";
const USER_URL = "https://streamlabs.com/api/v2.0/user";
const SOCKET_TOKEN_URL = "https://streamlabs.com/api/v2.0/socket/token";

type TokenResp = { access_token: string; refresh_token?: string; expires_in?: number };
type UserResp = {
  streamlabs?: { id?: number | string; display_name?: string };
  twitch?: { name?: string };
  youtube?: { title?: string; id?: string };
  facebook?: { name?: string };
};

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Streamlabs</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{max-width:420px;padding:32px;background:#141414;border:1px solid #262626;border-radius:12px;text-align:center}a{color:#fb923c}</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/streamlabs/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        if (error) return html(`<h2>Streamlabs said no</h2><p>${error}</p><p><a href="/account">Back</a></p>`, 400);
        if (!code || !state) return html(`<h2>Missing code</h2><p><a href="/account">Back</a></p>`, 400);

        const userId = state.split(".")[0];
        if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return html("<h2>Bad state</h2>", 400);

        const clientId = process.env.STREAMLABS_CLIENT_ID;
        const clientSecret = process.env.STREAMLABS_CLIENT_SECRET;
        if (!clientId || !clientSecret) return html("<h2>Streamlabs not configured</h2>", 500);

        const redirectUri = `${url.origin}/api/public/streamlabs/callback`;

        // 1. Exchange code for tokens.
        const tokenRes = await fetch(TOKEN_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code,
          }),
        });
        if (!tokenRes.ok) {
          const body = await tokenRes.text();
          console.error("streamlabs token exchange failed", tokenRes.status, body);
          return html(`<h2>Token exchange failed</h2><pre>${body.slice(0, 300)}</pre>`, 502);
        }
        const tokens = (await tokenRes.json()) as TokenResp;

        // 2. Fetch profile + linked platforms.
        const userRes = await fetch(`${USER_URL}?access_token=${encodeURIComponent(tokens.access_token)}`);
        const user = (userRes.ok ? await userRes.json() : {}) as UserResp;
        const linked: Array<{ platform: string; handle: string }> = [];
        if (user.twitch?.name) linked.push({ platform: "twitch", handle: user.twitch.name });
        if (user.youtube?.id || user.youtube?.title) linked.push({ platform: "youtube", handle: user.youtube.id ?? user.youtube.title! });
        if (user.facebook?.name) linked.push({ platform: "facebook", handle: user.facebook.name });

        // 3. Fetch a socket token for the merged chat feed.
        const socketRes = await fetch(`${SOCKET_TOKEN_URL}?access_token=${encodeURIComponent(tokens.access_token)}`);
        const socketJson = socketRes.ok ? ((await socketRes.json()) as { socket_token?: string }) : {};

        const { encryptToken } = await import("@/lib/streamlabs-crypto.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;

        const { error: upsertError } = await supabaseAdmin.from("streamlabs_connections").upsert(
          {
            user_id: userId,
            streamlabs_user_id: user.streamlabs?.id != null ? String(user.streamlabs.id) : null,
            streamlabs_display_name: user.streamlabs?.display_name ?? null,
            access_token_ciphertext: encryptToken(tokens.access_token),
            refresh_token_ciphertext: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
            socket_token_ciphertext: socketJson.socket_token ? encryptToken(socketJson.socket_token) : null,
            expires_at: expiresAt,
            linked_platforms: linked,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
        if (upsertError) {
          console.error("streamlabs upsert failed", upsertError);
          return html("<h2>Could not save connection</h2>", 500);
        }

        return html(
          `<h2>Streamlabs connected</h2><p>${linked.length ? `Found ${linked.length} linked platform${linked.length === 1 ? "" : "s"}.` : "No linked platforms detected."}</p><p><a href="/account">Continue</a></p>`,
        );
      },
    },
  },
});
