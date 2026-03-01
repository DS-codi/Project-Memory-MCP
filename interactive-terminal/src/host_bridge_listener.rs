use std::io;
use std::net::{Shutdown, TcpListener, TcpStream};
use std::thread;

pub fn spawn(host_port: u16, runtime_port: u16) {
    if host_port == 0 || runtime_port == 0 {
        return;
    }

    thread::spawn(move || {
        let bind_addr = format!("0.0.0.0:{host_port}");
        let (listener, active_bind_addr) = match TcpListener::bind(&bind_addr) {
            Ok(listener) => (listener, bind_addr),
            Err(primary_error) => {
                let localhost_addr = format!("127.0.0.1:{host_port}");
                match TcpListener::bind(&localhost_addr) {
                    Ok(listener) => {
                        eprintln!(
                            "Host GUI bridge listener failed to bind on 0.0.0.0:{host_port}: {primary_error}; using {localhost_addr}"
                        );
                        (listener, localhost_addr)
                    }
                    Err(fallback_error) => {
                        eprintln!(
                            "Host GUI bridge listener failed to bind on 0.0.0.0:{host_port} ({primary_error}) and {localhost_addr} ({fallback_error})"
                        );
                        return;
                    }
                }
            }
        };

        eprintln!("Host GUI bridge listener active on {active_bind_addr} -> 127.0.0.1:{runtime_port}");

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    #[test]
    fn spawn_with_zero_host_port_returns_early() {
        // Should not panic or bind anything when host_port is 0.
        spawn(0, 9999);
        // Allow the (no-op) thread a moment to confirm no crash.
        thread::sleep(std::time::Duration::from_millis(50));
    }

    #[test]
    fn spawn_with_zero_runtime_port_returns_early() {
        // Should not panic or bind anything when runtime_port is 0.
        spawn(9999, 0);
        thread::sleep(std::time::Duration::from_millis(50));
    }

    #[test]
    fn spawn_binds_to_host_port() {
        // Bind a listener on an ephemeral port, then verify the bridge listener
        // occupies the requested host_port.
        let temp_listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let host_port = temp_listener.local_addr().unwrap().port();
        drop(temp_listener); // free the port

        // We need a runtime port that something listens on, so the proxy has
        // a target.  Use another ephemeral port for that.
        let runtime_listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let runtime_port = runtime_listener.local_addr().unwrap().port();

        spawn(host_port, runtime_port);
        // Give the thread time to bind.
        thread::sleep(std::time::Duration::from_millis(200));

        // Verify we can connect to host_port (meaning spawn bound it).
        let conn = TcpStream::connect(("127.0.0.1", host_port));
        assert!(
            conn.is_ok(),
            "Should be able to connect to host_port after spawn()"
        );

        drop(runtime_listener);
    }

    #[test]
    fn data_proxied_through_host_to_runtime() {
        // Set up a simple "runtime" TCP server on an ephemeral port that echoes
        // data back to the client.
        let runtime_listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let runtime_port = runtime_listener.local_addr().unwrap().port();

        // Echo server: accepts one connection, reads data, writes it back.
        let echo_handle = thread::spawn(move || {
            let (mut stream, _) = runtime_listener.accept().unwrap();
            let mut buf = [0u8; 256];
            let n = stream.read(&mut buf).unwrap();
            stream.write_all(&buf[..n]).unwrap();
            stream.shutdown(Shutdown::Write).unwrap();
        });

        // Free an ephemeral port for the host bridge listener.
        let temp_listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let host_port = temp_listener.local_addr().unwrap().port();
        drop(temp_listener);

        spawn(host_port, runtime_port);
        thread::sleep(std::time::Duration::from_millis(200));

        // Connect to host_port, send data, verify the echo comes back.
        let mut client = TcpStream::connect(("127.0.0.1", host_port)).unwrap();
        client
            .set_read_timeout(Some(std::time::Duration::from_secs(2)))
            .unwrap();

        let payload = b"hello from host bridge test\n";
        client.write_all(payload).unwrap();
        client.shutdown(Shutdown::Write).unwrap();

        let mut response = Vec::new();
        let _ = client.read_to_end(&mut response);
        assert_eq!(
            response, payload,
            "Data sent through host_port should be echoed back via runtime_port"
        );

        echo_handle.join().unwrap();
    }
}
