import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

const EXTENSIONS = [
  {
    name: "nos2x",
    url: "https://chrome.google.com/webstore/detail/nos2x/kpgefcfmnafjgpblbdjbbenonbnepbkg",
  },
  { name: "Alby", url: "https://getalby.com" },
  { name: "Keys.Band", url: "https://keys.band" },
];

const NoExtensionModal = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    />
    <div
      className="relative frame-box p-8 max-w-sm w-full"
      style={{ background: "var(--bg-surface)" }}
    >
      {/* Corner ornaments */}
      <span
        className="absolute top-2 left-2 w-4 h-4"
        style={{
          borderTop: "1px solid var(--gold-mid)",
          borderLeft: "1px solid var(--gold-mid)",
          opacity: 0.6,
        }}
      />
      <span
        className="absolute top-2 right-2 w-4 h-4"
        style={{
          borderTop: "1px solid var(--gold-mid)",
          borderRight: "1px solid var(--gold-mid)",
          opacity: 0.6,
        }}
      />
      <span
        className="absolute bottom-2 left-2 w-4 h-4"
        style={{
          borderBottom: "1px solid var(--gold-mid)",
          borderLeft: "1px solid var(--gold-mid)",
          opacity: 0.6,
        }}
      />
      <span
        className="absolute bottom-2 right-2 w-4 h-4"
        style={{
          borderBottom: "1px solid var(--gold-mid)",
          borderRight: "1px solid var(--gold-mid)",
          opacity: 0.6,
        }}
      />

      <h3
        className="font-display text-sm tracking-[0.2em] text-center mb-1"
        style={{ color: "var(--gold-mid)" }}
      >
        NO EXTENSION FOUND
      </h3>
      <hr className="divider-gold my-4" />
      <p
        className="font-body italic text-sm text-center leading-relaxed mb-6"
        style={{ color: "var(--text-secondary)" }}
      >
        To enter the auction house, you must carry a Nostr key. Install one of
        the sacred extensions below.
      </p>
      <div className="flex flex-col gap-2">
        {EXTENSIONS.map((ext) => (
          <a
            key={ext.name}
            href={ext.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-center no-underline text-xs"
          >
            {ext.name} →
          </a>
        ))}
      </div>
      <button
        onClick={onClose}
        className="mt-5 w-full font-display text-[10px] tracking-[0.3em] uppercase bg-transparent border-none cursor-pointer"
        style={{ color: "var(--text-muted)" }}
      >
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

    if (result.ok) {
      navigate("/admin/dashboard");
    } else if (result.error === "no_extension") {
      setNoExtModal(true);
    }
  };

  return (
    <>
      <div
        className="min-h-[calc(100vh-140px)] overflow-hidden relative flex flex-col justify-center"
        style={{ backgroundColor: "var(--bg-base)" }}
      >
        {/* Gold atmosphere */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 40%, color-mix(in srgb, var(--gold-mid) 5%, transparent) 0%, transparent 70%)",
          }}
        />

        {/* Top rule */}
        <div
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, transparent, var(--gold-muted), transparent)",
          }}
        />

        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-64 pointer-events-none"
          style={{
            background: "linear-gradient(to top, var(--bg-base), transparent)",
          }}
        />

        {/* Left pillars */}
        <div
          className="absolute bottom-0 left-8 xl:left-20 flex gap-3 items-end pointer-events-none"
          style={{ opacity: 0.18 }}
        >
          {[80, 110, 95, 70].map((h, i) => (
            <div
              key={i}
              className={`anim-pillar delay-${i + 1} flex flex-col items-center`}
            >
              <div
                className="w-6 h-3 mb-0.5"
                style={{
                  background:
                    "linear-gradient(to bottom, var(--gold-mid), var(--gold-muted))",
                }}
              />
              <div
                className="w-4 relative"
                style={{
                  height: `${h}px`,
                  background:
                    "linear-gradient(to bottom, color-mix(in srgb, var(--gold-mid) 50%, transparent), color-mix(in srgb, var(--gold-dim) 30%, transparent))",
                }}
              >
                {[0, 1, 2].map((j) => (
                  <div
                    key={j}
                    className="absolute top-0 bottom-0 w-px"
                    style={{
                      left: `${25 + j * 25}%`,
                      background:
                        "color-mix(in srgb, var(--gold-mid) 20%, transparent)",
                    }}
                  />
                ))}
              </div>
              <div
                className="w-7 h-2 mt-0.5"
                style={{
                  background:
                    "linear-gradient(to bottom, color-mix(in srgb, var(--gold-mid) 40%, transparent), transparent)",
                }}
              />
              <div
                className="w-8 h-1.5"
                style={{
                  background:
                    "color-mix(in srgb, var(--gold-muted) 30%, transparent)",
                }}
              />
            </div>
          ))}
        </div>

        {/* Right pillars */}
        <div
          className="absolute bottom-0 right-8 xl:right-20 flex gap-3 items-end pointer-events-none"
          style={{ opacity: 0.18 }}
        >
          {[70, 95, 110, 80].map((h, i) => (
            <div
              key={i}
              className={`anim-pillar delay-${i + 1} flex flex-col items-center`}
            >
              <div
                className="w-6 h-3 mb-0.5"
                style={{
                  background:
                    "linear-gradient(to bottom, var(--gold-mid), var(--gold-muted))",
                }}
              />
              <div
                className="w-4 relative"
                style={{
                  height: `${h}px`,
                  background:
                    "linear-gradient(to bottom, color-mix(in srgb, var(--gold-mid) 50%, transparent), color-mix(in srgb, var(--gold-dim) 30%, transparent))",
                }}
              >
                {[0, 1, 2].map((j) => (
                  <div
                    key={j}
                    className="absolute top-0 bottom-0 w-px"
                    style={{
                      left: `${25 + j * 25}%`,
                      background:
                        "color-mix(in srgb, var(--gold-mid) 20%, transparent)",
                    }}
                  />
                ))}
              </div>
              <div
                className="w-7 h-2 mt-0.5"
                style={{
                  background:
                    "linear-gradient(to bottom, color-mix(in srgb, var(--gold-mid) 40%, transparent), transparent)",
                }}
              />
              <div
                className="w-8 h-1.5"
                style={{
                  background:
                    "color-mix(in srgb, var(--gold-muted) 30%, transparent)",
                }}
              />
            </div>
          ))}
        </div>

        {/* Starfield */}
        {[...Array(28)].map((_, i) => (
          <div
            key={i}
            className="absolute w-px h-px anim-pulse-gold pointer-events-none"
            style={{
              top: `${10 + Math.sin(i * 1.7) * 40 + 30}%`,
              left: `${(i * 3.6) % 100}%`,
              background: "var(--silver-light)",
              animationDelay: `${(i * 0.4) % 4}s`,
              opacity: 0.2,
            }}
          />
        ))}

        {/* Main content */}
        <div className="relative z-10 flex flex-col items-center justify-center py-20 px-6 text-center">
          {/* Eyebrow */}
          <div className="anim-fade-up delay-1 flex items-center gap-3 mb-8">
            <div
              className="w-12 h-px"
              style={{
                background:
                  "linear-gradient(to right, transparent, var(--gold-muted))",
              }}
            />
            <span
              className="font-display text-[10px] tracking-[0.4em] uppercase"
              style={{ color: "var(--gold-muted)" }}
            >
              Est. on Nostr
            </span>
            <div
              className="w-12 h-px"
              style={{
                background:
                  "linear-gradient(to left, transparent, var(--gold-muted))",
              }}
            />
          </div>

          {/* Diamond ornament */}
          <div className="anim-fade-up delay-1 anim-float mb-6">
            <div className="relative w-12 h-12 mx-auto">
              <div
                className="absolute inset-0 rotate-45"
                style={{
                  border:
                    "1px solid color-mix(in srgb, var(--gold-mid) 40%, transparent)",
                }}
              />
              <div
                className="absolute inset-2 rotate-45"
                style={{
                  border:
                    "1px solid color-mix(in srgb, var(--gold-mid) 20%, transparent)",
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="w-2 h-2 rotate-45"
                  style={{ background: "var(--gold-mid)" }}
                />
              </div>
            </div>
          </div>

          {/* Title */}
          <h1 className="anim-fade-up delay-2 font-display font-bold leading-tight mb-3">
            <span className="shimmer-text block text-5xl sm:text-6xl md:text-7xl lg:text-8xl tracking-[0.05em]">
              GlassAbbey
            </span>
          </h1>

          {/* Ornament divider */}
          <div className="anim-fade-up delay-2 flex items-center gap-4 my-5">
            <hr className="divider-gold w-20" />
            <div className="flex gap-1">
              <div
                className="w-1 h-1 rotate-45"
                style={{
                  background:
                    "color-mix(in srgb, var(--gold-mid) 50%, transparent)",
                }}
              />
              <div
                className="w-1.5 h-1.5 rotate-45"
                style={{ background: "var(--gold-mid)" }}
              />
              <div
                className="w-1 h-1 rotate-45"
                style={{
                  background:
                    "color-mix(in srgb, var(--gold-mid) 50%, transparent)",
                }}
              />
            </div>
            <hr className="divider-gold w-20" />
          </div>

          {/* Subtitle */}
          <p
            className="anim-fade-up delay-3 font-body italic text-lg sm:text-xl md:text-2xl tracking-wide"
            style={{ color: "var(--text-secondary)" }}
          >
            Welcome to the Auction House
          </p>

          {/* CTAs */}
          <div className="anim-fade-up delay-4 flex flex-col sm:flex-row items-center gap-4">
            <a
              href="/explore"
              className="btn-ghost min-w-45 text-center no-underline"
            >
              Explore
            </a>
            <button
              onClick={handleLoginToCreate}
              disabled={loading}
              className="btn-primary min-w-45"
              style={{ opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "Connecting…" : "Login to Create"}
            </button>
          </div>

          <hr className="anim-fade-up delay-5 divider-gold mt-12 w-64" />
        </div>
      </div>

      {noExtModal && <NoExtensionModal onClose={() => setNoExtModal(false)} />}
    </>
  );
};

export default Home;
