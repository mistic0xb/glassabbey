import { useState } from "react";
import { useNavigate } from "react-router";
import { v4 as uuidv4 } from "uuid";
import { validateNWCString } from "../../libs/nwc/nwc";
import { saveNWC } from "../../libs/nwc/nwcStorage";

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  error?: string;
  hint?: string;
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
    {hint && !error && <p className="text-white/25 text-xs">{hint}</p>}
    {error && <p className="text-red-400 text-xs">{error}</p>}
  </div>
);

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

    // Validate NWC if provided
    if (nwcString.trim()) {
      const nwcErr = validateNWCString(nwcString.trim());
      if (nwcErr) e.nwc = nwcErr;
    }

    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }

    // Save NWC locally — never sent to any server or Nostr relay
    if (nwcString.trim() && !errors.nwc) {
      saveNWC(lightningAddress.trim(), nwcString.trim());
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
        {/* Back */}
        <button
          onClick={() => navigate("/admin/dashboard")}
          className="text-white/30 text-xs hover:text-white transition-colors bg-transparent border-none cursor-pointer mb-8"
        >
          ← Dashboard
        </button>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">New Collection</h1>
          <p className="text-white/40 text-sm mt-1">
            Fill in the details to get started
          </p>
        </div>

        {/* Form */}
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

          {/* NWC — optional, improves payment confirmation reliability */}
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
              <p className="text-green-400/60 text-xs">✓ Valid NWC string</p>
            )}
            {/* Privacy note — shown when field is empty or focused */}
            {!nwcString && (
              <p className="text-white/20 text-xs leading-relaxed">
                Enables direct payment confirmation — recommended for Blink,
                Wallet of Satoshi, and other wallets. Stored only in this
                browser, never shared.
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

          {/* Banner preview */}
          {bannerUrl && (
            <div
              className="h-24 rounded overflow-hidden border border-white/10 bg-cover bg-center"
              style={{ backgroundImage: `url(${bannerUrl})` }}
            />
          )}
        </div>

        {/* Submit */}
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
