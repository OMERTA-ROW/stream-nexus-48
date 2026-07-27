import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  beginStreamlabsAuth,
  getStreamlabsStatus,
  disconnectStreamlabs,
} from "@/lib/streamlabs.functions";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account — OmniCast" },
      { name: "description", content: "Manage your OmniCast account and linked streaming platforms." },
    ],
  }),
  component: AccountPage,
});

type Status = Awaited<ReturnType<typeof getStreamlabsStatus>>;

function AccountPage() {
  const navigate = useNavigate();
  const begin = useServerFn(beginStreamlabsAuth);
  const status = useServerFn(getStreamlabsStatus);
  const disconnect = useServerFn(disconnectStreamlabs);

  const [email, setEmail] = useState<string | null>(null);
  const [sl, setSl] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const s = await status();
      setSl(s);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await begin({ data: { origin: window.location.origin } });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start Streamlabs auth");
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      await disconnect();
      await refresh();
      toast.success("Streamlabs disconnected");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const linked = sl?.connected ? sl.linkedPlatforms ?? [] : [];

  const goToHubWithLinks = () => {
    if (!linked.length) {
      navigate({ to: "/hub" });
      return;
    }
    const params = new URLSearchParams();
    for (const c of linked) params.append("add", `${c.platform}:${c.handle}`);
    navigate({ to: "/hub", search: Object.fromEntries(params) as never });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="font-semibold">OmniCast</Link>
          <div className="flex gap-2 text-sm">
            <Link to="/hub" className="text-muted-foreground hover:text-foreground">Hub</Link>
            <button onClick={signOut} className="text-muted-foreground hover:text-foreground">Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        <section>
          <h1 className="text-2xl font-semibold">Account</h1>
          <p className="text-sm text-muted-foreground mt-1">{email}</p>
        </section>

        <section className="rounded-lg border border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Streamlabs</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Link Streamlabs to auto-load your Twitch/YouTube/Facebook channels into the hub and stream your merged chat into one feed.
              </p>
            </div>
            <span
              className="text-xs px-2 py-1 rounded-full border"
              style={{
                borderColor: sl?.connected ? "var(--color-streamlabs)" : "hsl(var(--border))",
                color: sl?.connected ? "var(--color-streamlabs)" : "hsl(var(--muted-foreground))",
              }}
            >
              {sl?.connected ? "Connected" : "Not connected"}
            </span>
          </div>

          {sl?.connected ? (
            <div className="mt-4 space-y-3">
              <div className="text-sm">
                <span className="text-muted-foreground">Account:</span>{" "}
                <span className="font-medium">{sl.displayName ?? "Streamlabs user"}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Detected platforms:</span>{" "}
                {linked.length ? (
                  <span className="font-medium">
                    {linked.map((l) => `${l.platform}:${l.handle}`).join(", ")}
                  </span>
                ) : (
                  <span className="italic text-muted-foreground">none — link Twitch/YouTube/Facebook in Streamlabs first</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={goToHubWithLinks}>Open hub with these channels</Button>
                <Button variant="outline" onClick={connect} disabled={busy}>Refresh link</Button>
                <Button variant="ghost" onClick={unlink} disabled={busy}>Disconnect</Button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <Button onClick={connect} disabled={busy}>
                {busy ? "Opening Streamlabs…" : "Connect Streamlabs"}
              </Button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
