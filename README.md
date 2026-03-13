# Security Routing Application

An offline-first, high-security transport routing application using Spring Boot and GraphHopper.

## Features

*   **Offline Routing:** Uses GraphHopper with OSM data.
*   **Security Weighting:** Avoids choke points (bridges, tunnels) and high-threat areas.
*   **Asset Management:** Visualizes Police, EMS, Military, and Safe Havens.
*   **Live Traffic:** Simulates live traffic updates to adjust routing dynamically.
*   **Frontend:** Leaflet.js based dashboard for route planning and assessment.

## Setup

1.  **Build:** `mvn clean package`
2.  **Run:** `java -jar target/security-routing-0.0.1-SNAPSHOT.jar`
3.  **Access:** Open `http://localhost:8080`

## Configuration

*   **OSM Data:** Please rename your OSM compliant map data file to either `map-data.osm.bz2` (for compressed files) or `map-data.osm` (for uncompressed files) and place it in the root directory.
*   **Threat Data:** Place `threats.geojson` in the root directory.

## API Endpoints

*   `POST /api/secure-route`: Calculate route.
*   `GET /api/security-assets`: Get all security assets.

## Releases (Windows & Mac)

A universal release package is available.

1.  Download `security-routing-release.zip`.
2.  Extract the contents.
3.  **Windows:** Double-click `run-windows.bat`.
4.  **Mac/Linux:** Open a terminal, navigate to the folder, and run `./run-mac.sh`.

*Note: Java 17+ must be installed on your system.*

## Troubleshooting

If routing fails, ensure the OSM file covers the requested coordinates.
