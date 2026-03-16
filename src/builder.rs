use crate::graph::{GraphData, NodeInfo, SecurityAsset};
use fast_paths::InputGraph;
use osmpbfreader::{OsmObj, OsmPbfReader};
use memmap2::MmapOptions;
use rayon::prelude::*;
use redb::{Database, ReadableTable, TableDefinition};
use std::collections::HashMap;
use std::fs::{File, remove_file};
use std::io::{Cursor, Write};
use std::sync::Mutex;

// redb Table Definitions for Out-of-Core Chunking
const ROUTABLE_NODES: TableDefinition<i64, ()> = TableDefinition::new("routable_nodes");
const NODE_COORDS: TableDefinition<i64, [f64; 2]> = TableDefinition::new("node_coords");

pub fn build_graph(pbf_path: &str, out_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let cache_path = format!("{}.redb", out_path);
    if std::path::Path::new(&cache_path).exists() {
        remove_file(&cache_path)?;
    }

    println!("Initializing redb disk cache at {}...", cache_path);
    let db = Database::create(&cache_path)?;

    println!("Mapping PBF file into unified memory...");
    let file = File::open(pbf_path)?;
    let mmap = unsafe { MmapOptions::new().map(&file)? };

    // ==========================================
    // PASS 1: Identify Routable Nodes
    // ==========================================
    println!("Pass 1: Scanning for routable ways and writing required nodes to disk...");
    let write_txn = db.begin_write()?;
    {
        let mut table = write_txn.open_table(ROUTABLE_NODES)?;
        let mut pbf_pass1 = OsmPbfReader::new(Cursor::new(&mmap));
        for obj in pbf_pass1.iter().filter_map(Result::ok) {
            if let OsmObj::Way(w) = obj {
                if w.tags.contains_key("highway") {
                    for node_id in &w.nodes {
                        table.insert(node_id.0, ())?;
                    }
                }
            }
        }
    }
    write_txn.commit()?;

    // ==========================================
    // PASS 2: Extract Coordinates & Assets
    // ==========================================
    println!("Pass 2: Extracting coordinates to disk and caching security assets...");
    let mut security_assets = Vec::new();
    let mut total_nodes = 0;

    let write_txn = db.begin_write()?;
    let read_txn = db.begin_read()?;
    let routable_table = read_txn.open_table(ROUTABLE_NODES)?;

    {
        let mut coord_table = write_txn.open_table(NODE_COORDS)?;
        let mut pbf_pass2 = OsmPbfReader::new(Cursor::new(&mmap));

        for obj in pbf_pass2.iter().filter_map(Result::ok) {
            if let OsmObj::Node(n) = obj {
                // Disk-backed lookup
                if routable_table.get(n.id.0)?.is_some() {
                    coord_table.insert(n.id.0, [n.lat(), n.lon()])?;
                    total_nodes += 1;
                }

                // Security Asset Logic
                let tags = &n.tags;
                let is_police = tags.get("amenity").map_or(false, |v| v.as_str() == "police");
                let is_ems = tags.get("amenity").map_or(false, |v| v.as_str() == "hospital" || v.as_str() == "clinic");
                let is_military = tags.get("military").is_some();
                let is_safe_haven = tags.get("emergency").map_or(false, |v| v.as_str() == "assembly_point");

                if is_police || is_ems || is_military || is_safe_haven {
                    let asset_type = if is_police { "POLICE" }
                    else if is_ems { "EMS" }
                    else if is_military { "MILITARY" }
                    else { "SAFE_HAVEN" };

                    security_assets.push(SecurityAsset {
                        id: n.id.0.to_string(),
                        name: tags.get("name").map_or("Unnamed".to_string(), |v| v.to_string()),
                        asset_type: asset_type.to_string(),
                        lat: n.lat(),
                        lon: n.lon(),
                        status: "ACTIVE".to_string(),
                    });
                }
            }
        }
    }
    write_txn.commit()?;

    // ==========================================
    // ID Mapping (In-Memory for CH internal IDs)
    // ==========================================
    println!("Assigning Contraction Hierarchy Internal IDs...");
    let mut final_nodes: Vec<NodeInfo> = Vec::with_capacity(total_nodes);
    let mut osm_to_internal: HashMap<i64, usize> = HashMap::with_capacity(total_nodes);

    let read_txn = db.begin_read()?;
    let coord_table = read_txn.open_table(NODE_COORDS)?;

    for (idx, result) in coord_table.iter()?.enumerate() {
        let (osm_id_val, coords_val) = result?;
        let osm_id = osm_id_val.value();
        let coords = coords_val.value();

        osm_to_internal.insert(osm_id, idx);
        final_nodes.push(NodeInfo {
            id: idx,
            osm_id,
            lat: coords[0],
            lon: coords[1],
        });
    }

    // ==========================================
    // PASS 3: Calculate Edges via Rayon chunks
    // ==========================================
    println!("Pass 3: Extracting ways and computing edges...");
    let mut ways = Vec::new();
    let mut pbf_pass3 = OsmPbfReader::new(Cursor::new(&mmap));
    for obj in pbf_pass3.iter().filter_map(Result::ok) {
        if let OsmObj::Way(w) = obj {
            if w.tags.contains_key("highway") {
                ways.push(w);
            }
        }
    }

    let edges = Mutex::new(Vec::new());

    ways.par_iter().for_each(|way| {
        let is_oneway = way.tags.get("oneway").map(|v| v.as_str()) == Some("yes");
        let speed_limit: u32 = match way.tags.get("highway").map(|v| v.as_str()) {
            Some("motorway") | Some("trunk") => 100,
            Some("primary") => 80,
            Some("secondary") => 60,
            Some("tertiary") => 50,
            Some("residential") => 30,
            Some("living_street") => 10,
            _ => 40,
        };

        let mut local_edges = Vec::new();
        let node_ids = &way.nodes;

        for i in 0..node_ids.len() - 1 {
            let n1_osm = node_ids[i].0;
            let n2_osm = node_ids[i + 1].0;

            if let (Some(&n1_internal), Some(&n2_internal)) = (
                osm_to_internal.get(&n1_osm),
                osm_to_internal.get(&n2_osm),
            ) {
                let n1 = &final_nodes[n1_internal];
                let n2 = &final_nodes[n2_internal];

                let r = 6371000.0;
                let d_lat = (n2.lat - n1.lat).to_radians();
                let d_lon = (n2.lon - n1.lon).to_radians();
                let a = (d_lat / 2.0).sin().powi(2) +
                        n1.lat.to_radians().cos() * n2.lat.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
                let distance = r * (2.0 * a.sqrt().atan2((1.0 - a).sqrt()));

                let time_cost_ms = (distance / (speed_limit as f64 * 1000.0 / 3600.0) * 1000.0) as usize;

                local_edges.push((n1_internal, n2_internal, time_cost_ms));
                if !is_oneway {
                    local_edges.push((n2_internal, n1_internal, time_cost_ms));
                }
            }
        }
        edges.lock().unwrap().extend(local_edges);
    });

    // ==========================================
    // Compile and Serialize
    // ==========================================
    let mut input_graph = InputGraph::new();
    for (source, target, weight) in edges.into_inner().unwrap() {
        input_graph.add_edge(source, target, weight);
    }
    input_graph.freeze();

    println!("Preparing FastPaths CH Graph (Utilizing all cores)...");
    let fast_graph = fast_paths::prepare(&input_graph);

    let graph_data = GraphData {
        nodes: final_nodes,
        osm_to_internal,
        security_assets,
        fast_graph,
    };

    println!("Serializing final graph to {} via bincode...", out_path);
    let bytes = bincode::serialize(&graph_data)?;
    File::create(out_path)?.write_all(&bytes)?;

    println!("Cleaning up redb cache...");
    let _ = remove_file(&cache_path);

    println!("Planet graph successfully built.");
    Ok(())
}
