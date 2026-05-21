"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Home,
  Loader2,
  LockKeyhole,
  Mail,
  RadioTower,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/app/toast-provider";

type AuthMode = "sign-in" | "sign-up";

type AuthPanelProps = {
  isConfigured: boolean;
};

const authBenefits = [
  {
    icon: ShieldCheck,
    label: "Account-bound homes",
  },
  {
    icon: RadioTower,
    label: "Realtime device bridge",
  },
  {
    icon: CheckCircle2,
    label: "Traceable command status",
  },
];

export function AuthPanel({ isConfigured }: AuthPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [homeName, setHomeName] = useState("My Home");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { addToast } = useToast();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isConfigured) {
      addToast("Add the Supabase environment values before using auth.", "error");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    if (mode === "sign-up") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: fullName,
            home_name: homeName,
          },
        },
      });

      if (error) {
        addToast(error.message, "error");
        setIsSubmitting(false);
        return;
      }

      addToast("Account created. Check your email if confirmation is enabled.", "success");
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      addToast(error.message, "error");
      setIsSubmitting(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <section className="authShell">
      <div className="authVisual">
        <Link className="brand authBrand" href="/">
          <span className="brandMark">
            <Home size={19} aria-hidden="true" />
          </span>
          HomeLynk
        </Link>
        <div>
          <p className="eyebrow">Secure control access</p>
          <h1>{mode === "sign-up" ? "Create your home hub." : "Welcome back."}</h1>
          <p>
            Pair a user account with a specific ESP32, then manage appliances
            with live feedback and traceable command status.
          </p>
        </div>
        <div className="authBenefitGrid" aria-label="Authentication benefits">
          {authBenefits.map((benefit) => {
            const Icon = benefit.icon;

            return (
              <div key={benefit.label}>
                <Icon size={16} aria-hidden="true" />
                <span>{benefit.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <form className="authForm" onSubmit={handleSubmit}>
        <div className="authFormHeader">
          <p className="eyebrow muted">Home access</p>
          <h2>{mode === "sign-up" ? "Set up your control account" : "Sign in to your control hub"}</h2>
        </div>

        <div className="segmented" aria-label="Authentication mode">
          <button
            type="button"
            className={mode === "sign-in" ? "active" : ""}
            onClick={() => setMode("sign-in")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "sign-up" ? "active" : ""}
            onClick={() => setMode("sign-up")}
          >
            Create account
          </button>
        </div>

        {mode === "sign-up" ? (
          <>
            <label className="field">
              <span>Full name</span>
              <div>
                <UserRound size={18} aria-hidden="true" />
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  required
                />
              </div>
            </label>
            <label className="field">
              <span>Home name</span>
              <div>
                <Home size={18} aria-hidden="true" />
                <input
                  value={homeName}
                  onChange={(event) => setHomeName(event.target.value)}
                  placeholder="Main residence"
                  required
                />
              </div>
            </label>
          </>
        ) : null}

        <label className="field">
          <span>Email</span>
          <div>
            <Mail size={18} aria-hidden="true" />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
              required
            />
          </div>
        </label>

        <label className="field">
          <span>Password</span>
          <div className="passwordField">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
            <button
              type="button"
              className="passwordToggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
        </label>

        <button className="button darkButton fullWidth" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="spin" size={18} aria-hidden="true" /> : null}
          {mode === "sign-up" ? "Create account" : "Sign in"}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
