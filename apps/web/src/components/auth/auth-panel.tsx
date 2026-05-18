"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Home, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "sign-in" | "sign-up";

type AuthPanelProps = {
  isConfigured: boolean;
};

export function AuthPanel({ isConfigured }: AuthPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [homeName, setHomeName] = useState("My Home");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");

    if (!isConfigured) {
      setNotice("Add the Supabase environment values before using auth.");
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
        setNotice(error.message);
        setIsSubmitting(false);
        return;
      }

      setNotice("Account created. Check your email if confirmation is enabled.");
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setNotice(error.message);
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
      </div>

      <form className="authForm" onSubmit={handleSubmit}>
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
          <div>
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </div>
        </label>

        {notice ? <p className="formNotice">{notice}</p> : null}

        <button className="button darkButton fullWidth" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="spin" size={18} aria-hidden="true" /> : null}
          {mode === "sign-up" ? "Create account" : "Sign in"}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
