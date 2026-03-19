# LegalShield Consultation Platform Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a LegalShield affiliate consultation website with a team management portal, backed by Supabase.

**Architecture:** Static HTML/CSS/JS frontend served by Vercel. Supabase provides PostgreSQL database, Auth, Realtime subscriptions, and an Edge Function for secure form submission. Portal uses a 3-level MLM hierarchy (Owner > Manager > Caller) with RLS-enforced data isolation.

**Tech Stack:** HTML/CSS/JS (no framework), Supabase JS SDK v2, Supabase Edge Functions (Deno/TypeScript), Cloudflare Turnstile, Vercel static hosting.

**Spec:** `docs/superpowers/specs/2026-03-19-legalshield-consultation-platform-design.md`

**Existing source files:**
- `/Users/poweredbyexcellence/Downloads/files (35)/legalshield-client-site.html`
- `/Users/poweredbyexcellence/Downloads/files (35)/legalshield-affiliate-portal.html`

---

## File Map

```
legalshieldconsultation/
├── index.html                        # Client site (rebuilt to match legalshield.com)
├── portal/
│   └── index.html                    # Affiliate portal (auth + all sections)
├── css/
│   ├── client.css                    # Client site styles
│   └── portal.css                    # Portal styles
├── js/
│   ├── supabase-config.js            # Supabase URL + anon key export
│   ├── client-form.js                # Consultation form + Turnstile
│   ├── portal-auth.js                # Login/logout/session/role check
│   ├── portal-leads.js               # Lead CRUD, scoring, filtering, realtime
│   ├── portal-commissions.js         # Commission CRUD, stats, overrides
│   ├── portal-team.js                # Team management, invites, hierarchy
│   └── portal-dashboard.js           # Dashboard stats + activity feed
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql    # All tables, triggers, RLS policies
│   └── functions/
│       ├── submit-lead/
│       │   └── index.ts              # Edge Function: secure lead form submission
│       └── invite-member/
│           └── index.ts              # Edge Function: team member invites
├── vercel.json                       # Routing
└── package.json                      # Metadata
```

Note: The Edge Function (`submit-lead`) is deployed via the Supabase dashboard or CLI, not via Vercel. The source is included in the plan but lives in the Supabase project.

---

## Task 1: Project Scaffolding & Configuration

**Files:**
- Create: `package.json`
- Create: `vercel.json`
- Create: `js/supabase-config.js`
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
.env
.env.local
.superpowers/
.DS_Store
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "legalshieldconsultation",
  "version": "1.0.0",
  "description": "LegalShield Consultation Platform - Client site & Affiliate portal",
  "private": true
}
```

- [ ] **Step 3: Create `vercel.json`**

```json
{
  "rewrites": [
    { "source": "/portal", "destination": "/portal/index.html" },
    { "source": "/portal/", "destination": "/portal/index.html" }
  ]
}
```

Note: Vercel serves static files automatically. We only need rewrites for `/portal` without trailing slash. `/js/*`, `/css/*`, and `/index.html` are served as-is.

- [ ] **Step 4: Create `js/supabase-config.js`**

```js
// Replace these with your actual Supabase project values
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
const TURNSTILE_SITE_KEY = 'YOUR_TURNSTILE_SITE_KEY';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/submit-lead`;

// Initialize Supabase client (loaded via CDN in HTML)
// supabase global is available after <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json vercel.json js/supabase-config.js
git commit -m "feat: project scaffolding with Vercel config and Supabase setup"
```

---

## Task 2: Database Schema & RLS Policies

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

This SQL file is run in the Supabase SQL Editor to set up the entire database.

- [ ] **Step 1: Write the profiles table and updated_at trigger function**

```sql
-- ============================================
-- LEGALSHIELD CONSULTATION PLATFORM SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- Reusable updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── PROFILES ──
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'caller')),
  parent_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'deactivated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Write the leads table**

```sql
-- ── LEADS ──
CREATE TABLE leads (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name text NOT NULL,
  last_name text DEFAULT '',
  phone text NOT NULL,
  email text DEFAULT '',
  zip text DEFAULT '',
  interest text DEFAULT '',
  call_time text DEFAULT '',
  status text NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Called', 'Follow-Up', 'Enrolled', 'Not Interested')),
  reminder date,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('website', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 3: Write the lead_logs table**

```sql
-- ── LEAD LOGS ──
CREATE TABLE lead_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id bigint NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Write the commissions table**

```sql
-- ── COMMISSIONS ──
CREATE TABLE commissions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_name text NOT NULL,
  plan text NOT NULL,
  monthly_fee numeric NOT NULL,
  est_commission numeric NOT NULL,
  notes text DEFAULT '',
  lead_id bigint REFERENCES leads(id) ON DELETE SET NULL,
  logged_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER commissions_updated_at
  BEFORE UPDATE ON commissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 5: Write the touch_profile_updated_at trigger**

This trigger updates the acting user's `profiles.updated_at` whenever they perform actions, powering the "last active" feature.

```sql
-- Touch profiles.updated_at when user takes actions
CREATE OR REPLACE FUNCTION touch_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET updated_at = now() WHERE id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER leads_touch_profile
  AFTER INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION touch_profile_updated_at();

CREATE TRIGGER lead_logs_touch_profile
  AFTER INSERT ON lead_logs
  FOR EACH ROW EXECUTE FUNCTION touch_profile_updated_at();

CREATE TRIGGER commissions_touch_profile
  AFTER INSERT OR UPDATE ON commissions
  FOR EACH ROW EXECUTE FUNCTION touch_profile_updated_at();
```

- [ ] **Step 6: Write helper function for role checking**

```sql
-- Helper: get current user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND status != 'deactivated';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get IDs of my team members (direct reports)
CREATE OR REPLACE FUNCTION get_my_team_ids()
RETURNS SETOF uuid AS $$
  SELECT id FROM profiles WHERE parent_id = auth.uid() AND status != 'deactivated';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is active (not deactivated)
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status != 'deactivated');
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

- [ ] **Step 7: Write RLS policies for profiles**

```sql
-- ── RLS: PROFILES ──
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Select: Owner sees all, Manager sees self + their callers, Caller sees self
CREATE POLICY profiles_select ON profiles FOR SELECT USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR id = auth.uid()
    OR (get_my_role() = 'manager' AND parent_id = auth.uid())
  )
);

-- Insert: Owner can insert any, Manager can insert callers under self
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR (get_my_role() = 'manager' AND parent_id = auth.uid() AND role = 'caller')
  )
);

-- Update: Owner can update any, Manager can update their callers, Caller can update self
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR (get_my_role() = 'manager' AND parent_id = auth.uid())
    OR id = auth.uid()
  )
);
```

- [ ] **Step 8: Write RLS policies for leads**

```sql
-- ── RLS: LEADS ──
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Select: Owner sees all, Manager sees assigned to self or team, Caller sees own
CREATE POLICY leads_select ON leads FOR SELECT USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR assigned_to = auth.uid()
    OR (get_my_role() = 'manager' AND assigned_to IN (SELECT get_my_team_ids()))
  )
);

-- Insert: Authenticated active users can insert manual leads
CREATE POLICY leads_insert ON leads FOR INSERT WITH CHECK (
  is_active_user() AND source = 'manual'
);

-- Also allow the Edge Function (service role) to insert website leads
-- This is handled by the Edge Function using the service_role key, which bypasses RLS

-- Update: Same scope as select
CREATE POLICY leads_update ON leads FOR UPDATE USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR assigned_to = auth.uid()
    OR (get_my_role() = 'manager' AND assigned_to IN (SELECT get_my_team_ids()))
  )
);

-- Delete: Owner and Manager only (within their scope)
CREATE POLICY leads_delete ON leads FOR DELETE USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR (get_my_role() = 'manager' AND (
      assigned_to = auth.uid()
      OR assigned_to IN (SELECT get_my_team_ids())
    ))
  )
);
```

- [ ] **Step 9: Write RLS policies for lead_logs**

```sql
-- ── RLS: LEAD_LOGS ──
ALTER TABLE lead_logs ENABLE ROW LEVEL SECURITY;

-- Select: Can see logs for leads you can see
CREATE POLICY lead_logs_select ON lead_logs FOR SELECT USING (
  is_active_user() AND (
    EXISTS (
      SELECT 1 FROM leads WHERE leads.id = lead_logs.lead_id AND (
        get_my_role() = 'owner'
        OR leads.assigned_to = auth.uid()
        OR (get_my_role() = 'manager' AND leads.assigned_to IN (SELECT get_my_team_ids()))
      )
    )
  )
);

-- Insert: Can add logs to leads you can see
CREATE POLICY lead_logs_insert ON lead_logs FOR INSERT WITH CHECK (
  is_active_user() AND author_id = auth.uid() AND (
    EXISTS (
      SELECT 1 FROM leads WHERE leads.id = lead_logs.lead_id AND (
        get_my_role() = 'owner'
        OR leads.assigned_to = auth.uid()
        OR (get_my_role() = 'manager' AND leads.assigned_to IN (SELECT get_my_team_ids()))
      )
    )
  )
);

-- No delete policy (logs are immutable)
```

- [ ] **Step 10: Write RLS policies for commissions**

```sql
-- ── RLS: COMMISSIONS ──
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

-- Select: Owner sees all, Manager sees own + team, Caller sees own
CREATE POLICY commissions_select ON commissions FOR SELECT USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR logged_by = auth.uid()
    OR (get_my_role() = 'manager' AND logged_by IN (SELECT get_my_team_ids()))
  )
);

-- Insert: Authenticated users insert with their own logged_by
CREATE POLICY commissions_insert ON commissions FOR INSERT WITH CHECK (
  is_active_user() AND logged_by = auth.uid()
);

-- Update: Owner any, Manager own + team, Caller own
CREATE POLICY commissions_update ON commissions FOR UPDATE USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR logged_by = auth.uid()
    OR (get_my_role() = 'manager' AND logged_by IN (SELECT get_my_team_ids()))
  )
);

-- Delete: Owner any, Manager own + team, Caller cannot
CREATE POLICY commissions_delete ON commissions FOR DELETE USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR (get_my_role() = 'manager' AND (
      logged_by = auth.uid()
      OR logged_by IN (SELECT get_my_team_ids())
    ))
  )
);
```

- [ ] **Step 11: Write the auto-create profile trigger for new auth users**

```sql
-- Auto-create a profile when a new user signs up via invite
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, parent_id, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'caller'),
    (NEW.raw_user_meta_data->>'parent_id')::uuid,
    'active'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

- [ ] **Step 12: Enable Realtime on the leads table**

```sql
-- Enable Realtime for leads table
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
```

- [ ] **Step 13: Assemble the full migration file and commit**

Combine all the SQL from steps 1-12 into `supabase/migrations/001_initial_schema.sql`.

```bash
git add supabase/migrations/001_initial_schema.sql
git commit -m "feat: database schema with tables, triggers, RLS policies"
```

---

## Task 3: Supabase Edge Function — `submit-lead`

**Files:**
- Create: `supabase/functions/submit-lead/index.ts`

This file is deployed via Supabase CLI (`supabase functions deploy submit-lead`). It uses the Supabase service_role key (server-side only, never exposed to client).

- [ ] **Step 1: Write the Edge Function**

```typescript
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
  // Handle CORS preflight
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
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return new Response(JSON.stringify({ error: 'Valid phone number is required (10+ digits)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (zip && !/^\d{5}$/.test(zip)) {
      return new Response(JSON.stringify({ error: 'ZIP code must be 5 digits' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Write the `invite-member` Edge Function**

Create `supabase/functions/invite-member/index.ts`. This function uses the service_role key server-side to invite users via Supabase Auth admin API.

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Verify the caller is authenticated and has permission
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use anon client to verify caller's identity
    const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') || '');
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get caller's profile to check role
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: callerProfile } = await serviceClient
      .from('profiles').select('*').eq('id', caller.id).single();

    if (!callerProfile || callerProfile.status === 'deactivated') {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { full_name, email, role, parent_id } = body;

    // Validate inputs
    if (!full_name || !email || !role) {
      return new Response(JSON.stringify({ error: 'Name, email, and role are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Role checks: Owner can invite anyone, Manager can only invite callers under self
    if (callerProfile.role === 'manager' && role !== 'caller') {
      return new Response(JSON.stringify({ error: 'Managers can only invite callers' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (callerProfile.role === 'caller') {
      return new Response(JSON.stringify({ error: 'Callers cannot invite members' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Invite user via admin API
    const { data: inviteData, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: full_name,
        role: role,
        parent_id: parent_id,
      },
    });

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: inviteData.user.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/submit-lead/index.ts supabase/functions/invite-member/index.ts
git commit -m "feat: Edge Functions for lead submission and member invites"
```

---

## Task 4: Client Site — HTML Structure

**Files:**
- Create: `index.html`
- Create: `css/client.css`

Build the client-facing site matching legalshield.com's layout and design. This is the largest single file. Based on the existing `legalshield-client-site.html` but updated to match legalshield.com's current structure with updated pricing.

- [ ] **Step 1: Create `css/client.css`**

Extract and write all styles for the client site. Match legalshield.com's color scheme (navy `#0a0520`, purple `#3d1fa8`, gold `#e8b800`), typography (Lora serif headings, Inter body), responsive breakpoints (900px, 600px). Reference the existing file's CSS as a starting point but update colors, spacing, and layout to match the current legalshield.com.

Key style sections:
- CSS variables (`:root`)
- Top bar, header, nav, mega dropdowns
- Hero section with stats bar
- Stats bar, press bar
- How We Help cards, How It Works steps
- Plans toggle + plan cards
- Coverage grid cards
- Testimonials cards
- FAQ accordion
- CTA band
- Footer grid
- Modal + form styles
- Sticky mobile CTA
- Responsive breakpoints

- [ ] **Step 2: Create `index.html` — head and header**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Affordable Online Legal Help for All | LegalShield Consultation</title>
<meta name="description" content="Get access to a real law firm for around $1 a day. Unlimited legal consultations, document reviews, and more. Plans starting at $35.95/mo.">
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/client.css">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body>
```

Include: top bar with phone placeholder, sticky header with logo + nav (How It Works, Common Problems mega dropdown, Resources mega dropdown, Plans link), Sign In link, "Get Protected" CTA. Use the existing file's header structure as base, keeping the shield SVG logo.

- [ ] **Step 3: Create `index.html` — hero section**

Hero with: "Real Lawyers, Real Savings, Real Peace of Mind" headline, subtitle about $1/day, "Shop plans" + "Learn more" buttons, 3-stat bar (4.5M+, 22 yrs, ~$1/day), 9-cell emoji grid. Match existing file structure.

- [ ] **Step 4: Create `index.html` — stats bar, press bar, How We Help**

- Stats bar: 5 metrics (4.5 million helped, $26M savings, 22 yrs, 1972, ~$1/day)
- Press bar: "As seen in" with CNBC, Fortune, Business Insider, etc.
- How We Help: 5-card grid (Family Law, Estate Planning, Real Estate, Traffic, Consumer Finance) — each card opens consultation modal on click

- [ ] **Step 5: Create `index.html` — How It Works (3 steps)**

Updated from 4 steps to 3 to match current legalshield.com:
1. Tell us about the help you need
2. We connect you with a provider law firm
3. Get the legal help you need

Each step has: number badge, emoji, title, description.

- [ ] **Step 6: Create `index.html` — Plans & Pricing**

Toggle between Personal and Small Business tabs. **Updated pricing:**

Personal plans:
- Personal Plan: $35.95/mo
- Personal + Home Business: ~$59/mo
- Personal + Trial Defense: ~$54/mo

Small Business plans:
- Essentials: $49/mo
- Plus: $99/mo
- Pro: $169/mo

Each plan card has: name, price, feature list with checkmarks, "Get Started" button that opens modal.

- [ ] **Step 7: Create `index.html` — Coverage, Testimonials, FAQ**

- Coverage: 12-card grid of legal help areas, each clickable to open modal
- Testimonials: 3 member story cards with star ratings
- FAQ: 6 expandable accordion items

- [ ] **Step 8: Create `index.html` — CTA band, Footer, Mobile sticky**

- CTA band: "Get Legal Protection Today" with "Shop plans" + phone number buttons
- Footer: 4-column grid, disclaimer, copyright, privacy/terms links
- Sticky mobile CTA bar (visible < 600px)

- [ ] **Step 9: Create `index.html` — Consultation modal**

Modal with form fields: First Name, Last Name, Phone*, Email, ZIP, Plan Interest dropdown, Best Call Time dropdown. Include Cloudflare Turnstile widget. Success state with checkmark animation.

```html
<!-- Turnstile widget inside form -->
<div class="cf-turnstile" data-sitekey="YOUR_TURNSTILE_SITE_KEY" data-callback="onTurnstileSuccess"></div>
```

- [ ] **Step 10: Add Supabase SDK + form script**

At bottom of `index.html`:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/supabase-config.js"></script>
<script src="/js/client-form.js"></script>
```

- [ ] **Step 11: Commit**

```bash
git add index.html css/client.css
git commit -m "feat: client site HTML/CSS matching legalshield.com design"
```

---

## Task 5: Client Site — Form Submission Logic

**Files:**
- Create: `js/client-form.js`

- [ ] **Step 1: Write `client-form.js`**

```js
// Turnstile token storage
let turnstileToken = '';
function onTurnstileSuccess(token) {
  turnstileToken = token;
}

function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('mform').style.display = 'block';
  document.getElementById('msuccess').style.display = 'none';
  // Reset Turnstile
  if (window.turnstile) turnstile.reset();
  turnstileToken = '';
}

// Close on overlay click
document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// Client-side validation
function validateForm() {
  const fn = document.getElementById('f-fn').value.trim();
  const ph = document.getElementById('f-ph').value.trim();
  const em = document.getElementById('f-em').value.trim();
  const zip = document.getElementById('f-zip').value.trim();

  if (!fn) return 'First name is required.';
  if (!ph || ph.replace(/\D/g, '').length < 10) return 'Valid phone number is required (10+ digits).';
  if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return 'Please enter a valid email address.';
  if (zip && !/^\d{5}$/.test(zip)) return 'ZIP code must be 5 digits.';
  if (!turnstileToken) return 'Please complete the CAPTCHA verification.';
  return null;
}

async function submitForm() {
  const err = validateForm();
  if (err) { alert(err); return; }

  const btn = document.querySelector('.btn-submit');
  const origText = btn.textContent;
  btn.textContent = 'Submitting...';
  btn.disabled = true;

  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: document.getElementById('f-fn').value.trim(),
        last_name: document.getElementById('f-ln').value.trim(),
        phone: document.getElementById('f-ph').value.trim(),
        email: document.getElementById('f-em').value.trim(),
        zip: document.getElementById('f-zip').value.trim(),
        interest: document.getElementById('f-int').value,
        call_time: document.getElementById('f-time').value,
        turnstile_token: turnstileToken,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submission failed');

    // Success
    document.getElementById('mform').style.display = 'none';
    document.getElementById('msuccess').style.display = 'block';

    // Clear form
    ['f-fn','f-ln','f-ph','f-em','f-zip'].forEach(id => document.getElementById(id).value = '');
    ['f-int','f-time'].forEach(id => document.getElementById(id).value = '');
  } catch (e) {
    alert(e.message || 'Something went wrong. Please try again.');
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

// FAQ toggle (client site)
function tfq(el) {
  const item = el.parentElement;
  item.classList.toggle('open');
  item.querySelector('.fq-a').style.display = item.classList.contains('open') ? 'block' : 'none';
}
document.querySelectorAll('.fq-a').forEach(a => a.style.display = 'none');

// Plans toggle
function switchPlans(type, btn) {
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.plans-wrap').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(type + '-plans').classList.add('active');
}
```

- [ ] **Step 2: Commit**

```bash
git add js/client-form.js
git commit -m "feat: client form submission with Turnstile + Edge Function"
```

---

## Task 6: Portal — CSS Styles

**Files:**
- Create: `css/portal.css`

- [ ] **Step 1: Write `css/portal.css`**

Extract and adapt styles from the existing `legalshield-affiliate-portal.html`. Keep the same design language (purple/gold/navy) but organized in a clean external stylesheet. Key sections:

- CSS variables (same palette as client site for consistency)
- Login screen styles
- Header + nav tabs
- Dashboard cards
- Stats row, cards
- Toolbar (search, filters, add button)
- Table styles (leads, commissions, team)
- Score bars and status badges
- Reminder badges
- Action buttons
- Modal styles (add lead, update lead, log enrollment, invite member)
- Notification banner
- Team tree view
- Call script accordion
- FAQ/objection accordion
- Quick reference cards
- Plan cards
- Responsive breakpoints

- [ ] **Step 2: Commit**

```bash
git add css/portal.css
git commit -m "feat: portal CSS styles"
```

---

## Task 7: Portal — HTML Structure & Auth

**Files:**
- Create: `portal/index.html`
- Create: `js/portal-auth.js`

- [ ] **Step 1: Create `portal/index.html` — login screen**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LegalShield Affiliate Portal</title>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/portal.css">
</head>
<body>

<!-- LOGIN SCREEN (shown when not authenticated) -->
<div id="login-screen">
  <!-- Full-screen centered login form with email/password fields -->
  <!-- Logo, "Affiliate Portal" title -->
  <!-- Email input, Password input, "Sign In" button -->
  <!-- Error message area -->
</div>

<!-- PORTAL (hidden until authenticated) -->
<div id="portal-app" style="display:none">
```

- [ ] **Step 2: Create `portal/index.html` — header + nav**

Inside `#portal-app`:
- Header with shield logo + "LegalShield Consultation" + "Affiliate Representative Portal"
- Role badge (shows current user's role)
- Logout button
- Nav tabs: Dashboard, Warm Leads, Commission Tracker, Team, Plans & Pricing, Call Script, FAQs & Objections, Quick Reference

- [ ] **Step 3: Create `portal/index.html` — Dashboard section**

Section `#dashboard`:
- Stats row: New Leads, Total Leads, Enrolled, Follow-Up Due, Team Size
- Performance summary card (my enrollments this month, commission earned)
- Recent activity feed (last 10 actions)
- Quick action buttons: Add Lead, Invite Team Member

- [ ] **Step 4: Create `portal/index.html` — Warm Leads section**

Section `#leads`:
- Title + subtitle
- Stats row (New, Total, Enrolled, Contacted, Follow-Up Due)
- Toolbar: search input, filter buttons (All, New, Called, Follow-Up, Enrolled, Not Interested), Export CSV + Add Lead buttons
- Table: Score, Name, Phone, Email/ZIP, Interest, Call Time, Added, Reminder, Assigned To, Status, Actions
- Empty state message

- [ ] **Step 5: Create `portal/index.html` — Commission section**

Section `#commission`:
- Stats cards: Total Earnings, This Month, Total Enrolled, Avg Plan Value
- Commission rate guide table (updated pricing)
- Enrollment log table with "Log Enrollment" button
- Empty state

- [ ] **Step 6: Create `portal/index.html` — Team Management section**

Section `#team`:
- Title + "Invite Member" button
- Team tree view container
- Performance table: Name, Role, Status, Leads Assigned, Enrollments, Conversion Rate, Last Active

- [ ] **Step 7: Create `portal/index.html` — Reference sections**

Sections carried over from existing portal HTML (updated pricing):
- `#plans` — Plans & Pricing (Personal/Business toggle, plan cards)
- `#script` — Call Script (6 accordion steps)
- `#faq` — FAQs & Objections (expandable cards)
- `#quick` — Quick Reference (key numbers, prices, value statements)

- [ ] **Step 8: Create `portal/index.html` — Modals**

All modals:
- Add Lead modal (first_name, last_name, phone, email, zip, interest, call_time, status, reminder, notes)
- Update Lead modal (status, reminder, call log note, log history)
- Log Enrollment modal (member name, plan dropdown, date, notes, optional lead link)
- Invite Member modal (name, email, role dropdown)
- Notification banner area

- [ ] **Step 9: Create `portal/index.html` — Scripts at bottom**

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/supabase-config.js"></script>
<script src="/js/portal-auth.js"></script>
<script src="/js/portal-leads.js"></script>
<script src="/js/portal-commissions.js"></script>
<script src="/js/portal-team.js"></script>
<script src="/js/portal-dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 10: Write `js/portal-auth.js`**

```js
// State
let currentUser = null;
let currentProfile = null;

// On page load: check session
async function initAuth() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    await loadProfile(session.user);
  } else {
    showLogin();
  }

  // Listen for auth changes
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await loadProfile(session.user);
    } else if (event === 'SIGNED_OUT') {
      showLogin();
    }
  });
}

async function loadProfile(user) {
  const sb = getSupabase();
  const { data: profile, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile || profile.status === 'deactivated') {
    await sb.auth.signOut();
    showLogin('Account is deactivated or not found.');
    return;
  }

  currentUser = user;
  currentProfile = profile;
  showPortal();
}

function showLogin(errorMsg) {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('portal-app').style.display = 'none';
  if (errorMsg) {
    document.getElementById('login-error').textContent = errorMsg;
  }
}

async function showPortal() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('portal-app').style.display = 'block';

  // Update UI with user info
  document.getElementById('user-name').textContent = currentProfile.full_name;
  document.getElementById('user-role').textContent = currentProfile.role.charAt(0).toUpperCase() + currentProfile.role.slice(1);

  // Load all data before rendering dashboard (avoids empty state race condition)
  await Promise.all([initLeads(), initCommissions(), initTeam()]);
  initDashboard();
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = 'Email and password are required.';
    return;
  }

  const sb = getSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = error.message;
  }
}

async function handleLogout() {
  const sb = getSupabase();
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
}

// Nav tab switching
function showSec(id, btn) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nt').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}

// Helper: check if current user is owner
function isOwner() { return currentProfile?.role === 'owner'; }
function isManager() { return currentProfile?.role === 'manager'; }
function isCaller() { return currentProfile?.role === 'caller'; }
function canDelete() { return isOwner() || isManager(); }

// Notification helper
function showNotif(msg, type) {
  const area = document.getElementById('notif-area');
  const div = document.createElement('div');
  div.className = 'notif' + (type ? ' ' + type : '');
  div.innerHTML = '<span>' + msg + '</span><button class="notif-close" onclick="this.parentElement.remove()">x</button>';
  area.appendChild(div);
  setTimeout(() => { if (div.parentElement) div.remove(); }, 5000);
}

// Init on load
document.addEventListener('DOMContentLoaded', initAuth);
```

- [ ] **Step 11: Commit**

```bash
git add portal/index.html js/portal-auth.js
git commit -m "feat: portal HTML structure with auth login/logout"
```

---

## Task 8: Portal — Leads Management

**Files:**
- Create: `js/portal-leads.js`

- [ ] **Step 1: Write lead scoring function**

```js
function scoreLead(lead) {
  let s = 0;
  const interestScores = {
    'Small Business Pro': 10, 'Small Business Plus': 8,
    'Personal + Home Business': 7, 'Small Business Essentials': 6,
    'Personal + Trial Defense': 5, 'Personal / Family': 4, 'Not sure': 2
  };
  for (const [k, v] of Object.entries(interestScores)) {
    if ((lead.interest || '').includes(k)) { s += v; break; }
  }
  const hrs = (Date.now() - new Date(lead.created_at).getTime()) / 3600000;
  if (hrs < 2) s += 8; else if (hrs < 12) s += 5; else if (hrs < 24) s += 3; else if (hrs < 72) s += 1;
  const statusScores = { New: 3, 'Follow-Up': 2, Called: 1, Enrolled: 0, 'Not Interested': -5 };
  s += (statusScores[lead.status] || 0);
  if (lead.call_time) s += 1;
  if (lead.zip) s += 1;
  return Math.max(0, Math.min(20, s));
}

function scoreLabel(n) {
  if (n >= 14) return { cls: 'score-hot', lbl: 'Hot', color: '#ef4444' };
  if (n >= 9) return { cls: 'score-warm', lbl: 'Warm', color: '#f97316' };
  if (n >= 5) return { cls: 'score-cool', lbl: 'Cool', color: '#3b82f6' };
  return { cls: 'score-cold', lbl: 'Cold', color: '#94a3b8' };
}
```

- [ ] **Step 2: Write lead fetching + realtime subscription**

```js
let allLeads = [];
let leadFilter = 'all';
let teamProfiles = []; // loaded by portal-team.js, shared

async function initLeads() {
  await fetchLeads();
  subscribeLeads();
}

async function fetchLeads() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('leads')
    .select('*, lead_logs(*)')
    .order('created_at', { ascending: false });

  if (error) { console.error('Failed to fetch leads:', error); return; }
  allLeads = data || [];
  renderLeads();
  updateLeadStats();
}

function subscribeLeads() {
  const sb = getSupabase();
  sb.channel('leads-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
      fetchLeads(); // Re-fetch on any change
    })
    .subscribe();
}
```

- [ ] **Step 3: Write lead rendering function**

Renders the leads table with filtering, searching, scoring, status badges, reminder badges, action buttons (respecting role-based visibility), and assigned-to display. Populates stats row. Handles empty state.

Key behaviors:
- Filter by `leadFilter` variable
- Search by name, phone, email
- Sort by score descending
- Show delete button only for Owner/Manager
- Show assigned_to dropdown for Owner/Manager
- Format dates, phone links, reminder colors

- [ ] **Step 4: Write lead CRUD operations**

```js
// Add lead manually
async function saveLead() {
  const firstName = document.getElementById('al-fname').value.trim();
  const phone = document.getElementById('al-phone').value.trim();
  if (!firstName || !phone) { alert('First name and phone are required.'); return; }

  const sb = getSupabase();
  const { error } = await sb.from('leads').insert({
    first_name: firstName,
    last_name: document.getElementById('al-lname').value.trim(),
    phone: phone.replace(/\D/g, ''),
    email: document.getElementById('al-email').value.trim(),
    zip: document.getElementById('al-zip').value.trim(),
    interest: document.getElementById('al-int').value,
    call_time: document.getElementById('al-time').value,
    status: document.getElementById('al-status').value,
    reminder: document.getElementById('al-rem').value || null,
    source: 'manual',
    assigned_to: currentProfile.id,
  });

  if (error) { alert('Failed to add lead.'); return; }
  closeAddModal();
  showNotif('Lead added!', 'ok');
}

// Update lead status + add log
async function saveUpdate() {
  const id = parseInt(document.getElementById('upd-id').value);
  const sb = getSupabase();

  await sb.from('leads').update({
    status: document.getElementById('upd-status').value,
    reminder: document.getElementById('upd-rem').value || null,
  }).eq('id', id);

  const note = document.getElementById('upd-note').value.trim();
  if (note) {
    await sb.from('lead_logs').insert({
      lead_id: id,
      author_id: currentProfile.id,
      note: note,
    });
  }

  closeUpdateModal();
  showNotif('Lead updated!', 'ok');
}

// Delete lead
async function deleteLead(id) {
  if (!confirm('Remove this lead?')) return;
  const sb = getSupabase();
  await sb.from('leads').delete().eq('id', id);
  showNotif('Lead removed.', 'ok');
}

// Assign lead to team member
async function assignLead(leadId, profileId) {
  const sb = getSupabase();
  await sb.from('leads').update({
    assigned_to: profileId || null
  }).eq('id', leadId);
}

// Export CSV (respects role visibility — only exports what user can see)
function exportCSV() {
  if (!allLeads.length) { alert('No leads to export.'); return; }
  const headers = ['First Name','Last Name','Phone','Email','ZIP','Interest','Call Time','Date Added','Status','Score','Reminder','Last Note'];
  const rows = allLeads.map(l => {
    const s = scoreLead(l);
    const lastNote = l.lead_logs?.length ? l.lead_logs[0].note.replace(/,/g, ';') : '';
    return [l.first_name, l.last_name, l.phone, l.email, l.zip, l.interest, l.call_time,
      new Date(l.created_at).toLocaleDateString(), l.status, s, l.reminder || '', lastNote];
  });
  const csv = [headers, ...rows].map(r => r.map(v => '"' + v + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'legalshield_leads_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
}
```

- [ ] **Step 5: Write modal open/close helpers for leads**

Functions for: `openAddModal()`, `closeAddModal()`, `openUpdateModal(id)`, `closeUpdateModal()`, `setLeadFilter(filter, btn)`.

- [ ] **Step 6: Commit**

```bash
git add js/portal-leads.js
git commit -m "feat: portal leads management with scoring, CRUD, realtime"
```

---

## Task 9: Portal — Commission Tracker

**Files:**
- Create: `js/portal-commissions.js`

- [ ] **Step 1: Write commission fetching and rendering**

```js
let allCommissions = [];

async function initCommissions() {
  await fetchCommissions();
}

async function fetchCommissions() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('commissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { console.error('Failed to fetch commissions:', error); return; }
  allCommissions = data || [];
  renderCommissions();
}
```

Render function populates:
- Stats cards (total earnings, this month, total enrolled, avg plan value)
- Enrollment log table
- Empty state

- [ ] **Step 2: Write commission CRUD**

```js
async function saveCommission() {
  const name = document.getElementById('cm-name').value.trim();
  const planRaw = document.getElementById('cm-plan').value;
  if (!name || !planRaw) { alert('Name and plan are required.'); return; }

  const [plan, monthly, comm] = planRaw.split('|');
  const leadId = document.getElementById('cm-lead').value || null;

  const sb = getSupabase();
  const { error } = await sb.from('commissions').insert({
    member_name: name,
    plan: plan,
    monthly_fee: parseFloat(monthly),
    est_commission: parseFloat(comm),
    notes: document.getElementById('cm-notes').value,
    lead_id: leadId ? parseInt(leadId) : null,
    logged_by: currentProfile.id,
  });

  if (error) { alert('Failed to log enrollment.'); return; }
  closeCommModal();
  fetchCommissions();
  showNotif('Enrollment logged!', 'ok');
}

async function deleteCommission(id) {
  if (!confirm('Remove this enrollment?')) return;
  const sb = getSupabase();
  await sb.from('commissions').delete().eq('id', id);
  fetchCommissions();
  showNotif('Enrollment removed.', 'ok');
}
```

Commission plan dropdown values (updated pricing):
```
Personal Plan|35.95|45
Personal + Home Business|59|70
Personal + Trial Defense|54|65
SB Essentials|49|65
SB Plus|99|125
SB Pro|169|210
```

- [ ] **Step 3: Write modal helpers for commissions**

`openCommModal()`, `closeCommModal()` — populate enrolled leads dropdown from `allLeads` where status is 'Enrolled'.

- [ ] **Step 4: Commit**

```bash
git add js/portal-commissions.js
git commit -m "feat: portal commission tracker with CRUD and stats"
```

---

## Task 10: Portal — Team Management

**Files:**
- Create: `js/portal-team.js`

- [ ] **Step 1: Write team fetching**

```js
async function initTeam() {
  await fetchTeam();
}

async function fetchTeam() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) { console.error('Failed to fetch team:', error); return; }
  teamProfiles = data || [];
  renderTeamTree();
  renderPerformanceTable();
}
```

- [ ] **Step 2: Write team tree rendering**

Build a visual hierarchy: Owner at top, Managers indented under Owner, Callers indented under their Manager. Each node shows: name, role badge, status badge, leads count, enrollments count, last active relative time. Deactivated members shown with muted styling and "deactivated" badge.

- [ ] **Step 3: Write performance table rendering**

Sortable table with columns: Name, Role, Status, Leads Assigned (count from `allLeads`), Enrollments (count from `allCommissions`), Last Active (relative from `updated_at`).

- [ ] **Step 4: Write invite member function**

```js
async function inviteMember() {
  const name = document.getElementById('inv-name').value.trim();
  const email = document.getElementById('inv-email').value.trim();
  const role = document.getElementById('inv-role').value;

  if (!name || !email || !role) { alert('All fields are required.'); return; }

  // Validate: Manager can only invite callers
  if (isManager() && role !== 'caller') {
    alert('You can only invite callers to your team.');
    return;
  }

  try {
    // Call Edge Function (uses service_role key server-side)
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();

    const res = await fetch(SUPABASE_URL + '/functions/v1/invite-member', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({
        full_name: name,
        email: email,
        role: role,
        parent_id: currentProfile.id,
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Invite failed');

    closeInviteModal();
    fetchTeam();
    showNotif('Team member invited! They will receive an email to set their password.', 'ok');
  } catch (e) {
    alert('Invite failed: ' + e.message);
  }
}
```

- [ ] **Step 5: Write deactivate member function**

```js
async function deactivateMember(profileId) {
  if (!confirm('Deactivate this team member? They will lose portal access.')) return;

  const sb = getSupabase();

  // Set profile status to deactivated
  await sb.from('profiles').update({ status: 'deactivated' }).eq('id', profileId);

  // Unassign their leads
  await sb.from('leads').update({ assigned_to: null }).eq('assigned_to', profileId);

  fetchTeam();
  fetchLeads();
  showNotif('Team member deactivated.', 'ok');
}
```

- [ ] **Step 6: Write modal helpers for team**

`openInviteModal()`, `closeInviteModal()` — role dropdown shows Manager + Caller for Owner, only Caller for Manager.

- [ ] **Step 7: Commit**

```bash
git add js/portal-team.js
git commit -m "feat: portal team management with tree view, invites, deactivation"
```

---

## Task 11: Portal — Dashboard

**Files:**
- Create: `js/portal-dashboard.js`

- [ ] **Step 1: Write dashboard initialization and stats**

```js
async function initDashboard() {
  renderDashboardStats();
  renderActivityFeed();
}

function renderDashboardStats() {
  const today = new Date().toISOString().split('T')[0];
  const newLeads = allLeads.filter(l => l.status === 'New').length;
  const totalLeads = allLeads.length;
  const enrolled = allLeads.filter(l => l.status === 'Enrolled').length;
  const followUpDue = allLeads.filter(l =>
    l.reminder && l.reminder <= today &&
    l.status !== 'Enrolled' && l.status !== 'Not Interested'
  ).length;
  const teamSize = teamProfiles.filter(p => p.status === 'active').length;

  document.getElementById('dash-new').textContent = newLeads;
  document.getElementById('dash-total').textContent = totalLeads;
  document.getElementById('dash-enrolled').textContent = enrolled;
  document.getElementById('dash-followup').textContent = followUpDue;
  document.getElementById('dash-team').textContent = teamSize;

  // My performance this month
  const now = new Date();
  const myComms = allCommissions.filter(c => {
    const d = new Date(c.created_at);
    return c.logged_by === currentProfile.id &&
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  document.getElementById('dash-my-enrollments').textContent = myComms.length;
  document.getElementById('dash-my-commission').textContent =
    '$' + myComms.reduce((a, c) => a + c.est_commission, 0).toLocaleString();
}
```

- [ ] **Step 2: Write activity feed**

Build a combined activity feed from recent lead_logs and commission entries, sorted by created_at descending, limited to 10 items. Each item shows: icon, description ("John updated lead Jane Smith to Called"), relative timestamp.

- [ ] **Step 3: Commit**

```bash
git add js/portal-dashboard.js
git commit -m "feat: portal dashboard with stats and activity feed"
```

---

## Task 12: Portal — Reference Sections (Static)

These sections are carried over from the existing portal HTML and don't need JS logic beyond accordion toggles.

**Files:**
- Modify: `portal/index.html` (already created in Task 7)

- [ ] **Step 1: Verify Plans & Pricing section has updated pricing**

Personal Plan: $35.95/mo, Personal + Home Business: ~$59/mo, Personal + Trial Defense: ~$54/mo, SB Essentials: $49/mo, SB Plus: $99/mo, SB Pro: $169/mo.

- [ ] **Step 2: Verify Call Script section has all 6 steps**

Opening, Discovery, Present Solution, Match Plan, Handle Hesitation, Wrap-Up.

- [ ] **Step 3: Verify FAQ section has all 8 items**

Including objections (already have lawyer, too expensive, vs LegalZoom, need to think) and info (real lawyers?, pre-existing?, cancel?, family?).

- [ ] **Step 4: Verify Quick Reference has updated pricing**

Key numbers, prices at a glance, always included features, best plan match, top value statements.

- [ ] **Step 5: Add accordion toggle JS to portal-auth.js**

```js
// Script accordion toggle
function toggleScriptStep(hdr) {
  hdr.parentElement.classList.toggle('open');
}

// FAQ toggle
function toggleFaq(hdr) {
  const item = hdr.parentElement;
  item.classList.toggle('open');
  const answer = item.querySelector('.fqa');
  answer.style.display = item.classList.contains('open') ? 'block' : 'none';
}

// Plans toggle
function showPortalPlans(id, btn) {
  document.querySelectorAll('.psec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.pt').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}
```

- [ ] **Step 6: Commit**

```bash
git add portal/index.html js/portal-auth.js
git commit -m "feat: portal reference sections with updated pricing"
```

---

## Task 13: Integration Testing & Verification

- [ ] **Step 1: Verify Supabase setup**

Run `001_initial_schema.sql` in Supabase SQL Editor. Verify:
- All 4 tables created
- All triggers working (`updated_at` auto-updates)
- All RLS policies active
- Realtime enabled on `leads` table
- `handle_new_user` trigger creates profiles on signup

Test: Create a test user in Supabase Auth dashboard, verify profile auto-created.

- [ ] **Step 2: Verify Edge Function**

Deploy `submit-lead` Edge Function. Test:
- POST with valid data → 200, lead inserted with `status='New'`, `source='website'`
- POST without first_name → 400 error
- POST with short phone → 400 error
- POST with invalid Turnstile token → 400 error

- [ ] **Step 3: Verify client site locally**

Open `index.html` in browser. Verify:
- All sections render correctly
- Navigation works (smooth scroll, mega dropdowns)
- Plans toggle works
- FAQ accordion works
- Modal opens/closes
- Form validation works client-side
- Form submits to Edge Function successfully
- Success message shows after submit
- Responsive: check at 900px and 600px breakpoints
- Mobile sticky CTA visible on small screens

- [ ] **Step 4: Verify portal auth**

Open `portal/index.html`. Verify:
- Login screen shows by default
- Login with test user credentials → portal loads
- User name and role badge display correctly
- Logout works → returns to login screen
- Deactivated user cannot log in

- [ ] **Step 5: Verify portal leads**

- Add a lead manually → appears in table
- Submit a lead from client site → appears in portal in real-time
- Lead scoring displays correctly
- Filters work (All, New, Called, etc.)
- Search works
- Update lead status → badge changes
- Add call log → appears in update modal history
- Assign lead to team member (Owner/Manager only)
- Delete lead (Owner/Manager only, not visible for Caller)
- Export CSV downloads correct data
- Reminder badges show correct colors (overdue/today/future)

- [ ] **Step 6: Verify portal commissions**

- Log enrollment → appears in table
- Stats cards update (total, this month, enrolled count, avg)
- Link enrollment to a lead (optional)
- Delete enrollment (role-based)
- Commission rate guide shows correct pricing

- [ ] **Step 7: Verify portal team**

- Team tree displays hierarchy correctly
- Invite modal works (or document manual Supabase user creation for Phase 1)
- Performance table shows correct counts
- Deactivate member → status changes, leads unassigned, can't log in
- Role-based visibility: Manager sees only their team, Caller sees only self

- [ ] **Step 8: Verify portal dashboard**

- Stats row shows correct numbers
- Performance summary reflects current user's data
- Activity feed shows recent actions

- [ ] **Step 9: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration testing fixes"
```

---

## Task 14: Deploy to Vercel + Domain Setup

- [ ] **Step 1: Push to GitHub**

```bash
git push origin master
```

- [ ] **Step 2: Connect to Vercel**

1. Go to vercel.com, import the `legalshieldconsultation` GitHub repo
2. Framework: "Other" (static site, no build step)
3. Deploy

- [ ] **Step 3: Configure custom domain**

1. In Vercel project settings → Domains → Add `legalshieldconsultation.com`
2. Vercel provides DNS records (A record or CNAME)
3. Go to domain registrar → update DNS records to point to Vercel
4. Wait for DNS propagation + SSL certificate auto-provisioning

- [ ] **Step 4: Update Supabase config**

Update `js/supabase-config.js` with real Supabase project URL, anon key, and Turnstile site key.

- [ ] **Step 5: Set Edge Function secrets**

In Supabase dashboard → Edge Functions → `submit-lead` → set environment variables:
- `TURNSTILE_SECRET_KEY` = your Cloudflare Turnstile secret key

- [ ] **Step 6: Create Owner account**

In Supabase Auth dashboard:
1. Create user with your email + password
2. The `handle_new_user` trigger auto-creates a profile
3. In SQL Editor, update the profile role to 'owner':
```sql
UPDATE profiles SET role = 'owner' WHERE email = 'your@email.com';
```

- [ ] **Step 7: Final production verification**

Visit `legalshieldconsultation.com`:
- Client site loads with SSL
- Form submission works
- Visit `/portal` → login works
- All portal features functional

- [ ] **Step 8: Commit final config**

```bash
git add js/supabase-config.js
git commit -m "chore: configure production Supabase + Turnstile keys"
git push origin master
```
