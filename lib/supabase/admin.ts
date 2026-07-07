import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client: bypasses RLS entirely. Only ever import this from
// server-only code (Server Actions, Server Components) — never from a
// 'use client' file, and never send SUPABASE_SERVICE_ROLE_KEY to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
