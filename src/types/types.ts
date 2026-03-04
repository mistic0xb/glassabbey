export interface Collection {
    id: string;          // d-tag (uuid)
    pubkey?: string;
    name: string;
    lightningAddress: string;
    location?: string;
    bannerUrl?: string;
}

export interface Piece {
    id: string;          // d-tag (uuid)
    collectionId: string; // references Collection d-tag
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