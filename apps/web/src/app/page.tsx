import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Cpu,
  Gauge,
  Home as HomeIcon,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: RadioTower,
    title: "Realtime command loop",
    text: "Every tap moves through delivery, acknowledgement, and completion states so the interface reflects what the ESP32 actually did.",
  },
  {
    icon: ShieldCheck,
    title: "Device-bound access",
    text: "Each home receives a unique device identity and pairing code, keeping control scoped to the right account and hardware unit.",
  },
  {
    icon: Gauge,
    title: "Low-latency dashboard",
    text: "A responsive PWA surface gives users quick controls, device health, room context, and live feedback from one installable app.",
  },
];

const steps = [
  "Create a HomeLynk account",
  "Pair the ESP32 with the generated device code",
  "Control rooms, appliances, schedules, and scenes",
];

export default function Home() {
  return (
    <main className="site">
      <section className="hero">
        <nav className="nav">
          <Link className="brand" href="/">
            <span className="brandMark">
              <HomeIcon size={19} aria-hidden="true" />
            </span>
            HomeLynk
          </Link>
          <div className="navLinks">
            <a href="#system">System</a>
            <a href="#experience">Experience</a>
            <Link href="/auth">Sign in</Link>
          </div>
        </nav>

        <div className="heroContent">
          <p className="eyebrow">
            <Sparkles size={16} aria-hidden="true" />
            ESP32-powered home automation
          </p>
          <h1>HomeLynk</h1>
          <p className="heroCopy">
            A secure web and PWA control layer for appliances, room scenes, and
            live device feedback across connected homes.
          </p>
          <div className="heroActions">
            <Link className="button primaryButton" href="/auth">
              Start control hub
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="button glassButton" href="/dashboard">
              View dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="statusBand" aria-label="Product status highlights">
        <div>
          <span>Command target</span>
          <strong>&lt; 150 ms UI response</strong>
        </div>
        <div>
          <span>Device link</span>
          <strong>WebSocket + signed pairing</strong>
        </div>
        <div>
          <span>Install mode</span>
          <strong>Next.js PWA</strong>
        </div>
      </section>

      <section className="section" id="system">
        <div className="sectionHeader">
          <p className="eyebrow muted">
            <Cpu size={16} aria-hidden="true" />
            Architecture
          </p>
          <h2>Built around reliable device communication.</h2>
          <p>
            The web app, realtime server, Supabase Postgres database, and ESP32
            firmware speak through a command protocol that is explicit about
            device presence and execution state.
          </p>
        </div>

        <div className="flowGrid">
          <article className="flowItem">
            <Zap size={22} aria-hidden="true" />
            <h3>User command</h3>
            <p>Dashboard applies an optimistic state and emits a signed command.</p>
          </article>
          <article className="flowItem">
            <RadioTower size={22} aria-hidden="true" />
            <h3>Realtime router</h3>
            <p>WebSocket service validates ownership and forwards to the ESP32.</p>
          </article>
          <article className="flowItem">
            <Activity size={22} aria-hidden="true" />
            <h3>Device response</h3>
            <p>ESP32 acknowledges, reports telemetry, and the UI reconciles state.</p>
          </article>
        </div>
      </section>

      <section className="section splitSection" id="experience">
        <div className="sectionHeader compact">
          <p className="eyebrow muted">
            <LockKeyhole size={16} aria-hidden="true" />
            Product experience
          </p>
          <h2>Fast controls without hiding device truth.</h2>
          <p>
            Users see responsive switches immediately, while command status,
            online presence, and device logs make the system transparent when
            Wi-Fi or hardware is slow.
          </p>
        </div>
        <div className="featureList">
          {features.map((feature) => (
            <article className="featureItem" key={feature.title}>
              <feature.icon size={22} aria-hidden="true" />
              <div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section setupSection">
        <div className="setupCopy">
          <p className="eyebrow muted">
            <BellRing size={16} aria-hidden="true" />
            Launch path
          </p>
          <h2>Ready for hardware handoff.</h2>
        </div>
        <div className="steps">
          {steps.map((step) => (
            <div className="step" key={step}>
              <CheckCircle2 size={19} aria-hidden="true" />
              <span>{step}</span>
            </div>
          ))}
        </div>
        <Link className="button darkButton" href="/auth">
          Create account
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
