use axum::{
    extract::{State, Json},
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::services::ServeFile;
use crate::graph::{GraphData, SecurityAsset};

#[derive(RustEmbed)]
#[folder = "src/main/resources/static/"]
struct Asset;

pub struct AppState {
    pub graph_data: GraphData,
}

#[derive(Deserialize)]
pub struct RouteRequest {
    #[serde(rename = "startLat")]
    pub start_lat: f64,
    #[serde(rename = "startLon")]
    pub start_lon: f64,
    #[serde(rename = "endLat")]
    pub end_lat: f64,
    #[serde(rename = "endLon")]
    pub end_lon: f64,
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

    let state = Arc::new(AppState {
        graph_data,
    });

    // ServeFile correctly implements HTTP Range requests natively which map.pmtiles requires.
    let serve_pmtiles = ServeFile::new(pmtiles_path);

    let app = Router::new()
        .route("/", get(index_handler))
        .route("/api/security-assets", get(get_assets))
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
    Json(state.graph_data.security_assets.clone())
}

async fn calculate_route(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RouteRequest>,
) -> Json<RouteResponse> {

    let router = crate::router::Router::new(&state.graph_data);

    let start_node = find_nearest_node(&state.graph_data.nodes, payload.start_lat, payload.start_lon);
    let end_node = find_nearest_node(&state.graph_data.nodes, payload.end_lat, payload.end_lon);

    let (path_ids, cost) = router.route(start_node, end_node, false, false).unwrap_or((vec![], 0.0));

    let mut coords = Vec::new();

    for i in 0..path_ids.len() {
        let n = &state.graph_data.nodes[path_ids[i]];
        coords.push(vec![n.lon, n.lat]);
    }

    // A real system would sum real physical distances. Here we just return an approximation.
    let distance_approx = cost * (40.0 * 1000.0 / 3600.0); // Assuming avg speed 40kmh

    let response = RouteResponse {
        geometry: RouteGeometry {
            geometry_type: "LineString".to_string(),
            coordinates: coords,
        },
        distance: distance_approx,
        time: cost,
        choke_points_avoided: 0,
        proximity_score: 0.0,
        eta_to_nearest_safe_haven: "N/A".to_string(),
        intersected_threats: vec![],
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
