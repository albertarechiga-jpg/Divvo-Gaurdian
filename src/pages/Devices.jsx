import { useEffect, useState, useCallback } from "react";
import DeviceCard from "../components/DeviceCard.jsx";
import { fetchDevices, subscribeToDevices } from "../lib/devices.js";
import { SB_URL, authHeaders } from "../lib/supabase.js";

export default function DevicesPage({ session }) {
  const accessToken = session?.access_token;
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seen, setSeen] = useState([]);

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

  // Phones that have sent GPS in the last 7 days. Read-only: no device token, so no Capture or status.
  useEffect(() => {
    if (!accessToken) return;
    const poll = () => fetch(SB_URL + "/rest/v1/gps_latest?select=device_id,device_name,lat,lon,created_at&order=created_at.desc", { headers: authHeaders(accessToken) })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setSeen(rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 7 * 24 * 3600 * 1000)))
      .catch(() => {});
    poll();
    const iv = setInterval(poll, 15000);
    return () => clearInterval(iv);
  }, [accessToken]);

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

        {seen.filter((s) => !devices.some((d) => d.imei === s.device_id)).length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-gray-700">Seen via GPS (not provisioned)</h2>
            <p className="text-xs text-gray-400 mt-0.5 mb-3">These phones have sent GPS but have no device token, so Capture and status are unavailable until they are provisioned.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {seen.filter((s) => !devices.some((d) => d.imei === s.device_id)).map((s) => (
                <div key={s.device_id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="font-mono text-sm font-bold text-gray-900">{s.device_id}</p>
                  <p className="text-xs text-gray-500 mt-1">Last GPS {new Date(s.created_at).toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{Number(s.lat).toFixed(4)}, {Number(s.lon).toFixed(4)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
