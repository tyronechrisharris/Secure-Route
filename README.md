# Secure Route: High-Performance Offline Routing

Secure Route is a continent-scale routing engine designed for security-conscious applications. It provides mathematically optimal routing with offline-first map rendering and real-time threat detection.

🚀 Getting Started
This routing engine utilizes an out-of-core Contraction Hierarchies architecture. It calculates mathematically optimal routes in milliseconds while maintaining a massive, continent-scale road network within standard memory limits using a local redb geometry cache.

1. Download the Map Visuals (PMTiles)
The frontend UI renders the map entirely offline using a single 120GB .pmtiles archive. You must download this file into the root directory before starting the server.

Option A: Native Curl (Recommended)
curl -C - -o map.pmtiles https://build.protomaps.com/20260317.pmtiles
(Note: The -C - flag allows you to safely stop and resume the massive download at any time).

Option B: Docker (Parallel Download)
docker run --rm -it -v $(pwd):/data -w /data alpine sh -c "sed -i 's/https/http/g' /etc/apk/repositories && apk add --no-cache aria2 && aria2c --check-certificate=false -x 16 -s 16 -c 'https://build.protomaps.com/20260317.pmtiles' -o map.pmtiles"

2. Build the Routing Graph
Before you can route, you must compile the raw OpenStreetMap .pbf data into an optimized fast_paths graph.
cargo build --release
./target/release/secure-route build --pbf data/north-america-latest.osm.pbf --out north-america-latest.osm.graph

Auto-Resume: If the build process is interrupted, running the command again will automatically detect the existing .redb cache and skip the initial parsing phases.
Topology Compression: The builder automatically compresses intermediate road curves to save RAM, storing the visual geometry safely on your SSD.

3. Serve the Application
Once the .graph is built and the map.pmtiles file is in your directory, start the API and frontend UI:
./target/release/secure-route serve --graph north-america-latest.osm.graph --tiles map.pmtiles --bind 0.0.0.0:8080
Navigate to http://localhost:8080 in your web browser.

🎯 Core Features & Usage

Multi-Waypoint Routing: Use the marker tool to drop multiple pins on the map. The engine will sequentially calculate the fastest path passing through all your designated waypoints.
Threat Area Detection: Use the polygon tool to draw restricted zones or active threat areas. When you request a route, the backend performs high-speed intersection math. If your path crosses a threat polygon, the UI will alert you and highlight the compromised route segment in red.
High-Fidelity Edge Unpacking: The backend queries the redb database in real-time to reconstruct the exact physical curves of the roads, ensuring the visual route smoothly traces the physical map rather than snapping to straight, jagged lines.
