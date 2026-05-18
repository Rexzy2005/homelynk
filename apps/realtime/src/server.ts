import dotenv from "dotenv";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "../../../.env");
const realtimeEnvPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: rootEnvPath });
dotenv.config({ path: realtimeEnvPath, override: true });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  WS_PORT: z.coerce.number().default(4000),
  DEVICE_COMMAND_TIMEOUT_MS: z.coerce.number().default(10000),
});

const env = envSchema.parse(process.env);
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});

type UserClient = {
  kind: "user";
  userId: string;
  email: string | null;
  subscriptions: Set<string>;
  ws: WebSocket;
};

type DeviceClient = {
  kind: "device";
  deviceId: string;
  publicDeviceId: string;
  ownerId: string;
  ws: WebSocket;
};

type Client = UserClient | DeviceClient;

const clients = new WeakMap<WebSocket, Client>();
const userSockets = new Map<string, Set<WebSocket>>();
const deviceSockets = new Map<string, WebSocket>();
const commandTimers = new Map<string, ReturnType<typeof setTimeout>>();

const commandCreateSchema = z.object({
  type: z.literal("command.create"),
  requestId: z.string().min(1),
  payload: z.object({
    deviceId: z.string().min(1),
    applianceId: z.string().uuid(),
    action: z.string().min(1),
    desiredState: z.record(z.string(), z.unknown()).default({}),
  }),
});

const subscribeSchema = z.object({
  type: z.literal("device.subscribe"),
  payload: z.object({
    deviceId: z.string().min(1),
  }),
});

const telemetrySchema = z.object({
  type: z.literal("device.telemetry"),
  payload: z.object({
    states: z.array(
      z.object({
        applianceId: z.string().uuid(),
        state: z.record(z.string(), z.unknown()),
      }),
    ),
    wifiRssi: z.number().optional(),
    uptimeMs: z.number().optional(),
  }),
});

const ackSchema = z.object({
  type: z.literal("command.ack"),
  commandId: z.string().uuid(),
  requestId: z.string().optional(),
  status: z.enum(["acknowledged", "completed", "failed"]),
  applianceId: z.string().uuid().optional(),
  state: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function send(ws: WebSocket, message: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendToUser(userId: string, message: unknown) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  sockets.forEach((socket) => send(socket, message));
}

async function verifyUserToken(token: string) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const user = (await response.json()) as { id: string; email?: string };
  return { id: user.id, email: user.email ?? null };
}

async function verifyDevice(publicDeviceId: string, secret: string) {
  const result = await pool.query<{
    id: string;
    owner_id: string;
    public_device_id: string;
  }>(
    `
      select id, owner_id, public_device_id
      from public.devices
      where public_device_id = $1
        and device_secret_hash = $2
      limit 1
    `,
    [publicDeviceId, hashSecret(secret)],
  );

  return result.rows[0] ?? null;
}

async function userOwnsDevice(userId: string, publicDeviceId: string) {
  const result = await pool.query<{ id: string }>(
    `
      select id
      from public.devices
      where owner_id = $1 and public_device_id = $2
      limit 1
    `,
    [userId, publicDeviceId],
  );

  return result.rows[0] ?? null;
}

async function handleUserMessage(client: UserClient, raw: unknown) {
  const subscribe = subscribeSchema.safeParse(raw);
  if (subscribe.success) {
    const device = await userOwnsDevice(client.userId, subscribe.data.payload.deviceId);
    if (!device) {
      send(client.ws, { type: "error", error: "Device not found for user." });
      return;
    }

    client.subscriptions.add(subscribe.data.payload.deviceId);
    send(client.ws, {
      type: "device.presence",
      deviceId: subscribe.data.payload.deviceId,
      online: deviceSockets.has(subscribe.data.payload.deviceId),
    });
    return;
  }

  const command = commandCreateSchema.safeParse(raw);
  if (!command.success) {
    send(client.ws, { type: "error", error: "Unsupported user message." });
    return;
  }

  const payload = command.data.payload;
  const deviceSocket = deviceSockets.get(payload.deviceId);
  const status = deviceSocket ? "sent_to_device" : "queued_device_offline";

  const inserted = await pool.query<{ id: string }>(
    `
      insert into public.appliance_commands (
        device_id,
        appliance_id,
        user_id,
        action,
        desired_state,
        status,
        request_id,
        sent_at
      )
      select d.id, a.id, $2, $4, $5::jsonb, $6, $7, case when $6 = 'sent_to_device' then now() else null end
      from public.devices d
      join public.appliances a on a.device_id = d.id and a.id = $3
      where d.public_device_id = $1 and d.owner_id = $2
      returning id
    `,
    [
      payload.deviceId,
      client.userId,
      payload.applianceId,
      payload.action,
      JSON.stringify(payload.desiredState),
      status,
      command.data.requestId,
    ],
  );

  const commandId = inserted.rows[0]?.id;
  if (!commandId) {
    send(client.ws, {
      type: "command.status",
      requestId: command.data.requestId,
      status: "rejected",
      error: "Device or appliance not found.",
    });
    return;
  }

  send(client.ws, {
    type: "command.status",
    requestId: command.data.requestId,
    commandId,
    status,
  });

  if (!deviceSocket) {
    return;
  }

  send(deviceSocket, {
    type: "command.execute",
    requestId: command.data.requestId,
    commandId,
    applianceId: payload.applianceId,
    action: payload.action,
    desiredState: payload.desiredState,
  });

  const timer = setTimeout(async () => {
    await pool.query(
      `
        update public.appliance_commands
        set status = 'timeout', error_message = 'Device did not acknowledge before timeout.'
        where id = $1 and status in ('sent_to_device', 'pending')
      `,
      [commandId],
    );
    send(client.ws, {
      type: "command.status",
      requestId: command.data.requestId,
      commandId,
      status: "timeout",
    });
    commandTimers.delete(commandId);
  }, env.DEVICE_COMMAND_TIMEOUT_MS);

  commandTimers.set(commandId, timer);
}

async function handleDeviceMessage(client: DeviceClient, raw: unknown) {
  const telemetry = telemetrySchema.safeParse(raw);
  if (telemetry.success) {
    await pool.query(
      `
        update public.devices
        set last_seen_at = now(), status = 'online'
        where id = $1
      `,
      [client.deviceId],
    );

    for (const state of telemetry.data.payload.states) {
      await pool.query(
        `
          update public.appliances
          set state = $3::jsonb, is_online = true, updated_at = now()
          where id = $1 and device_id = $2
        `,
        [state.applianceId, client.deviceId, JSON.stringify(state.state)],
      );
    }

    sendToUser(client.ownerId, {
      type: "device.telemetry",
      deviceId: client.publicDeviceId,
      payload: telemetry.data.payload,
    });
    return;
  }

  const ack = ackSchema.safeParse(raw);
  if (!ack.success) {
    send(client.ws, { type: "error", error: "Unsupported device message." });
    return;
  }

  const status = ack.data.status;
  const command = await pool.query<{
    request_id: string;
    user_id: string;
  }>(
    `
      update public.appliance_commands
      set status = $2,
          error_message = $3,
          acknowledged_at = case when $2 in ('acknowledged', 'completed') then coalesce(acknowledged_at, now()) else acknowledged_at end,
          completed_at = case when $2 in ('completed', 'failed') then now() else completed_at end
      where id = $1
        and device_id = $4
      returning request_id, user_id
    `,
    [ack.data.commandId, status, ack.data.error ?? null, client.deviceId],
  );

  const commandRow = command.rows[0];
  if (!commandRow) {
    send(client.ws, { type: "error", error: "Command not found for device." });
    return;
  }

  const timer = commandTimers.get(ack.data.commandId);
  if (timer) {
    clearTimeout(timer);
    commandTimers.delete(ack.data.commandId);
  }

  if (ack.data.applianceId && ack.data.state) {
    await pool.query(
      `
        update public.appliances
        set state = $3::jsonb, is_online = true, updated_at = now()
        where id = $1 and device_id = $2
      `,
      [ack.data.applianceId, client.deviceId, JSON.stringify(ack.data.state)],
    );
  }

  sendToUser(commandRow.user_id, {
    type: "command.status",
    requestId: commandRow.request_id,
    commandId: ack.data.commandId,
    status,
    error: ack.data.error ?? null,
  });
}

async function authenticate(requestUrl: URL, ws: WebSocket): Promise<Client | null> {
  const role = requestUrl.searchParams.get("role");

  if (role === "user") {
    const token = requestUrl.searchParams.get("token");
    if (!token) return null;

    const user = await verifyUserToken(token);
    if (!user) return null;

    const client: UserClient = {
      kind: "user",
      userId: user.id,
      email: user.email,
      subscriptions: new Set(),
      ws,
    };
    const sockets = userSockets.get(user.id) ?? new Set<WebSocket>();
    sockets.add(ws);
    userSockets.set(user.id, sockets);
    return client;
  }

  if (role === "device") {
    const publicDeviceId = requestUrl.searchParams.get("deviceId");
    const secret = requestUrl.searchParams.get("secret");
    if (!publicDeviceId || !secret) return null;

    const device = await verifyDevice(publicDeviceId, secret);
    if (!device) return null;

    const client: DeviceClient = {
      kind: "device",
      deviceId: device.id,
      publicDeviceId: device.public_device_id,
      ownerId: device.owner_id,
      ws,
    };
    deviceSockets.set(device.public_device_id, ws);
    await pool.query(
      `
        update public.devices
        set status = 'online', last_seen_at = now()
        where id = $1
      `,
      [device.id],
    );
    sendToUser(device.owner_id, {
      type: "device.presence",
      deviceId: device.public_device_id,
      online: true,
    });
    return client;
  }

  return null;
}

const wss = new WebSocketServer({ port: env.WS_PORT });
const alive = new WeakMap<WebSocket, boolean>();

wss.on("connection", async (ws, request) => {
  const requestUrl = new URL(request.url ?? "/", `ws://${request.headers.host ?? "localhost"}`);
  const client = await authenticate(requestUrl, ws);

  if (!client) {
    ws.close(1008, "Unauthorized");
    return;
  }

  clients.set(ws, client);
  alive.set(ws, true);
  send(ws, { type: "connection.ready", role: client.kind });

  ws.on("pong", () => {
    alive.set(ws, true);
  });

  ws.on("message", async (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      const currentClient = clients.get(ws);
      if (!currentClient) return;

      if (currentClient.kind === "user") {
        await handleUserMessage(currentClient, parsed);
      } else {
        await handleDeviceMessage(currentClient, parsed);
      }
    } catch (error) {
      send(ws, {
        type: "error",
        error: error instanceof Error ? error.message : "Invalid message.",
      });
    }
  });

  ws.on("close", async () => {
    const currentClient = clients.get(ws);
    if (!currentClient) return;

    if (currentClient.kind === "user") {
      const sockets = userSockets.get(currentClient.userId);
      sockets?.delete(ws);
      if (!sockets?.size) userSockets.delete(currentClient.userId);
      return;
    }

    if (deviceSockets.get(currentClient.publicDeviceId) === ws) {
      deviceSockets.delete(currentClient.publicDeviceId);
      await pool.query(
        `
          update public.devices
          set status = 'offline'
          where id = $1
        `,
        [currentClient.deviceId],
      );
      sendToUser(currentClient.ownerId, {
        type: "device.presence",
        deviceId: currentClient.publicDeviceId,
        online: false,
      });
    }
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!alive.get(ws)) {
      ws.terminate();
      return;
    }
    alive.set(ws, false);
    ws.ping();
  });
}, 30000);

console.log(`HomeLynk realtime server listening on ws://localhost:${env.WS_PORT}`);
