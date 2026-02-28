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

var startLatInput = document.getElementById('startLat');
var startLonInput = document.getElementById('startLon');
var endLatInput = document.getElementById('endLat');
var endLonInput = document.getElementById('endLon');

var startMarker = L.marker([parseFloat(startLatInput.value), parseFloat(startLonInput.value)], {
    draggable: true,
    icon: L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png', iconSize: [25, 41], iconAnchor: [12, 41]})
}).addTo(map);

var endMarker = L.marker([parseFloat(endLatInput.value), parseFloat(endLonInput.value)], {
    draggable: true,
    icon: L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png', iconSize: [25, 41], iconAnchor: [12, 41]})
}).addTo(map);

startMarker.on('dragend', function(e) {
    var pos = e.target.getLatLng();
    startLatInput.value = pos.lat.toFixed(4);
    startLonInput.value = pos.lng.toFixed(4);
});

endMarker.on('dragend', function(e) {
    var pos = e.target.getLatLng();
    endLatInput.value = pos.lat.toFixed(4);
    endLonInput.value = pos.lng.toFixed(4);
});

function updateMarkersFromInputs() {
    var startLat = parseFloat(startLatInput.value);
    var startLon = parseFloat(startLonInput.value);
    var endLat = parseFloat(endLatInput.value);
    var endLon = parseFloat(endLonInput.value);
    if (!isNaN(startLat) && !isNaN(startLon)) startMarker.setLatLng([startLat, startLon]);
    if (!isNaN(endLat) && !isNaN(endLon)) endMarker.setLatLng([endLat, endLon]);
}

startLatInput.addEventListener('change', updateMarkersFromInputs);
startLonInput.addEventListener('change', updateMarkersFromInputs);
endLatInput.addEventListener('change', updateMarkersFromInputs);
endLonInput.addEventListener('change', updateMarkersFromInputs);

var mapPopup = L.popup();

map.on('click', function(e) {
    var lat = e.latlng.lat.toFixed(4);
    var lng = e.latlng.lng.toFixed(4);

    var content = document.createElement('div');
    content.innerHTML = `
        <div style="text-align: center; margin-bottom: 5px;"><b>Set Location</b></div>
        <button onclick="window.setPoint('start', ${lat}, ${lng})" style="margin-bottom: 5px; width: 100%;">Set Start</button>
        <button onclick="window.setPoint('end', ${lat}, ${lng})" style="width: 100%;">Set End</button>
    `;

    mapPopup
        .setLatLng(e.latlng)
        .setContent(content)
        .openOn(map);
});

window.setPoint = function(type, lat, lng) {
    if (type === 'start') {
        startLatInput.value = lat;
        startLonInput.value = lng;
        startMarker.setLatLng([lat, lng]);
    } else {
        endLatInput.value = lat;
        endLonInput.value = lng;
        endMarker.setLatLng([lat, lng]);
    }
    map.closePopup();
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
