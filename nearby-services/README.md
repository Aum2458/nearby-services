# NearMe — Nearby Services Finder

> **Free · Open · No API Keys · Powered by OpenStreetMap**

Find hospitals, restaurants, petrol pumps, pharmacies, shops, ATMs, hotels, and schools near your current location — **completely free**, no paid APIs, no API keys.

---

## Architecture Overview

```
Browser GPS  →  Flask Backend  →  Overpass API (OpenStreetMap)
                    ↓
              In-memory Cache (5 min)
                    ↓
            Leaflet.js Map + Results Panel
```

| Component       | Technology              | Cost |
|-----------------|-------------------------|------|
| Backend         | Python Flask            | Free |
| Map Tiles       | OpenStreetMap           | Free |
| POI Data        | Overpass API            | Free |
| Map Library     | Leaflet.js              | Free |
| Geocoding       | Nominatim (optional)    | Free |
| Hosting         | Vercel / Render         | Free tier |

---

## Features

- 📍 Real-time GPS location via browser Geolocation API
- 🗺️ Interactive dark-mode map with Leaflet.js + OSM tiles
- ⛽ 9 categories: Hospitals, Restaurants, Petrol, Pharmacies, Shops, ATMs, Schools, Hotels
- 📏 Adjustable search radius (500m → 10km)
- 🔄 3 Overpass API mirror endpoints with automatic failover
- ⚡ 5-minute server-side in-memory caching (no repeat queries)
- 📱 Fully responsive — works on mobile
- 🧭 One-click Google Maps directions from any result

---

## Quick Start (Local)

```bash
# 1. Clone / extract the project
cd nearby-services

# 2. Create a virtual environment
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the development server
python app.py

# 5. Open browser
open http://localhost:5000
```

No `.env` file needed. No API keys. Just run and go.

---

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (from project root)
vercel deploy

# Follow prompts — select Python framework
```

The `vercel.json` in this project handles routing automatically.

---

## Deploy to Render (Free Tier)

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your repo
4. Build command: `pip install -r requirements.txt`
5. Start command: `gunicorn app:app`
6. Done — free HTTPS URL in minutes

---

## Deploy to Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

railway login
railway init
railway up
```

---

## Project Structure

```
nearby-services/
├── app.py                  ← Flask backend + Overpass API logic
├── requirements.txt        ← Python dependencies
├── vercel.json             ← Vercel deployment config
├── Procfile                ← For Render / Heroku
├── templates/
│   └── index.html          ← Main HTML template (Jinja2)
└── static/
    ├── css/
    │   └── style.css       ← Dark-mode UI styles
    └── js/
        └── app.js          ← Frontend map + search logic
```

---

## API Endpoints

### `GET /api/nearby`

Query nearby places.

**Parameters:**

| Param     | Type   | Required | Description                                |
|-----------|--------|----------|--------------------------------------------|
| lat       | float  | ✅       | Latitude                                   |
| lon       | float  | ✅       | Longitude                                  |
| radius    | int    | ✅       | Radius in meters (max 10000)               |
| category  | string | ✅       | `all`, `hospital`, `restaurant`, `fuel`, `pharmacy`, `shop`, `atm`, `school`, `hotel` |

**Response:**
```json
{
  "success": true,
  "count": 12,
  "places": [
    {
      "id": 123456,
      "lat": 21.17,
      "lon": 72.83,
      "name": "Apollo Hospital",
      "category": { "key": "hospital", "name": "Hospitals & Clinics", "icon": "🏥", "color": "#ef4444" },
      "distance": 340,
      "address": "Ring Road, Surat",
      "phone": "+91 261 000 0000",
      "opening_hours": "24/7"
    }
  ]
}
```

### `GET /api/categories`

Returns all available categories.

### `GET /health`

Health check — returns server status and cache entry count.

---

## Adding New Categories

Edit `app.py` → `CATEGORIES` dict:

```python
"park": {
    "name": "Parks & Gardens",
    "icon": "🌳",
    "color": "#16a34a",
    "tags": [
        ("leisure", "park"),
        ("leisure", "garden"),
    ]
}
```

Then add a chip button in `templates/index.html`:

```html
<button class="chip" data-category="park" style="--chip-color:#16a34a">
  <span class="chip-icon">🌳</span>
  <span class="chip-label">Parks</span>
</button>
```

---

## Performance Optimizations

| Optimization          | Implementation                                      |
|-----------------------|-----------------------------------------------------|
| Server-side caching   | 5-min in-memory cache keyed by lat/lon/radius/cat   |
| Endpoint failover     | 3 Overpass mirrors tried in sequence                |
| Distance sorting      | Results sorted by Haversine distance (server-side)  |
| Radius cap            | Max 10km to prevent heavy queries                   |
| Query timeout         | 30-second Overpass timeout                          |
| Map tile lazy load    | Leaflet loads tiles on demand                       |
| XSS protection        | All user-facing strings escaped in frontend         |

---

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

**Required permission:** Location (prompted automatically)

---

## License

MIT — Free for personal and commercial use.
