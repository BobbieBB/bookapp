import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { supabase } from './supabase';
import type { Profile } from './types';

/** 'loading' while we don't know yet, 'error' when the profile could not be fetched (e.g. offline). */
export type ProfileState = 'loading' | 'ready' | 'error';

type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  profileState: ProfileState;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileState, setProfileState] = useState<ProfileState>('loading');
  const [loading, setLoading] = useState(true);
  // Only the latest request may update state (sign out / sign in in quick succession).
  const requestId = useRef(0);
  const loadedFor = useRef<string | null | undefined>(undefined);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    const id = ++requestId.current;
    loadedFor.current = userId ?? null;
    if (!userId) {
      setProfile(null);
      setProfileState('ready');
      return;
    }
    setProfileState('loading');
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, reads_books, reads_fanfic')
      .eq('id', userId)
      .maybeSingle();
    if (id !== requestId.current) return;
    if (error) {
      // Not the same as "no profile yet": never send an existing reader to onboarding.
      setProfileState('error');
      return;
    }
    setProfile((data as Profile | null) ?? null);
    setProfileState('ready');
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Token refreshes fire this too; only reload when the signed-in user changes.
      if ((next?.user.id ?? null) !== loadedFor.current) loadProfile(next?.user.id);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value: AuthState = {
    loading,
    session,
    profile,
    profileState,
    refreshProfile: () => loadProfile(session?.user.id),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
