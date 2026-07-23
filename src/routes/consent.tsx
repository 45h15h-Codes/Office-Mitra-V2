import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getActiveConsentVersionServerFn,
  recordConsentServerFn,
} from "@/lib/consent/consent.function";
import {
  Camera,
  Activity,
  AppWindow,
  ShieldCheck,
  ShieldOff,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/consent")({
  component: ConsentPage,
});

const CAPTURED = [
  {
    icon: Camera,
    label: "Periodic screenshots",
    detail: "Full-screen image captured at configured interval. Compressed to JPEG.",
  },
  {
    icon: AppWindow,
    label: "Active app & Main Website Domain",
    detail:
      "Which application or main website domain is in focus to measure productivity without recording exact full URL addresses.",
  },
  {
    icon: Activity,
    label: "Activity counts",
    detail: "Mouse move samples, mouse clicks, and keypress COUNT per minute. No key content ever.",
  },
];

const NOT_CAPTURED = [
  "Exact full URL addresses (e.g. private query params or specific chat paths are not read)",
  "Keystroke content — what you actually type is never recorded",
  "Screenshots or tracking while a blacklisted app is in focus",
  "Any data outside your configured working hours",
];

function ConsentPage() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["active-consent-policy"],
    queryFn: () => getActiveConsentVersionServerFn(),
  });

  const recordMutation = useMutation({
    mutationFn: (consentVersionId: string) => recordConsentServerFn({ data: { consentVersionId } }),
    onSuccess: (res) => {
      if (res.ok) {
        setDone(true);
        setTimeout(() => {
          navigate({ to: "/" });
        }, 1500);
      } else {
        setErrorMsg(res.error);
      }
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to record consent.");
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const consentVersion = data?.ok ? data.consentVersion : null;

  const handleAccept = () => {
    if (!consentVersion) return;
    setErrorMsg("");
    recordMutation.mutate(consentVersion.id);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6 py-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <ShieldCheck className="h-4 w-4" /> Monitoring Transparency Policy v{consentVersion?.version || "1.0"}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Workplace Transparency Consent</h1>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Review the monitoring parameters below to activate your session.
          </p>
        </div>

        {errorMsg && (
          <div className="p-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md font-medium">
            {errorMsg}
          </div>
        )}

        {done ? (
          <Card className="p-8 text-center space-y-3 bg-card border-border">
            <CheckCircle2 className="h-12 w-12 text-[oklch(0.68_0.16_155)] mx-auto" />
            <h2 className="text-xl font-semibold">Consent Recorded</h2>
            <p className="text-sm text-muted-foreground">Redirecting you to the application dashboard...</p>
          </Card>
        ) : (
          <Card className="p-6 space-y-6 bg-card border-border shadow-lg">
            {consentVersion && (
              <div className="p-4 bg-muted/40 rounded-lg text-sm text-muted-foreground leading-relaxed border border-border">
                {consentVersion.policyText}
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-[oklch(0.68_0.16_155)]" /> What IS Monitored
              </h3>
              <div className="grid gap-3">
                {CAPTURED.map((item, idx) => (
                  <div key={idx} className="flex gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
                    <item.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-foreground">{item.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <ShieldOff className="h-4 w-4 text-destructive" /> What is NEVER Monitored
              </h3>
              <ul className="space-y-1.5 list-disc list-inside text-xs text-muted-foreground pl-1">
                {NOT_CAPTURED.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="pt-4 border-t border-border space-y-4">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="consent-check"
                  checked={checked}
                  onCheckedChange={(c) => setChecked(Boolean(c))}
                />
                <Label htmlFor="consent-check" className="text-xs text-muted-foreground leading-normal cursor-pointer">
                  I have read and agree to the Monitoring Transparency Policy (v{consentVersion?.version}).
                </Label>
              </div>

              <Button
                onClick={handleAccept}
                disabled={!checked || recordMutation.isPending}
                className="w-full"
              >
                {recordMutation.isPending ? "Recording consent..." : "I Accept Policy & Continue"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
