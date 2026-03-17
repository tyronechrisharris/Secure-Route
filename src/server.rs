use axum::{
    extract::{Path, State, Json},
    http::{header, StatusCode, Uri},
    response::IntoResponse,
    routing::{get, post, put, delete},
    Router,
};
use redb::ReadableTable;
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::services::ServeFile;
use crate::graph::{GraphData, SecurityAsset};
use geo::{Polygon, Point, Coord};
use geo::Intersects;

pub const SECURITY_ASSETS: redb::TableDefinition<u64, &[u8]> = redb::TableDefinition::new("security_assets");

#[derive(RustEmbed)]
#[folder = "src/main/resources/static/"]
struct Asset;

pub struct AppState {
    pub graph_data: GraphData,
    pub db: redb::Database,
}

#[derive(Deserialize)]
pub struct RouteRequest {
    #[serde(rename = "route_points")]
    pub route_points: Vec<[f64; 2]>,
    #[serde(rename = "threat_polygons")]
    pub threat_polygons: Vec<Vec<Vec<[f64; 2]>>>,
    #[serde(rename = "threatLevel")]
    pub threat_level: String,
}

#[derive(Serialize)]
pub struct RouteResponse {
    pub geometry: RouteGeometry,
    pub distance: f64,
    pub time: f64,
    #[serde(rename = "chokePointsAvoided")]
    pub choke_points_avoided: u32,
    #[serde(rename = "proximityScore")]
    pub proximity_score: f64,
    #[serde(rename = "etaToNearestSafeHaven")]
    pub eta_to_nearest_safe_haven: String,
    #[serde(rename = "intersectedThreats")]
    pub intersected_threats: Vec<String>,
    #[serde(rename = "threat_intersected")]
    pub threat_intersected: bool,
}

#[derive(Serialize)]
pub struct RouteGeometry {
    #[serde(rename = "type")]
    pub geometry_type: String,
    pub coordinates: Vec<Vec<f64>>,
}

pub async fn run_server(graph_path: String, pmtiles_path: String, bind: String) {
    println!("Loading Graph Data from {}...", graph_path);
    let graph_bytes = std::fs::read(&graph_path).expect("Failed to read graph file");
    let graph_data: GraphData = bincode::deserialize(&graph_bytes).expect("Failed to deserialize graph data via bincode");

    let cache_path = format!("{}.redb", graph_path);
    println!("Opening redb database at {}...", cache_path);
    let db = redb::Database::open(&cache_path).expect("Failed to open redb database");

    let state = Arc::new(AppState {
        graph_data,
        db,
    });

    // ServeFile correctly implements HTTP Range requests natively which map.pmtiles requires.
    let serve_pmtiles = ServeFile::new(pmtiles_path);

    let app = Router::new()
        .route("/", get(index_handler))
        .route("/api/security-assets", get(get_assets).post(post_asset))
        .route("/api/security-assets/{id}", put(put_asset).delete(delete_asset))
        .route("/api/secure-route", post(calculate_route))
        .route("/map.pmtiles", axum::routing::get_service(serve_pmtiles))
        .route("/{*file}", get(static_handler))
        .with_state(state);

    println!("Listening on http://{}", bind);
    let listener = TcpListener::bind(&bind).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn index_handler() -> impl IntoResponse {
    static_handler(Uri::from_static("/index.html")).await
}

async fn static_handler(uri: Uri) -> impl IntoResponse {
    let mut path = uri.path().trim_start_matches('/').to_string();

    if path.is_empty() {
        path = "index.html".to_string();
    }

    match Asset::get(path.as_str()) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref())], content.data).into_response()
        }
        None => {
            (StatusCode::NOT_FOUND, "404 Not Found").into_response()
        }
    }
}

async fn get_assets(State(state): State<Arc<AppState>>) -> Json<Vec<SecurityAsset>> {
    let mut assets = state.graph_data.security_assets.clone();

    if let Ok(read_txn) = state.db.begin_read() {
        if let Ok(table) = read_txn.open_table(SECURITY_ASSETS) {
            if let Ok(iter) = table.iter() {
                for result in iter {
                    if let Ok((_id, value)) = result {
                        if let Ok(asset) = serde_json::from_slice::<SecurityAsset>(value.value()) {
                            assets.push(asset);
                        }
                    }
                }
            }
        }
    }

    Json(assets)
}

async fn post_asset(
    State(state): State<Arc<AppState>>,
    Json(mut asset): Json<SecurityAsset>,
) -> impl IntoResponse {
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    asset.id = id;

    let write_txn = state.db.begin_write().expect("Failed to begin write transaction");
    {
        let mut table = write_txn.open_table(SECURITY_ASSETS).expect("Failed to open security assets table");
        let serialized = serde_json::to_vec(&asset).unwrap();
        table.insert(id, serialized.as_slice()).expect("Failed to insert asset");
    }
    write_txn.commit().expect("Failed to commit transaction");

    (StatusCode::CREATED, Json(asset)).into_response()
}

async fn put_asset(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u64>,
    Json(mut asset): Json<SecurityAsset>,
) -> impl IntoResponse {
    asset.id = id;

    let write_txn = state.db.begin_write().expect("Failed to begin write transaction");
    {
        let mut table = write_txn.open_table(SECURITY_ASSETS).expect("Failed to open security assets table");
        let serialized = serde_json::to_vec(&asset).unwrap();
        table.insert(id, serialized.as_slice()).expect("Failed to update asset");
    }
    write_txn.commit().expect("Failed to commit transaction");

    StatusCode::OK
}

async fn delete_asset(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    let write_txn = state.db.begin_write().expect("Failed to begin write transaction");
    {
        let mut table = write_txn.open_table(SECURITY_ASSETS).expect("Failed to open security assets table");
        table.remove(id).expect("Failed to remove asset");
    }
    write_txn.commit().expect("Failed to commit transaction");

    StatusCode::NO_CONTENT
}

async fn calculate_route(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RouteRequest>,
) -> Json<RouteResponse> {

    let router = crate::router::Router::new(&state.graph_data);
    let mut full_path_ids = Vec::new();
    let mut total_cost = 0.0;

    for i in 0..payload.route_points.len() - 1 {
        let start_pt = payload.route_points[i];
        let end_pt = payload.route_points[i + 1];

        let start_node = find_nearest_node(&state.graph_data.nodes, start_pt[0], start_pt[1]);
        let end_node = find_nearest_node(&state.graph_data.nodes, end_pt[0], end_pt[1]);

        if let Some((leg_path, leg_cost)) = router.route(start_node, end_node, false, false) {
            if !leg_path.is_empty() {
                if !full_path_ids.is_empty() {
                    // Avoid duplicating the joint node
                    full_path_ids.extend(leg_path.into_iter().skip(1));
                } else {
                    full_path_ids.extend(leg_path);
                }
                total_cost += leg_cost;
            }
        }
    }

    let mut coords = Vec::new();
    let mut threat_intersected = false;

    // Convert payload polygons to geo::Polygon
    let geo_polygons: Vec<Polygon<f64>> = payload.threat_polygons.iter().map(|poly_coords| {
        let exterior_coords: Vec<Coord<f64>> = poly_coords[0].iter().map(|c| Coord { x: c[1], y: c[0] }).collect();
        let interiors: Vec<geo::LineString<f64>> = poly_coords.iter().skip(1).map(|ring| {
            ring.iter().map(|c| Coord { x: c[1], y: c[0] }).collect::<Vec<Coord<f64>>>().into()
        }).collect();
        Polygon::new(exterior_coords.into(), interiors)
    }).collect();

    if !full_path_ids.is_empty() {
        let read_txn = state.db.begin_read().expect("Failed to begin read transaction");
        let edge_geo_table = read_txn.open_table(crate::graph::EDGE_GEOMETRY).expect("Failed to open edge geometry table");

        // Add first node
        let first_node = &state.graph_data.nodes[full_path_ids[0]];
        let first_coord = vec![first_node.lon, first_node.lat];
        coords.push(first_coord.clone());

        // Check first node for threat
        let pt = Point::new(first_coord[0], first_coord[1]);
        for poly in &geo_polygons {
            if poly.intersects(&pt) {
                threat_intersected = true;
                break;
            }
        }

        for i in 0..full_path_ids.len() - 1 {
            let u = full_path_ids[i] as u64;
            let v = full_path_ids[i + 1] as u64;

            if let Ok(Some(geo_bytes)) = edge_geo_table.get((u, v)) {
                let points: Vec<[f64; 2]> = bincode::deserialize(geo_bytes.value().as_slice()).unwrap();
                for p in points {
                    let c = vec![p[1], p[0]]; // Swap to [lon, lat]
                    coords.push(c.clone());

                    if !threat_intersected {
                        let pt = Point::new(c[0], c[1]);
                        for poly in &geo_polygons {
                            if poly.intersects(&pt) {
                                threat_intersected = true;
                                break;
                            }
                        }
                    }
                }
            }

            let next_node = &state.graph_data.nodes[full_path_ids[i + 1]];
            let next_coord = vec![next_node.lon, next_node.lat];
            coords.push(next_coord.clone());

            if !threat_intersected {
                let pt = Point::new(next_coord[0], next_coord[1]);
                for poly in &geo_polygons {
                    if poly.intersects(&pt) {
                        threat_intersected = true;
                        break;
                    }
                }
            }
        }
    }

    // A real system would sum real physical distances. Here we just return an approximation.
    let distance_approx = total_cost * (40.0 * 1000.0 / 3600.0); // Assuming avg speed 40kmh

    let response = RouteResponse {
        geometry: RouteGeometry {
            geometry_type: "LineString".to_string(),
            coordinates: coords,
        },
        distance: distance_approx,
        time: total_cost,
        choke_points_avoided: 0,
        proximity_score: 0.0,
        eta_to_nearest_safe_haven: "N/A".to_string(),
        intersected_threats: vec![],
        threat_intersected,
    };

    Json(response)
}

fn find_nearest_node(nodes: &Vec<crate::graph::NodeInfo>, lat: f64, lon: f64) -> usize {
    let mut best_id = 0;
    let mut best_dist = f64::MAX;

    for n in nodes.iter() {
        let dist = (n.lat - lat).powi(2) + (n.lon - lon).powi(2);
        if dist < best_dist {
            best_dist = dist;
            best_id = n.id;
        }
    }

    best_id
}
