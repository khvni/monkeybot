mod cua;
mod safety;
mod socket;
mod types;

use socket::SocketServer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("cua_driver=info".parse()?),
        )
        .init();

    let socket_path = std::env::var("CUA_SOCKET_PATH").ok();
    let server = SocketServer::new(socket_path.as_deref());

    tracing::info!("Starting monkeybot CUA driver daemon");
    server.run().await
}
