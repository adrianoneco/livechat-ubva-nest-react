import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/api/client';
import { useToast } from '@/hooks/use-toast';
import { useProjectSetup } from '@/hooks/useProjectSetup';

type AppRole = 'admin' | 'supervisor' | 'agent';

interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  status: 'online' | 'offline' | 'away' | 'busy';
  is_approved: boolean;
  created_at: string;
  updated_at: string;
}

interface UserSector {
  id: string;
  sector_id: string;
  is_primary: boolean;
  sector_name?: string;
  instance_id?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  userSectors: UserSector[];
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  markSetupRedirectDone: () => void;
  isAdmin: boolean;
  isSupervisor: boolean;
  isAgent: boolean;
  isApproved: boolean;
  shouldRedirectToSetup: boolean;
  getSectorIds: () => string[];
  isInSector: (sectorId: string) => boolean;
  getInstanceIds: () => string[];
  isInInstance: (instanceId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [userSectors, setUserSectors] = useState<UserSector[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasRedirectedToSetup, setHasRedirectedToSetup] = useState(false);
  const setupTriggeredRef = useRef(false);
  const authInitializedRef = useRef(false);

  const { toast } = useToast();
  const { setupProject, isConfigured, isCheckingConfig } = useProjectSetup();

  const markSetupRedirectDone = () => {
    setHasRedirectedToSetup(true);
  };

  // Auto-create profile and role if missing
  const ensureUserProfile = async (userId: string, accessToken: string) => {
    try {
      console.log('🔧 [AuthContext] Attempting to auto-create profile/role...');

      const { data, error } = await supabase.functions.invoke('ensure-user-profile', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (error) {
        console.error('❌ [AuthContext] Error calling ensure-user-profile:', error);
        return false;
      }

      if (data?.profileCreated || data?.roleCreated) {
        console.log('✅ [AuthContext] Profile/role auto-created:', data);
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ [AuthContext] Error auto-creating profile:', error);
      return false;
    }
  };

  // Load profile and role for a user
  const loadUserData = async (userId: string) => {
    console.log('🔍 [AuthContext] Loading user data for:', userId);
    try {
      // Check if there's a valid token before making requests
      const hasToken = localStorage.getItem('access_token');
      if (!hasToken) {
        console.warn('⚠️ [AuthContext] No access token in localStorage, skipping loadUserData');
        return;
      }

      // Fetch user profile from /api/auth/me endpoint
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        console.warn('⚠️ [AuthContext] No access token available');
        return;
      }

      const { data: userData, error } = await supabase.auth.getUser();
      
      if (error || !userData?.user) {
        console.error('❌ [AuthContext] Error loading user data:', error);
        return;
      }

      const fetchedUser = userData.user as any;
      
      setProfile({
        id: fetchedUser.id,
        full_name: fetchedUser.fullName || fetchedUser.full_name || fetchedUser.email?.split('@')[0] || 'User',
        email: fetchedUser.email || null,
        avatar_url: fetchedUser.avatarUrl || fetchedUser.avatar_url || null,
        status: fetchedUser.status || 'online',
        is_approved: fetchedUser.isApproved ?? fetchedUser.is_approved ?? true,
        created_at: fetchedUser.created_at || new Date().toISOString(),
        updated_at: fetchedUser.updated_at || new Date().toISOString(),
      } as Profile);

      setRole(fetchedUser.role || 'agent');
      
      // Load user sectors
      const { data: sectorsData } = await supabase
        .from('user_sectors')
        .select('*')
        .eq('user_id', userId);
      
      if (sectorsData && Array.isArray(sectorsData)) {
        setUserSectors(sectorsData.map((s: any) => ({
          id: s.id,
          sector_id: s.sector_id,
          is_primary: s.is_primary,
          sector_name: s.sector_name || s.sectors?.name,
          instance_id: s.instance_id,
        })));
      }

      console.log('✅ [AuthContext] User data loaded:', { 
        id: fetchedUser.id, 
        email: fetchedUser.email, 
        role: fetchedUser.role 
      });
    } catch (error) {
      console.error('❌ [AuthContext] Error in loadUserData:', error);
    }
  };

  // Initialize auth state
  useEffect(() => {
    // Prevent multiple initializations during HMR
    if (authInitializedRef.current) {
      console.log('⚠️ [AuthContext] Already initialized, skipping...');
      return;
    }
    authInitializedRef.current = true;
    console.log('✅ [AuthContext] Initializing...');

    // Check if there's a token in localStorage first
    const hasToken = localStorage.getItem('access_token');
    if (!hasToken) {
      console.log('⚠️ [AuthContext] No token found, skipping auth check');
      setIsLoading(false);
      return;
    }

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          // Defer loading user data
          setTimeout(() => {
            loadUserData(currentSession.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        loadUserData(currentSession.user.id).finally(() => {
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      authInitializedRef.current = false;
    };
  }, []);

  // Handle tab/browser close - mark user as offline
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (user && session?.access_token) {
        const API_URL = import.meta.env.VITE_API_URL || '/api';
        // Use fetch with keepalive for reliable offline status update on tab close
        fetch(`${API_URL}/users/me`, {
          method: 'PUT',
          keepalive: true,
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: 'offline' })
        }).catch(() => {
          // Ignore errors on page unload
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user, session]);

  // Auto-setup infrastructure for remix
  const setupRemixInfrastructure = async () => {
    try {
      console.log('[AuthContext] Setting up remix infrastructure...');

      const { data, error } = await supabase.functions.invoke('setup-remix-infrastructure');

      if (error) {
        console.error('[AuthContext] Error setting up infrastructure:', error);
      } else {
        console.log('[AuthContext] Infrastructure setup complete:', data);
      }
    } catch (error) {
      console.error('[AuthContext] Error in setupRemixInfrastructure:', error);
    }
  };

  // Auto-setup project for admin on first login
  useEffect(() => {
    const shouldRunSetup =
      role === 'admin' &&
      !isCheckingConfig &&
      isConfigured === false &&
      setupTriggeredRef.current === false;

    if (shouldRunSetup) {
      setupTriggeredRef.current = true;
      console.log('[AuthContext] Admin detected, running auto-setup (once)...');
      setupProject();
      // Also setup infrastructure (storage buckets, realtime)
      setupRemixInfrastructure();
    }
  }, [role, isConfigured, isCheckingConfig, setupProject]);

  const signIn = async (email: string, password: string) => {
    console.log('🔐 [AuthContext] Attempting sign in for:', email);

    const { data, error } = await supabase.auth.signIn(email, password);

    if (!error && data?.user) {
      const userData = data.user as any;
      
      // Set user and session from login response
      setUser(data.user);
      if (data.session) {
        setSession(data.session);
      }
      
      // Set profile from the response data
      setProfile({
        id: userData.id,
        full_name: userData.fullName || userData.full_name || email.split('@')[0],
        email: userData.email || email,
        avatar_url: userData.avatarUrl || userData.avatar_url || null,
        status: 'online',
        is_approved: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Profile);
      
      setRole(userData.role || 'agent');

      toast({
        title: "Login realizado com sucesso",
        description: "Bem-vindo de volta!",
      });
    }

    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    console.log('🔐 [AuthContext] Attempting sign up for:', email);

    const { data, error } = await supabase.auth.signUp(email, password, fullName);

    if (!error && data?.user) {
      const userData = data.user as any;
      
      // Set the user state
      setUser(data.user);
      
      // Set profile from the registration response
      setProfile({
        id: userData.id,
        full_name: userData.fullName || userData.full_name || fullName || email.split('@')[0],
        email: userData.email || email,
        avatar_url: null,
        status: 'online',
        is_approved: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Profile);
      
      setRole(userData.role || 'agent');

      toast({
        title: "Cadastro realizado com sucesso",
        description: "Bem-vindo ao sistema!",
      });
      
      // After registration, auto-login the user
      const loginResult = await supabase.auth.signIn(email, password);
      if (!loginResult.error && loginResult.data?.session) {
        setSession(loginResult.data.session);
      }
    } else if (error) {
      console.error('❌ [AuthContext] Sign up error:', error);
    }

    return { error };
  };

  const signOut = async () => {
    // Update status to offline before logout
    if (user) {
      await supabase
        .from('profiles')
        .update({ status: 'offline' })
        .eq('id', user.id);
    }

    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setHasRedirectedToSetup(false);
    toast({
      title: "Logout realizado",
      description: "Até logo!",
    });
  };

  const refreshProfile = async () => {
    if (user) {
      await loadUserData(user.id);
    }
  };

  const isAdmin = role === 'admin';
  const isSupervisor = role === 'supervisor';
  const isAgent = role === 'agent';
  const isApproved = profile?.is_approved ?? true; // Default to true for safety

  // Determine if admin should be redirected to setup (only once per session)
  const shouldRedirectToSetup = isAdmin && !isCheckingConfig && isConfigured === false && !hasRedirectedToSetup;

  // Helper functions for sector-based access control
  const getSectorIds = useCallback(() => {
    return userSectors.map(us => us.sector_id);
  }, [userSectors]);

  const isInSector = useCallback((sectorId: string) => {
    return userSectors.some(us => us.sector_id === sectorId);
  }, [userSectors]);

  const getInstanceIds = useCallback(() => {
    const instanceIds = userSectors
      .map(us => us.instance_id)
      .filter((id): id is string => !!id);
    return [...new Set(instanceIds)];
  }, [userSectors]);

  const isInInstance = useCallback((instanceId: string) => {
    return userSectors.some(us => us.instance_id === instanceId);
  }, [userSectors]);

  console.log('🔐 [AuthContext] Current auth state:', {
    userId: user?.id,
    role,
    isAdmin,
    isSupervisor,
    isAgent,
    profileEmail: profile?.id,
    shouldRedirectToSetup,
    userSectorsCount: userSectors.length
  });

  const value: AuthContextType = {
    user,
    session,
    profile,
    role,
    userSectors,
    isLoading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    markSetupRedirectDone,
    isAdmin,
    isSupervisor,
    isAgent,
    isApproved,
    shouldRedirectToSetup,
    getSectorIds,
    isInSector,
    getInstanceIds,
    isInInstance,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
