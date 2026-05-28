// ===== Config =====
const API = 'https://cabgo-gateway-tz77.onrender.com/api'; // Live Render gateway

// ===== State =====
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let hasDiscount = false;

// ===== Helpers =====
const $ = id => document.getElementById(id);
const api = async (method, path, body = null, authRequired = true) => {
  const headers = { 'Content-Type': 'application/json' };
  if (authRequired && token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

const showAlert = (id, msg, type = 'error') => {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
};

const formatDate = dt => new Date(dt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const formatCur  = n  => `€${Number(n).toFixed(2)}`;

// ===== Navigation =====
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links button[data-page]').forEach(b => b.classList.remove('active'));
  const page = $(pageId);
  if (page) page.classList.add('active');
  const btn = document.querySelector(`.nav-links button[data-page="${pageId}"]`);
  if (btn) btn.classList.add('active');
}

function updateNav() {
  const loggedIn = !!token;
  $('nav-auth').style.display    = loggedIn ? 'none'  : 'flex';
  $('nav-app').style.display     = loggedIn ? 'flex'  : 'none';
  if (loggedIn && currentUser) {
    $('nav-username').textContent = `${currentUser.firstName} ${currentUser.surname}`;
  }
}

// ===== Auth =====
$('auth-login-tab').addEventListener('click', () => {
  $('auth-login-tab').classList.add('active');
  $('auth-register-tab').classList.remove('active');
  $('login-form').style.display    = 'block';
  $('register-form').style.display = 'none';
});

$('auth-register-tab').addEventListener('click', () => {
  $('auth-register-tab').classList.add('active');
  $('auth-login-tab').classList.remove('active');
  $('register-form').style.display = 'block';
  $('login-form').style.display    = 'none';
});

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const data = await api('POST', '/auth/login', {
      email:    $('login-email').value,
      password: $('login-password').value
    }, false);
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    updateNav();
    showPage('page-dashboard');
    loadDashboard();
  } catch (err) {
    showAlert('login-alert', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Login';
  }
});

$('register-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('register-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const data = await api('POST', '/auth/register', {
      firstName: $('reg-firstname').value,
      surname:   $('reg-surname').value,
      email:     $('reg-email').value,
      password:  $('reg-password').value
    }, false);
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    updateNav();
    showPage('page-dashboard');
    loadDashboard();
  } catch (err) {
    showAlert('register-alert', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
});

$('logout-btn').addEventListener('click', () => {
  token = null; currentUser = null; hasDiscount = false;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  updateNav();
  showPage('page-auth');
});

// ===== Dashboard =====
async function loadDashboard() {
  if (!token) return;
  try {
    const [bookings, notifs] = await Promise.all([
      api('GET', '/bookings'),
      api('GET', '/notifications')
    ]);

    const upcoming = bookings.filter(b => new Date(b.dateTime) >= new Date() && b.status === 'confirmed');
    const total    = bookings.length;
    const unread   = notifs.filter(n => !n.read).length;

    $('dash-upcoming').textContent = upcoming.length;
    $('dash-total').textContent    = total;
    $('dash-notifs').textContent   = unread;

    // Check for discount notification
    hasDiscount = notifs.some(n => n.type === 'discount');
    $('discount-banner').classList.toggle('show', hasDiscount);

    // Update notification badge
    const badge = $('notif-badge');
    if (badge) badge.textContent = unread || '';
    badge.style.display = unread ? 'inline' : 'none';

    // Recent bookings preview
    const container = $('dash-recent');
    container.innerHTML = '';
    if (bookings.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="icon">🚕</div><p>No bookings yet. Book your first ride!</p></div>';
    } else {
      bookings.slice(0, 3).forEach(b => {
        container.appendChild(buildBookingCard(b));
      });
    }
  } catch (err) {
    console.error('Dashboard error:', err.message);
  }
}

function buildBookingCard(b, showComplete = false) {
  const div = document.createElement('div');
  div.className = `booking-item status-${b.status}`;
  div.innerHTML = `
    <div class="booking-route">📍 ${b.startLocation} → ${b.endLocation}</div>
    <div class="booking-meta">
      <span>🗓️ ${formatDate(b.dateTime)}</span>
      <span>👥 ${b.passengers} passenger(s)</span>
      <span>🚗 ${b.cabType}</span>
      ${b.estimatedFare ? `<span>💶 Est. ${formatCur(b.estimatedFare)}</span>` : ''}
      <span class="status-badge status-${b.status}">${b.status.toUpperCase()}</span>
    </div>
    ${showComplete && b.status === 'confirmed' ? `<button class="btn-complete" data-id="${b._id}" style="margin-top:8px;background:#28a745;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;">✅ Complete Trip</button>` : ''}
  `;
  if (showComplete && b.status === 'confirmed') {
    div.querySelector('.btn-complete').addEventListener('click', async () => {
      try {
        await api('PATCH', `/bookings/${b._id}/complete`);
        loadBookings();
        loadDashboard();
      } catch (err) {
        alert(err.message);
      }
    });
  }
  return div;
}

// ===== New Booking =====
$('btn-new-booking').addEventListener('click', () => showPage('page-new-booking'));

// Fare preview when inputs change
let fareTimer;
['booking-start', 'booking-end', 'booking-cabtype', 'booking-datetime', 'booking-passengers'].forEach(id => {
  $(id)?.addEventListener('input', () => {
    clearTimeout(fareTimer);
    fareTimer = setTimeout(previewFare, 600);
  });
});

async function previewFare() {
  const start = $('booking-start').value;
  const end   = $('booking-end').value;
  const cab   = $('booking-cabtype').value;
  const dt    = $('booking-datetime').value;
  const pax   = $('booking-passengers').value;

  if (!start || !end || !cab || !dt || !pax) return;

  try {
    const data = await api('POST', '/payments/estimate', {
      startLocation: start, endLocation: end, cabType: cab,
      dateTime: dt, passengers: Number(pax), applyDiscount: hasDiscount
    });
    $('fare-preview').classList.add('show');
    $('fare-total-display').textContent = formatCur(data.totalPrice);
    $('fare-breakdown-display').textContent =
      `Base: ${formatCur(data.breakdown.cabFare)} × cab(${data.breakdown.cabMultiplier}) × time(${data.breakdown.daytimeMultiplier}) × passengers(${data.breakdown.passengersMultiplier})${data.breakdown.discountMultiplier < 1 ? ' × discount(0.9)' : ''}`;
  } catch {
    /* silently ignore preview errors */
  }
}

$('new-booking-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('book-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Booking...';

  const bookingData = {
    startLocation: $('booking-start').value,
    endLocation:   $('booking-end').value,
    dateTime:      $('booking-datetime').value,
    passengers:    Number($('booking-passengers').value),
    cabType:       $('booking-cabtype').value
  };

  try {
    const result = await api('POST', '/bookings', bookingData);
    showAlert('booking-alert', 'Booking confirmed! Your cab will be ready in ~3 minutes.', 'success');

    // Auto-process payment
    const payData = {
      bookingId:     result.booking._id,
      startLocation: bookingData.startLocation,
      endLocation:   bookingData.endLocation,
      cabType:       bookingData.cabType,
      dateTime:      bookingData.dateTime,
      passengers:    bookingData.passengers,
      applyDiscount: hasDiscount
    };
    const payResult = await api('POST', '/payments/pay', payData);
    showAlert('booking-alert',
      `Booking confirmed! Payment of ${formatCur(payResult.payment.totalPrice)} processed. Cab ready in ~3 minutes.`,
      'success');

    $('new-booking-form').reset();
    $('fare-preview').classList.remove('show');
    setTimeout(() => { showPage('page-bookings'); loadBookings(); }, 2000);
  } catch (err) {
    showAlert('booking-alert', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm Booking & Pay';
  }
});

// ===== Bookings Page =====
async function loadBookings() {
  const tab = document.querySelector('.tab-btn.active')?.dataset.tab || 'current';

  $('bookings-list').innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Loading...</p></div>';

  try {
    const path = tab === 'current' ? '/bookings/current' : tab === 'past' ? '/bookings/past' : '/bookings';
    const bookings = await api('GET', path);
    const container = $('bookings-list');
    container.innerHTML = '';

    if (bookings.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="icon">🚕</div><p>No ${tab} bookings found.</p></div>`;
      return;
    }

    // Show Complete Trip button only on the current bookings tab
    bookings.forEach(b => container.appendChild(buildBookingCard(b, tab === 'current')));
  } catch (err) {
    $('bookings-list').innerHTML = `<div class="alert alert-error show">${err.message}</div>`;
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadBookings();
  });
});

// ===== Notifications =====
async function loadNotifications() {
  $('notifications-list').innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Loading...</p></div>';
  try {
    const notifs = await api('GET', '/notifications');
    const container = $('notifications-list');
    container.innerHTML = '';

    if (notifs.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="icon">🔔</div><p>No notifications yet.</p></div>';
      return;
    }

    const iconMap = { cab_ready: '🚕', discount: '🎉', general: '📢' };
    notifs.forEach(n => {
      const div = document.createElement('div');
      div.className = `notif-item ${n.read ? '' : 'unread'}`;
      div.innerHTML = `
        <div class="notif-icon">${iconMap[n.type] || '📢'}</div>
        <div class="notif-body">
          <div class="notif-message">${n.message}</div>
          <div class="notif-time">${formatDate(n.createdAt)}</div>
        </div>
        ${!n.read ? `<button class="btn btn-sm btn-outline" onclick="markRead('${n._id}', this)">Mark read</button>` : ''}
      `;
      container.appendChild(div);
    });

    // Update badge
    const unread = notifs.filter(n => !n.read).length;
    const badge = $('notif-badge');
    badge.textContent = unread || '';
    badge.style.display = unread ? 'inline' : 'none';
  } catch (err) {
    $('notifications-list').innerHTML = `<div class="alert alert-error show">${err.message}</div>`;
  }
}

async function markRead(id, btn) {
  try {
    await api('PATCH', `/notifications/${id}/read`);
    btn.closest('.notif-item').classList.remove('unread');
    btn.remove();
    loadNotifications();
  } catch (err) {
    console.error(err);
  }
}

// ===== Locations =====
async function loadLocations() {
  $('locations-list').innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Loading...</p></div>';
  try {
    const locations = await api('GET', '/locations');
    const container = $('locations-list');
    container.innerHTML = '';

    if (locations.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📍</div><p>No favourite locations yet.</p></div>';
      return;
    }

    locations.forEach(loc => {
      const div = document.createElement('div');
      div.className = 'location-card';
      div.innerHTML = `
        <div class="location-info">
          <div class="location-name">📍 ${loc.name}</div>
          <div class="location-address">${loc.address}</div>
        </div>
        <div class="location-actions">
          <button class="btn btn-sm btn-outline" onclick="loadWeather('${loc._id}', this)">🌤️ Weather</button>
          <button class="btn btn-sm btn-outline" onclick="editLocation('${loc._id}', '${loc.name.replace(/'/g, "\\'")}', '${loc.address.replace(/'/g, "\\'")}')">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteLocation('${loc._id}', this)">🗑️</button>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    $('locations-list').innerHTML = `<div class="alert alert-error show">${err.message}</div>`;
  }
}

$('add-location-form').addEventListener('submit', async e => {
  e.preventDefault();
  const editId = $('location-edit-id').value;
  const name    = $('location-name').value;
  const address = $('location-address').value;

  try {
    if (editId) {
      await api('PUT', `/locations/${editId}`, { name, address });
      showAlert('location-alert', 'Location updated!', 'success');
      $('location-edit-id').value = '';
      $('add-location-btn').textContent = 'Add Location';
    } else {
      await api('POST', '/locations', { name, address });
      showAlert('location-alert', 'Location added!', 'success');
    }
    $('add-location-form').reset();
    loadLocations();
  } catch (err) {
    showAlert('location-alert', err.message);
  }
});

function editLocation(id, name, address) {
  $('location-edit-id').value = id;
  $('location-name').value    = name;
  $('location-address').value = address;
  $('add-location-btn').textContent = 'Update Location';
  $('location-name').focus();
}

async function deleteLocation(id, btn) {
  if (!confirm('Remove this location?')) return;
  try {
    await api('DELETE', `/locations/${id}`);
    loadLocations();
  } catch (err) {
    alert(err.message);
  }
}

async function loadWeather(locationId, btn) {
  const card = btn.closest('.location-card');
  let weatherBox = card.querySelector('.weather-box');

  if (weatherBox) { weatherBox.remove(); return; }

  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    const data = await api('GET', `/locations/${locationId}/weather`);
    const w = data.weather;
    weatherBox = document.createElement('div');
    weatherBox.className = 'weather-box';
    weatherBox.innerHTML = `
      <div class="weather-current">
        <img src="https:${w.current.icon}" width="40" alt="">
        <div>
          <div class="weather-temp">${w.current.temp_c}°C</div>
          <div class="weather-condition">${w.current.condition}</div>
          <div style="font-size:0.8rem;opacity:0.8">💧 ${w.current.humidity}% &nbsp; 💨 ${w.current.wind_kph} km/h</div>
        </div>
      </div>
      <div class="weather-forecast">
        ${(w.forecast || []).map(d => `
          <div class="forecast-day">
            <div class="day-date">${new Date(d.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            <img src="https:${d.icon}" width="28" alt="">
            <div class="day-temp">${d.max_temp_c}° / ${d.min_temp_c}°</div>
            <div style="opacity:0.8">🌧️ ${d.chance_of_rain}%</div>
          </div>
        `).join('')}
      </div>
    `;
    card.style.flexDirection = 'column';
    card.appendChild(weatherBox);
  } catch (err) {
    alert('Could not load weather: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🌤️ Weather';
  }
}

// ===== Profile =====
async function loadProfile() {
  try {
    const user = await api('GET', '/auth/profile');
    $('profile-firstname').textContent = user.firstName;
    $('profile-surname').textContent   = user.surname;
    $('profile-email').textContent     = user.email;
    $('profile-created').textContent   = formatDate(user.createdAt);
  } catch (err) {
    console.error(err);
  }
}

// ===== Nav page bindings =====
document.querySelectorAll('.nav-links button[data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    showPage(btn.dataset.page);
    const page = btn.dataset.page;
    if (page === 'page-dashboard')    loadDashboard();
    if (page === 'page-bookings')     loadBookings();
    if (page === 'page-notifications') loadNotifications();
    if (page === 'page-locations')    loadLocations();
    if (page === 'page-profile')      loadProfile();
  });
});

$('btn-new-booking').addEventListener('click', () => showPage('page-new-booking'));
$('btn-go-bookings').addEventListener('click', () => { showPage('page-bookings'); loadBookings(); });

// ===== Init =====
updateNav();
if (token) {
  showPage('page-dashboard');
  loadDashboard();
} else {
  showPage('page-auth');
}
