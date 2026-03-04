import { createContext, useContext, useState, type ReactNode } from "react";
import { hasNostrExtension, getPublicKey } from "../libs/nostrAuth";
import { fetchProfile } from "../libs/nostr/fetchProfile";

interface AuthContextType {
  isAuthenticated: boolean;
  userPubkey: string | null;
  userName: string | null;
  userPicture: string | null;
  login: () => Promise<{ ok: boolean; error?: "no_extension" | "rejected" }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userPubkey, setUserPubkey] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userPicture, setUserPicture] = useState<string | null>(null);

  const login = async () => {
    if (!hasNostrExtension()) {
      return { ok: false, error: "no_extension" as const };
    }

    const pubkey = await getPublicKey();
    if (!pubkey) {
      return { ok: false, error: "rejected" as const };
    }
    setUserPubkey(pubkey);

    // Fetch profile
    const data = await fetchProfile(pubkey);
    if (data?.name) setUserName(data?.name);
    if (data?.picture) setUserPicture(data?.picture);

    setIsAuthenticated(true);

    return { ok: true };
  };

  const logout = () => {
    setUserPubkey(null);
    setUserName(null);
    setUserPicture(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        userPubkey,
        userName,
        userPicture,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
