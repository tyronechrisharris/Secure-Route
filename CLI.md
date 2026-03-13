# Command Line Interface (CLI) Guide

Secure-Route operates in two distinct modes.

### 1. Build Phase (Graph Ingestion)
To parse an `.osm.pbf` file (like `planet-osm.pbf` or `rhode-island.osm.pbf`) into an internal `.graph` format for zero-copy memory mapping:
```bash
secure-route build --pbf <path_to_pbf> --out <output_graph_name>
```
*Example:* `secure-route build --pbf data/rhode-island.osm.pbf --out rhode-island.graph`

### 2. Serve Phase (Routing Engine & Embedded UI)
To run the server utilizing the built graph:
```bash
secure-route serve --graph <path_to_graph> --tiles <path_to_pmtiles> --bind <host:port>
```
*Example:* `secure-route serve --graph rhode-island.graph --tiles map.pmtiles --bind 0.0.0.0:8080`