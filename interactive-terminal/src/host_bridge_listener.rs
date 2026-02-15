use std::io;
use std::net::{Shutdown, TcpListener, TcpStream};
use std::thread;

pub fn spawn(host_port: u16, runtime_port: u16) {
    if host_port == 0 || runtime_port == 0 {
        return;
    }

    thread::spawn(move || {
        let bind_addr = format!("0.0.0.0:{host_port}");
        let listener = match TcpListener::bind(&bind_addr) {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!(
                    "Host GUI bridge listener failed to bind on {bind_addr}: {error}"
                );
                return;
            }
        };

        eprintln!(
            "Host GUI bridge listener active on {bind_addr} -> 127.0.0.1:{runtime_port}"
        );

        for incoming in listener.incoming() {
            let Ok(client_stream) = incoming else {
                continue;
            };

            thread::spawn(move || {
                if let Err(error) = proxy_client(client_stream, runtime_port) {
                    eprintln!("Host GUI bridge proxy error: {error}");
                }
            });
        }
    });
}

fn proxy_client(client_stream: TcpStream, runtime_port: u16) -> io::Result<()> {
    let runtime_stream = TcpStream::connect(("127.0.0.1", runtime_port))?;

    let mut client_reader = client_stream.try_clone()?;
    let mut client_writer = client_stream;
    let mut runtime_reader = runtime_stream.try_clone()?;
    let mut runtime_writer = runtime_stream;

    let to_runtime = thread::spawn(move || {
        let _ = io::copy(&mut client_reader, &mut runtime_writer);
        let _ = runtime_writer.shutdown(Shutdown::Write);
    });

    let to_client = thread::spawn(move || {
        let _ = io::copy(&mut runtime_reader, &mut client_writer);
        let _ = client_writer.shutdown(Shutdown::Write);
    });

    let _ = to_runtime.join();
    let _ = to_client.join();
    Ok(())
}
