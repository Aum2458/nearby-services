"""
Nearby Services Finder — Flask Backend
Free solution using Overpass API (OpenStreetMap data)
No paid APIs. No API keys required.
"""

from flask import Flask, render_template, request, jsonify
import requests
import math
import time
from functools import lru_cache
import hashlib
import json

app = Flask(__name__)

# ── Overpass API endpoints (fallback chain) ──────────────────────────────────
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# ── Category → OSM tag mapping ───────────────────────────────────────────────
CATEGORIES = {
    "all": {
        "name": "All Places",
        "icon": "🏢",
        "color": "#6366f1",
        "tags": []  # populated dynamically
    },
    "hospital": {
        "name": "Hospitals & Clinics",
        "icon": "🏥",
        "color": "#ef4444",
        "tags": [
            ("amenity", "hospital"),
            ("amenity", "clinic"),
            ("amenity", "doctors"),
            ("healthcare", "hospital"),
            ("healthcare", "clinic"),
        ]
    },
    "restaurant": {
        "name": "Restaurants & Cafes",
        "icon": "🍽️",
        "color": "#f97316",
        "tags": [
            ("amenity", "restaurant"),
            ("amenity", "fast_food"),
            ("amenity", "cafe"),
            ("amenity", "food_court"),
        ]
    },
    "fuel": {
        "name": "Petrol Pumps",
        "icon": "⛽",
        "color": "#3b82f6",
        "tags": [
            ("amenity", "fuel"),
        ]
    },
    "pharmacy": {
        "name": "Medical Stores",
        "icon": "💊",
        "color": "#22c55e",
        "tags": [
            ("amenity", "pharmacy"),
            ("shop", "chemist"),
            ("healthcare", "pharmacy"),
        ]
    },
    "shop": {
        "name": "Shops & Markets",
        "icon": "🛒",
        "color": "#a855f7",
        "tags": [
            ("shop", "supermarket"),
            ("shop", "convenience"),
            ("shop", "general"),
            ("shop", "grocery"),
            ("shop", "mall"),
        ]
    },
    "atm": {
        "name": "ATMs & Banks",
        "icon": "🏧",
        "color": "#14b8a6",
        "tags": [
            ("amenity", "atm"),
            ("amenity", "bank"),
        ]
    },
    "school": {
        "name": "Schools & Colleges",
        "icon": "🏫",
        "color": "#eab308",
        "tags": [
            ("amenity", "school"),
            ("amenity", "college"),
            ("amenity", "university"),
        ]
    },
    "hotel": {
        "name": "Hotels & Lodging",
        "icon": "🏨",
        "color": "#ec4899",
        "tags": [
            ("tourism", "hotel"),
            ("tourism", "motel"),
            ("tourism", "hostel"),
            ("tourism", "guest_house"),
        ]
    },
}

# Simple in-memory cache
_cache = {}
CACHE_TTL = 300  # 5 minutes


def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance in meters between two coordinates."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def build_overpass_query(lat, lon, radius, tags):
    """Build Overpass QL query string."""
    filters = []
    for key, value in tags:
        filters.append(f'node["{key}"="{value}"](around:{radius},{lat},{lon});')
        filters.append(f'way["{key}"="{value}"](around:{radius},{lat},{lon});')

    return f"""
[out:json][timeout:30];
(
  {''.join(filters)}
);
out center tags;
"""


def identify_category(osm_tags):
    """Match OSM tags to our category system."""
    for cat_key, cat in CATEGORIES.items():
        if cat_key == "all":
            continue
        for key, value in cat["tags"]:
            if osm_tags.get(key) == value:
                return {
                    "key": cat_key,
                    "name": cat["name"],
                    "icon": cat["icon"],
                    "color": cat["color"],
                }
    return {"key": "other", "name": "Other", "icon": "📍", "color": "#94a3b8"}


def format_address(tags):
    """Build human-readable address from OSM address tags."""
    parts = []
    for field in ["addr:housenumber", "addr:street", "addr:suburb", "addr:city", "addr:postcode"]:
        if tags.get(field):
            parts.append(tags[field])
    return ", ".join(parts) if parts else None


def query_overpass(lat, lon, radius, category):
    """Query Overpass API with caching and endpoint failover."""
    # Collect tags
    if category == "all":
        tags = []
        for cat_key, cat in CATEGORIES.items():
            if cat_key != "all":
                tags.extend(cat["tags"])
    else:
        tags = CATEGORIES.get(category, {}).get("tags", [])

    # Cache key
    cache_key = hashlib.md5(
        f"{round(lat,4)},{round(lon,4)},{radius},{category}".encode()
    ).hexdigest()

    cached = _cache.get(cache_key)
    if cached and time.time() - cached["ts"] < CACHE_TTL:
        return cached["data"]

    query = build_overpass_query(lat, lon, radius, tags)
    last_error = None

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            resp = requests.post(
                endpoint,
                data={"data": query},
                timeout=25,
                headers={"User-Agent": "NearbyServicesFinder/1.0"}
            )
            resp.raise_for_status()
            raw = resp.json()

            places = []
            for el in raw.get("elements", []):
                el_tags = el.get("tags", {})

                # Get coordinates
                if el["type"] == "node":
                    elat, elon = el.get("lat"), el.get("lon")
                elif el.get("center"):
                    elat, elon = el["center"]["lat"], el["center"]["lon"]
                else:
                    continue

                if not elat or not elon:
                    continue

                cat_info = identify_category(el_tags)
                name = (el_tags.get("name")
                        or el_tags.get("name:en")
                        or el_tags.get("operator")
                        or cat_info["name"])

                places.append({
                    "id": el["id"],
                    "lat": elat,
                    "lon": elon,
                    "name": name,
                    "category": cat_info,
                    "distance": haversine(lat, lon, elat, elon),
                    "address": format_address(el_tags),
                    "phone": el_tags.get("phone") or el_tags.get("contact:phone"),
                    "website": el_tags.get("website") or el_tags.get("contact:website"),
                    "opening_hours": el_tags.get("opening_hours"),
                })

            places.sort(key=lambda p: p["distance"])

            _cache[cache_key] = {"data": places, "ts": time.time()}
            return places

        except Exception as e:
            last_error = str(e)
            continue

    raise RuntimeError(f"All Overpass endpoints failed. Last error: {last_error}")


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", categories=CATEGORIES)


@app.route("/api/nearby")
def nearby():
    try:
        # Fetch parameters as raw strings/None first to avoid TypeErrors
        raw_lat = request.args.get("lat")
        raw_lon = request.args.get("lon")
        
        # Verify both parameters were actually sent before attempting conversion
        if raw_lat is None or raw_lon is None:
            return jsonify({"error": "Missing coordinates (lat and lon parameters are required)"}), 400

        lat = float(raw_lat)
        lon = float(raw_lon)
        radius = min(int(request.args.get("radius", 1000)), 10000)
        category = request.args.get("category", "all")

        if category not in CATEGORIES:
            return jsonify({"error": "Invalid category"}), 400

        places = query_overpass(lat, lon, radius, category)
        return jsonify({"success": True, "count": len(places), "places": places})

    except ValueError:
        return jsonify({"error": "Invalid coordinate format (must be numeric values)"}), 400
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500


@app.route("/api/categories")
def get_categories():
    result = {k: {"name": v["name"], "icon": v["icon"], "color": v["color"]}
              for k, v in CATEGORIES.items()}
    return jsonify(result)


@app.route("/health")
def health():
    return jsonify({"status": "ok", "cache_entries": len(_cache)})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)