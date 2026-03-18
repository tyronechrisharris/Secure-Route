# Tactical Routing Engine (Secure-Route)

The Tactical Routing Engine is a high-performance, offline-first routing solution designed for high-stakes environments requiring planet-scale data processing and granular threat avoidance. It combines the speed of Contraction Hierarchies with the flexibility of a dynamic A* engine.

## 1. Executive Overview & Core Features

*   **Offline, High-Performance Routing**: Utilizes Contraction Hierarchies (via `fast_paths`) for millisecond-level routing on static road networks.
*   **Dynamic Threat Avoidance**: Real-time avoidance of user-defined threat zones using a fallback A* routing engine.
*   **Persistent Tactical Assets**: Integrated management of Safe Havens, Military Police, and Hospitals with proximity-based cost incentives.
*   **Planet-Scale RAM Safety**: Out-of-core graph builder using `redb` and MPSC streaming to process 70GB+ OSM files on consumer hardware.
*   **Interactive Operations UI**: A sophisticated Leaflet-based frontend with drag-and-drop waypoint management, real-time threat drawing, and breach reporting.

---

## 2. The Build Pipeline (`builder.rs`)

The build pipeline transforms raw OpenStreetMap `.pbf` data into an optimized routing graph.

### MPSC Streaming Architecture
To prevent Out-Of-Memory (OOM) crashes on massive datasets, the builder utilizes Multi-Producer, Single-Consumer (MPSC) channels. Geometries and adjacency data are processed in parallel across CPU cores and streamed to a dedicated background writer thread. This thread performs batched inserts into the `redb` database, ensuring that only a small portion of the multi-gigabyte dataset resides in RAM at any given time.

### Redb Caching & "Warm Rebuilds"
The builder uses `redb` as an embedded key-value store for intermediate data.
*   **Warm Rebuild**: If the builder detects an existing `.redb` cache (specifically the `NODE_COORDS` table), it automatically skips the expensive Pass 1 (Node Identification) and Pass 2 (Coordinate Extraction), drastically reducing time for repeated builds.

### Speed Limit & Weight Calculation
Weights are calculated based on travel time (milliseconds).
*   **OSM Maxspeed Parsing**: The builder extracts `maxspeed` tags, explicitly handling `mph` to `km/h` conversions (value * 1.60934).
*   **Heuristic Fallbacks**: If no speed tag is found, it falls back to highway-class defaults (e.g., Motorway: 100km/h, Residential: 30km/h).
*   **Haversine Distance**: Edge weights are calculated using the Haversine formula to ensure high-fidelity distance measurements across the globe.

### Database Layout
The `.redb` file contains several critical B-Tree tables:
*   `NODE_COORDS`: Maps OSM Node IDs to `[lat, lon]`.
*   `OSM_TO_INTERNAL`: Maps OSM IDs to sequential internal IDs used by the routing engines.
*   `EDGE_GEOMETRY`: Stores compressed path coordinates for every edge, allowing for high-fidelity "edge unpacking" during API responses.
*   `ADJACENCY_LIST`: Stores neighbor lists for the dynamic A* fallback engine.

---

## 3. The Backend Architecture (`server.rs`)

The backend is built with Axum and serves as the bridge between the routing engines and the frontend.

### Data Structures
*   `SecurityAsset`: Persistent tactical points (POLICE, EMS, MILITARY, SAFE_HAVEN).
*   `RouteRequest`: Contains `route_points` (waypoints), `threat_polygons`, and a `threatLevel` threshold.
*   `RouteResponse`: Returns the full geometry, distance, travel time, and a list of `intersectedThreats`.

### Dual-Engine Logic
The server intelligently selects the best routing strategy:
1.  **FastPaths Engine (CH)**: If no active threat barriers are present, the server uses Contraction Hierarchies for near-instant routing.
2.  **A* Fallback Engine**: If any threat polygons intersect with the user's requested `threatLevel`, the system falls back to a custom A* implementation.

### A* Engine Mechanics
The fallback engine uses the `pathfinding` crate with a custom cost function:
*   **Threat Avoidance (PIP)**: Before checking a neighbor, the engine performs a Point-in-Polygon (PIP) check against all active barriers. If a node falls within a threat zone, it is treated as having infinite cost, effectively severing that road from the network.
*   **Security Asset Overwatch**: Nodes within ~5km of a security asset receive a **0.5x cost discount (security bonus)**, incentivizing paths that stay close to support infrastructure.
*   **Time-Based Heuristic**: The `heuristic_time_ms` function uses a straight-line travel time estimate (assuming a max speed of 120km/h) to remain admissible and efficient.

---

## 4. The Frontend Architecture (`app.js` & `index.html`)

The frontend provides a real-time tactical dashboard for operators.

### Interactive Map Control
*   **Leaflet-Geoman**: Used for drawing and editing threat polygons and markers. Users can attach metadata like "Name" and "Severity" directly to polygons.
*   **PMTiles**: Map visuals are rendered entirely offline from a local `.pmtiles` archive using the Protomaps protocol.

### Tactical Asset Management
The UI provides full CRUD capabilities for security assets. Users can click on the map to create new assets, which are persisted to the backend's `redb` database. Existing assets can be edited or moved in real-time.

### Waypoint Management & SortableJS
The `#waypoint-list` panel uses `SortableJS` to allow operators to drag and drop waypoints. This reordering is synchronized with the internal `routeWaypoints` array, ensuring that the `calculateRoute` call reflects the operator's desired sequence of travel.

### Breach Reporting
When a route is calculated, the backend returns an `intersectedThreats` array. If any segments of the path cross a threat zone (even if the avoidance engine was active), the UI highlights the route in **RED** and displays a critical warning alert.

---

## 5. Setup, Build & Run Instructions

### Dependencies
*   Rust Toolchain (latest stable)
*   A `.pbf` OpenStreetMap extract (e.g., from Geofabrik)
*   A `.pmtiles` file for map visuals (optional but recommended for the UI)

### 1. Scorched Earth (Clean Start)
To ensure a fresh build, delete existing cache files:
```bash
rm -f north-america.graph north-america.graph.redb
```

### 2. Build the Routing Graph
Compile the OSM data into the tactical graph:
```bash
cargo run --release -- build --pbf data/map-data.osm.pbf --out map.graph
```
*Wait for the "Planet graph successfully built" message.*

### 3. Start the Server
Launch the Axum API and frontend:
```bash
cargo run --release -- serve --graph map.graph --tiles map.pmtiles --bind 0.0.0.0:8080
```

### 4. Access the Dashboard
Open your browser and navigate to:
`http://localhost:8080`
