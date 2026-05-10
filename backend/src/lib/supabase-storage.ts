import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

let cachedClient: SupabaseClient | null = null;

export const getSupabaseStorageClient = (): SupabaseClient | null => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return cachedClient;
};
