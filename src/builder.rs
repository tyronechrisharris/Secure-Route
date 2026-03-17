use crate::graph::{GraphData, NodeInfo, SecurityAsset};
use fast_paths::InputGraph;
use osmpbfreader::{OsmObj, OsmPbfReader, Way};
use memmap2::MmapOptions;
use rayon::prelude::*;
use redb::{Database, ReadableTable, TableDefinition, ReadableTableMetadata, ReadOnlyTable};
use std::fs::File;
use std::io::{Cursor, Write};
use std::sync::Mutex;

// redb Table Definitions
const ROUTABLE_NODES: TableDefinition<i64, ()> = TableDefinition::new("routable_nodes");
const NODE_COORDS: TableDefinition<i64, [f64; 2]> = TableDefinition::new("node_coords");
const OSM_TO_INTERNAL: TableDefinition<i64, u64> = TableDefinition::new("osm_to_internal");
const NODE_DEGREES: TableDefinition<i64, u32> = TableDefinition::new("node_degrees");

enum BuilderMsg {
    Geo(((u64, u64), Vec<u8>, bool)),
    Adj((u64, u64, usize, bool)),
}

pub fn build_graph(pbf_path: &str, out_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let cache_path = format!("{}.redb", out_path);

    let mut skip_passes = false;
    if std::path::Path::new(&cache_path).exists() {
        if let Ok(db) = Database::open(&cache_path) {
            if let Ok(read_txn) = db.begin_read() {
                if let Ok(table) = read_txn.open_table(NODE_COORDS) {
                    if table.len().unwrap_or(0) > 0 {
                        println!("Found existing redb cache. Skipping Passes 1 & 2...");
                        skip_passes = true;
                    }
                }
            }
        }
    }

    let db = if skip_passes {
        Database::open(&cache_path)?
    } else {
        println!("Initializing redb disk cache at {}...", cache_path);
        Database::create(&cache_path)?
    };

    println!("Mapping PBF file into unified memory...");
    let file = File::open(pbf_path)?;
    let mmap = unsafe { MmapOptions::new().map(&file)? };

    if !skip_passes {
        println!("Pass 1: Identifying routable nodes...");
        let write_txn = db.begin_write()?;
        {
            let mut table = write_txn.open_table(ROUTABLE_NODES)?;
            let mut pbf = OsmPbfReader::new(Cursor::new(&mmap));
            for obj in pbf.iter().filter_map(Result::ok) {
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

        println!("Pass 2: Extracting coordinates...");
        let write_txn = db.begin_write()?;
        let read_txn = db.begin_read()?;
        let routable_table = read_txn.open_table(ROUTABLE_NODES)?;
        {
            let mut coord_table = write_txn.open_table(NODE_COORDS)?;
            let mut pbf = OsmPbfReader::new(Cursor::new(&mmap));
            for obj in pbf.iter().filter_map(Result::ok) {
                if let OsmObj::Node(n) = obj {
                    if routable_table.get(n.id.0)?.is_some() {
                        coord_table.insert(n.id.0, [n.lat(), n.lon()])?;
                    }
                }
            }
        }
        write_txn.commit()?;
    }

    println!("Phase 3: Calculating node degrees and identifying security assets...");
    let mut security_assets = Vec::new();
    let write_txn = db.begin_write()?;
    {
        let mut degree_table = write_txn.open_table(NODE_DEGREES)?;
        let mut pbf = OsmPbfReader::new(Cursor::new(&mmap));
        for obj in pbf.iter().filter_map(Result::ok) {
            match obj {
                OsmObj::Way(w) => {
                    if w.tags.contains_key("highway") {
                        let len = w.nodes.len();
                        for (i, node_id) in w.nodes.iter().enumerate() {
                            let val = degree_table.get(node_id.0)?.map(|v| v.value()).unwrap_or(0);
                            let mut deg = val & 0x7FFFFFFF;
                            let mut is_endpoint = (val & 0x80000000) != 0;
                            deg += 1;
                            if i == 0 || i == len - 1 {
                                is_endpoint = true;
                            }
                            degree_table.insert(node_id.0, deg | (if is_endpoint { 0x80000000 } else { 0 }))?;
                        }
                    }
                }
                OsmObj::Node(n) => {
                    let tags = &n.tags;
                    let is_police = tags.get("amenity").map_or(false, |v| v == "police");
                    let is_ems = tags.get("amenity").map_or(false, |v| v == "hospital" || v == "clinic");
                    let is_military = tags.contains_key("military");
                    let is_safe_haven = tags.get("emergency").map_or(false, |v| v == "assembly_point");

                    if is_police || is_ems || is_military || is_safe_haven {
                        let asset_type = if is_police { "POLICE" }
                        else if is_ems { "EMS" }
                        else if is_military { "MILITARY" }
                        else { "SAFE_HAVEN" };

                        security_assets.push(SecurityAsset {
                            id: n.id.0 as u64,
                            name: tags.get("name").map_or("Unnamed".to_string(), |v| v.to_string()),
                            asset_type: asset_type.to_string(),
                            lat: n.lat(),
                            lon: n.lon(),
                            operational: true,
                        });
                    }
                }
                _ => {}
            }
        }
    }
    write_txn.commit()?;

    println!("Phase 3: Assigning Internal IDs to preserved nodes...");
    let mut final_nodes = Vec::new();
    let write_txn = db.begin_write()?;
    {
        let mut mapping_table = write_txn.open_table(OSM_TO_INTERNAL)?;
        let read_txn = db.begin_read()?;
        let coord_table = read_txn.open_table(NODE_COORDS)?;
        let degree_table = read_txn.open_table(NODE_DEGREES)?;

        let mut internal_id_counter: u64 = 0;
        for result in coord_table.iter()? {
            let (osm_id_v, coords_v) = result?;
            let osm_id = osm_id_v.value();
            let coords = coords_v.value();

            let val = degree_table.get(osm_id)?.map(|v| v.value()).unwrap_or(0);
            let deg = val & 0x7FFFFFFF;
            let is_endpoint = (val & 0x80000000) != 0;

            if deg > 1 || is_endpoint {
                mapping_table.insert(osm_id, internal_id_counter)?;
                final_nodes.push(NodeInfo {
                    id: internal_id_counter as usize,
                    osm_id,
                    lat: coords[0],
                    lon: coords[1],
                });
                internal_id_counter += 1;
            }
        }
    }
    write_txn.commit()?;

    println!("Phase 3: Computing compressed edges (MPSC Streaming)...");
    let (tx, rx) = std::sync::mpsc::sync_channel::<BuilderMsg>(20_000);

    let db_arc = std::sync::Arc::new(db);
    let db_writer = db_arc.clone();
    let writer_thread = std::thread::spawn(move || {
        let write_txn = db_writer.begin_write().unwrap();
        {
            let mut geo_table = write_txn.open_table(crate::graph::EDGE_GEOMETRY).unwrap();
            let mut adj_table = write_txn.open_table(crate::graph::ADJACENCY_LIST).unwrap();
            let mut adj_buffer: std::collections::HashMap<u64, Vec<(u64, f64)>> = std::collections::HashMap::new();

            while let Ok(msg) = rx.recv() {
                match msg {
                    BuilderMsg::Geo(((s, t), geo_bytes, is_ow)) => {
                        geo_table.insert((s, t), geo_bytes.clone()).unwrap();
                        if !is_ow {
                            let mut path: Vec<[f64; 2]> = bincode::deserialize(&geo_bytes).unwrap();
                            path.reverse();
                            geo_table.insert((t, s), bincode::serialize(&path).unwrap()).unwrap();
                        }
                    }
                    BuilderMsg::Adj((s, t, w, is_ow)) => {
                        adj_buffer.entry(s).or_default().push((t, w as f64));
                        if !is_ow {
                            adj_buffer.entry(t).or_default().push((s, w as f64));
                        }

                        if adj_buffer.len() > 1000 {
                            for (node_id, neighbors) in adj_buffer.drain() {
                                let mut existing: Vec<(u64, f64)> = adj_table.get(node_id).unwrap()
                                    .map(|v| bincode::deserialize(v.value()).unwrap())
                                    .unwrap_or_default();
                                existing.extend(neighbors);
                                adj_table.insert(node_id, bincode::serialize(&existing).unwrap().as_slice()).unwrap();
                            }
                        }
                    }
                }
            }
            for (node_id, neighbors) in adj_buffer {
                let mut existing: Vec<(u64, f64)> = adj_table.get(node_id).unwrap()
                    .map(|v| bincode::deserialize(v.value()).unwrap())
                    .unwrap_or_default();
                existing.extend(neighbors);
                adj_table.insert(node_id, bincode::serialize(&existing).unwrap().as_slice()).unwrap();
            }
        }
        write_txn.commit().unwrap();
    });

    {
        let read_txn = db_arc.begin_read()?;
        let mapping_table = read_txn.open_table(OSM_TO_INTERNAL)?;
        let coord_table = read_txn.open_table(NODE_COORDS)?;

        let mut pbf = OsmPbfReader::new(Cursor::new(&mmap));
        let mut ways_batch = Vec::new();

        for obj in pbf.iter().filter_map(Result::ok) {
            if let OsmObj::Way(way) = obj {
                if way.tags.contains_key("highway") {
                    ways_batch.push(way);
                    if ways_batch.len() >= 10000 {
                        process_ways_batch(&ways_batch, &mapping_table, &coord_table, tx.clone());
                        ways_batch.clear();
                    }
                }
            }
        }
        process_ways_batch(&ways_batch, &mapping_table, &coord_table, tx);
    }

    drop(db_arc);
    writer_thread.join().unwrap();

    let db = Database::open(&cache_path)?;
    let mut input_graph = InputGraph::new();
    println!("Phase 3: Populating InputGraph from ADJACENCY_LIST...");
    let read_txn = db.begin_read()?;
    let adj_table = read_txn.open_table(crate::graph::ADJACENCY_LIST)?;
    for result in adj_table.iter()? {
        let (node_id_v, neighbors_v) = result?;
        let s = node_id_v.value();
        let neighbors: Vec<(u64, f64)> = bincode::deserialize(neighbors_v.value())?;
        for (t, weight) in neighbors {
            input_graph.add_edge(s as usize, t as usize, weight as usize);
        }
    }

    input_graph.freeze();
    println!("Preparing FastPaths CH Graph...");
    let fast_graph = fast_paths::prepare(&input_graph);

    let graph_data = GraphData {
        nodes: final_nodes,
        security_assets,
        fast_graph,
    };

    println!("Serializing final graph to {} via bincode...", out_path);
    let bytes = bincode::serialize(&graph_data)?;
    File::create(out_path)?.write_all(&bytes)?;

    println!("Planet graph successfully built. Cache preserved at {}", cache_path);
    Ok(())
}

fn process_ways_batch(
    ways: &[Way],
    mapping_table: &ReadOnlyTable<i64, u64>,
    coord_table: &ReadOnlyTable<i64, [f64; 2]>,
    tx: std::sync::mpsc::SyncSender<BuilderMsg>,
) {
    ways.par_iter().for_each(|way| {
        let is_ow = way.tags.get("oneway").map(|v| v.as_str()) == Some("yes");
        let speed = if let Some(maxspeed) = way.tags.get("maxspeed").map(|v| v.as_str()) {
            if maxspeed.ends_with(" mph") {
                maxspeed.replace(" mph", "").parse::<f64>().unwrap_or(40.0) * 1.60934
            } else {
                maxspeed.parse::<f64>().unwrap_or(40.0)
            }
        } else {
            match way.tags.get("highway").map(|v| v.as_str()) {
                Some("motorway") | Some("trunk") => 100.0,
                Some("primary") => 80.0,
                Some("secondary") => 60.0,
                Some("tertiary") => 50.0,
                Some("residential") => 30.0,
                Some("living_street") => 10.0,
                _ => 40.0,
            }
        };

        let nodes = &way.nodes;
        let mut i = 0;
        while i < nodes.len() - 1 {
            if let Some(start_id) = mapping_table.get(nodes[i].0).unwrap().map(|v| v.value()) {
                let mut weight = 0.0;
                let mut path = Vec::new();
                let mut j = i + 1;
                while j < nodes.len() {
                    let n1 = nodes[j-1].0;
                    let n2 = nodes[j].0;

                    if let (Some(c1_v), Some(c2_v)) = (coord_table.get(n1).unwrap(), coord_table.get(n2).unwrap()) {
                        let c1 = c1_v.value();
                        let c2 = c2_v.value();
                        weight += haversine_ms(c1[0], c1[1], c2[0], c2[1], speed);
                    }

                    if let Some(end_id) = mapping_table.get(n2).unwrap().map(|v| v.value()) {
                        tx.send(BuilderMsg::Adj((start_id, end_id, weight as usize, is_ow))).unwrap();

                        let geo_bytes = bincode::serialize(&path).unwrap();
                        tx.send(BuilderMsg::Geo(((start_id, end_id), geo_bytes, is_ow))).unwrap();

                        i = j;
                        break;
                    } else {
                        if let Some(c_v) = coord_table.get(n2).unwrap() {
                            path.push(c_v.value());
                        }
                        j += 1;
                    }
                    if j == nodes.len() {
                        i = j;
                    }
                }
            } else {
                i += 1;
            }
        }
    });
}

fn haversine_ms(lat1: f64, lon1: f64, lat2: f64, lon2: f64, speed_kmh: f64) -> f64 {
    let r = 6371000.0;
    let d_lat = (lat2 - lat1).to_radians();
    let d_lon = (lon2 - lon1).to_radians();
    let a = (d_lat / 2.0).sin().powi(2) +
            lat1.to_radians().cos() * lat2.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
    let distance = r * 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
    (distance / (speed_kmh * 1000.0 / 3600.0)) * 1000.0
}
