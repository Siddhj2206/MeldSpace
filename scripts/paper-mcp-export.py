#!/usr/bin/env python3
"""Minimal Streamable-HTTP MCP client for the local Paper Desktop server.

Used to pull `get_jsx` exports straight to files so large design payloads never
travel through an agent's context. Each `export` is still one gated Paper request.

Usage:
  python3 paper_mcp.py list
  python3 paper_mcp.py export <nodeId> <outfile> [tailwind|inline-styles]
"""
import json
import sys
import urllib.request

BASE = "http://127.0.0.1:29979/mcp"


def _post(payload, session=None, timeout=300):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(BASE, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json, text/event-stream")
    if session:
        req.add_header("Mcp-Session-Id", session)
    resp = urllib.request.urlopen(req, timeout=timeout)
    return resp.headers.get("Mcp-Session-Id"), resp.read().decode()


def _events(body):
    out = []
    for line in body.splitlines():
        if line.startswith("data:"):
            chunk = line[5:].strip()
            if chunk:
                out.append(json.loads(chunk))
    return out


def _session():
    sid, _ = _post({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "paper-export", "version": "0.1"},
        },
    })
    if not sid:
        raise SystemExit("initialize returned no Mcp-Session-Id")
    _post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
    return sid


def call_tool(name, args):
    sid = _session()
    _, body = _post({
        "jsonrpc": "2.0", "id": 2, "method": "tools/call",
        "params": {"name": name, "arguments": args},
    }, sid)
    for msg in _events(body):
        if msg.get("id") != 2:
            continue
        if "error" in msg:
            raise SystemExit("tool error: " + json.dumps(msg["error"]))
        res = msg["result"]
        if res.get("isError"):
            raise SystemExit("tool isError: " + json.dumps(res))
        if "structuredContent" in res:
            return res["structuredContent"]
        text = "\n".join(
            c.get("text", "") for c in res.get("content", []) if c.get("type") == "text"
        )
        try:
            return json.loads(text)
        except Exception:
            return text
    raise SystemExit("no result for tools/call in response")


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd = sys.argv[1]

    if cmd == "list":
        sid = _session()
        _, body = _post({
            "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {},
        }, sid)
        for msg in _events(body):
            if msg.get("id") == 2:
                for t in msg["result"]["tools"]:
                    print(t["name"])
        return

    if cmd == "export":
        node, out = sys.argv[2], sys.argv[3]
        fmt = sys.argv[4] if len(sys.argv) > 4 else "tailwind"
        data = call_tool("get_jsx", {"nodeId": node, "format": fmt})
        jsx = data.get("jsx") if isinstance(data, dict) else data
        if not isinstance(jsx, str) or not jsx.strip():
            raise SystemExit("get_jsx returned no jsx string: " + repr(data)[:500])
        with open(out, "w") as f:
            f.write(jsx.rstrip() + "\n")
        print(f"{out}: {len(jsx)} chars ({fmt})")
        return

    raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
