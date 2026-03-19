// Replace these with your actual Supabase project values
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
const TURNSTILE_SITE_KEY = 'YOUR_TURNSTILE_SITE_KEY';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/submit-lead`;

// Initialize Supabase client (loaded via CDN in HTML)
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}
