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
