// ── Company registry ──────────────────────────────────────────────────────────
// The registry itself (id/name/region/map center) now lives in Supabase's
// `companies` table — see src/lib/companies.js — so new companies can be
// created at runtime instead of requiring a code change. This file keeps only
// the static demo fleet/shipment-route data for the companies that have real
// mock hardware/lanes configured (owlet, meridian, coastal). A company with no
// entry here simply gets an empty fleet (see the `|| []` fallbacks where these
// are read) until real devices are onboarded.

// ── Live devices & shipments, keyed by company id ────────────────────────────
export const COMPANY_DEVICES = {
  owlet: [
    { id: "DG-1028", trailerId: "TRL-4482", lat: 27.5306, lon: -99.4803, severity: "Critical", type: "Lock Tamper Detected",           location: "I-35 N near Laredo, TX",          battery: 74, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Tampered", vibration: "Elevated", checkin: "10:14 AM", carrier: "Maersk Line",    cargo: "$840,000" },
    { id: "DG-1041", trailerId: "TRL-3391", lat: 27.8006, lon: -97.3964, severity: "Critical", type: "Door Opened Outside Geofence",    location: "US-281 near Corpus Christi, TX",   battery: 61, lte: "Moderate", camera: "Online",   door: "Open",    lock: "Unlocked", vibration: "Elevated", checkin: "10:09 AM", carrier: "Hapag-Lloyd",    cargo: "$1,200,000" },
    { id: "DG-0994", trailerId: "TRL-8820", lat: 29.4241, lon: -98.4936, severity: "Warning",  type: "Battery Below 18%",               location: "I-10 W near San Antonio, TX",      battery: 17, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "09:52 AM", carrier: "COSCO Shipping", cargo: "$560,000" },
    { id: "DG-1102", trailerId: "TRL-5567", lat: 29.5736, lon: -98.6947, severity: "Warning",  type: "GPS Signal Degraded",             location: "FM-2252 near Helotes, TX",         battery: 88, lte: "Weak",    camera: "Degraded", door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "09:38 AM", carrier: "Evergreen",      cargo: "$320,000" },
    { id: "DG-1055", trailerId: "TRL-2210", lat: 29.3787, lon: -98.5531, severity: "Secure",   type: "All Systems Normal",              location: "I-410 Loop, San Antonio TX",       battery: 92, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "10:18 AM", carrier: "Maersk Line",    cargo: "$420,000" },
    { id: "DG-1076", trailerId: "TRL-7714", lat: 29.7282, lon: -95.2713, severity: "Secure",   type: "All Systems Normal",              location: "Port of Houston — Bay 14",         battery: 78, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "10:15 AM", carrier: "COSCO Shipping", cargo: "$980,000" },
    { id: "DG-1088", trailerId: "TRL-3305", lat: 29.7030, lon: -98.0810, severity: "Secure",   type: "All Systems Normal",              location: "I-35 S near New Braunfels TX",     battery: 85, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "10:12 AM", carrier: "Hapag-Lloyd",    cargo: "$650,000" },
    { id: "DG-1099", trailerId: "TRL-9921", lat: 29.5688, lon: -97.9641, severity: "Secure",   type: "All Systems Normal",              location: "IH-10 E near Seguin TX",          battery: 69, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "10:08 AM", carrier: "Evergreen",      cargo: "$290,000" },
  ],
  meridian: [
    { id: "MR-2031", trailerId: "TRL-6621", lat: 47.2529, lon: -122.4443, severity: "Critical", type: "Lock Tamper Detected",           location: "I-5 S near Tacoma, WA",            battery: 68, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Tampered", vibration: "Elevated", checkin: "8:41 AM",  carrier: "ONE",       cargo: "$710,000" },
    { id: "MR-2044", trailerId: "TRL-7783", lat: 45.5051, lon: -122.6750, severity: "Critical", type: "Unauthorized Stop",              location: "I-84 near Portland, OR",           battery: 55, lte: "Moderate", camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Elevated", checkin: "8:36 AM",  carrier: "Yang Ming", cargo: "$1,050,000" },
    { id: "MR-1987", trailerId: "TRL-4410", lat: 47.0379, lon: -122.9007, severity: "Warning",  type: "Battery Below 18%",               location: "US-101 near Olympia, WA",          battery: 15, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "8:22 AM",  carrier: "ZIM",       cargo: "$480,000" },
    { id: "MR-2012", trailerId: "TRL-5528", lat: 47.6588, lon: -122.3321, severity: "Warning",  type: "GPS Signal Degraded",             location: "I-90 near Seattle, WA",            battery: 81, lte: "Weak",     camera: "Degraded", door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "8:19 AM",  carrier: "MSC",       cargo: "$390,000" },
    { id: "MR-2055", trailerId: "TRL-6690", lat: 47.2769, lon: -122.4218, severity: "Secure",   type: "All Systems Normal",              location: "Port of Tacoma — Berth 7",         battery: 90, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "8:44 AM",  carrier: "ONE",       cargo: "$860,000" },
    { id: "MR-2066", trailerId: "TRL-7701", lat: 47.5480, lon: -122.3326, severity: "Secure",   type: "All Systems Normal",              location: "Port of Seattle — Terminal 18",    battery: 84, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "8:40 AM",  carrier: "Yang Ming", cargo: "$620,000" },
    { id: "MR-2077", trailerId: "TRL-8814", lat: 45.5231, lon: -122.9750, severity: "Secure",   type: "All Systems Normal",              location: "I-5 N near Vancouver, WA",         battery: 76, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "8:30 AM",  carrier: "ZIM",       cargo: "$340,000" },
    { id: "MR-2088", trailerId: "TRL-9925", lat: 46.9787, lon: -122.7378, severity: "Secure",   type: "All Systems Normal",              location: "US-12 near Chehalis, WA",          battery: 71, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "8:15 AM",  carrier: "MSC",       cargo: "$275,000" },
  ],
  coastal: [
    { id: "CL-3041", trailerId: "TRL-1123", lat: 32.0835, lon: -81.0998, severity: "Critical", type: "Seal Tampering Detected",         location: "I-16 W near Savannah, GA",         battery: 71, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Tampered", vibration: "Elevated", checkin: "11:02 AM", carrier: "CMA CGM",   cargo: "$930,000" },
    { id: "CL-3059", trailerId: "TRL-2234", lat: 30.3322, lon: -81.6557, severity: "Critical", type: "Door Opened Outside Geofence",    location: "I-95 near Jacksonville, FL",       battery: 58, lte: "Moderate", camera: "Online",   door: "Open",    lock: "Unlocked", vibration: "Elevated", checkin: "10:57 AM", carrier: "OOCL",      cargo: "$1,410,000" },
    { id: "CL-3020", trailerId: "TRL-3345", lat: 32.7765, lon: -79.9311, severity: "Warning",  type: "Battery Below 18%",               location: "US-17 near Charleston, SC",        battery: 14, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "10:44 AM", carrier: "Wan Hai",   cargo: "$505,000" },
    { id: "CL-3033", trailerId: "TRL-4456", lat: 31.1801, lon: -81.4915, severity: "Warning",  type: "GPS Signal Degraded",             location: "I-95 near Brunswick, GA",          battery: 79, lte: "Weak",     camera: "Degraded", door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "10:39 AM", carrier: "APL",       cargo: "$365,000" },
    { id: "CL-3072", trailerId: "TRL-5567", lat: 32.1275, lon: -81.1435, severity: "Secure",   type: "All Systems Normal",              location: "Port of Savannah — Garden City",   battery: 88, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "11:05 AM", carrier: "CMA CGM",   cargo: "$1,020,000" },
    { id: "CL-3084", trailerId: "TRL-6678", lat: 30.4022, lon: -81.6714, severity: "Secure",   type: "All Systems Normal",              location: "Port of Jacksonville — Blount Is.", battery: 82, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "11:00 AM", carrier: "OOCL",      cargo: "$710,000" },
    { id: "CL-3095", trailerId: "TRL-7789", lat: 32.8998, lon: -79.9948, severity: "Secure",   type: "All Systems Normal",              location: "I-26 near North Charleston, SC",   battery: 75, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "10:50 AM", carrier: "Wan Hai",   cargo: "$455,000" },
    { id: "CL-3106", trailerId: "TRL-8890", lat: 31.5804, lon: -81.2076, severity: "Secure",   type: "All Systems Normal",              location: "US-17 near Darien, GA",            battery: 66, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "10:42 AM", carrier: "APL",       cargo: "$318,000" },
  ],
};

// Dashed reference routes drawn on the map, keyed by company id.
export const COMPANY_SHIPMENT_ROUTES = {
  owlet: [
    { id: "OWL-SAV-1003", severity: "Critical", from: [-81.0998, 32.0835], to: [-84.3880, 33.7490], label: "Savannah → Atlanta", cargo: "$3.1M", carrier: "Hapag-Lloyd", origin: "Savannah, GA", destination: "Atlanta, GA" },
    { id: "OWL-HOU-1001", severity: "High",     from: [-95.3698, 29.7604], to: [-118.2437, 34.0522], label: "Houston → LA",       cargo: "$2.4M", carrier: "Maersk Line", origin: "Houston, TX",  destination: "Los Angeles, CA" },
  ],
  meridian: [
    { id: "MER-SEA-2001", severity: "Critical", from: [-122.3321, 47.6588], to: [-122.6750, 45.5051], label: "Seattle → Portland", cargo: "$2.6M", carrier: "ONE",       origin: "Seattle, WA",  destination: "Portland, OR" },
    { id: "MER-TAC-2002", severity: "High",     from: [-122.4443, 47.2529], to: [-121.9886, 45.7749], label: "Tacoma → Salem",     cargo: "$1.9M", carrier: "Yang Ming", origin: "Tacoma, WA",   destination: "Salem, OR" },
  ],
  coastal: [
    { id: "CST-SAV-3001", severity: "Critical", from: [-81.0998, 32.0835], to: [-81.6557, 30.3322], label: "Savannah → Jacksonville", cargo: "$2.9M", carrier: "CMA CGM", origin: "Savannah, GA",   destination: "Jacksonville, FL" },
    { id: "CST-CHS-3002", severity: "High",     from: [-79.9311, 32.7765], to: [-81.0998, 32.0835], label: "Charleston → Savannah",   cargo: "$1.7M", carrier: "OOCL",    origin: "Charleston, SC", destination: "Savannah, GA" },
  ],
};

// Per-device origin/destination/carrier/cargo prefill for the AI Route Planner,
// keyed by company id then device id.
export const COMPANY_DEVICE_CONTEXT = {
  owlet: {
    "DG-1028": { origin: "Laredo, TX",          destination: "San Antonio, TX", carrier: "Maersk Line",    cargo: "$840,000" },
    "DG-1041": { origin: "Corpus Christi, TX",  destination: "Houston, TX",     carrier: "Hapag-Lloyd",    cargo: "$1,200,000" },
    "DG-0994": { origin: "San Antonio, TX",     destination: "Dallas, TX",      carrier: "COSCO Shipping", cargo: "$560,000" },
    "DG-1102": { origin: "Helotes, TX",         destination: "San Antonio, TX", carrier: "Evergreen",      cargo: "$320,000" },
    "DG-1055": { origin: "San Antonio, TX",     destination: "Austin, TX",      carrier: "Maersk Line",    cargo: "$420,000" },
    "DG-1076": { origin: "Houston, TX",         destination: "New Orleans, LA", carrier: "COSCO Shipping", cargo: "$980,000" },
    "DG-1088": { origin: "New Braunfels, TX",   destination: "San Antonio, TX", carrier: "Hapag-Lloyd",    cargo: "$650,000" },
    "DG-1099": { origin: "Seguin, TX",          destination: "Houston, TX",     carrier: "Evergreen",      cargo: "$290,000" },
  },
  meridian: {
    "MR-2031": { origin: "Tacoma, WA",    destination: "Portland, OR",  carrier: "ONE",       cargo: "$710,000" },
    "MR-2044": { origin: "Portland, OR",  destination: "Salem, OR",     carrier: "Yang Ming", cargo: "$1,050,000" },
    "MR-1987": { origin: "Olympia, WA",   destination: "Tacoma, WA",    carrier: "ZIM",       cargo: "$480,000" },
    "MR-2012": { origin: "Seattle, WA",   destination: "Tacoma, WA",    carrier: "MSC",       cargo: "$390,000" },
    "MR-2055": { origin: "Tacoma, WA",    destination: "Seattle, WA",   carrier: "ONE",       cargo: "$860,000" },
    "MR-2066": { origin: "Seattle, WA",   destination: "Everett, WA",   carrier: "Yang Ming", cargo: "$620,000" },
    "MR-2077": { origin: "Vancouver, WA", destination: "Portland, OR",  carrier: "ZIM",       cargo: "$340,000" },
    "MR-2088": { origin: "Chehalis, WA",  destination: "Olympia, WA",   carrier: "MSC",       cargo: "$275,000" },
  },
  coastal: {
    "CL-3041": { origin: "Savannah, GA",    destination: "Atlanta, GA",      carrier: "CMA CGM", cargo: "$930,000" },
    "CL-3059": { origin: "Jacksonville, FL",destination: "Savannah, GA",     carrier: "OOCL",    cargo: "$1,410,000" },
    "CL-3020": { origin: "Charleston, SC",  destination: "Savannah, GA",     carrier: "Wan Hai", cargo: "$505,000" },
    "CL-3033": { origin: "Brunswick, GA",   destination: "Jacksonville, FL", carrier: "APL",     cargo: "$365,000" },
    "CL-3072": { origin: "Savannah, GA",    destination: "Charleston, SC",   carrier: "CMA CGM", cargo: "$1,020,000" },
    "CL-3084": { origin: "Jacksonville, FL",destination: "Orlando, FL",      carrier: "OOCL",    cargo: "$710,000" },
    "CL-3095": { origin: "Charleston, SC",  destination: "Savannah, GA",     carrier: "Wan Hai", cargo: "$455,000" },
    "CL-3106": { origin: "Darien, GA",      destination: "Jacksonville, FL", carrier: "APL",     cargo: "$318,000" },
  },
};
