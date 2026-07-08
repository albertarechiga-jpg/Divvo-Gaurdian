export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export async function geocode(place) {
  const encoded = encodeURIComponent(place.trim());
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encoded}&access_token=${MAPBOX_TOKEN}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data = await res.json();
  const feat = data.features?.[0];
  if (!feat) throw new Error(`Could not find a location for "${place}"`);
  return feat.geometry.coordinates; // [lng, lat]
}

// coord: [lng, lat] -> human-readable place (city/county/state), best-effort.
// There is no reliable public directory mapping coordinates to the correct
// law-enforcement agency's contact info, so this only resolves the place
// name — the recipient is still a human decision (see RecoveryDetail.jsx's
// contactAgency()).
export async function reverseGeocode([lng, lat]) {
  const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Reverse geocoding failed (${res.status})`);
  const data = await res.json();
  const feat = data.features?.[0];
  if (!feat) return null;
  const ctx = feat.properties?.context || {};
  return {
    placeName: feat.properties?.full_address || feat.properties?.name || null,
    city: ctx.place?.name || null,
    county: ctx.district?.name || null,
    state: ctx.region?.name || null,
  };
}
