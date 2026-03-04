import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAuthenticated, userPubkey, userName, userPicture, login, logout } =
    useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    const result = await login();
    if (result.ok) navigate("/admin/dashboard");
  };

  const shortKey = userPubkey ? `${userPubkey.slice(0, 8)}…` : null;

  return (
    <nav className="w-full bg-[var(--bg-base)] border-b border-[var(--border-subtle)] sticky top-0 z-50">
      <div className="mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo - Made larger and bolder */}
        <Link to="/" className="flex items-center gap-4 group">
          <div className="relative w-10 h-10 rotate-45 flex items-center justify-center transition-all duration-500 group-hover:rotate-[225deg] border-2 border-[var(--gold-mid)]">
            <div className="w-2 h-2 bg-[var(--gold-mid)] rotate-[-45deg]" />
          </div>
          <span className="font-bold text-lg tracking-[0.25em] text-[var(--gold-mid)] uppercase">
            GLASSABBEY
          </span>
        </Link>

        {/* Desktop Links - Improved spacing and font-weight */}
        <div className="hidden md:flex items-center gap-8">
          <Link
            to="/explore"
            className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] hover:text-white transition-colors"
          >
            Explore
          </Link>

          {isAuthenticated && (
            <Link
              to="/admin/dashboard"
              className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] hover:text-white transition-colors"
            >
              Dashboard
            </Link>
          )}
        </div>

        {/* Desktop Auth Section */}
        <div className="hidden md:flex items-center gap-6">
          {isAuthenticated ? (
            <div className="flex items-center gap-4 pl-10">
              {/* Profile Cluster */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs font-bold text-white leading-none mb-1">
                    {userName || "Nostrich"}
                  </p>
                </div>

                {/* User Picture with Gold Ring */}
                <div className="w-10 h-10 rounded-full border-2 border-[var(--gold-dim)] overflow-hidden bg-[var(--bg-elevated)]">
                  {userPicture ? (
                    <img
                      src={userPicture}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--gold-mid)] bg-[var(--gold-dim)]/20">
                      ?
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={logout}
                className="px-3 py-1 text-[10px] font-bold uppercase tracking-tighter border border-[var(--border-subtle)] text-[var(--silver-dark)] hover:text-[var(--danger)] hover:border-[var(--danger)] transition-all rounded"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="px-8 py-2.5 text-xs font-bold uppercase tracking-[0.15em] border-2 border-[var(--gold-mid)] text-[var(--gold-mid)] hover:bg-[var(--gold-mid)] hover:text-black transition-all shadow-[0_0_15px_rgba(212,175,55,0.1)] hover:shadow-[0_0_20px_rgba(212,175,55,0.3)]"
            >
              Connect Nostr
            </button>
          )}
        </div>

        {/* Mobile Toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden flex flex-col justify-center items-end gap-1.5 w-8 h-8"
        >
          <span
            className={`h-0.5 bg-[var(--gold-mid)] transition-all duration-300 ${mobileOpen ? "w-8 rotate-45 translate-y-2" : "w-8"}`}
          />
          <span
            className={`h-0.5 bg-[var(--gold-mid)] transition-all duration-300 ${mobileOpen ? "opacity-0" : "w-5"}`}
          />
          <span
            className={`h-0.5 bg-[var(--gold-mid)] transition-all duration-300 ${mobileOpen ? "w-8 -rotate-45 -translate-y-2" : "w-3"}`}
          />
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-20 bg-[var(--bg-base)] z-50 px-8 py-12 flex flex-col gap-8 animate-in fade-in slide-in-from-top-4">
          {isAuthenticated && (
            <div className="flex items-center gap-4 p-4 border border-[var(--border-subtle)] rounded-lg">
              <img
                src={userPicture || ""}
                className="w-14 h-14 rounded-full border border-[var(--gold-dim)]"
                alt="Profile"
              />
              <div>
                <p className="text-lg font-bold text-white">{userName}</p>
                <p className="text-xs text-[var(--silver-dark)]">{shortKey}</p>
              </div>
            </div>
          )}

          <Link
            to="/explore"
            onClick={() => setMobileOpen(false)}
            className="text-2xl font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--gold-mid)]"
          >
            Explore
          </Link>

          {isAuthenticated ? (
            <>
              <Link
                to="/admin/dashboard"
                onClick={() => setMobileOpen(false)}
                className="text-2xl font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--gold-mid)]"
              >
                Dashboard
              </Link>

              <button
                onClick={() => {
                  logout();
                  setMobileOpen(false);
                }}
                className="text-left text-sm font-bold uppercase tracking-widest text-[var(--danger-muted)]"
              >
                Disconnect Wallet
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                handleLogin();
                setMobileOpen(false);
              }}
              className="mt-4 w-full py-4 text-sm font-bold uppercase border-2 border-[var(--gold-mid)] text-[var(--gold-mid)]"
            >
              Login with Nostr
            </button>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
