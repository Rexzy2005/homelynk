"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Fan,
  Home,
  Lightbulb,
  Loader2,
  Lock,
  LogOut,
  Plug,
  Power,
  RefreshCw,
  Router,
  Shield,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getRealtimeUrl } from "@/lib/config";

type ApplianceState = {
  power?: boolean;
  level?: number;
  locked?: boolean;
  [key: string]: unknown;
};

export type ApplianceRecord = {
  id: string;
  device_id: string;
  name: string;
  room: string;
  kind: string;
  state: ApplianceState | null;
  is_online: boolean;
  sort_order: number;
};

export type DeviceRecord = {
  id: string;
  home_id: string;
  public_device_id: string;
  name: string;
  status: string;
  last_seen_at: string | null;
  pairing_code: string | null;
  firmware_version: string | null;
};

export type CommandRecord = {
  id: string;
  device_id: string;
  appliance_id: string | null;
  action: string;
  status: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

type DeviceConsoleProps = {
  userEmail: string;
  home: {
    id: string;
    name: string;
  };
  device: DeviceRecord | null;
  appliances: ApplianceRecord[];
  commands: CommandRecord[];
  setupError?: string | null;
};

type ConnectionState = "connecting" | "connected" | "offline";

function applianceIcon(kind: string) {
  if (kind === "light") return Lightbulb;
  if (kind === "fan") return Fan;
  if (kind === "lock") return Lock;
  return Plug;
}

function commandLabel(status: string) {
  return status.replaceAll("_", " ");
}

function formatTime(value: string | null) {
  if (!value) return "Never";
  // Force stable SSR/client formatting by pinning locale and timezone.
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function DeviceConsole({
  userEmail,
  home,
  device,
  appliances,
  commands,
  setupError,
}: DeviceConsoleProps) {
  const router = useRouter();
  const wsRef = useRef<WebSocket | null>(null);
  const [connection, setConnection] = useState<ConnectionState>(() =>
    device && !setupError ? "connecting" : "offline",
  );
  const [applianceOverrides, setApplianceOverrides] = useState<
    Record<string, { state?: ApplianceState; is_online?: boolean }>
  >({});
  const [commandStatus, setCommandStatus] = useState<Record<string, string>>({});
  const [recentCommands, setRecentCommands] = useState<CommandRecord[]>(commands);
  const activeDevice = device;

  const items = useMemo(
    () =>
      appliances.map((appliance) => {
        const override = applianceOverrides[appliance.id];
        if (!override) return appliance;

        return {
          ...appliance,
          state: override.state ?? appliance.state,
          is_online: override.is_online ?? appliance.is_online,
        };
      }),
    [appliances, applianceOverrides],
  );

  const onlineCount = useMemo(() => items.filter((item) => item.is_online).length, [items]);
  const poweredCount = useMemo(
    () => items.filter((item) => Boolean(item.state?.power ?? item.state?.locked)).length,
    [items],
  );

  useEffect(() => {
    if (!device || setupError) {
      return;
    }

    const currentDevice = device;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      setConnection("connecting");

      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token || closed) {
          setConnection("offline");
          return;
        }

        const url = new URL(getRealtimeUrl());
        url.searchParams.set("role", "user");
        url.searchParams.set("token", session.access_token);
        const socket = new WebSocket(url.toString());
        wsRef.current = socket;

        socket.addEventListener("open", () => {
          setConnection("connected");
          socket.send(
            JSON.stringify({
              type: "device.subscribe",
              payload: { deviceId: currentDevice.public_device_id },
            }),
          );
        });

        socket.addEventListener("message", (event) => {
          const message = JSON.parse(event.data);

          if (message.type === "device.telemetry") {
            const updates = message.payload?.states?.reduce(
              (acc: Record<string, { state?: ApplianceState; is_online?: boolean }>, update: { applianceId: string; state: ApplianceState }) => {
                acc[update.applianceId] = {
                  state: update.state,
                  is_online: true,
                };
                return acc;
              },
              {},
            );

            if (updates && Object.keys(updates).length) {
              setApplianceOverrides((current) => ({
                ...current,
                ...updates,
              }));
            }
          }

          if (message.type === "command.status") {
            setCommandStatus((current) => ({
              ...current,
              [message.requestId ?? message.commandId]: message.status,
            }));
          }
        });

        socket.addEventListener("close", () => {
          if (closed) return;
          setConnection("offline");
          retryTimer = setTimeout(connect, 2500);
        });

        socket.addEventListener("error", () => {
          setConnection("offline");
        });
      } catch {
        setConnection("offline");
      }
    }

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [device, setupError]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/auth");
    router.refresh();
  }

  function sendCommand(appliance: ApplianceRecord) {
    if (!activeDevice) {
      return;
    }
    const requestId = crypto.randomUUID();
    const currentPower = Boolean(appliance.state?.power ?? appliance.state?.locked);
    const nextPower = !currentPower;
    const action = appliance.kind === "lock" ? (nextPower ? "lock" : "unlock") : nextPower ? "turn_on" : "turn_off";

    setCommandStatus((current) => ({ ...current, [requestId]: "pending" }));
    setApplianceOverrides((current) => ({
      ...current,
      [appliance.id]: {
        state: {
          ...appliance.state,
          power: appliance.kind === "lock" ? appliance.state?.power : nextPower,
          locked: appliance.kind === "lock" ? nextPower : appliance.state?.locked,
        },
        is_online: appliance.is_online,
      },
    }));

    setRecentCommands((current) => [
      {
        id: requestId,
        device_id: activeDevice.id,
        appliance_id: appliance.id,
        action,
        status: connection === "connected" ? "sent_to_device" : "local_preview",
        error_message: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      },
      ...current.slice(0, 7),
    ]);

    const payload = {
      type: "command.create",
      requestId,
      payload: {
        deviceId: activeDevice.public_device_id,
        applianceId: appliance.id,
        action,
        desiredState:
          appliance.kind === "lock"
            ? { locked: nextPower }
            : { power: nextPower },
      },
    };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    } else {
      window.setTimeout(() => {
        setCommandStatus((current) => ({ ...current, [requestId]: "completed" }));
      }, 650);
    }
  }

  async function copyPairingValue(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <Link className="brand dashboardBrand" href="/">
          <span className="brandMark">
            <Home size={19} aria-hidden="true" />
          </span>
          HomeLynk
        </Link>
        <nav className="sideNav" aria-label="Dashboard navigation">
          <a className="active" href="#overview">
            <Activity size={18} aria-hidden="true" />
            Overview
          </a>
          <a href="#devices">
            <Router size={18} aria-hidden="true" />
            Devices
          </a>
          <a href="#security">
            <Shield size={18} aria-hidden="true" />
            Logs
          </a>
        </nav>
        <button className="iconTextButton" type="button" onClick={signOut}>
          <LogOut size={18} aria-hidden="true" />
          Sign out
        </button>
      </aside>

      <section className="dashboardMain">
        <header className="dashboardHeader" id="overview">
          <div>
            <p className="eyebrow muted">
              <Smartphone size={16} aria-hidden="true" />
              {userEmail}
            </p>
            <h1>{home.name}</h1>
          </div>
          <div className={`connectionPill ${connection}`}>
            {connection === "connected" ? <Wifi size={18} aria-hidden="true" /> : <WifiOff size={18} aria-hidden="true" />}
            {connection}
          </div>
        </header>

        {setupError ? (
          <div className="noticeBar">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{setupError}</span>
          </div>
        ) : null}

        <section className="metricGrid" aria-label="Home status">
          <article className="metric">
            <span>Online appliances</span>
            <strong>
              {onlineCount}/{items.length}
            </strong>
          </article>
          <article className="metric">
            <span>Active loads</span>
            <strong>{poweredCount}</strong>
          </article>
          <article className="metric">
            <span>Last device ping</span>
            <strong suppressHydrationWarning>
              {formatTime(activeDevice?.last_seen_at ?? null)}
            </strong>
          </article>
        </section>

        <section className="dashboardGrid">
          <div className="controlPanel" id="devices">
            <div className="panelHeader">
              <div>
                <p className="eyebrow muted">Rooms</p>
                <h2>Appliance controls</h2>
              </div>
              <button className="iconButton" type="button" aria-label="Refresh dashboard" onClick={() => router.refresh()}>
                <RefreshCw size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="applianceGrid">
              {items.map((appliance) => {
                const Icon = applianceIcon(appliance.kind);
                const isActive = Boolean(appliance.state?.power ?? appliance.state?.locked);

                return (
                  <article className={`applianceCard ${isActive ? "on" : ""}`} key={appliance.id}>
                    <div className="applianceTop">
                      <span className="deviceIcon">
                        <Icon size={21} aria-hidden="true" />
                      </span>
                      <button
                        className={`powerButton ${isActive ? "on" : ""}`}
                        type="button"
                        aria-label={`${isActive ? "Disable" : "Enable"} ${appliance.name}`}
                        onClick={() => sendCommand(appliance)}
                        disabled={!activeDevice}
                      >
                        <Power size={18} aria-hidden="true" />
                      </button>
                    </div>
                    <div>
                      <h3>{appliance.name}</h3>
                      <p>{appliance.room}</p>
                    </div>
                    <div className="cardFooter">
                      <span>{isActive ? "Active" : "Standby"}</span>
                      <small>{appliance.is_online ? "online" : "offline"}</small>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="devicePanel">
            <div className="panelHeader">
              <div>
                <p className="eyebrow muted">ESP32</p>
                <h2>{activeDevice?.name ?? "No device provisioned"}</h2>
              </div>
              <span className="statusDot" aria-label={activeDevice?.status ?? "offline"} />
            </div>
            {activeDevice ? (
              <>
                <div className="pairingBox">
                  <span>Device ID</span>
                  <button type="button" onClick={() => copyPairingValue(activeDevice.public_device_id)}>
                    {activeDevice.public_device_id}
                    <Copy size={15} aria-hidden="true" />
                  </button>
                </div>

                {activeDevice.pairing_code ? (
                  <div className="pairingBox highlighted">
                    <span>Pairing code</span>
                    <button type="button" onClick={() => copyPairingValue(activeDevice.pairing_code ?? "")}>
                      {activeDevice.pairing_code}
                      <Copy size={15} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <div className="successBox">
                    <CheckCircle2 size={18} aria-hidden="true" />
                    <span>Provisioned</span>
                  </div>
                )}
              </>
            ) : (
              <div className="noticeBar">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>Create a device to see pairing details.</span>
              </div>
            )}

            <div className="commandList" id="security">
              <h3>Recent commands</h3>
              {recentCommands.length ? (
                recentCommands.map((command) => (
                  <div className="commandItem" key={command.id}>
                    <span>
                      {commandStatus[command.id] === "pending" ? (
                        <Loader2 className="spin" size={16} aria-hidden="true" />
                      ) : (
                        <Clock3 size={16} aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <strong>{command.action}</strong>
                      <small>{commandLabel(commandStatus[command.id] ?? command.status)}</small>
                    </div>
                  </div>
                ))
              ) : (
                <p className="emptyState">No commands yet</p>
              )}
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
