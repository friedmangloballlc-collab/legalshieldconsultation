// ── DASHBOARD ──
function initDashboard() {
  renderDashboardStats();
  renderActivityFeed();
}

function renderDashboardStats() {
  var today = new Date().toISOString().split('T')[0];
  var newLeads = allLeads.filter(function(l) { return l.status === 'New'; }).length;
  var totalLeads = allLeads.length;
  var enrolled = allLeads.filter(function(l) { return l.status === 'Enrolled'; }).length;
  var followUpDue = allLeads.filter(function(l) {
    return l.reminder && l.reminder <= today && l.status !== 'Enrolled' && l.status !== 'Not Interested';
  }).length;
  var teamSize = teamProfiles.filter(function(p) { return p.status === 'active'; }).length;

  var el;
  el = document.getElementById('dash-new'); if (el) el.textContent = newLeads;
  el = document.getElementById('dash-total'); if (el) el.textContent = totalLeads;
  el = document.getElementById('dash-enrolled'); if (el) el.textContent = enrolled;
  el = document.getElementById('dash-followup'); if (el) el.textContent = followUpDue;
  el = document.getElementById('dash-team'); if (el) el.textContent = teamSize;

  // My performance this month
  var now = new Date();
  var myComms = allCommissions.filter(function(c) {
    var d = new Date(c.created_at);
    return c.logged_by === currentProfile.id &&
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  el = document.getElementById('dash-my-enrollments'); if (el) el.textContent = myComms.length;
  el = document.getElementById('dash-my-commission');
  if (el) el.textContent = '$' + myComms.reduce(function(a, c) { return a + Number(c.est_commission); }, 0).toLocaleString();
}

function renderActivityFeed() {
  var feed = document.getElementById('activity-feed');
  if (!feed) return;

  // Combine recent lead_logs and commissions into a unified feed
  var items = [];

  // Lead logs from all leads
  allLeads.forEach(function(lead) {
    (lead.lead_logs || []).forEach(function(log) {
      var authorName = 'Someone';
      if (typeof teamProfiles !== 'undefined' && log.author_id) {
        var author = teamProfiles.find(function(p) { return p.id === log.author_id; });
        if (author) authorName = author.full_name;
      }
      items.push({
        icon: '📝',
        text: authorName + ' logged a note on ' + lead.first_name + ' ' + (lead.last_name || ''),
        time: log.created_at,
      });
    });
  });

  // Commission entries
  allCommissions.forEach(function(c) {
    var loggedName = 'Someone';
    if (typeof teamProfiles !== 'undefined' && c.logged_by) {
      var logger = teamProfiles.find(function(p) { return p.id === c.logged_by; });
      if (logger) loggedName = logger.full_name;
    }
    items.push({
      icon: '💵',
      text: loggedName + ' enrolled ' + c.member_name + ' (' + c.plan + ')',
      time: c.created_at,
    });
  });

  // Sort by time descending, take top 10
  items.sort(function(a, b) { return new Date(b.time) - new Date(a.time); });
  items = items.slice(0, 10);

  if (!items.length) {
    feed.innerHTML = '<div class="empty"><p>No recent activity.</p></div>';
    return;
  }

  feed.innerHTML = items.map(function(item) {
    return '<div class="activity-item">' +
      '<span class="activity-icon">' + item.icon + '</span>' +
      '<span style="flex:1">' + item.text + '</span>' +
      '<span class="activity-time">' + timeAgo(item.time) + '</span>' +
    '</div>';
  }).join('');
}
