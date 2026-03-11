import type { SubCloser } from "nostr-tools/abstract-pool";
import type { UserProfile } from "../../types/types";
import { DEFAULT_RELAYS, getPool } from "./pool";
import type { Event } from "nostr-tools";

// Fetch user profile (kind 0)
export async function fetchProfile(pubkey: string): Promise<UserProfile | null> {
    const pool = getPool();

    return new Promise(resolve => {
        let sub: SubCloser;

        const timeout = setTimeout(() => {
            if (sub) sub.close();
            resolve(null);
        }, 3000);

        const filter = {
            kinds: [0],
            authors: [pubkey],
            limit: 1,
        };

        sub = pool.subscribeMany(DEFAULT_RELAYS, filter, {
            onevent(event: Event) {
                clearTimeout(timeout);
                if (sub) sub.close();

                try {
                    const profileData = JSON.parse(event.content);
                    resolve({
                        pubkey,
                        name: profileData.name,
                        picture: profileData.picture,
                        about: profileData.about,
                    });
                } catch (err) {
                    console.error("Failed to parse user profile:", err);
                    resolve({ pubkey });
                }
            },
            oneose() {
                clearTimeout(timeout);
                if (sub) sub.close();
                resolve(null);
            },
        });
    });
}