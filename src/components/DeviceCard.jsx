import { useEffect, useState, useCallback } from "react";
import DeviceMapPin from "./DeviceMapPin.jsx";
import {
  fetchLatestPhoto,
  signPhotoUrl,
  queueTakePhotoCommand,
  subscribeToPhotos,
  subscribeToCommand,
} from "../lib/devices.js";

function relativeTime(iso) {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATUS_STYLES = {
  online: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  offline: "bg-gray-100 text-gray-500 ring-1 ring-gray-200",
};

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value ?? "—"}</p>
    </div>
  );
}

// "Take photo" tap-to-done flow:
//  1. insert a `commands` row ({ command: "take_photo", status: "pending" })
//  2. subscribe to that row's updates via Realtime
//  3. the mock camera / real device polls `command`, gets it, uploads a
//     photo through file-upload (which flips the row to "done")
//  4. this card flips its button state the moment that update arrives
export default function DeviceCard({ device, accessToken }) {
  const [latestPhoto, setLatestPhoto] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [commandState, setCommandState] = useState("idle"); // idle | pending | sent | done | failed
  const [, forceTick] = useState(0);

  const loadLatestPhoto = useCallback(async () => {
    try {
      const photo = await fetchLatestPhoto(accessToken, device.imei);
      setLatestPhoto(photo);
      if (photo) {
        const url = await signPhotoUrl(accessToken, photo.storage_path);
        setPhotoUrl(url);
      } else {
        setPhotoUrl(null);
      }
    } catch (err) {
      console.error("DeviceCard: failed to load latest photo", err);
    }
  }, [accessToken, device.imei]);

  useEffect(() => {
    loadLatestPhoto();
  }, [loadLatestPhoto]);

  useEffect(() => {
    const unsubscribe = subscribeToPhotos(device.imei, () => loadLatestPhoto());
    return unsubscribe;
  }, [device.imei, loadLatestPhoto]);

  // Re-render the "last seen" label every 30s without waiting on a device event.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleTakePhoto = async () => {
    setCommandState("pending");
    try {
      const command = await queueTakePhotoCommand(accessToken, device.imei);
      const unsubscribe = subscribeToCommand(command.id, (payload) => {
        const status = payload.new?.status;
        if (status === "sent") setCommandState("sent");
        if (status === "done") {
          setCommandState("done");
          loadLatestPhoto();
          unsubscribe();
          setTimeout(() => setCommandState("idle"), 4000);
        }
        if (status === "failed") {
          setCommandState("failed");
          unsubscribe();
          setTimeout(() => setCommandState("idle"), 4000);
        }
      });
    } catch (err) {
      console.error("DeviceCard: failed to queue take_photo command", err);
      setCommandState("failed");
      setTimeout(() => setCommandState("idle"), 4000);
    }
  };

  const isOnline = device.status === "online";
  const takePhotoLabel =
    commandState === "pending" ? "Queuing…" :
    commandState === "sent" ? "Sent to device…" :
    commandState === "done" ? "Photo received ✓" :
    commandState === "failed" ? "Failed — try again" :
    "Take photo";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs font-bold text-blue-700">{device.imei}</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{device.model || "Unknown model"}</p>
          <p className="text-xs text-gray-400">{device.firmware || "—"}</p>
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[device.status] || STATUS_STYLES.offline}`}>
          {device.status || "offline"}
        </span>
      </div>

      <p className="text-xs text-gray-400">Last seen {relativeTime(device.last_seen)}</p>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Battery" value={device.battery != null ? `${device.battery}%` : null} />
        <Stat label="Signal" value={device.signal != null ? `${device.signal}/5` : null} />
        <Stat label="Temp" value={device.temp_c != null ? `${device.temp_c}°C` : null} />
        <Stat label="SD free" value={device.sd_free_mb != null ? `${device.sd_free_mb} MB` : null} />
        <Stat label="Lat" value={device.lat != null ? device.lat.toFixed(4) : null} />
        <Stat label="Lng" value={device.lng != null ? device.lng.toFixed(4) : null} />
      </div>

      <DeviceMapPin lat={device.lat} lng={device.lng} />

      <div>
        <p className="text-xs text-gray-400 mb-1.5">Latest photo</p>
        {photoUrl ? (
          <img src={photoUrl} alt={`Latest capture from ${device.imei}`} className="w-full h-40 object-cover rounded-lg" />
        ) : (
          <div className="h-40 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-400">
            No photo yet
          </div>
        )}
        {latestPhoto && (
          <p className="text-xs text-gray-400 mt-1">
            {latestPhoto.source === "on_demand" ? "On-demand" : "Motion"} · {relativeTime(latestPhoto.captured_at || latestPhoto.created_at)}
          </p>
        )}
      </div>

      <button
        onClick={handleTakePhoto}
        disabled={commandState === "pending" || commandState === "sent"}
        className={`w-full text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors ${
          commandState === "pending" || commandState === "sent"
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : commandState === "done"
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            : commandState === "failed"
            ? "bg-red-50 text-red-700 ring-1 ring-red-200"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {takePhotoLabel}
      </button>

      {!isOnline && (
        <p className="text-xs text-gray-400 text-center">Device is offline — command will queue until it checks in.</p>
      )}
    </div>
  );
}
