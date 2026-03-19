// Replace these with your actual Supabase project values
const SUPABASE_URL = 'https://gkcpglfxtynpzlqbghro.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrY3BnbGZ4dHlucHpscWJnaHJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDYwOTcsImV4cCI6MjA4OTUyMjA5N30.CEHnwb1345ls-lHI2TWWni-FFQM3702GHclCMAaDFyU';
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
