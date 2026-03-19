// ── STATE ──
var teamProfiles = [];

// ── INIT ──
async function initTeam() {
  await fetchTeam();
}

async function fetchTeam() {
  var sb = getSupabase();
  var { data, error } = await sb
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { console.error('Failed to fetch team:', error); return; }
  teamProfiles = data || [];
  renderTeamTree();
  renderPerformanceTable();
}

// ── TEAM TREE ──
function renderTeamTree() {
  var container = document.getElementById('team-tree');
  if (!container) return;

  if (!teamProfiles.length) {
    container.innerHTML = '<div class="empty"><div class="big">👥</div><p>No team members yet.</p></div>';
    return;
  }

  // Build hierarchy: owner at top, managers under owner, callers under managers
  var owner = teamProfiles.find(function(p) { return p.role === 'owner'; });
  var managers = teamProfiles.filter(function(p) { return p.role === 'manager'; });
  var callers = teamProfiles.filter(function(p) { return p.role === 'caller'; });

  var html = '';

  // Render owner
  if (owner) {
    html += renderTreeNode(owner, 1);
  }

  // Render managers + their callers
  managers.forEach(function(mgr) {
    html += renderTreeNode(mgr, 2);
    callers.filter(function(c) { return c.parent_id === mgr.id; }).forEach(function(caller) {
      html += renderTreeNode(caller, 3);
    });
  });

  // Render orphan callers (under owner directly)
  callers.filter(function(c) {
    return !c.parent_id || (owner && c.parent_id === owner.id) ||
      !managers.find(function(m) { return m.id === c.parent_id; });
  }).forEach(function(caller) {
    html += renderTreeNode(caller, 2);
  });

  container.innerHTML = html;
}

function renderTreeNode(profile, level) {
  var leadsCount = allLeads.filter(function(l) { return l.assigned_to === profile.id; }).length;
  var enrollCount = allCommissions.filter(function(c) { return c.logged_by === profile.id; }).length;
  var roleCls = 'role-' + profile.role;
  var deactivated = profile.status === 'deactivated';
  var deactivatedBadge = deactivated ? ' <span class="deactivated-badge">Deactivated</span>' : '';
  var statusBadge = profile.status === 'invited' ? ' <span class="sb s-called">Invited</span>' : '';

  var actions = '';
  if (!deactivated && profile.id !== currentProfile.id && (isOwner() || (isManager() && profile.parent_id === currentProfile.id))) {
    actions = '<button class="ab del" onclick="deactivateMember(\'' + profile.id + '\')">Deactivate</button>';
  }

  return '<div class="tree-node level-' + level + (deactivated ? ' deactivated' : '') + '">' +
    '<div class="node-info">' +
      '<span class="node-name">' + profile.full_name + deactivatedBadge + statusBadge + '</span>' +
      '<span class="node-role ' + roleCls + '">' + profile.role + '</span>' +
    '</div>' +
    '<div class="node-stats">' +
      '<span>📋 ' + leadsCount + ' leads</span>' +
      '<span>✅ ' + enrollCount + ' enrolled</span>' +
      '<span>🕐 ' + timeAgo(profile.updated_at) + '</span>' +
    '</div>' +
    '<div>' + actions + '</div>' +
  '</div>';
}

// ── PERFORMANCE TABLE ──
function renderPerformanceTable() {
  var body = document.getElementById('perf-body');
  if (!body) return;

  if (!teamProfiles.length) {
    body.innerHTML = '<tr><td colspan="7"><div class="empty"><p>No team members yet.</p></div></td></tr>';
    return;
  }

  body.innerHTML = teamProfiles.map(function(p) {
    var leadsCount = allLeads.filter(function(l) { return l.assigned_to === p.id; }).length;
    var enrollCount = allCommissions.filter(function(c) { return c.logged_by === p.id; }).length;
    var convRate = leadsCount > 0 ? ((enrollCount / leadsCount) * 100).toFixed(0) + '%' : '—';
    var roleCls = 'role-' + p.role;
    var statusHtml = p.status === 'deactivated'
      ? '<span class="deactivated-badge">Deactivated</span>'
      : (p.status === 'invited' ? '<span class="sb s-called">Invited</span>' : '<span class="sb s-enrolled">Active</span>');

    var actions = '';
    if (p.status !== 'deactivated' && p.id !== currentProfile.id && (isOwner() || (isManager() && p.parent_id === currentProfile.id))) {
      actions = '<button class="ab del" onclick="deactivateMember(\'' + p.id + '\')">Deactivate</button>';
    }

    return '<tr>' +
      '<td class="lname">' + p.full_name + '</td>' +
      '<td><span class="node-role ' + roleCls + '">' + p.role + '</span></td>' +
      '<td>' + statusHtml + '</td>' +
      '<td>' + leadsCount + '</td>' +
      '<td>' + enrollCount + '</td>' +
      '<td style="font-size:.78rem;color:var(--tl)">' + timeAgo(p.updated_at) + '</td>' +
      '<td>' + actions + '</td>' +
    '</tr>';
  }).join('');
}

// ── INVITE ──
function openInviteModal() {
  // Restrict role options based on current user role
  var roleSelect = document.getElementById('inv-role');
  if (roleSelect) {
    var opts = '<option value="">Select role</option>';
    if (isOwner()) {
      opts += '<option value="manager">Manager</option>';
    }
    opts += '<option value="caller">Caller</option>';
    roleSelect.innerHTML = opts;
  }
  document.getElementById('inv-ov').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeInviteModal() {
  document.getElementById('inv-ov').classList.remove('open');
  document.body.style.overflow = '';
}

async function inviteMember() {
  var name = document.getElementById('inv-name').value.trim();
  var email = document.getElementById('inv-email').value.trim();
  var role = document.getElementById('inv-role').value;

  if (!name || !email || !role) { alert('All fields are required.'); return; }

  if (isManager() && role !== 'caller') {
    alert('You can only invite callers to your team.');
    return;
  }

  try {
    var sb = getSupabase();
    var { data: { session } } = await sb.auth.getSession();

    var res = await fetch(SUPABASE_URL + '/functions/v1/invite-member', {
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

    var result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Invite failed');

    closeInviteModal();
    ['inv-name', 'inv-email'].forEach(function(id) { document.getElementById(id).value = ''; });
    document.getElementById('inv-role').value = '';
    await fetchTeam();
    showNotif('Team member invited! They will receive an email to set their password.', 'ok');
  } catch (e) {
    alert('Invite failed: ' + e.message);
  }
}

// ── DEACTIVATE ──
async function deactivateMember(profileId) {
  if (!confirm('Deactivate this team member? They will lose portal access.')) return;

  var sb = getSupabase();
  await sb.from('profiles').update({ status: 'deactivated' }).eq('id', profileId);
  await sb.from('leads').update({ assigned_to: null }).eq('assigned_to', profileId);

  await fetchTeam();
  await fetchLeads();
  showNotif('Team member deactivated.', 'ok');
}

// ── OVERLAY CLOSE ──
var invOv = document.getElementById('inv-ov');
if (invOv) {
  invOv.addEventListener('click', function(e) {
    if (e.target === this) { this.classList.remove('open'); document.body.style.overflow = ''; }
  });
}
