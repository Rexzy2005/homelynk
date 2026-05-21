import type { Metadata } from "next";
import type { Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { ToastProvider } from "@/app/toast-provider";
import { ToastContainer } from "@/components/toast-container";
import { PWAInstallPrompt } from "@/components/pwa/install-prompt";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HomeLynk | Responsive home automation",
    template: "%s | HomeLynk",
  },
  description:
    "A fast, installable home automation dashboard for controlling ESP32-powered appliances through secure realtime communication.",
  applicationName: "HomeLynk",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HomeLynk",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f4ec",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ToastProvider>
          {children}
          <ToastContainer />
          <PWAInstallPrompt />
        </ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
