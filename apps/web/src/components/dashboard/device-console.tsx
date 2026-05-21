"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Armchair,
  CheckCircle2,
  Clock3,
  Copy,
  Fan,
  Home,
  Lightbulb,
  Loader2,
  Lock,
  LogOut,
  Moon,
  Plug,
  Plus,
  Power,
  RefreshCw,
  Router,
  Shield,
  ShieldCheck,
  Smartphone,
  Sun,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getRealtimeUrl } from "@/lib/config";
import { useToast } from "@/app/toast-provider";

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
  devices: DeviceRecord[];
  appliances: ApplianceRecord[];
  commands: CommandRecord[];
  setupError?: string | null;
};

type ConnectionState = "connecting" | "connected" | "offline";

const scenePresets = [
  {
    id: "away",
    label: "Away",
    description: "Power down and lock",
    icon: ShieldCheck,
  },
  {
    id: "night",
    label: "Night",
    description: "Quiet security mode",
    icon: Moon,
  },
  {
    id: "morning",
    label: "Morning",
    description: "Wake core rooms",
    icon: Sun,
  },
];

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

function formatRelativeTime(value: string | null): string {
  if (!value) return "Never";

  const now = new Date();
  const past = new Date(value);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function DeviceConsole({
  userEmail,
  home,
  device,
  devices,
  appliances,
  commands,
  setupError,
}: DeviceConsoleProps) {
  const router = useRouter();
  const wsRef = useRef<WebSocket | null>(null);
  const requestApplianceRef = useRef<Record<string, string>>({});
  const isPreview = Boolean(setupError);
  const [connection, setConnection] = useState<ConnectionState>(() =>
    device && !setupError ? "connecting" : "offline",
  );
  const [applianceOverrides, setApplianceOverrides] = useState<
    Record<string, { state?: ApplianceState; is_online?: boolean }>
  >({});
  const [applianceStatus, setApplianceStatus] = useState<Record<string, string>>({});
  const [commandStatus, setCommandStatus] = useState<Record<string, string>>({});
  const [recentCommands, setRecentCommands] = useState<CommandRecord[]>(commands);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deviceName, setDeviceName] = useState("ESP32 Hub");
  const [selectedRoom, setSelectedRoom] = useState("All");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    device?.id ?? null,
  );
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const deviceList = useMemo(() => {
    if (devices.length) return devices;
    return device ? [device] : [];
  }, [device, devices]);
  const activeDevice = useMemo(
    () => deviceList.find((item) => item.id === selectedDeviceId) ?? deviceList[0] ?? null,
    [deviceList, selectedDeviceId],
  );
  const baseAppliances = useMemo(
    () => {
      if (!activeDevice) return [];
      return appliances.filter((appliance) => appliance.device_id === activeDevice.id);
    },
    [activeDevice, appliances],
  );

  const items = useMemo(
    () =>
      baseAppliances.map((appliance) => {
        const override = applianceOverrides[appliance.id];
        if (!override) return appliance;

        return {
          ...appliance,
          state: override.state ?? appliance.state,
          is_online: override.is_online ?? appliance.is_online,
        };
      }),
    [baseAppliances, applianceOverrides],
  );

  const rooms = useMemo(() => ["All", ...Array.from(new Set(items.map((item) => item.room)))], [items]);
  const visibleItems = useMemo(
    () => (selectedRoom === "All" ? items : items.filter((item) => item.room === selectedRoom)),
    [items, selectedRoom],
  );
  const visibleCommands = useMemo(
    () =>
      activeDevice
        ? recentCommands.filter((command) => command.device_id === activeDevice.id).slice(0, 8)
        : [],
    [activeDevice, recentCommands],
  );
  const onlineCount = useMemo(() => items.filter((item) => item.is_online).length, [items]);
  const poweredCount = useMemo(
    () => items.filter((item) => item.kind !== "lock" && Boolean(item.state?.power)).length,
    [items],
  );
  const securedCount = useMemo(
    () => items.filter((item) => item.kind === "lock" && Boolean(item.state?.locked)).length,
    [items],
  );

  useEffect(() => {
    if (!activeDevice || setupError) {
      return;
    }

    const currentDevice = activeDevice;
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
            const commandKey = message.requestId ?? message.commandId;
            setCommandStatus((current) => ({
              ...current,
              [commandKey]: message.status,
            }));
            setRecentCommands((current) =>
              current.map((command) =>
                command.id === commandKey ? { ...command, status: message.status } : command,
              ),
            );

            const applianceId = requestApplianceRef.current[commandKey];
            if (applianceId) {
              setApplianceStatus((current) => ({
                ...current,
                [applianceId]: message.status,
              }));

              if (["completed", "failed", "timeout", "rejected"].includes(message.status)) {
                window.setTimeout(() => {
                  setApplianceStatus((current) => {
                    const next = { ...current };
                    delete next[applianceId];
                    return next;
                  });
                }, 1800);
              }
            }
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
  }, [activeDevice, setupError]);

  async function signOut() {
    const { addToast } = useToast();

    if (isPreview) {
      addToast("Signing out...", "info");
      router.replace("/auth");
      return;
    }

    const supabase = createClient();
    try {
      await supabase.auth.signOut({ scope: "local" });
      addToast("Signed out successfully", "success");
      router.replace("/auth");
      router.refresh();
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Failed to sign out", "error");
    }
  }

  async function handleCreateDevice() {
    setCreateError(null);

    if (isPreview) {
      setCreateError("Connect Supabase and run the latest schema before adding real ESP32 devices.");
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/devices/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deviceName }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setCreateError(payload?.error ?? "Unable to create device.");
        setIsCreating(false);
        return;
      }

      setIsCreating(false);
      if (payload?.device?.id) {
        setSelectedDeviceId(payload.device.id);
      }
      router.refresh();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create device.");
      setIsCreating(false);
    }
  }

  function issueCommand(appliance: ApplianceRecord, desiredState: ApplianceState, action: string) {
    if (!activeDevice) {
      return;
    }
    const requestId = crypto.randomUUID();
    requestApplianceRef.current[requestId] = appliance.id;

    setCommandStatus((current) => ({ ...current, [requestId]: "pending" }));
    setApplianceStatus((current) => ({ ...current, [appliance.id]: "pending" }));
    setApplianceOverrides((current) => ({
      ...current,
      [appliance.id]: {
        state: {
          ...appliance.state,
          ...desiredState,
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
        desiredState,
      },
    };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    } else {
      window.setTimeout(() => {
        setCommandStatus((current) => ({ ...current, [requestId]: "completed" }));
        setApplianceStatus((current) => {
          const next = { ...current };
          delete next[appliance.id];
          return next;
        });
      }, 650);
    }
  }

  function sendCommand(appliance: ApplianceRecord) {
    const currentPower = Boolean(appliance.state?.power ?? appliance.state?.locked);
    const nextPower = !currentPower;
    const action = appliance.kind === "lock" ? (nextPower ? "lock" : "unlock") : nextPower ? "turn_on" : "turn_off";
    issueCommand(
      appliance,
      appliance.kind === "lock" ? { locked: nextPower } : { power: nextPower },
      action,
    );
  }

  function applyScene(sceneId: string) {
    visibleItems.forEach((appliance) => {
      if (sceneId === "away") {
        issueCommand(
          appliance,
          appliance.kind === "lock" ? { locked: true } : { power: false },
          appliance.kind === "lock" ? "lock" : "turn_off",
        );
      }

      if (sceneId === "night") {
        issueCommand(
          appliance,
          appliance.kind === "lock" ? { locked: true } : { power: appliance.kind === "light" },
          appliance.kind === "lock" ? "lock" : appliance.kind === "light" ? "turn_on" : "turn_off",
        );
      }

      if (sceneId === "morning") {
        issueCommand(
          appliance,
          appliance.kind === "lock" ? { locked: true } : { power: appliance.kind !== "plug" },
          appliance.kind === "plug" ? "turn_off" : appliance.kind === "lock" ? "lock" : "turn_on",
        );
      }
    });
  }

  async function copyPairingValue(value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedValue(value);
    window.setTimeout(() => setCopiedValue(null), 1500);
  }

  const addDeviceForm = (
    <form
      className="addDeviceForm"
      onSubmit={(event) => {
        event.preventDefault();
        handleCreateDevice();
      }}
    >
      <div>
        <label htmlFor="deviceName">ESP32 name</label>
        <input
          id="deviceName"
          value={deviceName}
          onChange={(event) => setDeviceName(event.target.value)}
          placeholder="Main relay controller"
        />
      </div>
      <button type="submit" className="button darkButton" disabled={isCreating}>
        {isCreating ? <Loader2 className="spin" size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
        {isCreating ? "Creating device..." : "Create ESP32 identity"}
      </button>
      {createError ? <small className="formNotice">{createError}</small> : null}
    </form>
  );

  return (
    <main className="dashboard dashboardShell">
      <header className="dashboardTopbar">
        <Link className="brand dashboardBrand dashboardTopbarBrand" href="/">
          <span className="brandMark">
            <Home size={19} aria-hidden="true" />
          </span>
          HomeLynk
        </Link>

        <nav className="dashboardTopNav" aria-label="Dashboard navigation">
          <a href="#overview">Overview</a>
          <a href="#devices">
            Devices
          </a>
          <a href="#pairing">
            Pairing
          </a>
          <a href="#security">
            Logs
          </a>
        </nav>

        <div className="dashboardTopActions">
          <div className={`connectionPill ${connection}`}>
            {connection === "connected" ? <Wifi size={18} aria-hidden="true" /> : <WifiOff size={18} aria-hidden="true" />}
            {connection}
          </div>
        </div>
      </header>

      <section className="dashboardMain">
        <section className="dashboardHero" id="overview">
          <div>
            <p className="eyebrow muted">
              <Smartphone size={16} aria-hidden="true" />
              {userEmail}
            </p>
            <h1>{home.name}</h1>
            <p className="dashboardSubtitle">
              Control relay-connected home appliances from anywhere through a secure ESP32 cloud bridge.
            </p>
          </div>
          <div className="homeBridgePanel">
            <div>
              <span>Registered ESP32</span>
              <strong>{deviceList.length}</strong>
            </div>
            <div>
              <span>Active device</span>
              <strong>{activeDevice?.name ?? "None"}</strong>
            </div>
            <div>
              <span>Last ping</span>
              <strong suppressHydrationWarning>{formatRelativeTime(activeDevice?.last_seen_at ?? null)}</strong>
            </div>
          </div>
        </section>

        {setupError ? (
          <div className="noticeBar">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{setupError}</span>
          </div>
        ) : null}

        <section className="metricGrid" aria-label="Home status">
          <article className="metric">
            <span>Relay channels</span>
            <strong>
              {items.length}
            </strong>
          </article>
          <article className="metric">
            <span>Online channels</span>
            <strong>{onlineCount}</strong>
          </article>
          <article className="metric">
            <span>Active relays</span>
            <strong>{poweredCount}</strong>
          </article>
          <article className="metric">
            <span>Locks secured</span>
            <strong>{securedCount}</strong>
          </article>
        </section>

        <section className="dashboardWorkspace">
          <div className="dashboardPrimary">
            {!activeDevice ? (
              <section className="emptyDevicePanel" id="devices">
                <div className="emptyDeviceCopy">
                  <span className="emptyDeviceIcon">
                    <Router size={26} aria-hidden="true" />
                  </span>
                  <p className="eyebrow muted">Setup required</p>
                  <h2>No ESP32 device added yet</h2>
                  <p>
                    Create a device identity, copy the generated device ID and pairing code,
                    then add them to the ESP32 provisioning step before deployment.
                  </p>
                </div>
                <div className="setupSteps" aria-label="ESP32 setup steps">
                  <div>
                    <strong>1</strong>
                    <span>Create ESP32 identity</span>
                  </div>
                  <div>
                    <strong>2</strong>
                    <span>Compile/provision firmware</span>
                  </div>
                  <div>
                    <strong>3</strong>
                    <span>ESP32 claims device secret</span>
                  </div>
                  <div>
                    <strong>4</strong>
                    <span>Control relay channels</span>
                  </div>
                </div>
                {addDeviceForm}
              </section>
            ) : (
              <>
                <section className="sceneRail" aria-label="Quick scenes">
                  {scenePresets.map((scene) => {
                    const SceneIcon = scene.icon;

                    return (
                      <button
                        className="sceneButton"
                        type="button"
                        key={scene.id}
                        onClick={() => applyScene(scene.id)}
                        disabled={!visibleItems.length}
                      >
                        <span>
                          <SceneIcon size={19} aria-hidden="true" />
                        </span>
                        <strong>{scene.label}</strong>
                        <small>{scene.description}</small>
                      </button>
                    );
                  })}
                </section>

                <section className="controlPanel" id="devices">
                  <div className="panelHeader">
                    <div>
                      <p className="eyebrow muted">Relay channels</p>
                      <h2>Appliance controls</h2>
                    </div>
                    <button className="iconButton" type="button" aria-label="Refresh dashboard" onClick={() => router.refresh()}>
                      <RefreshCw size={18} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="roomTabs" aria-label="Filter appliances by room">
                    {rooms.map((room) => (
                      <button
                        type="button"
                        key={room}
                        className={selectedRoom === room ? "active" : ""}
                        onClick={() => setSelectedRoom(room)}
                      >
                        {room === "All" ? <Zap size={15} aria-hidden="true" /> : <Armchair size={15} aria-hidden="true" />}
                        {room}
                      </button>
                    ))}
                  </div>

                  <div className="applianceGrid">
                    {visibleItems.length ? (
                      visibleItems.map((appliance) => {
                        const Icon = applianceIcon(appliance.kind);
                        const isActive = Boolean(appliance.state?.power ?? appliance.state?.locked);
                        const liveStatus = applianceStatus[appliance.id];

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
                              >
                                <Power size={18} aria-hidden="true" />
                              </button>
                            </div>
                            <div>
                              <h3>{appliance.name}</h3>
                              <p>
                                {appliance.room}
                                {typeof appliance.state?.level === "number" ? ` - ${appliance.state.level}%` : ""}
                              </p>
                            </div>
                            <div className="cardFooter">
                              <span>{isActive ? "Active" : "Standby"}</span>
                              <small className={liveStatus ? "liveStatus" : ""}>
                                {liveStatus ? commandLabel(liveStatus) : appliance.is_online ? "online" : "offline"}
                              </small>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <div className="applianceEmptyState">
                        <Plug size={24} aria-hidden="true" />
                        <strong>No relay channels yet</strong>
                        <span>The ESP32 device exists, but no relay channels are configured.</span>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>

          <aside className="dashboardRail">
            <section className="devicePanel" id="pairing">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow muted">ESP32 pairing</p>
                  <h2>{activeDevice?.name ?? "Add first ESP32"}</h2>
                </div>
                <span className="statusDot" aria-label={activeDevice?.status ?? "offline"} />
              </div>

              <div className="deviceSwitchRail" aria-label="Select ESP32 device">
                {deviceList.length ? (
                  deviceList.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={activeDevice?.id === item.id ? "active" : ""}
                      onClick={() => {
                        setSelectedDeviceId(item.id);
                        setSelectedRoom("All");
                      }}
                    >
                      <Router size={16} aria-hidden="true" />
                      <span>{item.name}</span>
                      <small>{item.status}</small>
                    </button>
                  ))
                ) : (
                  <div className="inlineEmptyState">
                    <Router size={17} aria-hidden="true" />
                    <span>No ESP32 devices yet</span>
                  </div>
                )}
              </div>

              {activeDevice ? (
                <>
                  <div className="pairingBox">
                    <span>Device ID</span>
                    <button type="button" onClick={() => copyPairingValue(activeDevice.public_device_id)}>
                      {activeDevice.public_device_id}
                      <Copy size={15} aria-hidden="true" />
                    </button>
                    {copiedValue === activeDevice.public_device_id ? <small>Copied</small> : null}
                  </div>

                  {activeDevice.pairing_code ? (
                    <div className="pairingBox highlighted">
                      <span>One-time pairing code</span>
                      <button type="button" onClick={() => copyPairingValue(activeDevice.pairing_code ?? "")}>
                        {activeDevice.pairing_code}
                        <Copy size={15} aria-hidden="true" />
                      </button>
                      {copiedValue === activeDevice.pairing_code ? <small>Copied</small> : null}
                    </div>
                  ) : (
                    <div className="successBox">
                      <CheckCircle2 size={18} aria-hidden="true" />
                      <span>Provisioned</span>
                    </div>
                  )}

                  <div className="deviceMetaGrid">
                    <div>
                      <span>Status</span>
                      <strong>{activeDevice.status}</strong>
                    </div>
                    <div>
                      <span>Firmware</span>
                      <strong>{activeDevice.firmware_version ?? "pending"}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className="pairingBox">
                  <span>Device setup</span>
                  <strong>No ESP32 added yet</strong>
                </div>
              )}

              {activeDevice ? addDeviceForm : null}
            </section>

            {/* Logout button in sidebar */}
            <div className="dashboardRailLogout">
              <button className="iconTextButton" type="button" onClick={signOut}>
                <LogOut size={18} aria-hidden="true" />
                Sign out
              </button>
            </div>

            <section className="commandList" id="security">
              <h3>Recent commands</h3>
              {visibleCommands.length ? (
                visibleCommands.map((command) => (
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
            </section>
          </aside>
        </section>
      </section>

      <nav className="mobileTabBar" aria-label="Mobile dashboard navigation">
        <a href="#overview">
          <Activity size={19} aria-hidden="true" />
          Overview
        </a>
        <a href="#devices">
          <Router size={19} aria-hidden="true" />
          Devices
        </a>
        <a href="#pairing">
          <Plus size={19} aria-hidden="true" />
          Add
        </a>
        <a href="#security">
          <Shield size={19} aria-hidden="true" />
          Logs
        </a>
      </nav>
    </main>
  );
}
