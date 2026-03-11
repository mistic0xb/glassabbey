import { useNavigate } from "react-router";
import type { Collection } from "../types/types";
import type { DraftCollection } from "../libs/draftCollections";

interface Props {
  collection: Collection | DraftCollection;
  pieceCount?: number;
  isDraft?: boolean;
}

const PLACEHOLDER_IMAGES = [
  "https://static.vecteezy.com/system/resources/thumbnails/002/073/027/small/abstract-colorful-shapes-background-free-vector.jpg",
  "https://static.vecteezy.com/system/resources/thumbnails/002/565/133/small/abstract-background-concept-free-vector.jpg",
  "https://static.vecteezy.com/system/resources/thumbnails/002/072/763/small/colorful-abstract-background-free-vector.jpg",
  "https://static.vecteezy.com/system/resources/thumbnails/000/155/039/small/colorful-abstract-doodle-vector.jpg",
];

const getPlaceholder = (id: string) => {
  const index = id.charCodeAt(0) % PLACEHOLDER_IMAGES.length;
  return PLACEHOLDER_IMAGES[index];
};

const CollectionCard = ({
  collection,
  pieceCount = 0,
  isDraft = false,
}: Props) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/admin/collection/${collection.id}/add-pieces`, {
      state: { ...collection, isDraft },
    });
  };

  const bannerUrl = collection.bannerUrl || getPlaceholder(collection.id);

  return (
    <div
      onClick={handleClick}
      className="cursor-pointer rounded-lg overflow-hidden border border-white/10 hover:border-white/25 transition-colors bg-[#0e0d09] group"
    >
      {/* Banner */}
      <div className="relative h-36 overflow-hidden">
        <img
          src={bannerUrl}
          alt={collection.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {isDraft && (
          <span className="absolute top-2 right-2 bg-black/70 border border-yellow-600/50 text-yellow-500 text-[10px] px-2 py-0.5 rounded">
            DRAFT
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 border-t border-white/10">
        <h3 className="text-white font-semibold text-sm truncate mb-1">
          {collection.name}
        </h3>

        <p className="text-white/40 text-xs truncate mb-1">
          ⚡ {collection.lightningAddress}
        </p>

        {collection.location && (
          <p className="text-white/30 text-xs truncate mb-1">
            📍 {collection.location}
          </p>
        )}

        <div className="border-t border-white/10 mt-3 pt-3">
          <p className="text-white/30 text-xs">
            {pieceCount} {pieceCount === 1 ? "piece" : "pieces"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default CollectionCard;
