# HomeLynk

HomeLynk is a full-stack home automation web app for ESP32-controlled appliances.

## Apps

- `apps/web`: Next.js PWA, marketing page, Supabase auth flow, dashboard, device claim API.
- `apps/realtime`: Node WebSocket server for user and ESP32 connections.
- `supabase/schema.sql`: Supabase Postgres schema, RLS policies, and bootstrap function.
- `docs/realtime-protocol.md`: WebSocket and provisioning contract for firmware integration.

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` values into `apps/web/.env.local` and `apps/realtime/.env`.
4. Start the web app:

```bash
npm run dev:web
```

5. Start the realtime server:

```bash
npm run dev:realtime
```

The web app expects the realtime server at `NEXT_PUBLIC_WS_URL`, defaulting to `ws://localhost:4000`.
