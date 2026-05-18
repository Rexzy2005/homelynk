# HomeLynk Progress

## Current Status

- Greenfield Next.js app scaffolded in `apps/web`.
- Installable PWA shell added with manifest, service worker, and generated PNG icons.
- Supabase Auth flow added for sign in, account creation, auth callback, and protected dashboard routing.
- Supabase service route added for one-time ESP32 device claiming at `/api/devices/claim`.
- Marketing landing page built for the HomeLynk product.
- User dashboard built with appliance controls, device pairing info, command history, and WebSocket status handling.
- Realtime WebSocket service created in `apps/realtime`.
- Supabase schema, RLS policies, bootstrap function, and protocol documentation added.
- PWA cache behavior tightened so authenticated dashboard and API responses stay network-first.

## Verification

- `npm run lint:web` passed.
- `npx tsc --noEmit` in `apps/web` passed.
- `npm run build:web` passed.
- `npm run build:realtime` passed.
- Live smoke test returned `200 OK` for `/`, `/dashboard`, and `/manifest.webmanifest`.
- Final verification after service worker cache tightening passed with `npm run lint:web` and `npm run build:web`.
- The earlier page/icon naming collision, external Google font fetch issue, PWA manifest typing issue, and realtime build output issue have been fixed.

## Next Steps

- Confirm the dashboard renders without Supabase credentials in demo mode.
- Add Supabase credentials later to test full auth, DB bootstrap, and ESP32 claim flow.
