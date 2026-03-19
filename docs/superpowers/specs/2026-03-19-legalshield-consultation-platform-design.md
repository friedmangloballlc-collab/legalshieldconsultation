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
- On submit: insert row into Supabase `leads` table, show success message
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
- Manager sees: their assigned leads, their callers, their team's commissions
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
- **Lead scoring** — same algorithm (interest + recency + status + completeness)
- **Filters** — All, New, Called, Follow-Up, Enrolled, Not Interested
- **Search** — by name, phone, email
- **Status badges** — New (blue), Called (yellow), Follow-Up (orange), Enrolled (green), Not Interested (red)
- **Reminder system** — overdue (red), today (yellow), future (green)
- **Lead assignment** — Owner/Manager can assign leads to team members via dropdown
- **Actions** — Call (tel: link), Update (modal with status change, reminder date, call log), Delete
- **Export CSV** — download filtered leads
- **Add Lead** — manual entry modal (same fields as existing)
- **Update modal** — change status, set reminder, add call log entry, view log history
- All data from Supabase, real-time subscriptions for live updates

#### 3.3 Commission Tracker
Carried over from existing portal:

- **Stats cards** — Total Earnings Est., This Month, Total Enrolled, Avg. Plan Value
- **Commission rate guide table** — plans, monthly fees, estimated commissions
- **Enrollment log** — date, member name, plan, monthly fee, est. commission, notes, delete
- **Log Enrollment modal** — member name, plan (dropdown with auto-calculated commission), date, notes
- **Override visibility** — Owner sees team commissions + override earnings. Manager sees their callers' commissions.
- Updated pricing to match legalshield.com ($35.95/mo personal plan)

#### 3.4 Team Management (new section)
- **Team tree view** — visual hierarchy showing Owner → Managers → Callers
- **Invite member** — modal with: Name, Email, Role (Manager or Caller), sends Supabase auth invite email
- **Member cards** — name, role, status (active/invited), leads assigned, enrollments, last active
- **Performance table** — sortable by: enrollments this month, total enrollments, lead conversion rate, calls logged
- **Deactivate/remove member** — soft delete (preserves history)

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
| parent_id | uuid FK → profiles.id | Who recruited them (null for owner) |
| status | text | 'active', 'invited', 'deactivated' |
| created_at | timestamptz | |

### `leads`
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto-increment |
| name | text | required |
| phone | text | required |
| email | text | |
| zip | text | |
| interest | text | plan interest from form |
| call_time | text | preferred call time |
| status | text | 'New', 'Called', 'Follow-Up', 'Enrolled', 'Not Interested' |
| reminder | date | follow-up reminder date |
| assigned_to | uuid FK → profiles.id | which team member owns this lead |
| source | text | 'website' or 'manual' |
| created_at | timestamptz | |

### `lead_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto-increment |
| lead_id | bigint FK → leads.id | |
| author_id | uuid FK → profiles.id | who logged this |
| note | text | call notes |
| created_at | timestamptz | |

### `commissions`
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto-increment |
| member_name | text | enrolled member's name |
| plan | text | plan name |
| monthly_fee | numeric | |
| est_commission | numeric | |
| notes | text | |
| logged_by | uuid FK → profiles.id | which team member enrolled them |
| created_at | timestamptz | |

### Row Level Security (RLS)

- **leads (insert):** Allow anonymous inserts (for website form) — only name, phone, email, zip, interest, call_time, status='New', source='website'
- **leads (select):** Owner sees all. Manager sees leads assigned to self or their callers. Caller sees only their assigned leads.
- **leads (update):** Same as select — can only update leads you can see.
- **leads (delete):** Owner only.
- **lead_logs:** Same visibility as parent lead.
- **commissions (select):** Owner sees all. Manager sees their own + their callers'. Caller sees only their own.
- **commissions (insert/delete):** Authenticated users can insert their own. Owner can delete any.
- **profiles (select):** Owner sees all. Manager sees self + their callers. Caller sees only self.
- **profiles (insert/update):** Owner can manage all. Manager can invite callers under themselves.

---

## 5. Real-Time Features

Supabase Realtime subscriptions:

- **Portal leads table** — subscribe to inserts on `leads` table. When a website visitor submits a form, the lead appears instantly in the portal without refresh.
- **Lead status changes** — team members see updates in real-time when a lead is updated by another team member.

---

## 6. Project Structure

```
legalshieldconsultation/
├── index.html                 # Client site
├── portal/
│   └── index.html             # Affiliate portal (auth + dashboard)
├── js/
│   ├── supabase-config.js     # Supabase URL + anon key
│   ├── client-form.js         # Form submission logic for client site
│   └── portal-app.js          # All portal logic (auth, leads, team, commissions)
├── vercel.json                # Routing config
└── package.json               # Project metadata
```

---

## 7. Hosting & Deployment

- **Vercel** (free tier): static file hosting, custom domain `legalshieldconsultation.com`
- **Supabase** (free tier): PostgreSQL, Auth, Realtime, 500MB database, 50K monthly active users
- **Domain:** Point DNS to Vercel, configure custom domain in Vercel dashboard
- **SSL:** Auto-provisioned by Vercel

### vercel.json
- Route `/portal` to `/portal/index.html`
- Route `/js/*` to static JS files
- Route everything else to `/index.html`

---

## 8. Security

- Supabase anon key is safe to expose in client-side code (RLS enforces access control)
- Portal requires authentication — no unauthenticated access to lead data
- Website form uses anon key with restricted insert-only policy
- No sensitive keys in client code — all security via RLS policies
- Phone numbers and emails protected behind auth

---

## 9. Out of Scope (Phase 1)

- Unlimited MLM depth (capped at 3 levels)
- Auto-distribution / round-robin lead assignment
- Email/SMS notifications for new leads
- Leaderboards and gamification
- Training/onboarding content management
- Payment processing for commissions
- Mobile app
