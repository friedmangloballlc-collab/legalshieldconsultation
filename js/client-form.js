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
  if (window.turnstile) turnstile.reset();
  turnstileToken = '';
}

// Close on overlay click
document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// Client-side validation
function validateForm() {
  var fn = document.getElementById('f-fn').value.trim();
  var ph = document.getElementById('f-ph').value.trim();
  var em = document.getElementById('f-em').value.trim();
  var zip = document.getElementById('f-zip').value.trim();

  if (!fn) return 'First name is required.';
  if (!ph || ph.replace(/\D/g, '').length < 10) return 'Valid phone number is required (10+ digits).';
  if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return 'Please enter a valid email address.';
  if (zip && !/^\d{5}$/.test(zip)) return 'ZIP code must be 5 digits.';
  if (!turnstileToken) return 'Please complete the CAPTCHA verification.';
  return null;
}

async function submitForm() {
  var err = validateForm();
  if (err) { alert(err); return; }

  var btn = document.querySelector('.btn-submit');
  var origText = btn.textContent;
  btn.textContent = 'Submitting...';
  btn.disabled = true;

  try {
    var res = await fetch(EDGE_FUNCTION_URL, {
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

    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submission failed');

    document.getElementById('mform').style.display = 'none';
    document.getElementById('msuccess').style.display = 'block';

    ['f-fn','f-ln','f-ph','f-em','f-zip'].forEach(function(id) { document.getElementById(id).value = ''; });
    ['f-int','f-time'].forEach(function(id) { document.getElementById(id).value = ''; });
  } catch (e) {
    alert(e.message || 'Something went wrong. Please try again.');
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

// FAQ toggle
function tfq(el) {
  var item = el.parentElement;
  item.classList.toggle('open');
  item.querySelector('.fq-a').style.display = item.classList.contains('open') ? 'block' : 'none';
}
document.querySelectorAll('.fq-a').forEach(function(a) { a.style.display = 'none'; });

// Plans toggle
function switchPlans(type, btn) {
  document.querySelectorAll('.ptab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.plans-wrap').forEach(function(p) { p.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById(type + '-plans').classList.add('active');
}
