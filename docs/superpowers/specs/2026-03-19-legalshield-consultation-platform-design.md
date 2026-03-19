# LegalShield Consultation Platform — Design Spec

**Domain:** legalshieldconsultation.com
**Date:** 2026-03-19
**Stack:** Static HTML/CSS/JS + Supabase + Vercel

---

## 1. Overview

Two-part platform for a LegalShield affiliate:

1. **Client Site** (`/`) — Professional public-facing site matching legalshield.com's design. Captures consultation leads.
2. **Affiliate Portal** (`/portal`) — Password-protected MLM team management platform. Manages leads, callers, commissions, and a 3-level team hierarchy.

---

## 2. Client Site (`/`)

### Purpose
Position the affiliate as a direct LegalShield representative. Visitors see a polished, authoritative legal services site and request a free consultation.

### Design
Match legalshield.com's current layout and visual style:

- **Color scheme:** Navy (#0a0520), purple (#3d1fa8), gold (#e8b800), white backgrounds
- **Typography:** Lora (serif headings), Inter (body text)
- **Responsive:** Desktop, tablet, mobile breakpoints

### Page Sections (in order)

1. **Top bar** — Phone number placeholder + CTA
2. **Sticky header** — Shield logo + "LegalShield Consultation" branding, nav (How It Works, Common Problems dropdown, Resources dropdown, Plans), Sign In link, "Get Protected" CTA button
3. **Hero** — "Real Lawyers, Real Savings, Real Peace of Mind" headline, subtext, "Shop Plans" + "Learn More" buttons, 3-stat bar (4.5M+ helped, 22 yrs experience, ~$1/day), emoji grid
4. **Stats bar** — 5 key metrics (4.5 million helped, $26M savings/yr, 22 yrs avg experience, since 1972, ~$1/day)
5. **Press bar** — "As seen in" logos: CNBC, Fortune, Business Insider, U.S. News, Newsweek, Kiplinger, MarketWatch, CBS News
6. **How We Help** — 5-card grid: Family Law, Estate Planning, Real Estate, Traffic & Accidents, Consumer Finance
7. **How It Works** — 3-step process: Tell us your issue → Connect with law firm → Get legal help (updated from 4 to 3 steps to match current legalshield.com)
8. **Plans & Pricing** — Toggle between Personal and Small Business. Updated pricing: Personal from $35.95/mo. Cards with features, "Get Started" buttons open consultation modal
9. **Coverage grid** — 12 coverage area cards (Estate Planning, Real Estate, Family Law, Traffic, Employee Rights, Consumer Finance, Small Business, Identity Theft, Contracts, Civil Litigation, Landlords, IP)
10. **Testimonials** — 3 member story cards with star ratings
11. **FAQ** — 6 expandable questions
12. **CTA band** — "Get Legal Protection Today" + buttons
13. **Footer** — 4-column grid (brand, plans, legal help, support), disclaimer, copyright, privacy/terms links

### Consultation Modal
- Fields: First Name, Last Name, Phone* (required), Email, ZIP, Plan Interest (dropdown), Best Call Time (dropdown)
- **Spam protection:** Cloudflare Turnstile (free) CAPTCHA on form submit
- **Input validation:** Phone format (digits only, 10+ chars), email format (regex), ZIP (5 digits), required fields enforced client-side and server-side
- On submit: call Supabase Edge Function (not direct insert) which validates inputs, verifies Turnstile token, and inserts into `leads` table with forced `status='New'`, `source='website'`, `assigned_to=NULL`
- Show success message on completion
- No localStorage — all data goes to Supabase

### Mobile
- Sticky bottom CTA bar on mobile
- Nav collapses on <600px
- Responsive grid adjustments throughout

---

## 3. Affiliate Portal (`/portal`)

### Authentication
- Supabase Auth with email/password
- Login screen shown by default
- Session persisted via Supabase client
- Three roles: **Owner** (you), **Manager** (your direct recruits who have their own team), **Caller** (leaf-level team members)

### Role Hierarchy (3 Levels)

```
Level 1: Owner (you)
  └── Level 2: Managers (your direct recruits)
        └── Level 3: Callers (their recruits)
```

- Owner sees everything: all leads, all team members, all commissions, all activity
- Manager sees: their assigned leads, their callers' leads, their team's commissions
- Caller sees: their assigned leads, their own commissions

### Portal Sections (nav tabs)

#### 3.1 Dashboard (landing page after login)
- Stats row: New Leads, Total Leads, Enrolled, Follow-Up Due, Team Size
- Recent activity feed (last 10 actions across team)
- Quick action buttons: Add Lead, Invite Team Member
- My performance summary (enrollments this month, commission earned)

#### 3.2 Warm Leads
Carried over from existing portal with enhancements:

- **Lead table** with columns: Score, Name, Phone, Email/ZIP, Interest, Call Time, Added, Reminder, Status, Assigned To, Actions
- **Lead scoring algorithm:**
  - Interest score: SB Pro=10, SB Plus=8, Personal+Home Biz=7, SB Essentials=6, Personal+Trial=5, Personal/Family=4, Not sure=2
  - Recency: <2hrs=+8, <12hrs=+5, <24hrs=+3, <72hrs=+1
  - Status: New=+3, Follow-Up=+2, Called=+1, Enrolled=0, Not Interested=-5
  - Has call time=+1, Has ZIP=+1
  - Range: 0-20
- **Filters** — All, New, Called, Follow-Up, Enrolled, Not Interested
- **Search** — by name, phone, email
- **Status badges** — New (blue), Called (yellow), Follow-Up (orange), Enrolled (green), Not Interested (red)
- **Reminder system** — overdue (red), today (yellow), future (green)
- **Lead assignment** — Owner/Manager can assign leads to team members via dropdown
- **Actions by role:**
  - All roles: Call (tel: link), Update (modal with status change, reminder date, call log)
  - Owner and Manager: Delete button visible and functional
  - Caller: No delete button shown
- **Export CSV** — downloads filtered leads respecting role visibility (Caller exports only their leads, Manager exports their team's leads, Owner exports all)
- **Add Lead** — manual entry modal (first_name, last_name, phone, email, zip, interest, call_time, status, reminder, notes)
- **Update modal** — change status, set reminder, add call log entry, view log history
- All data from Supabase, real-time subscriptions for live updates

#### 3.3 Commission Tracker
Carried over from existing portal:

- **Stats cards** — Total Earnings Est., This Month, Total Enrolled, Avg. Plan Value
- **Commission rate guide table** — plans, monthly fees, estimated commissions (updated pricing)
- **Enrollment log** — date, member name, plan, monthly fee, est. commission, linked lead (if applicable), notes, delete
- **Log Enrollment modal** — member name, plan (dropdown with auto-calculated commission), date, notes, optional lead link (dropdown of Enrolled leads)
- **Override visibility** — Owner sees team commissions + override earnings. Manager sees their callers' commissions.
- **Update/delete by role:** Owner can update/delete any commission. Manager can update/delete their own and their callers'. Caller can update their own only.
- Updated pricing to match legalshield.com ($35.95/mo personal plan)

#### 3.4 Team Management (new section)
- **Team tree view** — visual hierarchy showing Owner -> Managers -> Callers
- **Invite member** — modal with: Name, Email, Role (Manager or Caller), sends Supabase auth invite email
- **Member cards** — name, role, status (active/invited/deactivated), leads assigned, enrollments, last active (derived from `updated_at` on profiles)
- **Performance table** — sortable by: enrollments this month, total enrollments, lead conversion rate, calls logged
- **Deactivate/remove member** — soft delete (sets `profiles.status='deactivated'`):
  - Deactivated member cannot log in (checked on auth via RLS)
  - Leads assigned to deactivated member become unassigned (`assigned_to=NULL`) so Owner/Manager can reassign
  - Commissions logged by deactivated member remain visible (historical record preserved)
  - Deactivated profiles still appear in team tree with "deactivated" badge

#### 3.5 Plans & Pricing (reference)
Carried over as-is from existing portal. Toggle Personal/Business, plan cards with features. Updated pricing.

#### 3.6 Call Script (reference)
Carried over as-is. 6 expandable steps with talking points and tips.

#### 3.7 FAQs & Objections (reference)
Carried over as-is. Expandable FAQ/objection cards.

#### 3.8 Quick Reference (reference)
Carried over as-is. Key numbers, prices at a glance, always included features, best plan match, top value statements.

---

## 4. Database Schema (Supabase PostgreSQL)

### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | References auth.users.id |
| email | text | |
| full_name | text | |
| role | text | 'owner', 'manager', 'caller' |
| parent_id | uuid FK -> profiles.id | Who recruited them (null for owner) |
| status | text | 'active', 'invited', 'deactivated' |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now(), auto-updated via trigger |

### `leads`
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto-increment |
| first_name | text | required |
| last_name | text | |
| phone | text | required, validated (10+ digits) |
| email | text | validated email format |
| zip | text | 5 digits |
| interest | text | plan interest from form |
| call_time | text | preferred call time |
| status | text | 'New', 'Called', 'Follow-Up', 'Enrolled', 'Not Interested' |
| reminder | date | follow-up reminder date |
| assigned_to | uuid FK -> profiles.id | which team member owns this lead |
| source | text | 'website' or 'manual' |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now(), auto-updated via trigger |

### `lead_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto-increment |
| lead_id | bigint FK -> leads.id | ON DELETE CASCADE |
| author_id | uuid FK -> profiles.id | who logged this |
| note | text | call notes |
| created_at | timestamptz | DEFAULT now() |

### `commissions`
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto-increment |
| member_name | text | enrolled member's name |
| plan | text | plan name |
| monthly_fee | numeric | |
| est_commission | numeric | |
| notes | text | |
| lead_id | bigint FK -> leads.id | optional, links to originating lead |
| logged_by | uuid FK -> profiles.id | which team member enrolled them |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now(), auto-updated via trigger |

### Foreign Key Cascade Behavior
- `lead_logs.lead_id` -> `leads.id`: **ON DELETE CASCADE** (delete lead = delete its logs)
- `commissions.lead_id` -> `leads.id`: **ON DELETE SET NULL** (delete lead preserves commission record)
- `leads.assigned_to` -> `profiles.id`: **ON DELETE SET NULL** (delete profile unassigns leads)
- `commissions.logged_by` -> `profiles.id`: **ON DELETE SET NULL** (delete profile preserves commission)
- `profiles.parent_id` -> `profiles.id`: **ON DELETE SET NULL** (delete parent orphans children to top level)

### Database Triggers
- **`updated_at` trigger** on `leads`, `profiles`, `commissions`: auto-set `updated_at = now()` on any UPDATE
- **`profiles.updated_at` touch trigger**: when a user performs any action (insert lead_log, update lead, insert commission), touch their `profiles.updated_at` to track "last active"

### Row Level Security (RLS)

**leads:**
- **insert:** Via Edge Function only (anon users cannot insert directly). Authenticated users can insert with `source='manual'`.
- **select:** Owner sees all. Manager sees leads where `assigned_to` is self OR any profile where `parent_id` = self. Caller sees leads where `assigned_to` = self.
- **update:** Same as select scope.
- **delete:** Owner can delete any. Manager can delete leads in their select scope. Caller cannot delete.

**lead_logs:**
- **select/insert:** Same visibility as parent lead (join on lead_id -> leads with same RLS logic).
- **delete:** Not allowed (logs are immutable history).

**commissions:**
- **select:** Owner sees all. Manager sees where `logged_by` = self OR `logged_by` in profiles where `parent_id` = self. Caller sees where `logged_by` = self.
- **insert:** Authenticated users can insert with `logged_by` = their own id.
- **update:** Owner can update any. Manager can update where `logged_by` = self or their callers'. Caller can update where `logged_by` = self.
- **delete:** Owner can delete any. Manager can delete their scope. Caller cannot delete.

**profiles:**
- **select:** Owner sees all. Manager sees self + profiles where `parent_id` = self. Caller sees only self.
- **insert:** Owner can insert any. Manager can insert profiles with `parent_id` = self and `role` = 'caller'.
- **update:** Owner can update any. Manager can update profiles where `parent_id` = self. Caller can update only self (limited to full_name, email).
- **Auth check:** On login, if `profiles.status = 'deactivated'`, deny access (enforced via RLS on all tables: `status != 'deactivated'` check on the user's own profile).

---

## 5. Supabase Edge Function: `submit-lead`

Handles website form submissions securely:

1. Receive POST with: first_name, last_name, phone, email, zip, interest, call_time, turnstile_token
2. Verify Cloudflare Turnstile token (server-side HTTP call to Turnstile verify endpoint)
3. Validate inputs: phone (10+ digits after stripping non-digits), email format (if provided), zip (5 digits if provided), first_name required
4. Insert into `leads` table with forced values: `status='New'`, `source='website'`, `assigned_to=NULL`
5. Return success/error JSON

This prevents:
- Spam (Turnstile verification)
- Data corruption (server forces status/source/assigned_to values)
- Invalid data (server-side validation)

---

## 6. Real-Time Features

Supabase Realtime subscriptions:

- **`leads` table** must be added to the Supabase Realtime publication with RLS enabled on the publication
- **Portal leads view** — subscribe to inserts and updates on `leads` table. New website leads appear instantly. Status changes by team members are reflected in real-time.
- **Realtime filters** — each portal user subscribes with a filter matching their RLS scope to minimize unnecessary traffic

---

## 7. Project Structure

```
legalshieldconsultation/
├── index.html                 # Client site
├── portal/
│   └── index.html             # Affiliate portal (auth + dashboard)
├── js/
│   ├── supabase-config.js     # Supabase URL + anon key
│   ├── client-form.js         # Form submission + Turnstile logic
│   ├── portal-auth.js         # Login/logout/session management
│   ├── portal-leads.js        # Lead CRUD, scoring, filtering, realtime
│   ├── portal-team.js         # Team management, invites, hierarchy
│   └── portal-commissions.js  # Commission CRUD, stats, overrides
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql  # Tables, triggers, RLS policies
│   └── functions/
│       └── submit-lead/
│           └── index.ts       # Edge Function for website form
├── vercel.json                # Routing config
└── package.json               # Project metadata
```

---

## 8. Hosting & Deployment

- **Vercel** (free tier): static file hosting, custom domain `legalshieldconsultation.com`
- **Supabase** (free tier): PostgreSQL, Auth, Realtime, Edge Functions, 500MB database, 50K monthly active users
- **Domain:** Point DNS to Vercel, configure custom domain in Vercel dashboard
- **SSL:** Auto-provisioned by Vercel

### vercel.json routing (order matters — specific routes first)
1. `/portal` and `/portal/` -> `/portal/index.html`
2. `/js/*` -> static JS files (passthrough)
3. `/api/submit-lead` -> proxy to Supabase Edge Function (optional, or call Edge Function URL directly from client)
4. Everything else -> `/index.html`

---

## 9. Security

- Supabase anon key is safe to expose in client-side code (RLS enforces access control)
- Portal requires authentication — no unauthenticated access to lead data
- **Website form submits through Edge Function** (not direct anon insert) — prevents data corruption and abuse
- **Cloudflare Turnstile** on consultation form prevents bot spam
- **Input validation** on both client-side and Edge Function
- No sensitive keys in client code — all security via RLS policies + Edge Function
- Phone numbers and emails protected behind auth
- Deactivated users blocked at RLS level

---

## 10. Out of Scope (Phase 1)

- Unlimited MLM depth (capped at 3 levels)
- Auto-distribution / round-robin lead assignment
- Email/SMS notifications for new leads
- Leaderboards and gamification
- Training/onboarding content management
- Payment processing for commissions
- Mobile app
