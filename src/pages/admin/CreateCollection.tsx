import { useState } from "react";
import { useNavigate } from "react-router";
import { v4 as uuidv4 } from "uuid";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-secondary)",
  fontFamily: "'IM Fell English', Georgia, serif",
  fontSize: "0.9rem",
  padding: "0.75rem 1rem",
  outline: "none",
};

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
    if (Object.keys(e).length) {
      setErrors(e);
      return;
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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        padding: "3rem 1.5rem 6rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "560px" }}>
        {/* Back */}
        <button
          onClick={() => navigate("/admin/dashboard")}
          className="font-display"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--silver-dark)",
            fontSize: "0.6rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginBottom: "2.5rem",
            padding: 0,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--gold-mid)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--silver-dark)")
          }
        >
          ← Dashboard
        </button>

        {/* Heading */}
        <div className="anim-fade-up" style={{ marginBottom: "2.5rem" }}>
          <h1
            className="font-display shimmer-text"
            style={{
              fontSize: "clamp(1.3rem, 3vw, 1.9rem)",
              letterSpacing: "0.08em",
            }}
          >
            New Collection
          </h1>
          <hr
            className="divider-gold"
            style={{ marginTop: "1rem", maxWidth: "140px" }}
          />
        </div>

        {/* Form */}
        <div
          className="frame-box anim-fade-up delay-1"
          style={{
            padding: "2rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
          }}
        >
          {/* Name */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}
          >
            <label
              className="font-display"
              style={{
                fontSize: "0.58rem",
                letterSpacing: "0.25em",
                color: "var(--gold-muted)",
                textTransform: "uppercase",
              }}
            >
              Collection Name{" "}
              <span style={{ color: "var(--gold-mid)" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              placeholder="Spring Ceramics 2025"
              onChange={(e) => {
                setName(e.target.value);
                setErrors((p) => ({ ...p, name: "" }));
              }}
              style={{
                ...inputStyle,
                borderColor: errors.name
                  ? "var(--danger)"
                  : "var(--border-subtle)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--gold-muted)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = errors.name
                  ? "var(--danger)"
                  : "var(--border-subtle)")
              }
            />
            {errors.name && (
              <p
                className="font-body"
                style={{
                  fontSize: "0.7rem",
                  color: "var(--danger)",
                  fontStyle: "italic",
                }}
              >
                {errors.name}
              </p>
            )}
          </div>

          {/* Lightning Address */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}
          >
            <label
              className="font-display"
              style={{
                fontSize: "0.58rem",
                letterSpacing: "0.25em",
                color: "var(--gold-muted)",
                textTransform: "uppercase",
              }}
            >
              Lightning Address{" "}
              <span style={{ color: "var(--gold-mid)" }}>*</span>
            </label>
            <input
              type="text"
              value={lightningAddress}
              placeholder="you@getalby.com"
              onChange={(e) => {
                setLightningAddress(e.target.value);
                setErrors((p) => ({ ...p, lightningAddress: "" }));
              }}
              style={{
                ...inputStyle,
                borderColor: errors.lightningAddress
                  ? "var(--danger)"
                  : "var(--border-subtle)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--gold-muted)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = errors.lightningAddress
                  ? "var(--danger)"
                  : "var(--border-subtle)")
              }
            />
            {errors.lightningAddress && (
              <p
                className="font-body"
                style={{
                  fontSize: "0.7rem",
                  color: "var(--danger)",
                  fontStyle: "italic",
                }}
              >
                {errors.lightningAddress}
              </p>
            )}
          </div>

          <hr className="divider-gold" />

          {/* Location */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}
          >
            <label
              className="font-display"
              style={{
                fontSize: "0.58rem",
                letterSpacing: "0.25em",
                color: "var(--gold-muted)",
                textTransform: "uppercase",
              }}
            >
              Location{" "}
              <span style={{ color: "var(--silver-dark)" }}>(optional)</span>
            </label>
            <input
              type="text"
              value={location}
              placeholder="Brooklyn, NY"
              onChange={(e) => setLocation(e.target.value)}
              style={inputStyle}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--gold-muted)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--border-subtle)")
              }
            />
          </div>

          {/* Banner URL */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}
          >
            <label
              className="font-display"
              style={{
                fontSize: "0.58rem",
                letterSpacing: "0.25em",
                color: "var(--gold-muted)",
                textTransform: "uppercase",
              }}
            >
              Banner Image URL{" "}
              <span style={{ color: "var(--silver-dark)" }}>(optional)</span>
            </label>
            <input
              type="url"
              value={bannerUrl}
              placeholder="https://…"
              onChange={(e) => setBannerUrl(e.target.value)}
              style={inputStyle}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--gold-muted)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--border-subtle)")
              }
            />
            {bannerUrl && (
              <div
                style={{
                  height: "70px",
                  background: `url(${bannerUrl}) center/cover no-repeat`,
                  border: "1px solid var(--border-subtle)",
                  marginTop: "0.25rem",
                }}
              />
            )}
          </div>
        </div>

        {/* Next */}
        <div
          className="anim-fade-up delay-2"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "1.75rem",
          }}
        >
          <button className="btn-primary" onClick={handleNext}>
            Add Pieces →
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateCollection;
