import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

const EXTENSIONS = [
  { name: "nos2x", url: "https://chrome.google.com/webstore/detail/nos2x/kpgefcfmnafjgpblbdjbbenonbnepbkg" },
  { name: "Alby", url: "https://getalby.com" },
  { name: "Keys.Band", url: "https://keys.band" },
];

const NoExtensionModal = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
    <div className="bg-[#111] border border-white/10 rounded p-8 max-w-sm w-full mx-4">
      <h3 className="text-yellow-400 font-semibold text-sm mb-3">No Extension Found</h3>
      <p className="text-white/50 text-sm mb-5">Install a Nostr extension to continue:</p>
      <div className="flex flex-col gap-2">
        {EXTENSIONS.map((ext) => (
          <a key={ext.name} href={ext.url} target="_blank" rel="noopener noreferrer"
            className="text-green-400 text-sm hover:underline">
            {ext.name} →
          </a>
        ))}
      </div>
      <button onClick={onClose} className="mt-6 text-white/30 text-xs cursor-pointer bg-transparent border-none">
        Dismiss
      </button>
    </div>
  </div>
);

const Home = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [noExtModal, setNoExtModal] = useState(false);

  const handleLoginToCreate = async () => {
    setLoading(true);
    const result = await login();
    setLoading(false);
    if (result.ok) navigate("/admin/dashboard");
    else if (result.error === "no_extension") setNoExtModal(true);
  };

  return (
    <>
      <div className="min-h-[calc(100vh-60px)] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-5xl font-bold text-white">GlassAbbey</h1>
        <p className="text-white/50 text-base">Welcome to the Auction House</p>
        <div className="flex gap-3 mt-2">
          <a href="/explore" className="px-6 py-2.5 border border-white/20 text-white text-sm rounded hover:border-white/40 transition-colors">
            Explore
          </a>
          <button onClick={handleLoginToCreate} disabled={loading}
            className="px-6 py-2.5 border border-green-500 text-green-400 text-sm rounded hover:bg-green-500/10 transition-colors disabled:opacity-50 cursor-pointer">
            {loading ? "Connecting…" : "Login to Create"}
          </button>
        </div>
      </div>
      {noExtModal && <NoExtensionModal onClose={() => setNoExtModal(false)} />}
    </>
  );
};

export default Home;