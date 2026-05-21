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
- Root `npm run dev`, `npm run build`, and `npm run lint` aliases added for easier project commands.
- Dashboard upgraded for mobile: compact phone layout, fixed bottom mobile navigation, responsive metric cards, horizontal room filters, and quick scene controls.
- Dashboard realtime UX improved with per-appliance command status badges, clearer pairing copy feedback, and device firmware/status metadata.
- Device creation API cleanup completed for lint-safe server route code.
- Add-device flow rebuilt: `/api/devices/create` now uses an authenticated Supabase RPC, the dashboard can list/switch multiple ESP32 hubs, and the add-device form is always available from the pairing panel.
- Dashboard visual pass completed: cleaner control-console layout, darker sidebar, lighter operational workspace, device switch rail, and four-item mobile tab bar.
- Supabase schema now includes `create_home_device(device_name text)` for transactional device + default appliance creation.
- Supabase bootstrap corrected: new signups now create only profile/home. No default ESP32 or appliances are created until Add ESP32 is used.
- Dashboard preview corrected: empty device lists stay empty instead of showing fake demo hardware.
- Dashboard redesigned as a more user-centered product console: sticky top bar, operational hero, clear empty ESP32 onboarding, setup steps, focused control workspace, right-side pairing rail, and cleaner mobile collapse.
- PWA install prompt and toast overlays converted from unused utility classes to app CSS; the install prompt now appears from the top while toasts remain clear of the mobile bottom navigation.
- Removed the duplicate static `manifest.webmanifest` that conflicted with the Next.js app manifest route.
- Complete end-to-end Wokwi test guide added for a two-bulb ESP32 simulation, including claim flow, appliance ID lookup, sketch code, and troubleshooting.
- Full UI upgrade pass completed across the landing page, authentication flow, and dashboard: stronger visual hierarchy, refined surfaces, improved auth details, richer dashboard metrics, clearer device state, and better responsive spacing.

## Verification

- `npm run lint:web` passed.
- `npx tsc --noEmit` in `apps/web` passed.
- `npm run build:web` passed.
- `npm run build:realtime` passed.
- Live smoke test returned `200 OK` for `/`, `/dashboard`, and `/manifest.webmanifest`.
- Final verification after service worker cache tightening passed with `npm run lint:web` and `npm run build:web`.
- Latest dashboard verification passed with `npm run lint:web`, `npx tsc --noEmit` in `apps/web`, `npm run build:web`, and `npm run build:realtime`.
- Latest add-device/dashboard fix verified with `npm run lint:web`, `npx tsc --noEmit` in `apps/web`, `npm run build:web`, and `npm run build:realtime`.
- Latest empty-device provisioning fix verified with `npm run lint:web`, `npx tsc --noEmit` in `apps/web`, `npm run build:web`, and `npm run build:realtime`.
- Latest dashboard redesign verified with `npm run lint:web`, `npx tsc --noEmit` in `apps/web`, `npm run build:web`, and `npm run build:realtime`.
- Latest PWA prompt/Wokwi guide update verified with `npm run lint:web`, `npx tsc --noEmit` in `apps/web`, `npm run build:web`, and `npm run build:realtime`.
- Live dev smoke check returned `200 OK` for `/` and `/manifest.webmanifest`, and `/dashboard` correctly redirects unauthenticated users to `/auth`.
- Latest UI upgrade verified with `npm run lint:web`, `npx tsc --noEmit` in `apps/web`, `npm run build:web`, and `npm run build:realtime`. Live route checks returned `200 OK` for `/`, `/auth`, and `/manifest.webmanifest`; `/dashboard` redirects unauthenticated users to `/auth`.
- The earlier page/icon naming collision, external Google font fetch issue, PWA manifest typing issue, and realtime build output issue have been fixed.

## Next Steps

- Connect the app to a real Supabase project and run `supabase/schema.sql`.
- Run the latest `supabase/schema.sql` again if the Supabase project was already created before this update. The schema now drops/recreates `ensure_home_bootstrap()` and adds `create_home_device(device_name text)`.
- Follow `docs/end-to-end-wokwi-test-guide.md` to test the ESP32 claim and WebSocket command loop with the two-bulb Wokwi simulation.
