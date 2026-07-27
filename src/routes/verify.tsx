import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Status = "checking" | "verified" | "pending" | "signedout" | "error";

export const Route = createFileRoute("/verify")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Verify your account — OmniCast" },
      { name: "description", content: "Confirm your email to activate your OmniCast account." },
      { property: "og:title", content: "Verify your account — OmniCast" },
      { property: "og:description", content: "Confirm your email to activate your OmniCast account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setStatus("checking");
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      setStatus("signedout");
      return;
    }
    setEmail(data.user.email ?? "");
    setResendEmail(data.user.email ?? "");
    const confirmed = Boolean(
      data.user.email_confirmed_at ?? (data.user as { confirmed_at?: string }).confirmed_at,
    );
    setStatus(confirmed ? "verified" : "pending");
  };

  useEffect(() => {
    void check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => void check());
    return () => sub.subscription.unsubscribe();
  }, []);

  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: resendEmail,
        options: { emailRedirectTo: `${window.location.origin}/verify` },
      });
      if (error) throw error;
      toast.success("Verification email sent. Check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend email");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← OmniCast</Link>
          <h1 className="mt-2 text-2xl font-semibold">Account verification</h1>
        </div>

        {status === "checking" && (
          <p className="text-center text-sm text-muted-foreground">Checking your status…</p>
        )}

        {status === "verified" && (
          <div className="rounded-lg border border-border bg-card p-6 space-y-4 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary text-xl">✓</div>
            <div>
              <p className="font-medium">You're verified</p>
              <p className="text-sm text-muted-foreground mt-1">{email}</p>
            </div>
            <div className="flex justify-center gap-2">
              <Button onClick={() => navigate({ to: "/account" })}>Go to account</Button>
              <Button variant="outline" onClick={() => navigate({ to: "/hub" })}>Open hub</Button>
            </div>
          </div>
        )}

        {status === "pending" && (
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div>
              <p className="font-medium">Confirm your email</p>
              <p className="text-sm text-muted-foreground mt-1">
                We sent a verification link to <span className="text-foreground">{email}</span>. Click it to activate your account, then return here.
              </p>
            </div>
            <form onSubmit={resend} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="resend">Resend to</Label>
                <Input id="resend" type="email" required value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>Resend email</Button>
                <Button type="button" variant="outline" onClick={() => void check()} disabled={busy}>
                  I've verified — refresh
                </Button>
              </div>
            </form>
          </div>
        )}

        {status === "signedout" && (
          <div className="rounded-lg border border-border bg-card p-6 space-y-4 text-center">
            <p className="text-sm text-muted-foreground">You're not signed in. Sign in to check your verification status or resend the email.</p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => navigate({ to: "/auth" })}>Sign in</Button>
            </div>
          </div>
        )}

        {status === "error" && (
          <p className="text-center text-sm text-destructive">Something went wrong. Try again.</p>
        )}
      </div>
    </div>
  );
}
