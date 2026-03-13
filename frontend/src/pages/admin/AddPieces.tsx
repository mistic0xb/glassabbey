import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  saveDraftCollection,
  deleteDraftCollection,
  getDraftById,
} from "../../libs/draftCollections";
import {
  deleteCollection,
  publishCollection,
} from "../../libs/nostr/collection";
import {
  publishPieces,
  fetchPiecesByCollection,
} from "../../libs/nostr/pieces";
import { useAuth } from "../../context/AuthContext";
import type { Piece } from "../../types/types";
import { uploadToBlossom } from "../../libs/nostr/blossom";

interface CollectionState {
  id: string;
  name: string;
  lightningAddress: string;
  location?: string;
  bannerUrl?: string;
  isDraft?: boolean;
}

const emptyPiece = () => ({
  makerName: "",
  artifactName: "",
  size: "",
  description: "",
  imageUrl: "",
  imageMode: "url" as "url" | "upload",
  uploading: false,
  error: "",
});

const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400&h=300&fit=crop",
];
const getPlaceholder = (id: string) =>
  PLACEHOLDER_IMAGES[id.charCodeAt(0) % PLACEHOLDER_IMAGES.length];

const isValidUrl = (url: string) => /^https?:\/\/.+\..+/.test(url);

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs text-white/40 uppercase tracking-widest">
      {label}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white/5 border border-white/10 focus:border-white/30 outline-none text-white text-sm px-3 py-2 rounded transition-colors placeholder:text-white/20"
    />
  </div>
);

const TextareaField = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs text-white/40 uppercase tracking-widest">
      {label}
    </label>
    <textarea
      value={value}
      placeholder={placeholder}
      maxLength={520}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="bg-white/5 border border-white/10 focus:border-white/30 outline-none text-white text-sm px-3 py-2 rounded transition-colors placeholder:text-white/20 resize-none"
    />
    <p className="text-white/20 text-xs text-right">{value.length}/520</p>
  </div>
);

const ImageInput = ({
  value,
  onChange,
  mode,
  onModeChange,
  uploading,
  onUpload,
}: {
  value: string;
  onChange: (v: string) => void;
  mode: "url" | "upload";
  onModeChange: (m: "url" | "upload") => void;
  uploading: boolean;
  onUpload: (file: File) => void;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-white/40 uppercase tracking-widest">
          Image<span className="text-red-400 ml-0.5">*</span>
        </label>
        <div className="flex gap-1">
          {(["url", "upload"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-colors ${
                mode === m
                  ? "border-white/30 text-white bg-white/10"
                  : "border-white/10 text-white/30 bg-transparent hover:text-white/50"
              }`}
            >
              {m === "url" ? "URL" : "Upload"}
            </button>
          ))}
        </div>
      </div>

      {mode === "url" ? (
        <input
          type="url"
          value={value}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
          className="bg-white/5 border border-white/10 focus:border-white/30 outline-none text-white text-sm px-3 py-2 rounded transition-colors placeholder:text-white/20"
        />
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={`border border-dashed border-white/15 hover:border-white/30 text-sm rounded py-2 px-3 transition-colors bg-transparent cursor-pointer text-left ${
              uploading
                ? "text-white/30"
                : value
                  ? "text-green-400 border-green-500/30"
                  : "text-white/30"
            }`}
          >
            {uploading
              ? "Uploading…"
              : value
                ? "✓ Uploaded — click to replace"
                : "Click to choose file"}
          </button>
        </>
      )}
    </div>
  );
};

export const PieceCard = ({
  piece,
  collectionName,
}: {
  piece: Piece;
  collectionName: string;
}) => (
  <div className="border border-white/10 rounded-lg overflow-hidden bg-[#0e0d09]">
    <div className="h-52 overflow-hidden">
      <img
        src={piece.imageUrl || getPlaceholder(piece.id)}
        alt={piece.artifactName}
        className="w-full h-full object-cover"
      />
    </div>
    <div className="p-5 flex flex-col gap-3">
      <p className="text-white/30 text-xs uppercase tracking-widest">
        {collectionName}
      </p>
      <div className="border-t border-white/10 pt-3">
        <h2 className="text-white font-semibold text-base">
          {piece.artifactName}
        </h2>
        <p className="text-white/50 text-sm italic mt-1">
          by {piece.makerName}
        </p>
      </div>
      {piece.size && (
        <div className="border-t border-white/10 pt-3 flex justify-between items-center">
          <span className="text-white/30 text-xs uppercase tracking-widest">
            Size
          </span>
          <span className="text-white/70 text-sm">{piece.size}</span>
        </div>
      )}
      {piece.description && (
        <div className="border-t border-white/10 pt-3">
          <p className="text-white/50 text-sm leading-relaxed">
            {piece.description}
          </p>
        </div>
      )}
    </div>
  </div>
);

const EditCollectionModal = ({
  collection,
  onSave,
  onClose,
  saving,
}: {
  collection: CollectionState;
  onSave: (data: Partial<CollectionState>) => void;
  onClose: () => void;
  saving: boolean;
}) => {
  const [form, setForm] = useState({
    name: collection.name,
    lightningAddress: collection.lightningAddress,
    location: collection.location ?? "",
    bannerUrl: collection.bannerUrl ?? "",
  });
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-[#0e0d09] border border-white/10 rounded-lg p-6 w-full max-w-md flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">
            Edit Collection
          </h2>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white text-lg bg-transparent border-none cursor-pointer"
          >
            ×
          </button>
        </div>
        <Field label="Name" value={form.name} onChange={set("name")} required />
        <Field
          label="Lightning Address"
          value={form.lightningAddress}
          onChange={set("lightningAddress")}
          placeholder="you@wallet.com"
          required
        />
        <Field
          label="Location"
          value={form.location}
          onChange={set("location")}
          placeholder="City, Country"
        />
        <Field
          label="Banner URL"
          value={form.bannerUrl}
          onChange={set("bannerUrl")}
          placeholder="https://…"
          type="url"
        />
        <div className="flex gap-3 justify-end pt-2 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-white/40 hover:text-white bg-transparent border border-white/10 hover:border-white/30 rounded cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name || !form.lightningAddress}
            className="px-5 py-2 text-sm bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded border-none cursor-pointer transition-colors"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

const AddPieces = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { state } = useLocation() as { state: CollectionState | null };
  const { userPubkey } = useAuth();

  const [pieces, setPieces] = useState([emptyPiece()]);
  const [savedPieces, setSavedPieces] = useState<Piece[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [launching, setLaunching] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingCollection, setSavingCollection] = useState(false);
  const [collectionData, setCollectionData] = useState<CollectionState | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingCollection, setDeletingCollection] = useState(false);
  const [focusedPieceIdx, setFocusedPieceIdx] = useState(0);

  const rawCollection: CollectionState | null =
    state ??
    (id && userPubkey
      ? (() => {
          const draft = getDraftById(userPubkey, id);
          return draft ? { ...draft, isDraft: true } : null;
        })()
      : null);

  const isDraft = rawCollection?.isDraft ?? true;
  const collection = collectionData ?? rawCollection;

  useEffect(() => {
    if (!rawCollection) return;
    setCollectionData(rawCollection);
  }, []);

  useEffect(() => {
    if (!rawCollection || !userPubkey) return;
    if (isDraft) {
      const draft = getDraftById(userPubkey, rawCollection.id);
      if (draft?.pieces?.length) {
        setSavedPieces(draft.pieces);
        setSelectedPiece(draft.pieces[0]);
      }
    } else {
      setLoading(true);
      fetchPiecesByCollection(userPubkey, rawCollection.id).then((fetched) => {
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

  const focused = pieces[focusedPieceIdx];
  const livePreviewPiece: Piece | null =
    focused && (focused.imageUrl || focused.makerName || focused.artifactName)
      ? {
          id: `preview-${focusedPieceIdx}`,
          collectionId: collection.id,
          creatorPubkey: userPubkey ?? "",
          makerName: focused.makerName || "—",
          artifactName: focused.artifactName || "—",
          size: focused.size || undefined,
          description: focused.description || undefined,
          imageUrl: focused.imageUrl || undefined,
        }
      : null;

  const updatePiece = (i: number, field: string, value: string) =>
    setPieces((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)),
    );

  const addPieceRow = () => setPieces((p) => [...p, emptyPiece()]);

  const removePieceRow = (i: number) => {
    if (pieces.length === 1) return;
    setPieces((p) => p.filter((_, idx) => idx !== i));
  };

  const handleUpload = async (i: number, file: File) => {
    setPieces((prev) =>
      prev.map((p, idx) =>
        idx === i ? { ...p, uploading: true, error: "" } : p,
      ),
    );
    try {
      const url = await uploadToBlossom(file);
      setPieces((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, imageUrl: url, uploading: false } : p,
        ),
      );
    } catch {
      setPieces((prev) =>
        prev.map((p, idx) =>
          idx === i
            ? { ...p, uploading: false, error: "Upload failed. Try again." }
            : p,
        ),
      );
    }
  };

  const handleDeleteCollection = async () => {
    if (!collection) return;
    setDeletingCollection(true);
    try {
      await deleteCollection(collection);
      navigate("/admin/dashboard");
    } catch (err) {
      console.error("Failed to delete collection:", err);
      setDeletingCollection(false);
      setConfirmDelete(false);
    }
  };

  const buildNewPieces = (): Piece[] | null => {
    let hasError = false;
    const validated = pieces.map((p) => {
      if (!p.makerName.trim() || !p.artifactName.trim())
        return { ...p, error: "Maker and Artifact are required." };
      if (!p.imageUrl.trim()) return { ...p, error: "Image is required." };
      if (!isValidUrl(p.imageUrl))
        return { ...p, error: "Image URL must be a valid http/https link." };
      return { ...p, error: "" };
    });
    validated.forEach((p) => {
      if (p.error) hasError = true;
    });
    setPieces(validated);
    if (hasError) return null;
    return validated.map((p) => ({
      id: crypto.randomUUID(),
      collectionId: collection.id,
      creatorPubkey: userPubkey!,
      makerName: p.makerName.trim(),
      artifactName: p.artifactName.trim(),
      size: p.size.trim() || undefined,
      description: p.description.trim() || undefined,
      imageUrl: p.imageUrl.trim(),
    }));
  };

  const handleSaveDraft = () => {
    if (!userPubkey) return;
    const newPieces = buildNewPieces();
    if (!newPieces) return;
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
    if (!newPieces) return;
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

  const handleSaveCollection = async (data: Partial<CollectionState>) => {
    setSavingCollection(true);
    try {
      await publishCollection(
        data.name ?? collection.name,
        data.lightningAddress ?? collection.lightningAddress,
        data.location || undefined,
        data.bannerUrl || undefined,
        collection.id,
      );
      setCollectionData((prev) => ({ ...prev!, ...data }));
      setShowEditModal(false);
    } catch (err) {
      console.error("Failed to update collection:", err);
    }
    setSavingCollection(false);
  };

  const handleDeletePiece = async (pieceId: string) => {
    if (!userPubkey) return;
    setDeletingId(pieceId);
    try {
      const remaining = savedPieces.filter((p) => p.id !== pieceId);
      await publishPieces(collection.id, remaining);
      setSavedPieces(remaining);
      setSelectedPiece(remaining[0] ?? null);
    } catch (err) {
      console.error("Failed to delete piece:", err);
    }
    setDeletingId(null);
  };

  return (
    <div className="min-h-screen px-6 py-10 max-w-6xl mx-auto">
      <button
        onClick={() => navigate("/admin/dashboard")}
        className="text-white/30 text-xs hover:text-white transition-colors bg-transparent border-none cursor-pointer mb-8"
      >
        ← Dashboard
      </button>

      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">{collection.name}</h1>
          <p className="text-white/40 text-sm mt-1">
            {isDraft
              ? "Draft · Add pieces before launching"
              : "Published · Add more pieces"}
          </p>
        </div>
        {!isDraft && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="px-4 py-2 border border-white/15 hover:border-white/30 text-white/50 hover:text-white text-sm rounded transition-colors bg-transparent cursor-pointer"
            >
              Edit Collection
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 border border-red-500/30 hover:border-red-500/60 text-red-400/60 hover:text-red-400 text-sm rounded transition-colors bg-transparent cursor-pointer"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8 items-start">
        {/* LEFT */}
        <div className="flex flex-col gap-8">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-4">
              Add New Pieces
            </p>
            <div className="flex flex-col gap-3">
              {pieces.map((piece, i) => (
                <div
                  key={i}
                  onClick={() => setFocusedPieceIdx(i)}
                  className="border border-white/10 rounded-lg p-5 flex flex-col gap-4 bg-white/2"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/30 uppercase tracking-widest">
                      Piece {savedPieces.length + i + 1}
                    </span>
                    {pieces.length > 1 && (
                      <button
                        onClick={() => removePieceRow(i)}
                        className="text-xs text-white/20 hover:text-red-400 transition-colors bg-transparent border-none cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Maker"
                      value={piece.makerName}
                      onChange={(v) => updatePiece(i, "makerName", v)}
                      placeholder="Jane Doe"
                      required
                    />
                    <Field
                      label="Artifact"
                      value={piece.artifactName}
                      onChange={(v) => updatePiece(i, "artifactName", v)}
                      placeholder="Blue Vase"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_2fr] gap-3">
                    <Field
                      label="Size"
                      value={piece.size}
                      onChange={(v) => updatePiece(i, "size", v)}
                      placeholder='12" × 8"'
                    />
                    <ImageInput
                      value={piece.imageUrl}
                      onChange={(v) => updatePiece(i, "imageUrl", v)}
                      mode={piece.imageMode}
                      onModeChange={(m) =>
                        setPieces((prev) =>
                          prev.map((p, idx) =>
                            idx === i ? { ...p, imageMode: m } : p,
                          ),
                        )
                      }
                      uploading={piece.uploading}
                      onUpload={(f) => handleUpload(i, f)}
                    />
                  </div>
                  <TextareaField
                    label="Description"
                    value={piece.description}
                    onChange={(v) => updatePiece(i, "description", v)}
                    placeholder="A brief description of the piece…"
                  />
                  {piece.error && (
                    <p className="text-red-400 text-xs">{piece.error}</p>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addPieceRow}
              className="mt-3 w-full py-2.5 border border-dashed border-white/15 hover:border-white/30 text-white/40 hover:text-white/70 text-sm rounded-lg transition-colors bg-transparent cursor-pointer"
            >
              + Add Another Piece
            </button>
          </div>

          {loading ? (
            <p className="text-white/30 text-sm text-center py-8">
              Fetching pieces…
            </p>
          ) : (
            savedPieces.length > 0 && (
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest mb-3">
                  {savedPieces.length}{" "}
                  {savedPieces.length === 1 ? "Piece" : "Pieces"} in Collection
                </p>
                <div className="flex flex-col gap-1.5">
                  {savedPieces.map((piece) => (
                    <div
                      key={piece.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        selectedPiece?.id === piece.id
                          ? "border-white/30 bg-white/5"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div
                        onClick={() => setSelectedPiece(piece)}
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded overflow-hidden shrink-0 bg-white/5">
                          <img
                            src={piece.imageUrl || getPlaceholder(piece.id)}
                            alt={piece.artifactName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">
                            {piece.artifactName}
                          </p>
                          <p className="text-white/40 text-xs italic truncate">
                            {piece.makerName}
                          </p>
                        </div>
                        {piece.size && (
                          <span className="text-white/30 text-xs shrink-0">
                            {piece.size}
                          </span>
                        )}
                        {selectedPiece?.id === piece.id && (
                          <span className="text-green-400 text-xs shrink-0">
                            ●
                          </span>
                        )}
                      </div>
                      {!isDraft && (
                        <button
                          onClick={() => handleDeletePiece(piece.id)}
                          disabled={deletingId === piece.id}
                          className="text-white/20 hover:text-red-400 text-xs px-2 py-1 bg-transparent border-none cursor-pointer transition-colors disabled:opacity-40 shrink-0"
                        >
                          {deletingId === piece.id ? "…" : "Delete"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          <div className="border-t border-white/10 pt-6 flex justify-between items-center gap-3 flex-wrap">
            {isDraft && (
              <button
                onClick={handleSaveDraft}
                disabled={savedDraft}
                className="px-5 py-2.5 border border-white/20 text-white/60 hover:text-white hover:border-white/40 text-sm rounded transition-colors bg-transparent cursor-pointer disabled:opacity-50"
              >
                {savedDraft ? "✓ Saved — Returning…" : "Save as Draft"}
              </button>
            )}
            <button
              onClick={handleLaunch}
              disabled={
                launching ||
                (isDraft &&
                  savedPieces.length === 0 &&
                  !pieces.some(
                    (p) =>
                      p.makerName.trim() &&
                      p.artifactName.trim() &&
                      p.imageUrl.trim(),
                  ))
              }
              className="ml-auto px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors cursor-pointer border-none"
            >
              {launching
                ? "Launching…"
                : isDraft
                  ? "Launch Collection →"
                  : "Publish New Pieces →"}
            </button>
          </div>
        </div>

        {/* RIGHT — preview */}
        <div className="sticky top-6">
          {livePreviewPiece ? (
            <PieceCard
              piece={livePreviewPiece}
              collectionName={collection.name}
            />
          ) : selectedPiece ? (
            <PieceCard piece={selectedPiece} collectionName={collection.name} />
          ) : (
            <div className="border border-dashed border-white/10 rounded-lg h-64 flex items-center justify-center">
              <p className="text-white/20 text-sm">Select a piece to preview</p>
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#0e0d09] border border-white/10 rounded-lg p-6 w-full max-w-sm flex flex-col gap-4">
            <h2 className="text-white font-semibold text-base">
              Delete Collection?
            </h2>
            <p className="text-white/40 text-sm leading-relaxed">
              <span className="text-white/70">"{collection.name}"</span> will be
              permanently deleted and hidden from the auction house. This cannot
              be undone.
            </p>
            <div className="flex gap-3 justify-end pt-2 border-t border-white/10">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deletingCollection}
                className="px-4 py-2 text-sm text-white/40 hover:text-white bg-transparent border border-white/10 hover:border-white/30 rounded cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCollection}
                disabled={deletingCollection}
                className="px-5 py-2 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded border-none cursor-pointer transition-colors"
              >
                {deletingCollection ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <EditCollectionModal
          collection={collection}
          onSave={handleSaveCollection}
          onClose={() => setShowEditModal(false)}
          saving={savingCollection}
        />
      )}
    </div>
  );
};

export default AddPieces;
