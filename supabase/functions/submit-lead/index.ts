import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { first_name, last_name, phone, email, zip, interest, call_time, turnstile_token } = body;

    // 1. Verify Turnstile token
    if (TURNSTILE_SECRET) {
      const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: TURNSTILE_SECRET,
          response: turnstile_token || '',
        }),
      });
      const turnstileData = await turnstileRes.json();
      if (!turnstileData.success) {
        return new Response(JSON.stringify({ error: 'CAPTCHA verification failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 2. Validate inputs
    if (!first_name || !first_name.trim()) {
      return new Response(JSON.stringify({ error: 'First name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return new Response(JSON.stringify({ error: 'Valid phone number is required (10+ digits)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (zip && !/^\d{5}$/.test(zip)) {
      return new Response(JSON.stringify({ error: 'ZIP code must be 5 digits' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Insert lead with forced safe values (service role bypasses RLS)
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data, error } = await sb.from('leads').insert({
      first_name: first_name.trim(),
      last_name: (last_name || '').trim(),
      phone: cleanPhone,
      email: (email || '').trim(),
      zip: (zip || '').trim(),
      interest: (interest || '').trim(),
      call_time: (call_time || '').trim(),
      status: 'New',
      source: 'website',
      assigned_to: null,
    }).select().single();

    if (error) {
      return new Response(JSON.stringify({ error: 'Failed to submit. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
