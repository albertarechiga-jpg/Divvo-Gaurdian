// Shared mapbox-gl CDN loader (mirrors the per-page pattern already used in
// UnifiedCommandCenter.jsx) — cached so multiple device cards on the same
// page don't each inject their own <script>/<link> or race to set
// window.mapboxgl.accessToken.
import { MAPBOX_TOKEN } from "./mapbox.js";

let loadPromise = null;

export function loadMapboxGl() {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js";
    script.onload = () => {
      window.mapboxgl.accessToken = MAPBOX_TOKEN;
      resolve(window.mapboxgl);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return loadPromise;
}
