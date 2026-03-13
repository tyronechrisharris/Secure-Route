# Data Provisioning Guide

In secure environments, downloading maps must be air-gapped. Follow these instructions:

## Acquiring OSM PBF Maps
1. Visit **Geofabrik** or **Protomaps**.
2. Download an `.osm.pbf` file (e.g., `rhode-island.osm.pbf`).
3. Move this file to your target system securely.

## Acquiring Offline Tiles
1. Download or convert map extracts using `pmtiles` (Protomaps toolset).
2. Save as `map.pmtiles`.
3. Place this `.pmtiles` file in the same directory as the executable.

You must build the routing graph manually the first time via the `build` CLI command.