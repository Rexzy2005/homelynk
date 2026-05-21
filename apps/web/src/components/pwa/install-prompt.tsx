'use client';

import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/app/toast-provider';
import { Download } from 'lucide-react';

// Define the shape of the BeforeInstallPromptEvent interface
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platformUsage?: string }>;
}

export function PWAInstallPrompt() {
  const { addToast } = useToast();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Optionally, show a notification that the app can be installed
      addToast('HomeLynk is ready to be installed! Click the install button in the dashboard.', 'info');
    };

    const handleAppInstalled = () => {
      // Clear the deferred prompt so it can be garbage collected
      setDeferredPrompt(null);
      // Optionally, show a success toast
      addToast('HomeLynk has been installed successfully.', 'success');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [addToast]);

  const installPWA = useCallback(async () => {
    if (!deferredPrompt) return;
    // Show the prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    await deferredPrompt.userChoice;
    // Clear the deferred prompt since it can only be used once.
    setDeferredPrompt(null);
    // Note: We don't need to do anything specific based on outcome for now
  }, [deferredPrompt]);

  // We'll render a button in the dashboard if deferredPrompt is set
  if (!deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 flex justify-center p-2 pointer-events-none z-50">
      <div className="flex items-center gap-3 bg-teal/90 text-teal-dark rounded-lg p-4 shadow-lg pointer-events-auto">
        <Download size={20} aria-hidden="true" />
        <div className="flex-1 text-sm">
          <p className="whitespace-pre-line">Install HomeLynk for faster access and offline use?</p>
        </div>
        <button
          onClick={installPWA}
          className="button darkButton"
        >
          Install
        </button>
      </div>
    </div>
  );
}