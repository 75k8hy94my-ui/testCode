import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class LocalStaticServer(ThreadingHTTPServer):
    # Browser workers load many static assets at once. The default backlog of
    # five in Python 3.12 can reset those connections on macOS.
    request_queue_size = 128


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Serve testCode on loopback.")
    parser.add_argument("port", nargs="?", type=int, default=4173)
    args = parser.parse_args()

    with LocalStaticServer(("127.0.0.1", args.port), SimpleHTTPRequestHandler) as server:
        print(f"Serving testCode at http://127.0.0.1:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
