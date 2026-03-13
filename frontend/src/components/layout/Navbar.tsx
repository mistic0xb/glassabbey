import { Link, useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";

const Navbar = () => {
  const { isAuthenticated, userName, userPicture, login, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    const result = await login();
    if (result.ok) navigate("/admin/dashboard");
  };

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 h-15 bg-[#080806] border-b border-white/10">
      <Link to="/" className="text-white font-bold text-base no-underline">
        GlassAbbey
      </Link>

      <div className="flex items-center gap-6">
        <Link
          to="/explore"
          className="text-white/50 text-sm hover:text-white transition-colors no-underline"
        >
          Explore
        </Link>
        {isAuthenticated && (
          <Link
            to="/admin/dashboard"
            className="text-white/50 text-sm hover:text-white transition-colors no-underline"
          >
            Dashboard
          </Link>
        )}

        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            {userPicture && (
              <img
                src={userPicture}
                alt="Profile"
                className="w-8 h-8 rounded-full object-cover"
              />
            )}
            <span className="text-white text-sm">{userName || "Nostrich"}</span>
            <button
              onClick={logout}
              className="border border-white/20 text-red-400 text-xs px-3 py-1 rounded hover:border-red-400/50 transition-colors cursor-pointer bg-transparent"
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogin}
            className="border border-green-500 text-green-400 text-sm px-4 py-1.5 rounded hover:bg-green-500/10 transition-colors cursor-pointer bg-transparent"
          >
            Connect Nostr
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
