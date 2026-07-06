import { useEffect, useRef, useState } from "react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// markers: [{ coord: [lng, lat], color, label }]
// line: { from: [lng, lat], to: [lng, lat], color } (optional)
export default function RouteMap({ markers = [], line, height = "224px" }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const mapInitStarted = useRef(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (mapInitStarted.current || !mapContainer.current) return;
    mapInitStarted.current = true;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js";
    script.onload = () => {
      window.mapboxgl.accessToken = MAPBOX_TOKEN;
      const allCoords = [...markers.map((m) => m.coord), ...(line ? [line.from, line.to] : [])];
      const bounds = allCoords.reduce(
        (b, c) => b.extend(c),
        new window.mapboxgl.LngLatBounds(allCoords[0], allCoords[0])
      );
      map.current = new window.mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/dark-v11",
        bounds,
        fitBoundsOptions: { padding: 48, maxZoom: 9 },
      });
      map.current.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.current.on("load", () => setLoaded(true));
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!loaded || !window.mapboxgl) return;

    if (line && !map.current.getSource("route-map-line")) {
      map.current.addSource("route-map-line", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [line.from, line.to] } },
      });
      map.current.addLayer({
        id: "route-map-line",
        type: "line",
        source: "route-map-line",
        paint: { "line-color": line.color || "#3b82f6", "line-width": 2, "line-dasharray": [3, 3], "line-opacity": 0.7 },
      });
    }

    markers.forEach((m) => {
      const el = document.createElement("div");
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${m.color || "#3b82f6"};border:2px solid white;box-shadow:0 0 6px ${m.color || "#3b82f6"}88;`;
      new window.mapboxgl.Marker(el).setLngLat(m.coord).addTo(map.current);
    });
  }, [loaded]);

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
      {!loaded && (
        <div
          className="text-gray-400 text-xs"
          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}
        >
          Loading map…
        </div>
      )}
    </div>
  );
}
