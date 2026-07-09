import { useState } from "react";
import { createShipment } from "../lib/shipments.js";

export default function AddShipmentModal({ companyInfo, session, onClose, onCreated }) {
  const [cargoType, setCargoType] = useState("");
  const [containerNumber, setContainerNumber] = useState("");
  const [originPort, setOriginPort] = useState("");
  const [destination, setDestination] = useState("");
  const [carrier, setCarrier] = useState("");
  const [cargoValue, setCargoValue] = useState("");
  const [eta, setEta] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!destination.trim()) {
      setError("Destination is required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const shipment = await createShipment(session.access_token, {
        companyId: companyInfo.id,
        customer: companyInfo.name,
        cargoType: cargoType.trim() || undefined,
        containerNumber: containerNumber.trim() || undefined,
        originPort: originPort.trim() || undefined,
        destination: destination.trim(),
        carrier: carrier.trim() || undefined,
        cargoValue: cargoValue ? Number(cargoValue) : undefined,
        eta: eta || undefined,
      });
      onCreated(shipment);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create shipment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-white text-sm font-bold">Add Shipment</h2>
            <p className="text-gray-500 text-xs mt-0.5">For {companyInfo.name} — persisted, survives a refresh.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 -mt-1 -mr-1 p-1" aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1">Cargo Type</label>
            <input
              value={cargoType}
              onChange={(e) => setCargoType(e.target.value)}
              placeholder="Consumer Electronics"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1">Container Number</label>
            <input
              value={containerNumber}
              onChange={(e) => setContainerNumber(e.target.value)}
              placeholder="MSCU1234567"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 text-xs font-semibold mb-1">Origin</label>
              <input
                value={originPort}
                onChange={(e) => setOriginPort(e.target.value)}
                placeholder="Houston, TX"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs font-semibold mb-1">Destination</label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Los Angeles, CA"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1">Carrier</label>
            <input
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="Maersk Line"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 text-xs font-semibold mb-1">Cargo Value (USD)</label>
              <input
                type="number"
                value={cargoValue}
                onChange={(e) => setCargoValue(e.target.value)}
                placeholder="500000"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs font-semibold mb-1">ETA</label>
              <input
                type="datetime-local"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
              />
            </div>
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
              {submitting ? "Creating…" : "Create Shipment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
