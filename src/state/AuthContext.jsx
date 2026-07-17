import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase, isConfigured } from "../lib/supabase";
import { clearAllLocal } from "../lib/offline";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);

  const loadProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, role, active, cost_rate, contracted_hours_weekly, weekly_goal_hours")
        .eq("id", userId)
        .single();
      if (error) throw error;
      setProfile(data);
      setProfileError(null);
    } catch (e) {
      // Profilo non ancora pronto (es. trigger non installato): non bloccare.
      setProfile(null);
      setProfileError(e?.message || "Profilo non trovato");
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => active && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        loadProfile(sess.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    clearAllLocal();
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const value = {
    session,
    user: session?.user || null,
    profile,
    isAdmin: profile?.role === "admin",
    loading,
    profileError,
    isConfigured,
    signIn,
    signOut,
    reloadProfile: () => session?.user && loadProfile(session.user.id),
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
