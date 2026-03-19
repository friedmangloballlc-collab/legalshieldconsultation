// ── STATE ──
var allCommissions = [];

// ── INIT ──
async function initCommissions() {
  await fetchCommissions();
}

async function fetchCommissions() {
  var sb = getSupabase();
  var { data, error } = await sb
    .from('commissions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('Failed to fetch commissions:', error); return; }
  allCommissions = data || [];
  renderCommissions();
}

// ── RENDER ──
function renderCommissions() {
  var body = document.getElementById('comm-body');
  if (!body) return;

  if (!allCommissions.length) {
    body.innerHTML = '<tr><td colspan="8"><div class="empty"><div class="big">💵</div><p>No enrollments logged yet.</p></div></td></tr>';
    var te = document.getElementById('total-earn'); if (te) te.textContent = '$0';
    var me = document.getElementById('month-earn'); if (me) me.textContent = '$0';
    var ten = document.getElementById('total-enr'); if (ten) ten.textContent = '0';
    var ap = document.getElementById('avg-plan'); if (ap) ap.textContent = '$0';
    return;
  }

  var total = allCommissions.reduce(function(a, c) { return a + Number(c.est_commission); }, 0);
  var mn = new Date().getMonth(), yr = new Date().getFullYear();
  var monthTotal = allCommissions.filter(function(c) {
    var d = new Date(c.created_at);
    return d.getMonth() === mn && d.getFullYear() === yr;
  }).reduce(function(a, c) { return a + Number(c.est_commission); }, 0);

  var te = document.getElementById('total-earn'); if (te) te.textContent = '$' + total.toLocaleString();
  var me = document.getElementById('month-earn'); if (me) me.textContent = '$' + monthTotal.toLocaleString();
  var ten = document.getElementById('total-enr'); if (ten) ten.textContent = allCommissions.length;
  var ap = document.getElementById('avg-plan'); if (ap) ap.textContent = '$' + (total / allCommissions.length).toFixed(0);
  var ml = document.getElementById('month-lbl');
  if (ml) ml.textContent = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  body.innerHTML = allCommissions.map(function(c) {
    var deleteBtn = (isOwner() || (isManager() && (c.logged_by === currentProfile.id)) || c.logged_by === currentProfile.id)
      ? '<button class="ab del" onclick="deleteCommission(' + c.id + ')">✕</button>' : '';
    return '<tr>' +
      '<td style="font-size:.78rem;color:var(--tl)">' + new Date(c.created_at).toLocaleDateString() + '</td>' +
      '<td class="comm-plan">' + c.member_name + '</td>' +
      '<td style="font-size:.82rem">' + c.plan + '</td>' +
      '<td style="font-size:.82rem">$' + c.monthly_fee + '/mo</td>' +
      '<td class="comm-rate">~$' + c.est_commission + '</td>' +
      '<td style="font-size:.78rem;color:var(--tl)">' + (c.notes || '—') + '</td>' +
      '<td>' + deleteBtn + '</td>' +
    '</tr>';
  }).join('');
}

// ── ADD COMMISSION ──
function openCommModal() {
  document.getElementById('cm-date').value = new Date().toISOString().split('T')[0];

  // Populate lead link dropdown with enrolled leads
  var leadSelect = document.getElementById('cm-lead');
  if (leadSelect) {
    var opts = '<option value="">None</option>';
    allLeads.filter(function(l) { return l.status === 'Enrolled'; }).forEach(function(l) {
      opts += '<option value="' + l.id + '">' + l.first_name + ' ' + (l.last_name || '') + '</option>';
    });
    leadSelect.innerHTML = opts;
  }

  document.getElementById('comm-ov').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCommModal() {
  document.getElementById('comm-ov').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveCommission() {
  var name = document.getElementById('cm-name').value.trim();
  var planRaw = document.getElementById('cm-plan').value;
  if (!name || !planRaw) { alert('Name and plan are required.'); return; }

  var parts = planRaw.split('|');
  var plan = parts[0], monthly = parts[1], comm = parts[2];
  var leadId = document.getElementById('cm-lead') ? document.getElementById('cm-lead').value : '';

  var sb = getSupabase();
  var { error } = await sb.from('commissions').insert({
    member_name: name,
    plan: plan,
    monthly_fee: parseFloat(monthly),
    est_commission: parseFloat(comm),
    notes: document.getElementById('cm-notes').value,
    lead_id: leadId ? parseInt(leadId) : null,
    logged_by: currentProfile.id,
  });

  if (error) { alert('Failed to log enrollment: ' + error.message); return; }
  closeCommModal();
  ['cm-name', 'cm-notes'].forEach(function(id) { document.getElementById(id).value = ''; });
  document.getElementById('cm-plan').value = '';
  showNotif('Enrollment logged!', 'ok');
  await fetchCommissions();
}

// ── DELETE ──
async function deleteCommission(id) {
  if (!confirm('Remove this enrollment?')) return;
  var sb = getSupabase();
  await sb.from('commissions').delete().eq('id', id);
  showNotif('Enrollment removed.', 'ok');
  await fetchCommissions();
}

// ── OVERLAY CLOSE ──
var commOv = document.getElementById('comm-ov');
if (commOv) {
  commOv.addEventListener('click', function(e) {
    if (e.target === this) { this.classList.remove('open'); document.body.style.overflow = ''; }
  });
}
