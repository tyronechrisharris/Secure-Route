# Secure-Route (Rust Re-Write)

A highly performant, memory-safe, purely offline routing engine natively built in Rust, replacing the legacy Java backend.

## Features
- **Zero-Copy Graph Serialization:** Processes large `.osm.pbf` files directly into a memory-mapped `rkyv` `.graph` file to load into RAM in less than a few milliseconds.
- **Parallel Parsing:** Utilizes `osmpbfreader` and `rayon` to digest planet-scale graphs effortlessly.
- **Fast Routing:** Implements Dijkstra / Contraction Hierarchies compatible routing logic mimicking GraphHopper 9.0's CustomModel.
- **Offline PMTiles Map Rendering:** Connects via Axum.
- **Air-Gapped Embedded UI:** Frontend built into the binary using `rust-embed`.

## Build Instructions
1. Ensure Rust is installed.
2. Clone repository.
3. Run `cargo build --release`

## Usage
### Step 1: Ingesting PBF (Build Mode)
```bash
./secure-route build --pbf data/rhode-island.osm.pbf --out rhode-island.graph
```

### Step 2: Serving App & Routing (Serve Mode)
```bash
./secure-route serve --graph rhode-island.graph --tiles map.pmtiles --bind 0.0.0.0:8080
```
Open `http://localhost:8080`.

## Testing and Benchmarks
Run `cargo test` for unit logic tests.
Run `cargo bench` to benchmark routing algorithms to trace and avoid performance regressions using `criterion`.