import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { saveDraftCollection, deleteDraftCollection, getDraftById } from "../../libs/draftCollections";
import { publishCollection } from "../../libs/nostr/collection";
import { publishPieces, fetchPiecesByCollection } from "../../libs/nostr/pieces";
import { useAuth } from "../../context/AuthContext";
import type { Piece } from "../../types/types";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-secondary)",
  fontFamily: "'IM Fell English', Georgia, serif",
  fontSize: "0.85rem",
  padding: "0.65rem 0.9rem",
  outline: "none",
};

interface CollectionState {
  id: string;
  name: string;
  lightningAddress: string;
  location?: string;
  bannerUrl?: string;
  isDraft?: boolean;
}

const emptyPiece = () => ({ makerName: "", artifactName: "", size: "", imageUrl: "" });

// ── Piece detail card (right panel) ──────────────────────────────
const PieceCard = ({ piece, collectionName }: { piece: Piece; collectionName: string }) => (
  <div
    className="frame-box"
    style={{
      background: "var(--bg-surface)",
      overflow: "hidden",
      height: "100%",
      display: "flex",
      flexDirection: "column",
    }}
  >
    {/* Image */}
    <div
      style={{
        height: "220px",
        background: piece.imageUrl
          ? `url(${piece.imageUrl}) center/cover no-repeat`
          : "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-overlay) 100%)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {!piece.imageUrl && (
        <div className="w-10 h-10 rotate-45" style={{ border: "1px solid color-mix(in srgb, var(--gold-dim) 40%, transparent)" }} />
      )}
    </div>

    {/* Details */}
    <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", flex: 1 }}>
      {/* Collection label */}
      <p className="font-display" style={{ fontSize: "0.55rem", letterSpacing: "0.3em", color: "var(--gold-dim)", textTransform: "uppercase" }}>
        {collectionName}
      </p>

      <hr className="divider-gold" />

      {/* Artifact name */}
      <h2 className="font-display" style={{ fontSize: "1.1rem", letterSpacing: "0.08em", color: "var(--gold-mid)", lineHeight: 1.3 }}>
        {piece.artifactName}
      </h2>

      {/* Maker */}
      <p className="font-body" style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
        by {piece.makerName}
      </p>

      {/* Size */}
      {piece.size && (
        <>
          <hr className="divider-gold" />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="font-display" style={{ fontSize: "0.55rem", letterSpacing: "0.2em", color: "var(--gold-dim)", textTransform: "uppercase" }}>Size</span>
            <span className="font-body" style={{ fontSize: "0.8rem", color: "var(--silver-light)" }}>{piece.size}</span>
          </div>
        </>
      )}
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────
const AddPieces = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { state } = useLocation() as { state: CollectionState | null };
  const { userPubkey } = useAuth();

  const [pieces, setPieces] = useState<ReturnType<typeof emptyPiece>[]>([emptyPiece()]);
  const [savedPieces, setSavedPieces] = useState<Piece[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [launching, setLaunching] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [loading, setLoading] = useState(false);

  // Resolve collection — from state or from localStorage draft
  const collection: CollectionState | null = state ?? (id && userPubkey ? (() => {
    const draft = getDraftById(userPubkey, id);
    return draft ? { ...draft, isDraft: true } : null;
  })() : null);

  const isDraft = collection?.isDraft ?? true;

  // Load existing pieces
  useEffect(() => {
    if (!collection || !userPubkey) return;

    if (isDraft) {
      // Load pieces from localStorage draft
      const draft = getDraftById(userPubkey, collection.id);
      if (draft?.pieces?.length) {
        setSavedPieces(draft.pieces);
        setSelectedPiece(draft.pieces[0]);
      }
    } else {
      // Fetch pieces from Nostr
      setLoading(true);
      fetchPiecesByCollection(userPubkey, collection.id).then((fetched) => {
        setSavedPieces(fetched);
        if (fetched.length) setSelectedPiece(fetched[0]);
        setLoading(false);
      });
    }
  }, [userPubkey]);

  if (!collection) {
    navigate("/admin/collection/create");
    return null;
  }

  const updatePiece = (i: number, field: string, value: string) =>
    setPieces((prev) => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));

  const addPieceRow = () => setPieces((p) => [...p, emptyPiece()]);

  const removePieceRow = (i: number) => {
    if (pieces.length === 1) return;
    setPieces((p) => p.filter((_, idx) => idx !== i));
  };

  const buildNewPieces = (): Piece[] =>
    pieces
      .filter((p) => p.makerName.trim() && p.artifactName.trim())
      .map((p) => ({
        id: crypto.randomUUID(),
        collectionId: collection.id,
        makerName: p.makerName.trim(),
        artifactName: p.artifactName.trim(),
        size: p.size.trim() || undefined,
        imageUrl: p.imageUrl.trim() || undefined,
      }));

  const handleSaveDraft = () => {
    if (!userPubkey) return;
    const newPieces = buildNewPieces();
    const allPieces = [...savedPieces, ...newPieces];
    saveDraftCollection(userPubkey, {
      id: collection.id,
      name: collection.name,
      lightningAddress: collection.lightningAddress,
      location: collection.location,
      bannerUrl: collection.bannerUrl,
      pieces: allPieces,
    });
    setSavedDraft(true);
    setTimeout(() => navigate("/admin/dashboard"), 1500);
  };

  const handleLaunch = async () => {
    const newPieces = buildNewPieces();
    const allPieces = [...savedPieces, ...newPieces];
    if (!allPieces.length) return;
    setLaunching(true);
    try {
      await publishCollection(
        collection.name,
        collection.lightningAddress,
        collection.location,
        collection.bannerUrl,
        collection.id,
      );
      await publishPieces(collection.id, allPieces);
      if (userPubkey) deleteDraftCollection(userPubkey, collection.id);
      navigate("/admin/dashboard");
    } catch (err) {
      console.error("Launch failed:", err);
      setLaunching(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "3rem 1.5rem 6rem", maxWidth: "1200px", margin: "0 auto" }}>

      {/* Back */}
      <button
        onClick={() => navigate("/admin/dashboard")}
        className="font-display"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--silver-dark)", fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "2.5rem", padding: 0 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold-mid)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--silver-dark)")}
      >
        ← Dashboard
      </button>

      {/* Heading */}
      <div className="anim-fade-up" style={{ marginBottom: "2rem" }}>
        <h1 className="font-display shimmer-text" style={{ fontSize: "clamp(1.3rem, 3vw, 1.9rem)", letterSpacing: "0.08em" }}>
          {collection.name}
        </h1>
        <p className="font-body" style={{ fontSize: "0.78rem", color: "var(--silver-dark)", marginTop: "0.3rem", fontStyle: "italic" }}>
          {isDraft ? "Draft · Add pieces before launching" : "Published · Add more pieces"}
        </p>
        <hr className="divider-gold" style={{ marginTop: "1rem", maxWidth: "140px" }} />
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "60% 40%", gap: "2rem", alignItems: "start" }}>

        {/* LEFT — form + piece list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Add pieces form */}
          <div className="anim-fade-up delay-1">
            <p className="font-display" style={{ fontSize: "0.58rem", letterSpacing: "0.25em", color: "var(--gold-muted)", textTransform: "uppercase", marginBottom: "1rem" }}>
              Add New Pieces
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {pieces.map((piece, i) => (
                <div key={i} className="frame-box" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="font-display" style={{ fontSize: "0.55rem", letterSpacing: "0.2em", color: "var(--gold-dim)", textTransform: "uppercase" }}>
                      Piece {savedPieces.length + i + 1}
                    </span>
                    {pieces.length > 1 && (
                      <button onClick={() => removePieceRow(i)} className="font-display"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--silver-dark)", fontSize: "0.55rem", letterSpacing: "0.15em", textTransform: "uppercase" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--silver-dark)")}
                      >Remove</button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                    {[
                      { field: "makerName", placeholder: "Jane Doe", label: "Maker *" },
                      { field: "artifactName", placeholder: "Blue Vase", label: "Artifact *" },
                    ].map(({ field, placeholder, label }) => (
                      <div key={field} style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                        <label className="font-display" style={{ fontSize: "0.52rem", letterSpacing: "0.18em", color: "var(--gold-muted)", textTransform: "uppercase" }}>{label}</label>
                        <input type="text" value={(piece as any)[field]} placeholder={placeholder}
                          onChange={(e) => updatePiece(i, field, e.target.value)}
                          style={inputStyle}
                          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--gold-muted)")}
                          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0.6rem" }}>
                    {[
                      { field: "size", placeholder: '12" × 8"', label: "Size", type: "text" },
                      { field: "imageUrl", placeholder: "https://…", label: "Image URL", type: "url" },
                    ].map(({ field, placeholder, label, type }) => (
                      <div key={field} style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                        <label className="font-display" style={{ fontSize: "0.52rem", letterSpacing: "0.18em", color: "var(--gold-muted)", textTransform: "uppercase" }}>{label}</label>
                        <input type={type} value={(piece as any)[field]} placeholder={placeholder}
                          onChange={(e) => updatePiece(i, field, e.target.value)}
                          style={inputStyle}
                          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--gold-muted)")}
                          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-ghost" onClick={addPieceRow}
              style={{ width: "100%", padding: "0.6rem", fontSize: "0.6rem", marginTop: "0.75rem" }}
            >
              + Add Another Piece
            </button>
          </div>

          {/* Saved pieces list */}
          {loading ? (
            <div className="anim-pulse-gold font-display" style={{ fontSize: "0.6rem", letterSpacing: "0.25em", color: "var(--gold-dim)", textAlign: "center", padding: "2rem 0" }}>
              FETCHING PIECES…
            </div>
          ) : savedPieces.length > 0 && (
            <div className="anim-fade-up delay-2">
              <p className="font-display" style={{ fontSize: "0.58rem", letterSpacing: "0.25em", color: "var(--gold-muted)", textTransform: "uppercase", marginBottom: "0.75rem" }}>
                {savedPieces.length} {savedPieces.length === 1 ? "Piece" : "Pieces"} in Collection
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {savedPieces.map((piece) => (
                  <div
                    key={piece.id}
                    onClick={() => setSelectedPiece(piece)}
                    style={{
                      padding: "0.85rem 1rem",
                      background: selectedPiece?.id === piece.id ? "color-mix(in srgb, var(--gold-mid) 8%, var(--bg-surface))" : "var(--bg-surface)",
                      border: `1px solid ${selectedPiece?.id === piece.id ? "var(--gold-muted)" : "var(--border-subtle)"}`,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => { if (selectedPiece?.id !== piece.id) e.currentTarget.style.borderColor = "var(--gold-dim)"; }}
                    onMouseLeave={(e) => { if (selectedPiece?.id !== piece.id) e.currentTarget.style.borderColor = "var(--border-subtle)"; }}
                  >
                    {/* Thumbnail */}
                    <div style={{
                      width: "36px", height: "36px", flexShrink: 0,
                      background: piece.imageUrl ? `url(${piece.imageUrl}) center/cover no-repeat` : "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="font-display" style={{ fontSize: "0.72rem", letterSpacing: "0.08em", color: "var(--gold-mid)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {piece.artifactName}
                      </p>
                      <p className="font-body" style={{ fontSize: "0.68rem", color: "var(--silver-dark)", fontStyle: "italic" }}>
                        {piece.makerName}
                      </p>
                    </div>
                    {selectedPiece?.id === piece.id && (
                      <span style={{ fontSize: "0.55rem", color: "var(--gold-muted)", letterSpacing: "0.1em" }}>●</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="anim-fade-up delay-3">
            <hr className="divider-gold" style={{ marginBottom: "1.5rem" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              {isDraft && (
                <button className="btn-ghost" onClick={handleSaveDraft} disabled={savedDraft}
                  style={{
                    padding: "0.65rem 1.5rem", fontSize: "0.6rem",
                    opacity: savedDraft ? 0.7 : 1,
                    borderColor: savedDraft ? "var(--gold-mid)" : undefined,
                    color: savedDraft ? "var(--gold-mid)" : undefined,
                    transition: "all 0.3s ease",
                  }}
                >
                  {savedDraft ? "✓ Draft Saved — Returning…" : "Save as Draft"}
                </button>
              )}
              <button className="btn-primary" onClick={handleLaunch}
                disabled={launching || (isDraft && [...savedPieces, ...buildNewPieces()].length === 0)}
                style={{
                  padding: "0.75rem 2rem",
                  marginLeft: isDraft ? undefined : "auto",
                  opacity: launching ? 0.6 : 1,
                  cursor: launching ? "not-allowed" : "pointer",
                }}
              >
                {launching ? "Launching…" : isDraft ? "Launch Collection →" : "Publish New Pieces →"}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT — piece detail card */}
        <div style={{ position: "sticky", top: "6rem" }}>
          {selectedPiece ? (
            <PieceCard piece={selectedPiece} collectionName={collection.name} />
          ) : (
            <div className="frame-box" style={{
              height: "400px", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "1rem",
              background: "var(--bg-surface)",
            }}>
              <div className="w-10 h-10 rotate-45 anim-pulse-gold" style={{ border: "1px solid var(--border-subtle)" }} />
              <p className="font-display" style={{ fontSize: "0.58rem", letterSpacing: "0.25em", color: "var(--silver-dark)", textTransform: "uppercase" }}>
                Select a piece
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default AddPieces;