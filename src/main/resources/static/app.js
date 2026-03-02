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
    'ROUTE': L.layerGroup().addTo(map),
    'THREATS': L.layerGroup().addTo(map)
};

map.pm.addControls({
    position: 'topleft',
    drawMarker: true,
    drawPolygon: true,
    editMode: true,
    drawPolyline: false,
    drawRectangle: false,
    drawCircle: false,
    drawCircleMarker: false,
    drawText: false,
    removalMode: true,
});

var icons = {
    'POLICE': L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png', iconSize: [25, 41], iconAnchor: [12, 41]}),
    'EMS': L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png', iconSize: [25, 41], iconAnchor: [12, 41]}),
    'MILITARY': L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-black.png', iconSize: [25, 41], iconAnchor: [12, 41]}),
    'SAFE_HAVEN': L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png', iconSize: [25, 41], iconAnchor: [12, 41]})
};

// Load threats
fetch('/api/threats')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            pmIgnore: false,
            style: { color: 'red', fillColor: '#f03', fillOpacity: 0.5 },
            onEachFeature: function(feature, layer) {
                if (feature.properties && feature.properties.name) {
                    layer.bindPopup("<b>Threat:</b> " + feature.properties.name);
                }
            }
        }).addTo(layers['THREATS']);
    })
    .catch(err => console.error("Failed to load threats:", err));

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

function saveThreats() {
    // Extract Geoman layers
    let featureGroup = L.featureGroup(map.pm.getGeomanLayers());
    let geojson = featureGroup.toGeoJSON();

    fetch('/api/threats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geojson)
    })
    .then(response => {
        if (!response.ok) throw new Error("Failed to save threats");
        alert("Threats saved successfully!");
    })
    .catch(error => {
        alert("Error saving threats: " + error);
        console.error(error);
    });
}

function uploadMap() {
    const fileInput = document.getElementById('mapFile');
    const uploadBtn = document.getElementById('uploadBtn');
    const statusDiv = document.getElementById('uploadStatus');

    if (fileInput.files.length === 0) {
        statusDiv.innerHTML = "Please select a file first.";
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    uploadBtn.disabled = true;
    uploadBtn.innerText = "Uploading...";
    statusDiv.innerHTML = "Uploading and processing map data. This may take a minute...";

    fetch('/api/upload-map', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => { throw new Error(text) });
        }
        return response.text();
    })
    .then(text => {
        statusDiv.innerHTML = "<span style='color:#2ecc71'>" + text + "</span>";
        uploadBtn.disabled = false;
        uploadBtn.innerText = "Upload Map Data";
        fileInput.value = ""; // Clear the input
    })
    .catch(error => {
        statusDiv.innerHTML = "<span style='color:#e74c3c'>Error: " + error.message + "</span>";
        uploadBtn.disabled = false;
        uploadBtn.innerText = "Upload Map Data";
        console.error("Upload failed:", error);
    });
}

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

        let threatsEl = document.getElementById('valThreats');
        if (data.intersectedThreats && data.intersectedThreats.length > 0) {
            threatsEl.innerText = data.intersectedThreats.join(', ');
            threatsEl.style.color = 'red';
            threatsEl.style.backgroundColor = 'rgba(255,0,0,0.2)';
            threatsEl.style.padding = '2px 5px';
            threatsEl.style.borderRadius = '3px';
        } else {
            threatsEl.innerText = "Clear";
            threatsEl.style.color = '#2ecc71';
            threatsEl.style.backgroundColor = 'transparent';
        }
    })
    .catch(error => {
        alert("Error calculating route: " + error);
        console.error(error);
    });
}
