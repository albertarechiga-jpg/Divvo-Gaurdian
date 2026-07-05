const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "shipments", label: "Shipments" },
  { id: "alerts",    label: "Alerts" },
  { id: "incidents", label: "Incidents" },
  { id: "recovery",  label: "Recovery" },
  { id: "camera",    label: "Cameras" },
  { id: "reports",   label: "Reports" },
  { id: "settings",  label: "Settings" },
];

const NAV_ICONS = {
  "unified-command": (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
    </svg>
  ),
  "fleet-dashboard": (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  dashboard: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  shipments: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  alerts: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  incidents: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  recovery: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  camera: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  ),
  reports: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  settings: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
};

export default function Sidebar({ active, onNav, openAlerts, companies, selectedCompany, onCompanyChange }) {
  const current = companies?.find(c => c.id === selectedCompany) || companies?.[0];
  return (
    <aside className="w-60 h-screen bg-gray-950 flex flex-col flex-shrink-0 border-r border-gray-800/60 overflow-y-auto">
      {/* Brand */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-bold tracking-tight leading-none">Divvo Guardian</p>
            <p className="text-blue-400 text-xs mt-0.5 font-medium">by Divvo Global</p>
          </div>
        </div>
      </div>

      {/* Client badge / company switcher */}
      <div className="mx-4 mb-4 bg-blue-950/60 border border-blue-800/40 rounded-lg px-3 py-2.5">
        <p className="text-blue-300 text-xs font-semibold tracking-widest uppercase mb-1">Active Client</p>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-white rounded flex items-center justify-center flex-shrink-0">
            <span className="text-blue-700 text-xs font-black">{current?.name?.[0] || "?"}</span>
          </div>
          <div className="min-w-0 flex-1 relative">
            <select
              value={selectedCompany}
              onChange={(e) => onCompanyChange?.(e.target.value)}
              className="w-full bg-transparent text-white text-xs font-semibold leading-tight appearance-none cursor-pointer outline-none pr-4"
            >
              {companies?.map((c) => (
                <option key={c.id} value={c.id} className="bg-gray-900 text-white">{c.name}</option>
              ))}
            </select>
            <svg className="w-3 h-3 text-blue-400 absolute right-0 top-0.5 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6"/>
            </svg>
            <p className="text-blue-400 text-xs">{current?.program}</p>
          </div>
          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />
        </div>
      </div>

      {/* Command Center button */}
      <div className="px-3 mb-1">
        <button
          onClick={() => onNav("unified-command")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all mb-2 ${
            active === "unified-command" || active === "command" || active === "fleet-dashboard"
              ? "bg-red-600 text-white shadow-lg shadow-red-900/50"
              : "bg-red-950/40 border border-red-800/30 text-red-300 hover:bg-red-900/40 hover:text-red-100"
          }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
          </svg>
          <span className="font-bold tracking-wide">Command Center</span>
          <span className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
            <span className="text-xs font-semibold opacity-80">LIVE</span>
          </span>
        </button>
      </div>

      <div className="px-3 mb-2">
        <p className="text-gray-600 text-xs font-semibold uppercase tracking-widest px-2">Navigation</p>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onNav(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              active === item.id
                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40"
                : "text-gray-400 hover:bg-gray-800/60 hover:text-gray-200"
            }`}
          >
            <span className={active === item.id ? "text-white" : "text-gray-500"}>
              {NAV_ICONS[item.id]}
            </span>
            <span className="font-medium">{item.label}</span>
            {item.id === "alerts" && openAlerts > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs rounded-full min-w-5 h-5 px-1 flex items-center justify-center font-bold">
                {openAlerts}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800/60 mt-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-gray-300 text-xs font-semibold">AA</span>
          </div>
          <div className="min-w-0">
            <p className="text-gray-300 text-xs font-semibold truncate">Alberto Arechiga</p>
            <p className="text-gray-500 text-xs">Divvo Ops Analyst</p>
          </div>
          <div className="ml-auto w-1.5 h-1.5 bg-emerald-400 rounded-full" />
        </div>
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Divvo Guardian v1.0</p>
          <p className="text-gray-600 text-xs">© 2026 Divvo Global LLC</p>
        </div>
      </div>
    </aside>
  );
}
