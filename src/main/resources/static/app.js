// 1. Initialize the Leaflet map FIRST
// Default to the Manila operational zone (Zoom Level 13)
// Note: Swap to [36.0104, -84.2696] for local Oak Ridge testing
var map = L.map('map').setView([36.0104, -84.2696], 13);

// 2. Add the Vector PMTiles layer using the Protomaps Leaflet renderer
protomapsL.leafletLayer({
    url: '/map.pmtiles',
    theme: 'light' // Automatically applies a clean styling theme to the raw vector data
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

// Global routing state
let routeWaypoints = [];

// Load threats
let threatLayerMap = {};

fetch('/api/threats')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            pmIgnore: false,
            style: { color: 'red', fillColor: '#f03', fillOpacity: 0.5 },
            onEachFeature: function(feature, layer) {
                let id = L.stamp(layer);
                threatLayerMap[id] = layer;
                updateThreatPopup(layer, feature.properties.name, feature.properties.severity);
                layer.on('pm:update', saveThreats);
                layer.on('pm:dragend', saveThreats);
                layer.on('pm:remove', saveThreats);
            }
        }).addTo(layers['THREATS']);
    })
    .catch(err => console.error("Failed to load threats:", err));

map.on('pm:create', function(e) {
    if (e.shape === 'Marker') {
        const marker = e.layer;
        routeWaypoints.push(marker);
        marker.on('dragend', syncWaypointList);
        marker.on('pm:remove', function() {
            routeWaypoints = routeWaypoints.filter(m => m !== marker);
            syncWaypointList();
        });
        syncWaypointList();
    }
    if (e.shape === 'Polygon' || e.shape === 'Rectangle') {
        const layer = e.layer;

        let name = prompt("Enter Threat Area Name:", "New Threat");
        if (name === null) {
            map.removeLayer(layer);
            return;
        }

        let severityInput = prompt("Enter Threat Level (LOW, MEDIUM, HIGH):", "HIGH");
        if (severityInput === null) {
            map.removeLayer(layer);
            return;
        }

        let severity = severityInput.trim().toUpperCase();
        if (!['LOW', 'MEDIUM', 'HIGH'].includes(severity)) {
            severity = 'HIGH'; // Default to HIGH if invalid
        }

        layer.feature = layer.feature || { type: 'Feature', properties: {} };
        layer.feature.properties.name = name;
        layer.feature.properties.severity = severity;

        layer.setStyle({ color: 'red', fillColor: '#f03', fillOpacity: 0.5 });

        let id = L.stamp(layer);
        threatLayerMap[id] = layer;
        updateThreatPopup(layer, name, severity);

        layer.addTo(layers['THREATS']);

        layer.on('pm:update', saveThreats);
        layer.on('pm:dragend', saveThreats);
        layer.on('pm:remove', saveThreats);

        saveThreats(); // Auto-save on creation
    }
});

map.on('pm:remove', function(e) {
    if (threatLayerMap[L.stamp(e.layer)]) {
        layers['THREATS'].removeLayer(e.layer);
        delete threatLayerMap[L.stamp(e.layer)];
        saveThreats();
    }
    if (routeWaypoints.includes(e.layer)) {
        routeWaypoints = routeWaypoints.filter(m => m !== e.layer);
        syncWaypointList();
    }
});

window.updateThreatPopup = function(layer, name, severity) {
    let id = L.stamp(layer);
    let popupContent = `<b>Threat:</b> ${name || "Unnamed"}<br><b>Severity:</b> ${severity || "UNKNOWN"}<br><br>
        <button onclick="editThreatProperties(${id})" style="background: #f39c12; margin-bottom: 5px;">Edit Info</button><br>
        <button onclick="deleteThreat(${id})" style="background: #e74c3c;">Delete Threat</button>`;
    layer.bindPopup(popupContent);
};

window.editThreatProperties = function(id) {
    let layer = threatLayerMap[id];
    if (!layer) return;

    let currentName = layer.feature.properties.name || "New Threat";
    let currentSeverity = layer.feature.properties.severity || "HIGH";

    let name = prompt("Edit Threat Area Name:", currentName);
    if (name === null) return;

    let severityInput = prompt("Edit Threat Level (LOW, MEDIUM, HIGH):", currentSeverity);
    if (severityInput === null) return;

    let severity = severityInput.trim().toUpperCase();
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(severity)) {
        severity = 'HIGH';
    }

    layer.feature.properties.name = name;
    layer.feature.properties.severity = severity;

    updateThreatPopup(layer, name, severity);
    saveThreats();
};

window.deleteThreat = function(id) {
    let layer = threatLayerMap[id];
    if (!layer) return;

    if (confirm("Are you sure you want to delete this threat area?")) {
        map.removeLayer(layer);
        layers['THREATS'].removeLayer(layer);
        delete threatLayerMap[id];
        saveThreats();
    }
};

let assetMarkers = {};

window.createAssetMarker = function(asset) {
    if (!layers[asset.type]) return;

    const marker = L.marker([asset.lat, asset.lon], {icon: icons[asset.type]});
    assetMarkers[asset.id] = marker;

    const popupContent = `
        <b>${asset.name}</b><br>${asset.type}<br><br>
        <button onclick="editAsset(${asset.id})" style="background: #f39c12; margin-bottom: 5px; width: 100%;">Edit</button><br>
        <button onclick="deleteAsset(${asset.id})" style="background: #e74c3c; width: 100%;">Delete</button>
    `;

    marker.bindPopup(popupContent).addTo(layers[asset.type]);
};

window.editAsset = function(id) {
    const marker = assetMarkers[id];
    if (!marker) return;

    let newName = prompt("Enter New Name:");
    if (!newName) return;

    let newType = prompt("Enter New Type (POLICE, EMS, MILITARY, SAFE_HAVEN):");
    if (!newType) return;
    newType = newType.toUpperCase();

    if (!icons[newType]) {
        alert("Invalid Asset Type!");
        return;
    }

    const latlng = marker.getLatLng();
    const asset = {
        id: id,
        name: newName,
        type: newType,
        lat: latlng.lat,
        lon: latlng.lng,
        operational: true
    };

    fetch(`/api/security-assets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asset)
    })
    .then(response => {
        if (response.ok) {
            // Remove old marker and add new one to reflect changes
            map.removeLayer(marker);
            for (let l in layers) {
                if (layers[l].hasLayer(marker)) layers[l].removeLayer(marker);
            }
            createAssetMarker(asset);
        }
    })
    .catch(err => console.error("Failed to update asset:", err));
};

window.deleteAsset = function(id) {
    if (!confirm("Delete this security asset?")) return;

    fetch(`/api/security-assets/${id}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (response.ok) {
            const marker = assetMarkers[id];
            if (marker) {
                map.removeLayer(marker);
                for (let l in layers) {
                    if (layers[l].hasLayer(marker)) layers[l].removeLayer(marker);
                }
                delete assetMarkers[id];
            }
        }
    })
    .catch(err => console.error("Failed to delete asset:", err));
};

// Load assets
fetch('/api/security-assets')
    .then(response => response.json())
    .then(data => {
        data.forEach(asset => {
            createAssetMarker(asset);
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
let startMarker = L.marker([document.getElementById('startLat').value || 14.5995, document.getElementById('startLon').value || 120.9842], {
    draggable: true,
    icon: L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png', iconSize: [25, 41], iconAnchor: [12, 41]})
}).addTo(map);

let endMarker = L.marker([document.getElementById('endLat').value || 14.6095, document.getElementById('endLon').value || 120.9942], {
    draggable: true,
    icon: L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png', iconSize: [25, 41], iconAnchor: [12, 41]})
}).addTo(map);

routeWaypoints.push(startMarker);
routeWaypoints.push(endMarker);

// Sync marker dragging to input fields
startMarker.on('dragend', function(e) {
    var latlng = e.target.getLatLng();
    document.getElementById('startLat').value = latlng.lat.toFixed(6);
    document.getElementById('startLon').value = latlng.lng.toFixed(6);
    syncWaypointList();
});

endMarker.on('dragend', function(e) {
    var latlng = e.target.getLatLng();
    document.getElementById('endLat').value = latlng.lat.toFixed(6);
    document.getElementById('endLon').value = latlng.lng.toFixed(6);
    syncWaypointList();
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
            <button onclick="setPoint('end', ${lat}, ${lng})" style="margin-bottom: 5px; width: 100%; cursor: pointer;">Set End Point</button><br>
            <button onclick="startCreatingAsset(${lat}, ${lng})" style="margin-bottom: 5px; width: 100%; cursor: pointer; background: #3498db;">Add Security Asset</button><br>
            <button onclick="startDrawingThreat()" style="width: 100%; cursor: pointer; background: #e74c3c;">Create Threat Area</button>
        </div>
    `;

    popup
        .setLatLng(e.latlng)
        .setContent(content)
        .openOn(map);
});

// Expose startDrawingThreat globally so popup buttons can call it
window.startDrawingThreat = function() {
    map.closePopup();
    map.pm.enableDraw('Polygon', {
        snappable: true,
        snapDistance: 20,
    });
};

window.startCreatingAsset = function(lat, lng) {
    let name = prompt("Enter Asset Name:", "New Asset");
    if (!name) return;

    let type = prompt("Enter Asset Type (POLICE, EMS, MILITARY, SAFE_HAVEN):", "POLICE");
    if (!type) return;
    type = type.toUpperCase();

    if (!icons[type]) {
        alert("Invalid Asset Type!");
        return;
    }

    const asset = {
        id: 0, // Backend will assign
        name: name,
        type: type,
        lat: parseFloat(lat),
        lon: parseFloat(lng),
        operational: true
    };

    fetch('/api/security-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asset)
    })
    .then(response => response.json())
    .then(savedAsset => {
        createAssetMarker(savedAsset);
        map.closePopup();
    })
    .catch(err => console.error("Failed to save asset:", err));
};

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
    syncWaypointList();
    map.closePopup();
};


function saveThreats() {
    // We only want to save features in the THREATS layer group
    let geojson = layers['THREATS'].toGeoJSON();

    fetch('/api/threats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geojson)
    })
    .then(response => {
        if (!response.ok) throw new Error("Failed to save threats");
        // No alert, to be seamless
        console.log("Threats auto-saved successfully!");
    })
    .catch(error => {
        console.error("Error saving threats: ", error);
    });
}

// View Switching
window.switchView = function(view) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    if (view === 'routing') {
        document.getElementById('routing-view').classList.add('active');
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
    } else {
        document.getElementById('data-view').classList.add('active');
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        loadMapList();
    }
};

// Map Management Logic
const javaApi = '/api';

async function loadMapList() {
    try {
        const response = await fetch(`${javaApi}/maps`);
        const maps = await response.json();
        const select = document.getElementById('cache-select');
        select.innerHTML = '<option value="">Select a cached file...</option>';
        maps.forEach(map => {
            const opt = document.createElement('option');
            opt.value = map;
            opt.innerText = map;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error("Failed to load map list:", err);
    }
}

// Drag & Drop
const dropZone = document.getElementById('drop-zone');
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);
});

dropZone.addEventListener('dragenter', () => dropZone.classList.add('hover'));
dropZone.addEventListener('dragover', () => dropZone.classList.add('hover'));
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
dropZone.addEventListener('drop', (e) => {
    dropZone.classList.remove('hover');
    handleFileUpload(e.dataTransfer.files[0]);
});

window.handleFileUpload = async function(file) {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    updateStatus('Uploading...', 'processing');
    const progressBar = document.getElementById('upload-progress-bar');
    progressBar.style.display = 'block';
    progressBar.style.width = '0%';

    try {
        const response = await fetch(`${javaApi}/upload-map`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            updateStatus('Upload Success', 'success');
            progressBar.style.width = '100%';
            setTimeout(() => progressBar.style.display = 'none', 1000);
            loadMapList();
        } else {
            throw new Error(await response.text());
        }
    } catch (err) {
        updateStatus('Upload Failed: ' + err.message, 'error');
    }
};

window.runTransform = function() {
    const select = document.getElementById('cache-select');
    const file = select.value;
    if (!file) {
        alert("Please select a file to transform.");
        return;
    }

    const consoleEl = document.getElementById('log-console');
    consoleEl.innerHTML = '';
    updateStatus('Transforming...', 'processing');

    const eventSource = new EventSource(`${javaApi}/map/transform?file=${file}`);

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.log) {
            consoleEl.innerText += data.log;
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }
        if (data.status === 'success') {
            updateStatus('Transform Success', 'success');
            eventSource.close();
        } else if (data.status === 'error') {
            updateStatus('Transform Error: ' + data.message, 'error');
            eventSource.close();
        }
    };

    eventSource.onerror = (err) => {
        updateStatus('SSE Error', 'error');
        eventSource.close();
    };
};

window.applyToMap = async function() {
    const select = document.getElementById('cache-select');
    const file = select.value;

    updateStatus('Applying Map...', 'processing');

    try {
        const response = await fetch(`${javaApi}/map/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: file || 'map-data.osm.pbf' })
        });

        if (response.ok) {
            updateStatus('Map Applied & Reloaded', 'success');
            location.reload();
        } else {
            const data = await response.json();
            throw new Error(data.error);
        }
    } catch (err) {
        updateStatus('Apply Failed: ' + err.message, 'error');
    }
};

window.zoomToMap = async function() {
    updateStatus('Fetching Bounds...', 'processing');
    try {
        const response = await fetch('/api/map-bounds');
        if (!response.ok) throw new Error("Bounds not available");
        const bounds = await response.json();

        // Leaflet expects [[minLat, minLon], [maxLat, maxLon]]
        map.fitBounds([
            [bounds.minLat, bounds.minLon],
            [bounds.maxLat, bounds.maxLon]
        ]);
        updateStatus('Zoomed to map extent', 'success');
    } catch (err) {
        updateStatus('Zoom Failed: ' + err.message, 'error');
    }
};

function updateStatus(text, type) {
    const el = document.getElementById('status-indicator');
    el.innerText = text;
    el.className = 'status-' + type;
}

function calculateRoute() {
    var threatLevel = document.getElementById('threatLevel').value;

    let points = routeWaypoints.map(m => [m.getLatLng().lat, m.getLatLng().lng]);

    let threat_polygons = [];
    layers['THREATS'].eachLayer(layer => {
        if (layer instanceof L.Polygon) {
            let name = layer.feature?.properties?.name || "Unnamed Threat";
            let severity = layer.feature?.properties?.severity || "HIGH";
            let latlngs = layer.getLatLngs();
            let rings = Array.isArray(latlngs[0]) && !(latlngs[0][0] instanceof L.LatLng)
                ? latlngs.map(ring => (Array.isArray(ring) ? ring.map(ll => [ll.lat, ll.lng]) : [ring.lat, ring.lng]))
                : [latlngs.map(ll => [ll.lat, ll.lng])];

            threat_polygons.push({ name: name, severity: severity, coordinates: rings });
        }
    });

    var request = {
        route_points: points,
        threat_polygons: threat_polygons,
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

        let routeStyle = { color: '#ff7800', weight: 5, opacity: 0.65 };
        if (data.threat_intersected) {
            routeStyle = { color: 'red', weight: 7, opacity: 0.8 };
            window.alert("DANGER: This route crosses through a designated threat area!");
        }

        // Draw Route
        L.geoJSON(data.geometry, {
            style: routeStyle
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

// Waypoint Reordering UI Logic
window.syncWaypointList = function() {
    const listEl = document.getElementById('waypoint-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    routeWaypoints.forEach((marker, index) => {
        const li = document.createElement('li');
        li.className = 'waypoint-item';
        li.setAttribute('data-id', L.stamp(marker));

        let label = index === 0 ? "Start" : (index === routeWaypoints.length - 1 ? "End" : `Waypoint ${index}`);
        const latlng = marker.getLatLng();

        li.innerHTML = `
            <span class="handle">☰</span>
            <div>
                <strong>${label}</strong><br>
                <small>${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}</small>
            </div>
        `;
        listEl.appendChild(li);
    });
};

// Initialize Sortable
const waypointList = document.getElementById('waypoint-list');
if (waypointList) {
    new Sortable(waypointList, {
        animation: 150,
        handle: '.handle',
        onEnd: function (evt) {
            // Reorder routeWaypoints array based on DOM order
            const newOrderIds = Array.from(waypointList.querySelectorAll('li')).map(li => li.getAttribute('data-id'));
            const reorderedWaypoints = [];

            newOrderIds.forEach(id => {
                const marker = routeWaypoints.find(m => L.stamp(m).toString() === id);
                if (marker) reorderedWaypoints.push(marker);
            });

            routeWaypoints = reorderedWaypoints;
            syncWaypointList(); // Refresh labels (Start/End/Waypoint N)
        }
    });
}

// Initial sync
syncWaypointList();
