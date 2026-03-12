#!/usr/bin/env python3
"""Mem0 REST API client for memory operations."""

import argparse
import json
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE_URL = "http://192.168.0.160:18000"


def request(method: str, path: str, data: dict | None = None) -> dict:
    """Make HTTP request to Mem0 API."""
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode() if data else None

    req = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        print(f"Error {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Connection error: {e.reason}", file=sys.stderr)
        sys.exit(1)


def add_memory(args):
    """Store a new memory."""
    data = {
        "messages": [{"role": "user", "content": args.content}],
    }
    if args.user_id:
        data["user_id"] = args.user_id
    if args.agent_id:
        data["agent_id"] = args.agent_id
    if args.run_id:
        data["run_id"] = args.run_id
    if args.metadata:
        data["metadata"] = json.loads(args.metadata)

    result = request("POST", "/memories", data)
    print(json.dumps(result, indent=2))


def search_memories(args):
    """Search for memories."""
    data = {"query": args.query}
    if args.user_id:
        data["user_id"] = args.user_id
    if args.agent_id:
        data["agent_id"] = args.agent_id
    if args.run_id:
        data["run_id"] = args.run_id

    result = request("POST", "/search", data)
    print(json.dumps(result, indent=2))


def list_memories(args):
    """List all memories."""
    params = []
    if args.user_id:
        params.append(f"user_id={args.user_id}")
    if args.agent_id:
        params.append(f"agent_id={args.agent_id}")
    if args.run_id:
        params.append(f"run_id={args.run_id}")

    path = "/memories"
    if params:
        path += "?" + "&".join(params)

    result = request("GET", path)
    print(json.dumps(result, indent=2))


def get_memory(args):
    """Get a specific memory."""
    result = request("GET", f"/memories/{args.memory_id}")
    print(json.dumps(result, indent=2))


def update_memory(args):
    """Update a memory."""
    data = json.loads(args.data)
    result = request("PUT", f"/memories/{args.memory_id}", data)
    print(json.dumps(result, indent=2))


def delete_memory(args):
    """Delete a specific memory."""
    result = request("DELETE", f"/memories/{args.memory_id}")
    print(json.dumps(result, indent=2))


def delete_all(args):
    """Delete all memories for identifier."""
    params = []
    if args.user_id:
        params.append(f"user_id={args.user_id}")
    if args.agent_id:
        params.append(f"agent_id={args.agent_id}")
    if args.run_id:
        params.append(f"run_id={args.run_id}")

    path = "/memories"
    if params:
        path += "?" + "&".join(params)

    result = request("DELETE", path)
    print(json.dumps(result, indent=2))


def history(args):
    """Get memory history."""
    result = request("GET", f"/memories/{args.memory_id}/history")
    print(json.dumps(result, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Mem0 memory client")
    subs = parser.add_subparsers(dest="command", required=True)

    p = subs.add_parser("add", help="Store memory")
    p.add_argument("--content", "-c", required=True, help="Memory content")
    p.add_argument("--user-id", "-u", help="User ID")
    p.add_argument("--agent-id", "-a", help="Agent ID")
    p.add_argument("--run-id", "-r", help="Run/session ID")
    p.add_argument("--metadata", "-m", help="JSON metadata")
    p.set_defaults(func=add_memory)

    p = subs.add_parser("search", help="Search memories")
    p.add_argument("--query", "-q", required=True, help="Search query")
    p.add_argument("--user-id", "-u", help="User ID")
    p.add_argument("--agent-id", "-a", help="Agent ID")
    p.add_argument("--run-id", "-r", help="Run/session ID")
    p.set_defaults(func=search_memories)

    p = subs.add_parser("list", help="List memories")
    p.add_argument("--user-id", "-u", help="User ID")
    p.add_argument("--agent-id", "-a", help="Agent ID")
    p.add_argument("--run-id", "-r", help="Run/session ID")
    p.set_defaults(func=list_memories)

    p = subs.add_parser("get", help="Get memory")
    p.add_argument("memory_id", help="Memory ID")
    p.set_defaults(func=get_memory)

    p = subs.add_parser("update", help="Update memory")
    p.add_argument("memory_id", help="Memory ID")
    p.add_argument("--data", "-d", required=True, help="JSON update data")
    p.set_defaults(func=update_memory)

    p = subs.add_parser("delete", help="Delete memory")
    p.add_argument("memory_id", help="Memory ID")
    p.set_defaults(func=delete_memory)

    p = subs.add_parser("delete-all", help="Delete all memories")
    p.add_argument("--user-id", "-u", help="User ID")
    p.add_argument("--agent-id", "-a", help="Agent ID")
    p.add_argument("--run-id", "-r", help="Run/session ID")
    p.set_defaults(func=delete_all)

    p = subs.add_parser("history", help="Get memory history")
    p.add_argument("memory_id", help="Memory ID")
    p.set_defaults(func=history)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
