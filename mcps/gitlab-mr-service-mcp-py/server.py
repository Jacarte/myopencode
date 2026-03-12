import atexit
import json
import os
import subprocess
import time
from collections.abc import Mapping
from typing import Any
import urllib.error
import urllib.parse
import urllib.request

from mcp.server.fastmcp import FastMCP


SERVICE_PORT = os.getenv("SERVICE_PORT", "8080")
BASE_URL = f"http://127.0.0.1:{SERVICE_PORT}"


def _require_env() -> None:
    token = os.getenv("GITLAB_TOKEN", "").strip()
    if not token:
        raise RuntimeError("GITLAB_TOKEN is required")


def _start_service() -> subprocess.Popen[bytes]:
    env = dict(os.environ)
    env["SERVER_PORT"] = SERVICE_PORT
    proc = subprocess.Popen(
        ["/usr/local/bin/gitlab-mr-service"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return proc


def _wait_for_health(timeout_seconds: float = 15.0) -> None:
    start = time.time()
    while (time.time() - start) < timeout_seconds:
        try:
            req = urllib.request.Request(f"{BASE_URL}/health", method="GET")
            with urllib.request.urlopen(req, timeout=2.0) as res:
                if res.status == 200:
                    return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError("gitlab-mr-service did not become healthy in time")


def _service_call(
    method: str,
    path: str,
    query: Mapping[str, object | None] | None = None,
    body: Mapping[str, object | None] | None = None,
) -> Any:
    url = f"{BASE_URL}{path}"
    if query:
        clean_query = {k: v for k, v in query.items() if v is not None and v != ""}
        if clean_query:
            url = f"{url}?{urllib.parse.urlencode(clean_query)}"

    data = None
    headers: dict[str, str] = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, method=method, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=30.0) as res:
            payload = res.read().decode("utf-8")
            if not payload:
                return None
            try:
                return json.loads(payload)
            except json.JSONDecodeError:
                return payload
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code}: {detail}")


def _result(data: Any) -> str:
    if isinstance(data, str):
        return data
    return json.dumps(data, indent=2)


_require_env()
service_proc = _start_service()


def _cleanup() -> None:
    if service_proc.poll() is None:
        service_proc.terminate()
        try:
            service_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            service_proc.kill()


_ = atexit.register(_cleanup)
_wait_for_health()

mcp = FastMCP("gitlab-mr-service-mcp-py")


@mcp.tool()
def mr_list(
    project_id: str,
    state: str = "",
    order_by: str = "",
    sort: str = "",
    source_branch: str = "",
    target_branch: str = "",
    per_page: int = 0,
    page: int = 0,
) -> str:
    result = _service_call(
        "GET",
        f"/projects/{urllib.parse.quote(project_id, safe='')}/merge_requests",
        query={
            "state": state,
            "order_by": order_by,
            "sort": sort,
            "source_branch": source_branch,
            "target_branch": target_branch,
            "per_page": per_page if per_page > 0 else None,
            "page": page if page > 0 else None,
        },
    )
    return _result(result)


@mcp.tool()
def mr_get(project_id: str, mr_iid: int) -> str:
    result = _service_call(
        "GET",
        f"/projects/{urllib.parse.quote(project_id, safe='')}/merge_requests/{mr_iid}",
    )
    return _result(result)


@mcp.tool()
def mr_create(
    project_id: str,
    source_branch: str,
    target_branch: str,
    title: str,
    description: str = "",
    assignee_id: int = 0,
    target_project_id: int = 0,
    remove_source_branch: bool = False,
    squash: bool = False,
) -> str:
    body = {
        "source_branch": source_branch,
        "target_branch": target_branch,
        "title": title,
        "description": description,
        "assignee_id": assignee_id if assignee_id > 0 else None,
        "target_project_id": target_project_id if target_project_id > 0 else None,
        "remove_source_branch": remove_source_branch,
        "squash": squash,
    }
    result = _service_call(
        "POST",
        f"/projects/{urllib.parse.quote(project_id, safe='')}/merge_requests",
        body=body,
    )
    return _result(result)


@mcp.tool()
def mr_add_note(project_id: str, mr_iid: int, body: str) -> str:
    result = _service_call(
        "POST",
        f"/projects/{urllib.parse.quote(project_id, safe='')}/merge_requests/{mr_iid}/notes",
        body={"body": body},
    )
    return _result(result)


@mcp.tool()
def mr_get_diffs(project_id: str, mr_iid: int, include_changes: bool = False) -> str:
    result = _service_call(
        "GET",
        f"/projects/{urllib.parse.quote(project_id, safe='')}/merge_requests/{mr_iid}/diffs",
        query={"include_changes": str(include_changes).lower()},
    )
    return _result(result)


@mcp.tool()
def mr_get_jobs(project_id: str, mr_iid: int) -> str:
    result = _service_call(
        "GET",
        f"/projects/{urllib.parse.quote(project_id, safe='')}/merge_requests/{mr_iid}/jobs",
    )
    return _result(result)


@mcp.tool()
def pipeline_get_jobs(project_id: str, pipeline_id: int) -> str:
    result = _service_call(
        "GET",
        f"/projects/{urllib.parse.quote(project_id, safe='')}/pipelines/{pipeline_id}/jobs",
    )
    return _result(result)


@mcp.tool()
def mr_get_discussions(project_id: str, mr_iid: int) -> str:
    result = _service_call(
        "GET",
        f"/projects/{urllib.parse.quote(project_id, safe='')}/merge_requests/{mr_iid}/discussions",
    )
    return _result(result)


@mcp.tool()
def mr_get_participants(project_id: str, mr_iid: int) -> str:
    result = _service_call(
        "GET",
        f"/projects/{urllib.parse.quote(project_id, safe='')}/merge_requests/{mr_iid}/participants",
    )
    return _result(result)


if __name__ == "__main__":
    mcp.run(transport="stdio")
