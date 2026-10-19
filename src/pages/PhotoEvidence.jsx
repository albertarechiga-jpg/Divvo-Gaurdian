import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDevices,
  queueTakePhotoCommand,
  fetchCommand,
  subscribeToPhotos,
} from "../lib/devices.js";
import {
  fetchPhotos,
  signPhotoUrls,
  mapsLink,
  buildEvidencePackage,
  downloadBlob,
} from "../lib/proofOfCapture.js";

const CAPTURE_TIMEOUT_MS = 130_000; // server expires take_photo commands after 120 s
const POLL_MS = 2_000;
const FEED_REFRESH_MS = 5 * 60_000; // signed URLs last 15 min
const CLOCK_DRIFT_MS = 2 * 60_000;

function fmt(iso) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function CopyHash({ hash }) {
  const [copied, setCopied] = useState(false);
  if (!hash) return <span className="text-gray-400">no hash recorded</span>;
  return (
    <button
      type="button"
      title={`${hash} — click to copy`}
      onClick={() => {
        navigator.clipboard?.writeText(hash).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="font-mono text-gray-600 hover:text-blue-700"
    >
      {copied ? "copied ✓" : `${hash.slice(0, 8)}…${hash.slice(-6)}`}
    </button>
  );
}

function PhotoCard({ photo, url }) {
  const link = mapsLink(photo);
  const drift =
    photo.captured_at && Math.abs(new Date(photo.captured_at) - new Date(photo.created_at)) > CLOCK_DRIFT_MS;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={`Capture ${photo.id}`} loading="lazy" className="w-full h-44 object-cover bg-gray-100" />
        </a>
      ) : (
        <div className="h-44 bg-gray-100 flex items-center justify-center text-xs text-gray-400">Preview unavailable</div>
      )}
      <div className="p-4 space-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
            {photo.source === "on_demand" ? "On-demand" : "Motion"}
          </span>
          {photo.hash_verified ? (
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">Hash verified at upload</span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">No device hash</span>
          )}
          {link ? (
            <a href={link} target="_blank" rel="noreferrer" className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200">
              GPS {photo.lat.toFixed(5)}, {photo.lon.toFixed(5)}
              {photo.accuracy_m != null ? ` ±${Math.round(photo.accuracy_m)}m` : ""}
            </a>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold">No GPS fix</span>
          )}
        </div>
        <p className="text-gray-700">
          <span className="text-gray-400">Received (server): </span>
          {fmt(photo.created_at)}
        </p>
        <p className="text-gray-700">
          <span className="text-gray-400">Captured (phone clock): </span>
          {fmt(photo.captured_at)}
          {drift && <span className="ml-1 text-amber-600 font-semibold">· differs from server time</span>}
        </p>
        <p className="text-gray-700">
          <span className="text-gray-400">SHA-256: </span>
          <CopyHash hash={photo.sha256} />
          {photo.size_bytes != null && <span className="text-gray-400"> · {(photo.size_bytes / 1024).toFixed(0)} KB</span>}
        </p>
      </div>
    </div>
  );
}

export default function PhotoEvidencePage({ session }) {
  const accessToken = session?.access_token;
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const [devices, setDevices] = useState([]);
  const [imei, setImei] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [capture, setCapture] = useState({ state: "idle", message: "" }); // idle|queued|sent|done|failed
  const [exporting, setExporting] = useState(null); // null | { done, total }
  const [exportMsg, setExportMsg] = useState(null);
  const captureRun = useRef(0);

  const device = devices.find((d) => d.imei === imei);

  useEffect(() => {
    if (!accessToken) return;
    fetchDevices(accessToken)
      .then((rows) => {
        setDevices(rows);
        setImei((cur) => cur || (rows.find((d) => d.imei === "DG-1028") || rows[0])?.imei || "");
      })
      .catch((e) => setError(e.message));
  }, [accessToken]);

  const loadFeed = useCallback(async () => {
    if (!tokenRef.current || !imei) return;
    try {
      const rows = await fetchPhotos(tokenRef.current, imei, { from, to, limit: 100 });
      setPhotos(rows);
      setUrls(await signPhotoUrls(tokenRef.current, rows.map((r) => r.storage_path)));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [imei, from, to]);

  useEffect(() => {
    setLoading(true);
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    const id = setInterval(loadFeed, FEED_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadFeed]);

  useEffect(() => {
    if (!imei) return undefined;
    return subscribeToPhotos(imei, () => loadFeed());
  }, [imei, loadFeed]);

  useEffect(() => () => { captureRun.current += 1; }, []); // cancel polling on unmount

  const busy = capture.state === "queued" || capture.state === "sent";

  const handleCapture = async () => {
    if (!imei || busy) return;
    const run = ++captureRun.current;
    setCapture({ state: "queued", message: "Request sent — waiting for the phone…" });
    try {
      const cmd = await queueTakePhotoCommand(tokenRef.current, imei);
      const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
      while (run === captureRun.current) {
        if (Date.now() > deadline) {
          setCapture({ state: "failed", message: "No response from the phone in 2 minutes. Is the camera page open and armed?" });
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (run !== captureRun.current) return;
        const row = await fetchCommand(tokenRef.current, cmd.id);
        if (!row) continue;
        if (row.status === "sent") setCapture({ state: "sent", message: "Phone is taking the photo…" });
        if (row.status === "done") {
          setCapture({ state: "done", message: "Photo received ✓" });
          loadFeed();
          setTimeout(() => run === captureRun.current && setCapture({ state: "idle", message: "" }), 5000);
          return;
        }
        if (row.status === "failed") {
          setCapture({
            state: "failed",
            message: row.error === "expired" ? "The phone didn't pick up the request in time." : `Capture failed${row.error ? `: ${row.error}` : ""}`,
          });
          return;
        }
      }
    } catch (e) {
      setCapture({ state: "failed", message: e.message });
    }
  };

  const handleExport = async () => {
    setExportMsg(null);
    setExporting({ done: 0, total: 0 });
    try {
      const rows = await fetchPhotos(tokenRef.current, imei, { from, to, limit: 501 });
      if (!rows.length) throw new Error("No photos in this range.");
      if (rows.length > 500) throw new Error("More than 500 photos in range — narrow the dates.");
      const { blob, filename, problems, count } = await buildEvidencePackage({
        accessToken: tokenRef.current,
        imei,
        photos: rows,
        exportedBy: session?.user?.email,
        onProgress: (done, total) => setExporting({ done, total }),
      });
      downloadBlob(blob, filename);
      setExportMsg({
        ok: problems === 0,
        text:
          problems === 0
            ? `Exported ${count} photos — all fingerprints match.`
            : `Exported ${count} photos, but ${problems} did not verify. See the "integrity" column in manifest.csv.`,
      });
    } catch (e) {
      setExportMsg({ ok: false, text: e.message });
    } finally {
      setExporting(null);
    }
  };

  const captureStyles = {
    idle: "bg-blue-600 hover:bg-blue-700 text-white",
    queued: "bg-gray-100 text-gray-400 cursor-not-allowed",
    sent: "bg-gray-100 text-gray-400 cursor-not-allowed",
    done: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    failed: "bg-red-50 text-red-700 ring-1 ring-red-200",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900">Photo Evidence</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          On-demand captures with time, GPS and a SHA-256 fingerprint, exportable as an evidence package.
        </p>
      </div>

      <div className="p-8 space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-wrap items-end gap-4">
          <label className="text-xs text-gray-500">
            Device
            <select
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 min-w-48"
            >
              {devices.map((d) => (
                <option key={d.imei} value={d.imei}>
                  {d.imei}{d.model ? ` — ${d.model}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div>
            <button
              onClick={handleCapture}
              disabled={!imei || busy}
              className={`text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors ${captureStyles[capture.state]}`}
            >
              {busy ? "Capturing…" : "Capture now"}
            </button>
          </div>

          <div className="flex items-end gap-2 ml-auto">
            <label className="text-xs text-gray-500">
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
            </label>
            <label className="text-xs text-gray-500">
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
            </label>
            <button
              onClick={handleExport}
              disabled={!imei || !!exporting || photos.length === 0}
              className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              {exporting ? `Exporting ${exporting.done}/${exporting.total || "…"}` : "Export evidence"}
            </button>
          </div>

          {capture.message && (
            <p className={`basis-full text-xs ${capture.state === "failed" ? "text-red-600" : capture.state === "done" ? "text-emerald-700" : "text-gray-500"}`}>
              {capture.message}
            </p>
          )}
          {device && device.status !== "online" && capture.state === "idle" && (
            <p className="basis-full text-xs text-amber-600">
              {imei} was last seen {fmt(device.last_seen)} — a capture request expires after 2 minutes if the phone isn't connected.
            </p>
          )}
          {exportMsg && (
            <p className={`basis-full text-xs ${exportMsg.ok ? "text-emerald-700" : "text-red-600"}`}>{exportMsg.text}</p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-gray-400">Loading photos…</p>}
        {!loading && !error && photos.length === 0 && (
          <p className="text-sm text-gray-400">No photos for this device{from || to ? " in this range" : " yet"}. Use “Capture now”.</p>
        )}
        {photos.length > 0 && (
          <>
            <p className="text-xs text-gray-400">
              Showing the latest {photos.length} (newest first){photos.length === 100 ? " — narrow the dates to see older ones" : ""}.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {photos.map((p) => (
                <PhotoCard key={p.id} photo={p} url={urls[p.storage_path]} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
