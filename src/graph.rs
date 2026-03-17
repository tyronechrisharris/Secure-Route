use fast_paths::FastGraph;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SecurityAsset {
    pub id: String,
    pub name: String,
    pub asset_type: String,
    pub lat: f64,
    pub lon: f64,
    pub status: String,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct NodeInfo {
    pub id: usize, // Internal fast_paths ID
    pub osm_id: i64,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct GraphData {
    pub nodes: Vec<NodeInfo>,
    pub security_assets: Vec<SecurityAsset>,
    pub fast_graph: FastGraph,
}
