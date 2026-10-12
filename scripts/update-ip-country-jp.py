#!/usr/bin/env python3
"""Build a static Japanese IP range dataset from IPdeny (no runtime GeoIP API)."""
import datetime
import ipaddress
import json
import pathlib
import urllib.request

SOURCES = {
    "ipv4": "https://www.ipdeny.com/ipblocks/data/aggregated/jp-aggregated.zone",
    "ipv6": "https://www.ipdeny.com/ipv6/ipaddresses/aggregated/jp-aggregated.zone",
}
data = {"source": "IPdeny", "updated": datetime.datetime.now(datetime.timezone.utc).isoformat()}
for family, url in SOURCES.items():
    request = urllib.request.Request(url, headers={"User-Agent": "testCode-static-ip-country/1.0"})
    with urllib.request.urlopen(request, timeout=40) as response:
        body = response.read(2_000_000).decode("ascii")
    addresses = []
    for row in body.splitlines():
        row = row.strip()
        if not row or row.startswith("#"):
            continue
        network = ipaddress.ip_network(row, strict=False)
        if network.version != (4 if family == "ipv4" else 6):
            raise ValueError(f"Unexpected IP version in {family}")
        addresses.append(str(network))
    if len(addresses) < 100:
        raise ValueError(f"Suspiciously small Japanese {family} dataset ({len(addresses)} CIDRs)")
    data[family] = addresses

path = pathlib.Path("ip-country-jp.json")
path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
print(f"Wrote {path}: {len(data['ipv4'])} IPv4 and {len(data['ipv6'])} IPv6 CIDRs")
