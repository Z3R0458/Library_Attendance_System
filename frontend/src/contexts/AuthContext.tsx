import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseErrorMessage, supabase } from '../lib/supabase';
import { AuthContext, type AuthContextValue } from './auth';

const OFFLINE_ADMIN_SESSION_KEY = 'library-offline-admin-session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const nextSession = data.session ?? readCachedSession();
        setSession(nextSession);
      })
      .catch((error: unknown) => {
        console.error(getSupabaseErrorMessage(error, 'Unable to restore admin session.'));
        setSession(readCachedSession());
      })
      .finally(() => {
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        localStorage.setItem(OFFLINE_ADMIN_SESSION_KEY, JSON.stringify(nextSession));
      } else {
        localStorage.removeItem(OFFLINE_ADMIN_SESSION_KEY);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!navigator.onLine) {
      return { error: 'Admin login needs one online sign-in on this device before offline use.' };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    } catch (error) {
      return {
        error: getSupabaseErrorMessage(
          error,
          'Unable to sign in. Check your Supabase URL, key, and network connection.',
        ),
      };
    }
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(OFFLINE_ADMIN_SESSION_KEY);
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error(getSupabaseErrorMessage(error, 'Unable to notify Supabase about sign-out.'));
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn,
      signOut,
      isAdmin: !!session,
    }),
    [session, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function readCachedSession(): Session | null {
  try {
    const raw = localStorage.getItem(OFFLINE_ADMIN_SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
