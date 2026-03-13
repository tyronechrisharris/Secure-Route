use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Build the routing graph from an OSM PBF file
    Build {
        #[arg(short, long)]
        pbf: String,
        #[arg(short, long)]
        out: String,
    },
    /// Serve the web UI and API
    Serve {
        #[arg(short, long)]
        graph: String,
        #[arg(short, long, default_value = "map.pmtiles")]
        tiles: String,
        #[arg(short, long, default_value = "0.0.0.0:8080")]
        bind: String,
    },
}
