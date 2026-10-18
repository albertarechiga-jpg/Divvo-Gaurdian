import { useEffect, useRef } from "react";
import { loadMapboxGl } from "../lib/mapboxLoader.js";

export default function DeviceMapPin({ lat, lng }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (lat == null || lng == null || !containerRef.current) return;
    let cancelled = false;

    loadMapboxGl().then((mapboxgl) => {
      if (cancelled || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          center: [lng, lat],
          zoom: 11,
          interactive: false,
          attributionControl: false,
        });
      } else {
        mapRef.current.setCenter([lng, lat]);
      }

      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
      } else {
        const el = document.createElement("div");
        el.style.cssText =
          "width:14px;height:14px;border-radius:50%;background:#f97316;border:2px solid white;box-shadow:0 0 0 2px rgba(249,115,22,0.4);";
        markerRef.current = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(mapRef.current);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  if (lat == null || lng == null) {
    return (
      <div className="h-32 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-400">
        No GPS fix yet
      </div>
    );
  }

  return <div ref={containerRef} className="h-32 rounded-lg overflow-hidden" />;
}
