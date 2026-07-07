import { useState } from "react";
import { signIn, requestPasswordReset } from "../lib/auth.js";

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setNotice("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // onAuthStateChange in App.jsx picks up the new session from here.
    } catch (err) {
      setError(err.message || "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Enter your email first");
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setNotice("If that email has an account, a reset link is on its way — check your inbox.");
    } catch (err) {
      setError(err.message || "Failed to send reset email");
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
          {mode === "signin" ? (
            <>
              <h1 className="text-white text-sm font-bold mb-1">Sign in</h1>
              <p className="text-gray-500 text-xs mb-5">Access is invite-only. Contact your admin if you need an account.</p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-gray-400 text-xs font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
                    placeholder="you@divvoglobal.com"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-gray-400 text-xs font-semibold">Password</label>
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
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
                  {submitting ? "Signing in…" : "Sign In"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-white text-sm font-bold mb-1">Reset your password</h1>
              <p className="text-gray-500 text-xs mb-5">Enter your account email and we'll send you a reset link.</p>

              <form onSubmit={handleForgot} className="space-y-3">
                <div>
                  <label className="block text-gray-400 text-xs font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600"
                    placeholder="you@divvoglobal.com"
                  />
                </div>

                {error && <p className="text-red-400 text-xs">{error}</p>}
                {notice && <p className="text-emerald-400 text-xs">{notice}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg py-2.5 transition-colors disabled:opacity-50"
                >
                  {submitting ? "Sending…" : "Send Reset Link"}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="w-full text-gray-400 hover:text-gray-200 text-xs font-medium py-1"
                >
                  ← Back to sign in
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-gray-600 text-xs text-center mt-6">© 2026 Divvo Global LLC</p>
      </div>
    </div>
  );
}
