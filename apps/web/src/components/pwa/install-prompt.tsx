"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/app/toast-provider";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

function isInstalledPWA() {
  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export function PWAInstallPrompt() {
  const { addToast } = useToast();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (isInstalledPWA()) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setIsDismissed(false);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsDismissed(true);
      addToast("HomeLynk has been installed successfully.", "success");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [addToast]);

  const installPWA = useCallback(async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    setDeferredPrompt(null);
    setIsDismissed(true);

    if (choice.outcome === "accepted") {
      addToast("HomeLynk is installing.", "success");
    }
  }, [addToast, deferredPrompt]);

  const dismissPrompt = useCallback(() => {
    setIsDismissed(true);
  }, []);

  if (!deferredPrompt || isDismissed) {
    return null;
  }

  return (
    <aside
      className="pwaInstallPrompt"
      role="dialog"
      aria-label="Install HomeLynk"
      aria-live="polite"
    >
      <div className="pwaInstallCard">
        <div className="pwaInstallIcon" aria-hidden="true">
          <Download size={18} />
        </div>
        <div className="pwaInstallText">
          <strong>Install HomeLynk</strong>
          <span>Open your home controls faster and keep the dashboard available from your device.</span>
        </div>
        <div className="pwaInstallActions">
          <button
            type="button"
            onClick={dismissPrompt}
            className="pwaInstallDismiss"
            aria-label="Dismiss install prompt"
          >
            <X size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={installPWA} className="button darkButton">
            Install
          </button>
        </div>
      </div>
    </aside>
  );
}
