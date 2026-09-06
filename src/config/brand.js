// Single source of truth for app branding. Every UI-facing "Nihlus Vision" /
// company-name / logo / accent-color string in the app should read from here
// (directly, or via the per-company override in src/context/BrandContext.jsx)
// instead of being hardcoded — this is what lets Settings > Branding change
// the name/logo live without a code change.
//
// logoUrl is null by default: there is no bundled logo image asset (the
// current UI uses an inline SVG mark), so leaving this null keeps that
// fallback mark instead of pointing at an image that doesn't exist. Setting
// a logo (via Settings > Branding, once persisted) switches the UI to an
// <img> using this URL.
export const BRAND_DEFAULTS = {
  appName: "Nihlus Vision",
  companyName: "Nihlus",
  shortName: "Nihlus",
  tagline: "Smart Trailer Security",
  logoUrl: null,
  primaryColor: "#f97316",
};
