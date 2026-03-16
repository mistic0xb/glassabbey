import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import { v4 as uuidv4 } from "uuid";
import { validateNWCString } from "../../libs/nwc/nwc";
import { uploadToBlossom } from "../../libs/nostr/blossom";

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

  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNwcChange = (v: string) => {
    setNwcString(v);
    if (!v.trim()) {
      setErrors((p) => ({ ...p, nwc: "" }));
      return;
    }
    const err = validateNWCString(v.trim());
    setErrors((p) => ({ ...p, nwc: err ?? "" }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset
    setUploadError("");
    setBannerUrl("");
    setUploadState("uploading");

    try {
      const url = await uploadToBlossom(file);
      setBannerUrl(url);
      setUploadState("done");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setUploadState("error");
    } finally {
      // Clear file input so same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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

          {/* NWC */}
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

          {/* Banner Image — URL + Upload */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/40 uppercase tracking-widest">
              Banner Image
              <span className="text-white/20 ml-1">(optional)</span>
            </label>

            {/* URL input row */}
            <div className="flex gap-2">
              <input
                type="url"
                value={bannerUrl}
                placeholder="https://…"
                onChange={(e) => {
                  setBannerUrl(e.target.value);
                  setUploadState("idle");
                  setUploadError("");
                }}
                className="flex-1 bg-white/5 border border-white/10 outline-none text-white text-sm px-3 py-2 rounded transition-colors placeholder:text-white/20 focus:border-white/30"
              />

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* Upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadState === "uploading"}
                className="px-3 py-2 text-xs font-medium rounded border border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/30 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {uploadState === "uploading" ? (
                  <span className="flex items-center gap-1.5">
                    <svg
                      className="animate-spin h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                      />
                    </svg>
                    Uploading…
                  </span>
                ) : (
                  "Upload"
                )}
              </button>
            </div>

            {/* Upload status messages */}
            {uploadState === "done" && (
              <p className="text-green-400/60 text-xs">
                ✓ Uploaded successfully
              </p>
            )}
            {uploadState === "error" && (
              <p className="text-red-400 text-xs">{uploadError}</p>
            )}
          </div>

          {/* Banner preview */}
          {bannerUrl && (
            <div className="relative group">
              <div
                className="h-24 rounded overflow-hidden border border-white/10 bg-cover bg-center"
                style={{ backgroundImage: `url(${bannerUrl})` }}
              />
              {/* Clear button */}
              <button
                type="button"
                onClick={() => {
                  setBannerUrl("");
                  setUploadState("idle");
                  setUploadError("");
                }}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white/60 hover:text-white hover:bg-black/80 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-none"
                title="Remove banner"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={handleNext}
            disabled={uploadState === "uploading"}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded transition-colors border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Pieces →
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateCollection;
