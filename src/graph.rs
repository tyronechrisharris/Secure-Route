use fast_paths::FastGraph;
use serde::{Deserialize, Serialize};
use redb::TableDefinition;

pub const EDGE_GEOMETRY: TableDefinition<(u64, u64), Vec<u8>> = TableDefinition::new("edge_geometry");

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SecurityAsset {
    pub id: u64,
    pub name: String,
    #[serde(rename = "type")]
    pub asset_type: String,
    pub lat: f64,
    pub lon: f64,
    pub operational: bool,
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
