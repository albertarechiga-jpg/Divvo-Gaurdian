import { useEffect, useState, useCallback } from "react";
import DeviceCard from "../components/DeviceCard.jsx";
import { fetchDevices, subscribeToDevices } from "../lib/devices.js";

export default function DevicesPage({ session }) {
  const accessToken = session?.access_token;
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    fetchDevices(accessToken)
      .then((rows) => {
        setDevices(rows);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime keeps status/battery/signal/GPS (written by the `status` Edge
  // Function) and newly-provisioned devices live without polling.
  useEffect(() => {
    const unsubscribe = subscribeToDevices((payload) => {
      setDevices((prev) => {
        if (payload.eventType === "INSERT") {
          if (prev.some((d) => d.imei === payload.new.imei)) return prev;
          return [...prev, payload.new].sort((a, b) => a.imei.localeCompare(b.imei));
        }
        if (payload.eventType === "UPDATE") {
          return prev.map((d) => (d.imei === payload.new.imei ? payload.new : d));
        }
        if (payload.eventType === "DELETE") {
          return prev.filter((d) => d.imei !== payload.old.imei);
        }
        return prev;
      });
    });
    return unsubscribe;
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          IMEI-keyed cameras reporting status, GPS and photos in real time.
        </p>
      </div>

      <div className="p-8">
        {loading && <p className="text-sm text-gray-400">Loading devices…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && devices.length === 0 && (
          <p className="text-sm text-gray-400">No devices provisioned yet.</p>
        )}
        {!loading && !error && devices.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {devices.map((device) => (
              <DeviceCard key={device.imei} device={device} accessToken={accessToken} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
