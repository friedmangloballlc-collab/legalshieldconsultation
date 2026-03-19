// ── LEAD SCORING ──
function scoreLead(lead) {
  var s = 0;
  var interestScores = {
    'Small Business Pro': 10, 'Small Business Plus': 8,
    'Personal + Home Business': 7, 'Small Business Essentials': 6,
    'Personal + Trial Defense': 5, 'Personal / Family': 4, 'Not sure': 2
  };
  var keys = Object.keys(interestScores);
  for (var i = 0; i < keys.length; i++) {
    if ((lead.interest || '').indexOf(keys[i]) !== -1) { s += interestScores[keys[i]]; break; }
  }
  var hrs = (Date.now() - new Date(lead.created_at).getTime()) / 3600000;
  if (hrs < 2) s += 8; else if (hrs < 12) s += 5; else if (hrs < 24) s += 3; else if (hrs < 72) s += 1;
  var statusScores = { New: 3, 'Follow-Up': 2, Called: 1, Enrolled: 0, 'Not Interested': -5 };
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

// ── STATE ──
var allLeads = [];
var leadFilter = 'all';

// ── INIT ──
async function initLeads() {
  await fetchLeads();
  subscribeLeads();
}

async function fetchLeads() {
  var sb = getSupabase();
  var { data, error } = await sb
    .from('leads')
    .select('*, lead_logs(id, note, author_id, created_at)')
    .order('created_at', { ascending: false });
  if (error) { console.error('Failed to fetch leads:', error); return; }
  allLeads = data || [];
  renderLeads();
  updateLeadStats();
}

function subscribeLeads() {
  var sb = getSupabase();
  sb.channel('leads-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, function() {
      fetchLeads();
    })
    .subscribe();
}

// ── STATS ──
function updateLeadStats() {
  var today = new Date().toISOString().split('T')[0];
  var newCount = allLeads.filter(function(l) { return l.status === 'New'; }).length;
  var el = document.getElementById('sn'); if (el) el.textContent = newCount;
  el = document.getElementById('st'); if (el) el.textContent = allLeads.length;
  el = document.getElementById('se'); if (el) el.textContent = allLeads.filter(function(l) { return l.status === 'Enrolled'; }).length;
  el = document.getElementById('sc2'); if (el) el.textContent = allLeads.filter(function(l) { return l.status === 'Called' || l.status === 'Follow-Up'; }).length;
  el = document.getElementById('sr'); if (el) el.textContent = allLeads.filter(function(l) {
    return l.reminder && l.reminder <= today && l.status !== 'Enrolled' && l.status !== 'Not Interested';
  }).length;
  var nb = document.getElementById('new-badge');
  if (nb) { nb.textContent = newCount; nb.style.display = newCount > 0 ? 'inline' : 'none'; }
}

// ── RENDER ──
function renderLeads() {
  var q = (document.getElementById('search-inp') ? document.getElementById('search-inp').value : '').toLowerCase();
  var filtered = allLeads.filter(function(l) {
    var mf = leadFilter === 'all' || l.status === leadFilter;
    var fullName = (l.first_name + ' ' + l.last_name).toLowerCase();
    var mq = !q || fullName.indexOf(q) !== -1 || l.phone.indexOf(q) !== -1 || (l.email || '').toLowerCase().indexOf(q) !== -1;
    return mf && mq;
  }).map(function(l) {
    return Object.assign({}, l, { _s: scoreLead(l) });
  }).sort(function(a, b) { return b._s - a._s; });

  var tbody = document.getElementById('leads-body');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty"><div class="big">' +
      (leadFilter === 'all' ? '📋' : '🔍') + '</div><p>' +
      (leadFilter === 'all' ? 'No leads yet. Leads from your client website appear here automatically.' : 'No leads with this status.') +
      '</p></div></td></tr>';
    return;
  }

  var scls = { New: 's-new', Called: 's-called', 'Follow-Up': 's-fu', Enrolled: 's-enrolled', 'Not Interested': 's-ni' };
  var sic = { New: '🆕', Called: '📞', 'Follow-Up': '🔁', Enrolled: '✅', 'Not Interested': '❌' };
  var today = new Date().toISOString().split('T')[0];

  tbody.innerHTML = filtered.map(function(lead) {
    var sl = scoreLabel(lead._s);
    var remHtml = '<span style="font-size:.74rem;color:var(--tl)">—</span>';
    if (lead.reminder) {
      var rCls = lead.reminder < today ? 'rem-due' : (lead.reminder === today ? 'rem-today' : 'rem-future');
      var rLbl = lead.reminder < today ? '⚠ Overdue' : (lead.reminder === today ? '📅 Today' : lead.reminder);
      remHtml = '<span class="sb ' + rCls + '">' + rLbl + '</span>';
    }
    var logs = lead.lead_logs || [];
    logs.sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    var latestLog = logs.length ? '<div style="font-size:.72rem;color:var(--tl);margin-top:2px">📝 ' +
      logs[0].note.substring(0, 35) + (logs[0].note.length > 35 ? '…' : '') + '</div>' : '';

    var assignedName = '—';
    if (lead.assigned_to && typeof teamProfiles !== 'undefined') {
      var ap = teamProfiles.find(function(p) { return p.id === lead.assigned_to; });
      if (ap) assignedName = ap.full_name;
    }

    var deleteBtn = canDelete() ? '<button class="ab del" onclick="deleteLead(' + lead.id + ')">✕</button>' : '';

    return '<tr>' +
      '<td><div class="score-bar"><div class="score-dot ' + sl.cls + '"></div><span class="score-lbl" style="color:' + sl.color + '">' + sl.lbl + '</span></div><div style="font-size:.69rem;color:var(--tl);margin-top:2px">' + lead._s + '/20</div></td>' +
      '<td><div class="lname">' + lead.first_name + ' ' + (lead.last_name || '') + '</div>' + latestLog + '</td>' +
      '<td><a href="tel:' + lead.phone.replace(/\D/g, '') + '" class="lphone">' + lead.phone + '</a></td>' +
      '<td><div style="font-size:.79rem">' + (lead.email || '—') + '</div><div style="font-size:.73rem;color:var(--tl)">' + (lead.zip ? '📍 ' + lead.zip : '') + '</div></td>' +
      '<td style="font-size:.79rem;max-width:130px">' + (lead.interest || '—') + '</td>' +
      '<td style="font-size:.78rem">' + (lead.call_time || '—') + '</td>' +
      '<td style="font-size:.75rem;color:var(--tl)">' + new Date(lead.created_at).toLocaleDateString() + '</td>' +
      '<td>' + remHtml + '</td>' +
      '<td style="font-size:.78rem">' + assignedName + '</td>' +
      '<td><span class="sb ' + (scls[lead.status] || 's-new') + '">' + (sic[lead.status] || '') + ' ' + lead.status + '</span></td>' +
      '<td><div class="actbtns">' +
        '<a href="tel:' + lead.phone.replace(/\D/g, '') + '" class="ab call">📞</a>' +
        '<button class="ab" onclick="openUpdateModal(' + lead.id + ')">Update</button>' +
        deleteBtn +
      '</div></td>' +
    '</tr>';
  }).join('');
}

// ── FILTERS ──
function setLeadFilter(f, btn) {
  leadFilter = f;
  document.querySelectorAll('.fb').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderLeads();
}

// ── ADD LEAD ──
function openAddModal() {
  document.getElementById('add-ov').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeAddModal() {
  document.getElementById('add-ov').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveLead() {
  var firstName = document.getElementById('al-fname').value.trim();
  var phone = document.getElementById('al-phone').value.trim();
  if (!firstName || !phone) { alert('First name and phone are required.'); return; }

  var sb = getSupabase();
  var { error } = await sb.from('leads').insert({
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

  if (error) { alert('Failed to add lead: ' + error.message); return; }

  var notes = document.getElementById('al-notes').value.trim();
  if (notes) {
    // We'll add the note after lead is created — fetch latest
    await fetchLeads();
    var newest = allLeads[0];
    if (newest) {
      await sb.from('lead_logs').insert({ lead_id: newest.id, author_id: currentProfile.id, note: notes });
    }
  }

  closeAddModal();
  ['al-fname','al-lname','al-phone','al-email','al-zip','al-notes'].forEach(function(id) { document.getElementById(id).value = ''; });
  ['al-int','al-time'].forEach(function(id) { document.getElementById(id).value = ''; });
  document.getElementById('al-status').value = 'New';
  document.getElementById('al-rem').value = '';
  showNotif('Lead added!', 'ok');
  await fetchLeads();
}

// ── UPDATE MODAL ──
function openUpdateModal(id) {
  var lead = allLeads.find(function(l) { return l.id === id; });
  if (!lead) return;
  document.getElementById('upd-id').value = id;
  document.getElementById('upd-status').value = lead.status;
  document.getElementById('upd-rem').value = lead.reminder || '';
  document.getElementById('upd-note').value = '';
  document.getElementById('upd-title').textContent = 'Update: ' + lead.first_name + ' ' + (lead.last_name || '');

  var logArea = document.getElementById('upd-log-area');
  var logs = (lead.lead_logs || []).slice().sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  if (logs.length) {
    logArea.innerHTML = '<label style="font-size:.76rem;font-weight:600;color:var(--td);display:block;margin-bottom:5px">Call Log History</label><div class="log-list">' +
      logs.map(function(l) { return '<div class="log-item"><div class="log-meta">' + new Date(l.created_at).toLocaleString() + '</div>' + l.note + '</div>'; }).join('') + '</div>';
  } else {
    logArea.innerHTML = '';
  }

  document.getElementById('upd-ov').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeUpdateModal() {
  document.getElementById('upd-ov').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveUpdate() {
  var id = parseInt(document.getElementById('upd-id').value);
  var sb = getSupabase();

  var { error } = await sb.from('leads').update({
    status: document.getElementById('upd-status').value,
    reminder: document.getElementById('upd-rem').value || null,
  }).eq('id', id);

  if (error) { alert('Failed to update: ' + error.message); return; }

  var note = document.getElementById('upd-note').value.trim();
  if (note) {
    await sb.from('lead_logs').insert({
      lead_id: id,
      author_id: currentProfile.id,
      note: note,
    });
  }

  closeUpdateModal();
  showNotif('Lead updated!', 'ok');
  await fetchLeads();
}

// ── DELETE ──
async function deleteLead(id) {
  if (!confirm('Remove this lead?')) return;
  var sb = getSupabase();
  await sb.from('leads').delete().eq('id', id);
  showNotif('Lead removed.', 'ok');
  await fetchLeads();
}

// ── ASSIGN ──
async function assignLead(leadId, profileId) {
  var sb = getSupabase();
  await sb.from('leads').update({ assigned_to: profileId || null }).eq('id', leadId);
  await fetchLeads();
}

// ── EXPORT CSV ──
function exportCSV() {
  if (!allLeads.length) { alert('No leads to export.'); return; }
  var headers = ['First Name','Last Name','Phone','Email','ZIP','Interest','Call Time','Date Added','Status','Score','Reminder','Last Note'];
  var rows = allLeads.map(function(l) {
    var s = scoreLead(l);
    var logs = (l.lead_logs || []).slice().sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    var lastNote = logs.length ? logs[0].note.replace(/,/g, ';') : '';
    return [l.first_name, l.last_name, l.phone, l.email, l.zip, l.interest, l.call_time,
      new Date(l.created_at).toLocaleDateString(), l.status, s, l.reminder || '', lastNote];
  });
  var csv = [headers].concat(rows).map(function(r) { return r.map(function(v) { return '"' + v + '"'; }).join(','); }).join('\n');
  var a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'legalshield_leads_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
}

// ── OVERLAY CLOSE ──
['add-ov', 'upd-ov'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', function(e) {
      if (e.target === this) { this.classList.remove('open'); document.body.style.overflow = ''; }
    });
  }
});
