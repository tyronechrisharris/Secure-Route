# Secure-Route Architecture

1. **Graph Building (`src/builder.rs`):**
    - Parses `.osm.pbf` via `osmpbfreader` filtered for `highway` tags.
    - Processes arrays into sequential node and edge links.
    - Serializes output using `rkyv` framework to a binary file `.graph` allowing zero-copy mapping into memory.

2. **Zero-Copy Routing (`src/router.rs`):**
    - Routing algorithms directly access memory mapped node pointers in Ram.
    - Path distance and time mapping adjusts per intersection over `threats.geojson`.

3. **Embedded Server & UI (`src/server.rs`):**
    - High performance `axum` based tokio async loops serve vector PMTiles natively without calling remote systems.
    - `rust-embed` serves Leaflet offline-assets downloaded directly to `src/main/resources/static/`.