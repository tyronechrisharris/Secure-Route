var map = L.map('map').setView([51.505, -0.09], 13);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

var layers = {
    'POLICE': L.layerGroup().addTo(map),
    'EMS': L.layerGroup().addTo(map),
    'MILITARY': L.layerGroup().addTo(map),
    'SAFE_HAVEN': L.layerGroup().addTo(map),
    'ROUTE': L.layerGroup().addTo(map)
};

var icons = {
    'POLICE': L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png', iconSize: [25, 41], iconAnchor: [12, 41]}),
    'EMS': L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png', iconSize: [25, 41], iconAnchor: [12, 41]}),
    'MILITARY': L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-black.png', iconSize: [25, 41], iconAnchor: [12, 41]}),
    'SAFE_HAVEN': L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png', iconSize: [25, 41], iconAnchor: [12, 41]})
};

// Load assets
fetch('/api/security-assets')
    .then(response => response.json())
    .then(data => {
        data.forEach(asset => {
            if (layers[asset.type]) {
                L.marker([asset.lat, asset.lon], {icon: icons[asset.type]})
                    .bindPopup(`<b>${asset.name}</b><br>${asset.type}`)
                    .addTo(layers[asset.type]);
            }
        });
    })
    .catch(err => console.error("Failed to load assets:", err));

function toggleLayer(type) {
    if (map.hasLayer(layers[type])) {
        map.removeLayer(layers[type]);
    } else {
        map.addLayer(layers[type]);
    }
}

// Global markers for start and end
let startMarker = L.marker([document.getElementById('startLat').value || 51.5074, document.getElementById('startLon').value || -0.1278], {
    draggable: true,
    icon: L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png', iconSize: [25, 41], iconAnchor: [12, 41]})
}).addTo(map);

let endMarker = L.marker([document.getElementById('endLat').value || 51.5150, document.getElementById('endLon').value || -0.1100], {
    draggable: true,
    icon: L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png', iconSize: [25, 41], iconAnchor: [12, 41]})
}).addTo(map);

// Sync marker dragging to input fields
startMarker.on('dragend', function(e) {
    var latlng = e.target.getLatLng();
    document.getElementById('startLat').value = latlng.lat.toFixed(6);
    document.getElementById('startLon').value = latlng.lng.toFixed(6);
});

endMarker.on('dragend', function(e) {
    var latlng = e.target.getLatLng();
    document.getElementById('endLat').value = latlng.lat.toFixed(6);
    document.getElementById('endLon').value = latlng.lng.toFixed(6);
});

// Map click event to set points
var popup = L.popup();

map.on('click', function(e) {
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);

    const content = `
        <div style="text-align: center;">
            <p style="margin: 0 0 10px 0;"><strong>Set Location</strong></p>
            <button onclick="setPoint('start', ${lat}, ${lng})" style="margin-bottom: 5px; width: 100%; cursor: pointer;">Set Start Point</button><br>
            <button onclick="setPoint('end', ${lat}, ${lng})" style="width: 100%; cursor: pointer;">Set End Point</button>
        </div>
    `;

    popup
        .setLatLng(e.latlng)
        .setContent(content)
        .openOn(map);
});

// Expose setPoint globally so popup buttons can call it
window.setPoint = function(type, lat, lng) {
    if (type === 'start') {
        document.getElementById('startLat').value = lat;
        document.getElementById('startLon').value = lng;
        startMarker.setLatLng([lat, lng]);
    } else if (type === 'end') {
        document.getElementById('endLat').value = lat;
        document.getElementById('endLon').value = lng;
        endMarker.setLatLng([lat, lng]);
    }
    map.closePopup();
};

function calculateRoute() {
    var startLat = parseFloat(document.getElementById('startLat').value);
    var startLon = parseFloat(document.getElementById('startLon').value);
    var endLat = parseFloat(document.getElementById('endLat').value);
    var endLon = parseFloat(document.getElementById('endLon').value);
    var threatLevel = document.getElementById('threatLevel').value;

    var request = {
        startLat: startLat,
        startLon: startLon,
        endLat: endLat,
        endLon: endLon,
        threatLevel: threatLevel,
        vehicleProfile: "security_car"
    };

    fetch('/api/secure-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
    })
    .then(response => {
        if (!response.ok) throw new Error("Route calculation failed");
        return response.json();
    })
    .then(data => {
        layers['ROUTE'].clearLayers();

        // Draw Route
        L.geoJSON(data.geometry, {
            style: { color: '#ff7800', weight: 5, opacity: 0.65 }
        }).addTo(layers['ROUTE']);

        map.fitBounds(L.geoJSON(data.geometry).getBounds(), {padding: [50, 50]});

        // Update Dashboard
        document.getElementById('assessment').style.display = 'block';
        document.getElementById('valDistance').innerText = (data.distance / 1000).toFixed(2) + " km";
        document.getElementById('valTime').innerText = (data.time / 60000).toFixed(0) + " min";
        document.getElementById('valChoke').innerText = data.chokePointsAvoided; // Mocked for now
        document.getElementById('valProximity').innerText = (data.proximityScore / 1000).toFixed(2) + " km";
        document.getElementById('valSafeHaven').innerText = data.etaToNearestSafeHaven;
    })
    .catch(error => {
        alert("Error calculating route: " + error);
        console.error(error);
    });
}
