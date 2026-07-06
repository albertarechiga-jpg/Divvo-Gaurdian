import { useState } from "react";
import { createCompany } from "../lib/companies.js";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

async function geocode(place) {
  const encoded = encodeURIComponent(place.trim());
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encoded}&access_token=${MAPBOX_TOKEN}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data = await res.json();
  const feat = data.features?.[0];
  if (!feat) throw new Error(`Could not find a location for "${place}"`);
  return feat.geometry.coordinates; // [lng, lat]
}

export default function AddCompanyModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Company name is required");
      return;
    }
    if (!region.trim()) {
      setError("Region or city is required so the map can be centered");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const mapCenter = await geocode(region);
      const company = await createCompany({
        name: name.trim(),
        region: region.trim(),
        mapCenter,
        mapZoom: 5.8,
        primaryEmail: email.trim() || undefined,
        primaryPhone: phone.trim() || undefined,
      });
      onCreated(company);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create company");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-white text-sm font-bold">Add Company</h2>
            <p className="text-gray-500 text-xs mt-0.5">Onboard a new client — starts empty until fleet devices are configured.</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 -mt-1 -mr-1 p-1"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1">Company Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Freight"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1">Region / City</label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Phoenix, Arizona"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
            />
            <p className="text-gray-600 text-xs mt-1">Used to center the map for this client's fleet.</p>
          </div>

          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1">Primary Contact Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops@acmefreight.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1">Primary Contact Phone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 210 555 0000"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg py-2 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg py-2 transition-colors disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create Company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
