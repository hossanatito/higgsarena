"use client";
import { useEffect, useState } from "react";
import { WifiSlash } from "@phosphor-icons/react";

export function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-warn px-4 py-2 text-sm font-medium text-black safe-top">
      <WifiSlash size={16} aria-hidden /> You're offline. Jobs keep rendering on Higgsfield and will appear when you reconnect.
    </div>
  );
}
