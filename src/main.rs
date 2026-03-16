pub mod graph;
pub mod builder;
pub mod router;
pub mod server;
pub mod cli;

use clap::Parser;
use cli::{Cli, Commands};
use mimalloc::MiMalloc;

// Overrides the default system allocator with Microsoft's lock-free allocator
// This prevents severe thread contention when parsing millions of OSM objects across all cores.
#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Build { pbf, out } => {
            if let Err(e) = builder::build_graph(&pbf, &out) {
                eprintln!("Failed to build graph: {}", e);
                std::process::exit(1);
            }
        }
        Commands::Serve { graph, tiles, bind } => {
            server::run_server(graph, tiles, bind).await;
        }
    }
}
