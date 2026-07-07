import { useState } from "react";
import { updatePassword } from "../lib/auth.js";

export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(password);
      onDone();
    } catch (err) {
      setError(err.message || "Failed to update password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <p className="text-white text-base font-bold tracking-tight leading-none">Divvo Guardian</p>
            <p className="text-blue-400 text-xs mt-0.5 font-medium">by Divvo Global</p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-6">
          <h1 className="text-white text-sm font-bold mb-1">Set a new password</h1>
          <p className="text-gray-500 text-xs mb-5">Choose a new password for your account.</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-gray-400 text-xs font-semibold mb-1">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs font-semibold mb-1">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg py-2.5 transition-colors disabled:opacity-50"
            >
              {submitting ? "Updating…" : "Update Password"}
            </button>
          </form>
        </div>

        <p className="text-gray-600 text-xs text-center mt-6">© 2026 Divvo Global LLC</p>
      </div>
    </div>
  );
}
