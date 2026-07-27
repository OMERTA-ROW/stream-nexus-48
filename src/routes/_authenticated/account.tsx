import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account — OmniCast" },
      { name: "description", content: "Manage your OmniCast account and your saved streaming channels." },
    ],
  }),
  component: AccountPage,
});

const PLATFORMS = [
  "twitch",
  "youtube",
  "kick",
  "tiktok",
  "facebook",
  "snapchat",
  "streamlabs",
] as const;
type Platform = (typeof PLATFORMS)[number];

interface Row {
  id: string;
  platform: Platform;
  handle: string;
}

function AccountPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [platform, setPlatform] = useState<Platform>("twitch");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<string>("free");
  const [lifetime, setLifetime] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const refresh = async () => {
    const { data, error } = await supabase
      .from("user_channels")
      .select("id, platform, handle")
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as Row[]);
  };

  const refreshEntitlement = async () => {
    const { data } = await supabase
      .from("entitlements")
      .select("plan, lifetime")
      .maybeSingle();
    if (data) {
      setPlan(data.plan);
      setLifetime(data.lifetime);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    void refresh();
    void refreshEntitlement();
  }, []);

  const redeem = async () => {
    const code = coupon.trim();
    if (!code) return;
    setRedeeming(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setRedeeming(false);
      return;
    }
    const { data: c, error: ce } = await supabase
      .from("coupon_codes")
      .select("code, plan, lifetime")
      .eq("code", code)
      .maybeSingle();
    if (ce || !c) {
      setRedeeming(false);
      toast.error("Invalid coupon code.");
      return;
    }
    const { error } = await supabase.from("entitlements").upsert({
      user_id: u.user.id,
      plan: c.plan,
      lifetime: c.lifetime,
      source: "coupon",
      redeemed_code: c.code,
    });
    setRedeeming(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCoupon("");
    toast.success(`Redeemed — ${c.plan}${c.lifetime ? " (lifetime)" : ""} unlocked!`);
    await refreshEntitlement();
  };

  const add = async () => {
    const h = handle.trim();
    if (!h) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("user_channels").insert({
      user_id: u.user.id,
      platform,
      handle: h,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "That channel is already saved." : error.message);
      return;
    }
    setHandle("");
    toast.success("Channel saved");
    await refresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("user_channels").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="font-semibold">OmniCast</Link>
          <div className="flex gap-3 text-sm">
            <Link to="/hub" className="text-muted-foreground hover:text-foreground">Hub</Link>
            <button onClick={signOut} className="text-muted-foreground hover:text-foreground">Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        <section>
          <h1 className="text-2xl font-semibold">Account</h1>
          <p className="text-sm text-muted-foreground mt-1">{email}</p>
          <p className="text-xs mt-2">
            Plan: <span className="uppercase font-semibold text-primary">{plan}</span>
            {lifetime && <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-primary">Lifetime</span>}
          </p>
        </section>

        <section className="rounded-lg border border-border p-5">
          <h2 className="font-semibold">Redeem a coupon</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Have a code? Enter it to unlock a plan.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && redeem()}
              placeholder="Enter coupon code"
              className="flex-1 min-w-[220px] rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
            />
            <Button onClick={redeem} disabled={redeeming || !coupon.trim()}>
              {redeeming ? "Redeeming…" : "Redeem"}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border p-5">
          <h2 className="font-semibold">Your channels</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Save the platform handles you want to watch. They'll auto-load in the hub on every device you sign into.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="channel handle (e.g. shroud)"
              className="flex-1 min-w-[200px] rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <Button onClick={add} disabled={busy || !handle.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          <ul className="mt-5 divide-y divide-border rounded-md border border-border">
            {rows.length === 0 && (
              <li className="px-4 py-6 text-sm text-muted-foreground text-center">No channels saved yet.</li>
            )}
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3">
                <div className="text-sm">
                  <span className="uppercase text-xs text-muted-foreground mr-2">{r.platform}</span>
                  <span className="font-medium">{r.handle}</span>
                </div>
                <button
                  onClick={() => remove(r.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${r.handle}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate({ to: "/hub" })}>
              Open hub
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
