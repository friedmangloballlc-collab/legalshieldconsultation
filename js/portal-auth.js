// State
var currentUser = null;
var currentProfile = null;

async function initAuth() {
  var sb = getSupabase();
  var { data: { session } } = await sb.auth.getSession();

  if (session) {
    await loadProfile(session.user);
  } else {
    showLogin();
  }

  sb.auth.onAuthStateChange(async function(event, session) {
    if (event === 'SIGNED_IN' && session) {
      await loadProfile(session.user);
    } else if (event === 'SIGNED_OUT') {
      showLogin();
    }
  });
}

async function loadProfile(user) {
  var sb = getSupabase();
  var { data: profile, error } = await sb
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
  await showPortal();
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
  document.getElementById('user-name').textContent = currentProfile.full_name;
  document.getElementById('user-role').textContent = currentProfile.role.charAt(0).toUpperCase() + currentProfile.role.slice(1);

  await Promise.all([initLeads(), initCommissions(), initTeam()]);
  initDashboard();
}

async function handleLogin(e) {
  e.preventDefault();
  var email = document.getElementById('login-email').value.trim();
  var password = document.getElementById('login-password').value;
  var errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = 'Email and password are required.';
    return;
  }

  var sb = getSupabase();
  var { error } = await sb.auth.signInWithPassword({ email: email, password: password });
  if (error) {
    errorEl.textContent = error.message;
  }
}

async function handleLogout() {
  var sb = getSupabase();
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
}

function showSec(id, btn) {
  document.querySelectorAll('.sec').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('.nt').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
  if (id === 'commission') renderCommissions();
  if (id === 'team') { renderTeamTree(); renderPerformanceTable(); }
  if (id === 'dashboard') initDashboard();
}

function isOwner() { return currentProfile && currentProfile.role === 'owner'; }
function isManager() { return currentProfile && currentProfile.role === 'manager'; }
function isCaller() { return currentProfile && currentProfile.role === 'caller'; }
function canDelete() { return isOwner() || isManager(); }

function showNotif(msg, type) {
  var area = document.getElementById('notif-area');
  var div = document.createElement('div');
  div.className = 'notif' + (type ? ' ' + type : '');
  div.innerHTML = '<span>' + msg + '</span><button class="notif-close" onclick="this.parentElement.remove()">x</button>';
  area.appendChild(div);
  setTimeout(function() { if (div.parentElement) div.remove(); }, 5000);
}

// Script accordion toggle
function toggleScriptStep(hdr) { hdr.parentElement.classList.toggle('open'); }

// FAQ toggle
function toggleFaq(hdr) {
  var item = hdr.parentElement;
  item.classList.toggle('open');
  var answer = item.querySelector('.fqa');
  answer.style.display = item.classList.contains('open') ? 'block' : 'none';
}

// Plans toggle
function showPortalPlans(id, btn) {
  document.querySelectorAll('.psec').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('.pt').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}

// Relative time helper
function timeAgo(dateStr) {
  var now = new Date();
  var d = new Date(dateStr);
  var diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString();
}

document.addEventListener('DOMContentLoaded', initAuth);
// Initialize FAQ display
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.fqa').forEach(function(a) { a.style.display = 'none'; });
});
