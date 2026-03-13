use crate::graph::{GraphData, NodeInfo, SecurityAsset};
use fast_paths::InputGraph;
use osmpbfreader::{OsmObj, OsmPbfReader};
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;

pub fn build_graph(pbf_path: &str, out_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("Building CH graph from {}", pbf_path);

    let file = File::open(pbf_path)?;
    let mut pbf = OsmPbfReader::new(file);

    let mut nodes_map: HashMap<i64, NodeInfo> = HashMap::new();
    let mut ways: Vec<osmpbfreader::Way> = Vec::new();
    let mut security_assets: Vec<SecurityAsset> = Vec::new();
    let mut internal_id_counter: usize = 0;
    let mut osm_to_internal: HashMap<i64, usize> = HashMap::new();

    let objs = pbf.get_objs_and_deps(|obj| {
        if obj.is_way() && obj.tags().contains_key("highway") {
            return true;
        }

        if obj.is_node() {
            let tags = obj.tags();
            let is_police = tags.get("amenity").map_or(false, |v| v.as_str() == "police");
            let is_ems = tags.get("amenity").map_or(false, |v| v.as_str() == "hospital" || v.as_str() == "clinic");
            let is_military = tags.get("military").is_some();
            let is_safe_haven = tags.get("emergency").map_or(false, |v| v.as_str() == "assembly_point");

            if is_police || is_ems || is_military || is_safe_haven {
                return true;
            }
        }

        false
    })?;

    for (_id, obj) in &objs {
        match obj {
            OsmObj::Node(n) => {
                let node = NodeInfo {
                    id: 0,
                    osm_id: n.id.0,
                    lat: n.lat(),
                    lon: n.lon(),
                };
                nodes_map.insert(n.id.0, node);

                let tags = &n.tags;
                let is_police = tags.get("amenity").map_or(false, |v| v.as_str() == "police");
                let is_ems = tags.get("amenity").map_or(false, |v| v.as_str() == "hospital" || v.as_str() == "clinic");
                let is_military = tags.get("military").is_some();
                let is_safe_haven = tags.get("emergency").map_or(false, |v| v.as_str() == "assembly_point");

                let name = tags.get("name").map_or("Unnamed".to_string(), |v| v.to_string());
                let mut asset_type = None;

                if is_police { asset_type = Some("POLICE"); }
                else if is_ems { asset_type = Some("EMS"); }
                else if is_military { asset_type = Some("MILITARY"); }
                else if is_safe_haven { asset_type = Some("SAFE_HAVEN"); }

                if let Some(a_type) = asset_type {
                    security_assets.push(SecurityAsset {
                        id: n.id.0.to_string(),
                        name,
                        asset_type: a_type.to_string(),
                        lat: n.lat(),
                        lon: n.lon(),
                        status: "ACTIVE".to_string(),
                    });
                }
            }
            OsmObj::Way(w) => {
                if w.tags.contains_key("highway") {
                    ways.push(w.clone());
                }
            }
            _ => {}
        }
    }

    let mut final_nodes: Vec<NodeInfo> = Vec::with_capacity(nodes_map.len());
    for (osm_id, mut node) in nodes_map.into_iter() {
        node.id = internal_id_counter;
        osm_to_internal.insert(osm_id, internal_id_counter);
        final_nodes.push(node);
        internal_id_counter += 1;
    }

    final_nodes.sort_by_key(|n| n.id);

    println!("Found {} routable nodes, {} ways, {} security assets", final_nodes.len(), ways.len(), security_assets.len());

    let mut input_graph = InputGraph::new();

    for way in ways {
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

        let node_ids = &way.nodes;
        for i in 0..node_ids.len() - 1 {
            let n1_osm = node_ids[i].0;
            let n2_osm = node_ids[i + 1].0;

            if let (Some(&n1_internal), Some(&n2_internal)) = (
                osm_to_internal.get(&n1_osm),
                osm_to_internal.get(&n2_osm),
            ) {
                let n1_lat = final_nodes[n1_internal].lat;
                let n1_lon = final_nodes[n1_internal].lon;
                let n2_lat = final_nodes[n2_internal].lat;
                let n2_lon = final_nodes[n2_internal].lon;

                let r = 6371000.0;
                let d_lat = (n2_lat - n1_lat).to_radians();
                let d_lon = (n2_lon - n1_lon).to_radians();
                let lat1_rad = n1_lat.to_radians();
                let lat2_rad = n2_lat.to_radians();

                let a = (d_lat / 2.0).sin() * (d_lat / 2.0).sin() +
                    lat1_rad.cos() * lat2_rad.cos() *
                    (d_lon / 2.0).sin() * (d_lon / 2.0).sin();
                let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
                let distance = r * c;

                // CH graphs use integer weights, so we store cost as time in milliseconds
                let time_cost_ms = (distance / (speed_limit as f64 * 1000.0 / 3600.0) * 1000.0) as usize;

                input_graph.add_edge(n1_internal, n2_internal, time_cost_ms);

                if !is_oneway {
                    input_graph.add_edge(n2_internal, n1_internal, time_cost_ms);
                }
            }
        }
    }

    input_graph.freeze();
    println!("Preparing FastPaths CH Graph...");
    let fast_graph = fast_paths::prepare(&input_graph);

    let graph_data = GraphData {
        nodes: final_nodes,
        osm_to_internal,
        security_assets,
        fast_graph,
    };

    println!("Serializing graph to {} via bincode...", out_path);
    let bytes = bincode::serialize(&graph_data)?;
    let mut out_file = File::create(out_path)?;
    out_file.write_all(&bytes)?;

    println!("Graph successfully built and serialized.");
    Ok(())
}
