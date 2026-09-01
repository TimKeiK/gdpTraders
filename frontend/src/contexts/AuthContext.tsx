/**
 * Auth Context — manages authentication state across the app.
 * Provides: user info, token storage, login/register/logout helpers,
 * and an `isAuthenticated` flag for route protection.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, type LoginResponse } from '../api/client';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  kycStatus: string;
  withdrawalAddress?: string | null;
  withdrawalCap?: number;
  availableWithdrawal?: number;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, check if we have a token and fetch the profile
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    const init = async () => {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('gdptraders_token')) {
        try {
          const profile = await authApi.getProfile();
          if (mounted && !controller.signal.aborted) {
            setUser({
              id: profile.id,
              email: profile.email,
              name: profile.name,
              role: profile.role,
              kycStatus: profile.kycStatus,
            });
          }
        } catch {
          // Token invalid or expired — clear it (skip if this init was aborted)
          if (mounted && !controller.signal.aborted) {
            authApi.logout();
            setUser(null);
          }
        }
      }
      if (mounted && !controller.signal.aborted) setIsLoading(false);
    };

    init();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res: LoginResponse = await authApi.login(email, password);
    setUser({
      id: res.user.id,
      email: res.user.email,
      name: res.user.name,
      role: res.user.role,
      kycStatus: res.user.kycStatus,
      withdrawalAddress: (res.user as User).withdrawalAddress,
    });
  };

  const register = async (email: string, password: string, name: string) => {
    await authApi.register(email, password, name);
    // After register, we don't auto-login — user is sent to /login
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
  };

  const refreshProfile = async () => {
    try {
      const profile = await authApi.getProfile();
      setUser({
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        kycStatus: profile.kycStatus,
        withdrawalAddress: (profile as User).withdrawalAddress,
        withdrawalCap: (profile as User).withdrawalCap,
        availableWithdrawal: (profile as User).availableWithdrawal,
      });
    } catch (err) {
      console.error('Failed to refresh user profile:', err);
    }
  };

  const updateUser = (updates: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, register, logout, refreshProfile, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
