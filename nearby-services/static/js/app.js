/* ── NearMe Frontend App ─────────────────────────────────────────────────── */

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  userLat: null,
  userLon: null,
  category: 'all',
  radius: 2000,
  places: [],
  loading: false,
};

// ── Map Setup ──────────────────────────────────────────────────────────────
const map = L.map('map', { zoomControl: true }).setView([20.59, 78.96], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://openstreetmap.org/copyright" style="color:#a5b4fc">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
let userMarker = null;
let searchCircle = null;

// ── DOM Refs ───────────────────────────────────────────────────────────────
const locateBtn      = document.getElementById('locateBtn');
const radiusSlider   = document.getElementById('radiusSlider');
const radiusDisplay  = document.getElementById('radiusDisplay');
const statusBar      = document.getElementById('statusBar');
const statusText     = document.getElementById('statusText');
const statusCount    = document.getElementById('statusCount');
const resultsList    = document.getElementById('resultsList');
const resultCount    = document.getElementById('resultCount');
const mapHint        = document.getElementById('mapHint');
const archBtn        = document.getElementById('archBtn');
const modalOverlay   = document.getElementById('modalOverlay');
const modalClose     = document.getElementById('modalClose');

// ── Helpers ────────────────────────────────────────────────────────────────
function setStatus(msg, type = 'idle', count = null) {
  statusBar.className = `status-bar status-${type}`;
  statusText.textContent = msg;
  statusCount.textContent = count !== null ? count : '';
}

function fmtDist(m) {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

function makeIcon(emoji, color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:34px;height:34px;
      background:${color};
      border:2.5px solid rgba(255,255,255,0.9);
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:15px;
      box-shadow:0 3px 12px rgba(0,0,0,0.5);
    ">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

// ── Radius Slider ──────────────────────────────────────────────────────────
radiusSlider.addEventListener('input', () => {
  state.radius = parseInt(radiusSlider.value);
  const km = state.radius >= 1000 ? `${state.radius / 1000} km` : `${state.radius} m`;
  radiusDisplay.textContent = km;
  if (searchCircle) {
    searchCircle.setRadius(state.radius);
    map.fitBounds(searchCircle.getBounds(), { padding: [20, 20] });
  }
});

radiusSlider.addEventListener('change', () => {
  if (state.userLat) searchNearby();
});

// ── Category Chips ─────────────────────────────────────────────────────────
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
    chip.classList.add('chip--active');
    state.category = chip.dataset.category;
    if (state.userLat) searchNearby();
  });
});

// ── Locate Button ──────────────────────────────────────────────────────────
locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus('Geolocation not supported by your browser', 'error');
    return;
  }

  locateBtn.disabled = true;
  locateBtn.innerHTML = `<span class="spinner"></span> <span class="btn-label">Locating…</span>`;
  setStatus('Acquiring GPS position…', 'loading');

  navigator.geolocation.getCurrentPosition(
    pos => {
      state.userLat = pos.coords.latitude;
      state.userLon = pos.coords.longitude;
      locateBtn.disabled = false;
      locateBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg> <span class="btn-label">Relocate</span>`;
      mapHint.classList.add('hidden');
      setUserMarker(state.userLat, state.userLon);
      searchNearby();
    },
    err => {
      locateBtn.disabled = false;
      locateBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg> <span class="btn-label">Locate Me</span>`;
      const msgs = {
        1: 'Location permission denied. Please allow in browser settings.',
        2: 'Location unavailable. Try again.',
        3: 'Location request timed out.',
      };
      setStatus(msgs[err.code] || err.message, 'error');
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
  );
});

// ── Set User Marker ────────────────────────────────────────────────────────
function setUserMarker(lat, lon) {
  if (userMarker) map.removeLayer(userMarker);
  if (searchCircle) map.removeLayer(searchCircle);

  userMarker = L.marker([lat, lon], {
    icon: L.divIcon({
      className: '',
      html: `<div style="
        width:20px;height:20px;
        background:#6366f1;
        border:3px solid white;
        border-radius:50%;
        box-shadow:0 0 0 4px rgba(99,102,241,0.25);
      "></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    }),
    zIndexOffset: 1000,
  }).addTo(map).bindPopup('<strong style="color:#0a0a0f">📍 You are here</strong>');

  searchCircle = L.circle([lat, lon], {
    radius: state.radius,
    fillColor: '#6366f1',
    fillOpacity: 0.07,
    color: '#6366f1',
    weight: 1.5,
    dashArray: '6 8',
  }).addTo(map);

  map.fitBounds(searchCircle.getBounds(), { padding: [20, 20] });
}

// ── Search Nearby ──────────────────────────────────────────────────────────
async function searchNearby() {
  if (!state.userLat || state.loading) return;
  state.loading = true;
  setStatus('Querying OpenStreetMap…', 'loading');

  // Update circle radius
  if (searchCircle) {
    searchCircle.setRadius(state.radius);
    map.fitBounds(searchCircle.getBounds(), { padding: [20, 20] });
  }

  try {
    const params = new URLSearchParams({
      lat: state.userLat,
      lon: state.userLon,
      radius: state.radius,
      category: state.category,
    });

    const res = await fetch(`/api/nearby?${params}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Server error');

    state.places = data.places;
    renderResults(state.places);
    renderMarkers(state.places);

    const unit = state.radius >= 1000 ? `${state.radius / 1000}km` : `${state.radius}m`;
    setStatus(`Found ${data.count} places within ${unit}`, 'success', data.count);

    // Auto-hide success
    setTimeout(() => {
      if (statusBar.classList.contains('status-success'))
        setStatus(`${data.count} places loaded`, 'idle', data.count);
    }, 3000);

  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
  } finally {
    state.loading = false;
  }
}

// ── Render Results List ────────────────────────────────────────────────────
function renderResults(places) {
  resultCount.textContent = places.length;

  if (places.length === 0) {
    resultsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>No places found.</p>
        <small>Try increasing the search radius</small>
      </div>`;
    return;
  }

  resultsList.innerHTML = places.map((p, i) => `
    <div class="result-card" data-index="${i}" style="--card-color:${p.category.color}">
      <div class="card-top">
        <span class="card-icon">${p.category.icon}</span>
        <span class="card-name">${escHtml(p.name)}</span>
        <span class="card-distance">${fmtDist(p.distance)}</span>
      </div>
      <span class="card-cat">${escHtml(p.category.name)}</span>
      ${p.address ? `<div class="card-addr">📍 ${escHtml(p.address)}</div>` : ''}
    </div>
  `).join('');

  resultsList.querySelectorAll('.result-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.index);
      const place = state.places[idx];
      map.setView([place.lat, place.lon], 17);
      // Highlight
      document.querySelectorAll('.result-card').forEach(c => c.classList.remove('highlighted'));
      card.classList.add('highlighted');
    });
  });
}

// ── Render Map Markers ─────────────────────────────────────────────────────
function renderMarkers(places) {
  markerLayer.clearLayers();

  places.forEach((p, i) => {
    const icon = makeIcon(p.category.icon, p.category.color);
    const marker = L.marker([p.lat, p.lon], { icon }).addTo(markerLayer);

    const dist = fmtDist(p.distance);
    const addr = p.address ? `<div class="popup-addr">📍 ${escHtml(p.address)}</div>` : '';
    const phone = p.phone ? `<div class="popup-addr">📞 <a href="tel:${p.phone}" style="color:#a5b4fc">${p.phone}</a></div>` : '';
    const hours = p.opening_hours ? `<div class="popup-addr">🕐 ${escHtml(p.opening_hours)}</div>` : '';

    marker.bindPopup(`
      <div class="popup-inner">
        <div class="popup-name">${p.category.icon} ${escHtml(p.name)}</div>
        <div class="popup-cat">${escHtml(p.category.name)}</div>
        <div class="popup-dist">📏 ${dist} away</div>
        ${addr}${phone}${hours}
        <a class="popup-link" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}" target="_blank">🧭 Directions</a>
      </div>
    `, { maxWidth: 260 });

    marker.on('click', () => {
      // Highlight in list
      const cards = document.querySelectorAll('.result-card');
      cards.forEach(c => c.classList.remove('highlighted'));
      if (cards[i]) {
        cards[i].classList.add('highlighted');
        cards[i].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  });
}

// ── XSS Safety ────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Architecture Modal ─────────────────────────────────────────────────────
archBtn.addEventListener('click', () => modalOverlay.classList.add('open'));
modalClose.addEventListener('click', () => modalOverlay.classList.remove('open'));
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) modalOverlay.classList.remove('open');
});
