import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as api from "./api";

// The token lives in sessionStorage: it disappears when the tab is closed and is
// not shared between tabs. (localStorage would keep it for weeks.) The strict
// Content-Security-Policy (scripts only from our own origin) is what protects it
// from XSS. A httpOnly cookie would be stronger but needs CSRF protection too.
const STORAGE_KEY = "docai.token";

function readToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the user simply has to log in again after a reload */
  }
}

interface AuthContextValue {
  user: api.User | null;
  loading: boolean;
  notice: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: (notice?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken);
  const [user, setUser] = useState<api.User | null>(null);
  const [loading, setLoading] = useState<boolean>(() => readToken() !== null);
  const [notice, setNotice] = useState<string | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const logout = useCallback((message?: string) => {
    writeToken(null);
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    setNotice(message ?? null);
  }, []);

  // Must run before the effect below, which makes the first API call.
  useEffect(() => {
    api.configureApi({
      getToken: () => tokenRef.current,
      onUnauthorized: () => logout("Økten din har utløpt. Logg inn på nytt."),
    });
  }, [logout]);

  // A token from an earlier visit may be expired: verify it before trusting it.
  useEffect(() => {
    if (!tokenRef.current) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .getMe()
      .then((me) => !cancelled && setUser(me))
      .catch(() => !cancelled && logout())
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await api.login(email, password);
    writeToken(access_token);
    tokenRef.current = access_token;
    setToken(access_token);
    setUser(await api.getMe());
    setNotice(null);
  }, []);

  const register = useCallback(
    async (email: string, password: string) => {
      await api.register(email, password);
      await login(email, password);
    },
    [login],
  );

  const value = useMemo(
    () => ({ user, loading, notice, login, register, logout }),
    [user, loading, notice, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
