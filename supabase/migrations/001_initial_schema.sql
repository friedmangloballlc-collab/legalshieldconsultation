-- ============================================
-- LEGALSHIELD CONSULTATION PLATFORM SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- ── TRIGGER FUNCTION ──
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

-- ── LEAD LOGS ──
CREATE TABLE lead_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id bigint NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

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

-- ── TOUCH PROFILE ON USER ACTIONS ──
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

-- ── HELPER FUNCTIONS ──
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND status != 'deactivated';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_team_ids()
RETURNS SETOF uuid AS $$
  SELECT id FROM profiles WHERE parent_id = auth.uid() AND status != 'deactivated';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_active_user()
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status != 'deactivated');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── RLS: PROFILES ──
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON profiles FOR SELECT USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR id = auth.uid()
    OR (get_my_role() = 'manager' AND parent_id = auth.uid())
  )
);

CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR (get_my_role() = 'manager' AND parent_id = auth.uid() AND role = 'caller')
  )
);

CREATE POLICY profiles_update ON profiles FOR UPDATE USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR (get_my_role() = 'manager' AND parent_id = auth.uid())
    OR id = auth.uid()
  )
);

-- ── RLS: LEADS ──
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY leads_select ON leads FOR SELECT USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR assigned_to = auth.uid()
    OR (get_my_role() = 'manager' AND assigned_to IN (SELECT get_my_team_ids()))
  )
);

CREATE POLICY leads_insert ON leads FOR INSERT WITH CHECK (
  is_active_user() AND source = 'manual'
);

CREATE POLICY leads_update ON leads FOR UPDATE USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR assigned_to = auth.uid()
    OR (get_my_role() = 'manager' AND assigned_to IN (SELECT get_my_team_ids()))
  )
);

CREATE POLICY leads_delete ON leads FOR DELETE USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR (get_my_role() = 'manager' AND (
      assigned_to = auth.uid()
      OR assigned_to IN (SELECT get_my_team_ids())
    ))
  )
);

-- ── RLS: LEAD_LOGS ──
ALTER TABLE lead_logs ENABLE ROW LEVEL SECURITY;

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

-- ── RLS: COMMISSIONS ──
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY commissions_select ON commissions FOR SELECT USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR logged_by = auth.uid()
    OR (get_my_role() = 'manager' AND logged_by IN (SELECT get_my_team_ids()))
  )
);

CREATE POLICY commissions_insert ON commissions FOR INSERT WITH CHECK (
  is_active_user() AND logged_by = auth.uid()
);

CREATE POLICY commissions_update ON commissions FOR UPDATE USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR logged_by = auth.uid()
    OR (get_my_role() = 'manager' AND logged_by IN (SELECT get_my_team_ids()))
  )
);

CREATE POLICY commissions_delete ON commissions FOR DELETE USING (
  is_active_user() AND (
    get_my_role() = 'owner'
    OR (get_my_role() = 'manager' AND (
      logged_by = auth.uid()
      OR logged_by IN (SELECT get_my_team_ids())
    ))
  )
);

-- ── AUTO-CREATE PROFILE ON SIGNUP ──
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

-- ── ENABLE REALTIME ──
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
