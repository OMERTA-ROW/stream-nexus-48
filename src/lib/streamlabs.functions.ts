import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AUTH_URL = "https://streamlabs.com/api/v2.0/authorize";

// Build the URL the browser should redirect to in order to start Streamlabs OAuth.
export const beginStreamlabsAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { origin: string }) => input)
  .handler(async ({ data, context }) => {
    const clientId = process.env.STREAMLABS_CLIENT_ID;
    if (!clientId) {
      throw new Error("Streamlabs is not configured yet. Ask the site owner to add STREAMLABS_CLIENT_ID.");
    }
    const redirect = `${data.origin.replace(/\/$/, "")}/api/public/streamlabs/callback`;
    // Streamlabs uses `state` as an opaque round-trip value; we sign it lightly with the user id.
    const state = `${context.userId}.${crypto.randomUUID()}`;
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "socket.token alerts.read points.read donations.read");
    url.searchParams.set("state", state);
    return { url: url.toString(), state };
  });

// Return the current user's Streamlabs connection status + a socket.io URL the browser can use for chat.
export const getStreamlabsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("streamlabs_connections")
      .select("streamlabs_display_name, linked_platforms, socket_token_ciphertext, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { connected: false as const };
    const { decryptToken } = await import("./streamlabs-crypto.server");
    let socketToken: string | null = null;
    try {
      socketToken = data.socket_token_ciphertext ? decryptToken(data.socket_token_ciphertext) : null;
    } catch {
      socketToken = null;
    }
    return {
      connected: true as const,
      displayName: data.streamlabs_display_name,
      linkedPlatforms: (data.linked_platforms ?? []) as Array<{ platform: string; handle: string }>,
      socketToken,
      updatedAt: data.updated_at,
    };
  });

export const disconnectStreamlabs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("streamlabs_connections").delete().eq("user_id", context.userId);
    return { ok: true };
  });
