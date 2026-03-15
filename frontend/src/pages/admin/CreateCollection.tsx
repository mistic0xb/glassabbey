import { useState } from "react";
import { useNavigate } from "react-router";
import { v4 as uuidv4 } from "uuid";
import { validateNWCString } from "../../libs/nwc/nwc";

const WS_URL = import.meta.env.VITE_AUCTION_WS_URL || "ws://localhost:8080";

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  error?: string;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs text-white/40 uppercase tracking-widest">
      {label}
      {required && <span className="text-red-400 ml-0.5">*</span>}
      {!required && <span className="text-white/20 ml-1">(optional)</span>}
    </label>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-white/5 border outline-none text-white text-sm px-3 py-2 rounded transition-colors placeholder:text-white/20 focus:border-white/30 ${
        error ? "border-red-500/60" : "border-white/10"
      }`}
    />
    {error && <p className="text-red-400 text-xs">{error}</p>}
  </div>
);

// Send NWC string to server via a short-lived WS connection.
// Fire-and-forget — errors are non-fatal, collection creation proceeds either way.
function registerNWC(lightningAddress: string, nwcString: string): void {
  try {
    const ws = new WebSocket(`${WS_URL}?action=register`);
    const timeout = setTimeout(() => ws.close(), 8_000);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({ type: "REGISTER_NWC", lightningAddress, nwcString }),
      );
    };
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string);
        if (data.type === "NWC_REGISTERED") {
          console.log("[NWC] Registered on server for", lightningAddress);
        }
      } catch {}
      clearTimeout(timeout);
      ws.close();
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      console.warn(
        "[NWC] Failed to register on server — server-side NWC polling unavailable",
      );
    };
  } catch (e) {
    console.warn("[NWC] registerNWC error:", e);
  }
}

const CreateCollection = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [lightningAddress, setLightningAddress] = useState("");
  const [nwcString, setNwcString] = useState("");
  const [location, setLocation] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleNwcChange = (v: string) => {
    setNwcString(v);
    if (!v.trim()) {
      setErrors((p) => ({ ...p, nwc: "" }));
      return;
    }
    const err = validateNWCString(v.trim());
    setErrors((p) => ({ ...p, nwc: err ?? "" }));
  };

  const handleNext = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Required.";
    if (!lightningAddress.trim()) e.lightningAddress = "Required.";
    if (nwcString.trim()) {
      const nwcErr = validateNWCString(nwcString.trim());
      if (nwcErr) e.nwc = nwcErr;
    }
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }

    // Register NWC on server — fire and forget, non-blocking
    if (nwcString.trim() && !errors.nwc) {
      registerNWC(lightningAddress.trim(), nwcString.trim());
    }

    const id = uuidv4();
    navigate(`/admin/collection/${id}/add-pieces`, {
      state: {
        id,
        name: name.trim(),
        lightningAddress: lightningAddress.trim(),
        location: location.trim() || undefined,
        bannerUrl: bannerUrl.trim() || undefined,
      },
    });
  };

  return (
    <div className="min-h-screen flex justify-center px-6 py-10">
      <div className="w-full max-w-lg">
        <button
          onClick={() => navigate("/admin/dashboard")}
          className="text-white/30 text-xs hover:text-white transition-colors bg-transparent border-none cursor-pointer mb-8"
        >
          ← Dashboard
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">New Collection</h1>
          <p className="text-white/40 text-sm mt-1">
            Fill in the details to get started
          </p>
        </div>

        <div className="border border-white/10 rounded-lg p-6 flex flex-col gap-5 bg-white/2">
          <Field
            label="Collection Name"
            value={name}
            required
            onChange={(v) => {
              setName(v);
              setErrors((p) => ({ ...p, name: "" }));
            }}
            placeholder="Spring Ceramics 2025"
            error={errors.name}
          />

          <Field
            label="Lightning Address"
            value={lightningAddress}
            required
            onChange={(v) => {
              setLightningAddress(v);
              setErrors((p) => ({ ...p, lightningAddress: "" }));
            }}
            placeholder="you@getalby.com"
            error={errors.lightningAddress}
          />

          <div className="border-t border-white/10" />

          {/* NWC — optional, enables server-side payment confirmation */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/40 uppercase tracking-widest">
              Wallet Connect (NWC)
              <span className="text-white/20 ml-1">(optional)</span>
            </label>
            <input
              type="password"
              value={nwcString}
              placeholder="nostr+walletconnect://..."
              onChange={(e) => handleNwcChange(e.target.value)}
              className={`bg-white/5 border outline-none text-white text-sm px-3 py-2 rounded transition-colors placeholder:text-white/20 focus:border-white/30 font-mono ${
                errors.nwc
                  ? "border-red-500/60"
                  : nwcString && !errors.nwc
                    ? "border-green-500/40"
                    : "border-white/10"
              }`}
            />
            {errors.nwc && <p className="text-red-400 text-xs">{errors.nwc}</p>}
            {nwcString && !errors.nwc && (
              <p className="text-green-400/60 text-xs">
                ✓ Valid — payment confirmations will work with any wallet
              </p>
            )}
            {!nwcString && (
              <p className="text-white/20 text-xs leading-relaxed">
                Recommended for Blink, Wallet of Satoshi, and other wallets.
                Stored securely on the auction server — never published.
              </p>
            )}
          </div>

          <div className="border-t border-white/10" />

          <Field
            label="Location"
            value={location}
            onChange={setLocation}
            placeholder="Brooklyn, NY"
          />

          <Field
            label="Banner Image URL"
            value={bannerUrl}
            type="url"
            onChange={setBannerUrl}
            placeholder="https://…"
          />

          {bannerUrl && (
            <div
              className="h-24 rounded overflow-hidden border border-white/10 bg-cover bg-center"
              style={{ backgroundImage: `url(${bannerUrl})` }}
            />
          )}
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={handleNext}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded transition-colors border-none cursor-pointer"
          >
            Add Pieces →
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateCollection;
