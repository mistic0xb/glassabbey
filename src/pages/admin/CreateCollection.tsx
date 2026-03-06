import { useState } from "react";
import { useNavigate } from "react-router";
import { v4 as uuidv4 } from "uuid";

const Field = ({
  label, value, onChange, placeholder, type = "text", required = false, error,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean; error?: string;
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

const CreateCollection = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [lightningAddress, setLightningAddress] = useState("");
  const [location, setLocation] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleNext = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Required.";
    if (!lightningAddress.trim()) e.lightningAddress = "Required.";
    if (Object.keys(e).length) { setErrors(e); return; }

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
          <p className="text-white/40 text-sm mt-1">Fill in the details to get started</p>
        </div>

        {/* Form */}
        <div className="border border-white/10 rounded-lg p-6 flex flex-col gap-5 bg-white/2">

          <Field
            label="Collection Name" value={name} required
            onChange={(v) => { setName(v); setErrors((p) => ({ ...p, name: "" })); }}
            placeholder="Spring Ceramics 2025"
            error={errors.name}
          />

          <Field
            label="Lightning Address" value={lightningAddress} required
            onChange={(v) => { setLightningAddress(v); setErrors((p) => ({ ...p, lightningAddress: "" })); }}
            placeholder="you@getalby.com"
            error={errors.lightningAddress}
          />

          <div className="border-t border-white/10" />

          <Field
            label="Location" value={location}
            onChange={setLocation}
            placeholder="Brooklyn, NY"
          />

          <Field
            label="Banner Image URL" value={bannerUrl} type="url"
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