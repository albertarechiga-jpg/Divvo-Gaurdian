import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { BRAND_DEFAULTS } from "../config/brand.js";
import { fetchBrandSettings, normalizeBrand } from "../lib/brand.js";

const BrandContext = createContext({
  brand: BRAND_DEFAULTS,
  brandId: null,
  loading: true,
  refreshBrand: () => {},
});

// Loads the active company's brand_settings row (if any) and makes it
// available to every component underneath via useBrand() — no page-specific
// fetch needed. Falls back to BRAND_DEFAULTS whenever no row is saved yet,
// or while a company is still loading, so consumers never need a null check.
export function BrandProvider({ companyId, children }) {
  const [brand, setBrand]     = useState(BRAND_DEFAULTS);
  const [brandId, setBrandId] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshBrand = useCallback(() => {
    if (!companyId) {
      setBrand(BRAND_DEFAULTS);
      setBrandId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchBrandSettings(companyId).then((row) => {
      setBrand(normalizeBrand(row));
      setBrandId(row?.id ?? null);
      setLoading(false);
    });
  }, [companyId]);

  useEffect(() => { refreshBrand(); }, [refreshBrand]);

  // Browser tab title — the one piece of the app that can't just call
  // useBrand() itself.
  useEffect(() => { document.title = brand.appName; }, [brand.appName]);

  return (
    <BrandContext.Provider value={{ brand, brandId, loading, refreshBrand }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}
