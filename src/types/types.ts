export interface Collection {
    id: string;
    pubkey?: string;
    name: string;
    lightningAddress: string;
    location?: string;
    bannerUrl?: string;
    isDeleted?: boolean;
}

export interface Piece {
    id: string;          // d-tag (uuid)
    collectionId: string; // references Collection d-tag
    creatorPubkey: string;
    makerName: string;
    artifactName: string;
    size?: string;
    imageUrl?: string;
}

export interface UserProfile {
    pubkey: string;
    name?: string;
    picture?: string;
    about?: string;
}