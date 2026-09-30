#!/usr/bin/env python3
"""Discover Home Assistant entities for the LEDMatrix configuration UI."""

import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path


def emit(payload, interactive=True, success=True):
    print(json.dumps(payload))
    return 0 if (success or interactive) else 1


def fail(message, interactive=True, **extra):
    payload = {"ok": False, "error": str(message), "entities": []}
    payload.update(extra)
    return emit(payload, interactive=interactive, success=False)


def main():
    try:
        raw = sys.stdin.read().strip()
        params = json.loads(raw) if raw else {}
        interactive_request = bool(params)
    except Exception as exc:
        interactive_request = False
        return fail(f"Invalid request: {exc}")

    if not params.get("ha_url") or not params.get("ha_token"):
        try:
            root = Path(os.environ.get("LEDMATRIX_ROOT", "."))
            with open(root / "config" / "config.json", "r", encoding="utf-8") as handle:
                saved = json.load(handle).get("home-assistant", {})
            params = {**saved, **params}
        except Exception:
            pass

    raw_ha_url = str(params.get("ha_url") or "")
    raw_token = str(params.get("ha_token") or "")
    ha_url = raw_ha_url.strip().rstrip("/")
    token = raw_token.strip()
    token_whitespace_removed = raw_token != token
    query = str(params.get("query") or "").strip().lower()
    domain = str(params.get("domain") or "").strip().lower()
    mode = str(params.get("mode") or "validate").strip().lower()
    verify_ssl = bool(params.get("verify_ssl", True))

    if not ha_url.startswith(("http://", "https://")):
        return fail("Enter a valid Home Assistant URL first.", interactive_request)
    if not token:
        return fail("Enter a Home Assistant Long-Lived Access Token first.", interactive_request)

    endpoint = "/api/" if mode == "validate" else "/api/states"
    request_url = f"{ha_url}{endpoint}"
    req = urllib.request.Request(
        request_url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "LEDMatrix-Home-Assistant-Entity-Discovery/1.4.0",
        },
    )
    context = None if verify_ssl else ssl._create_unverified_context()

    try:
        with urllib.request.urlopen(req, timeout=10, context=context) as response:
            status_code = int(getattr(response, "status", 200) or 200)
            response_text = response.read().decode("utf-8", errors="replace")
            payload = json.loads(response_text)
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return fail("Home Assistant rejected the token (401 Unauthorized). Create or verify the Long-Lived Access Token.", interactive_request, endpoint=request_url, http_status=401, token_length=len(token), token_whitespace_removed=token_whitespace_removed)
        if exc.code == 403:
            return fail("Home Assistant denied access (403 Forbidden). Check the token permissions.", interactive_request, endpoint=request_url, http_status=403)
        return fail(f"Home Assistant returned HTTP {exc.code}: {exc.reason}", interactive_request, endpoint=request_url, http_status=exc.code)
    except urllib.error.URLError as exc:
        reason = str(getattr(exc, "reason", exc))
        if "CERTIFICATE_VERIFY_FAILED" in reason or "certificate verify failed" in reason.lower():
            return fail("SSL certificate validation failed. Fix the certificate or disable Verify SSL for a trusted local Home Assistant instance.", interactive_request, endpoint=request_url)
        return fail(f"Home Assistant URL is not reachable: {reason}", interactive_request, endpoint=request_url)
    except TimeoutError:
        return fail("Timed out connecting to Home Assistant. Check the URL and network path.", interactive_request, endpoint=request_url)
    except Exception as exc:
        return fail(f"Home Assistant connection failed: {exc}", interactive_request, endpoint=request_url)

    if mode == "validate":
        message = "Home Assistant API authenticated successfully."
        if isinstance(payload, dict) and payload.get("message"):
            message = str(payload.get("message"))
        return emit({
            "ok": True,
            "message": message,
            "entities": [],
            "endpoint": request_url,
            "http_status": status_code,
            "token_length": len(token),
            "token_whitespace_removed": token_whitespace_removed,
        })

    states = payload
    if not isinstance(states, list):
        return fail("Home Assistant returned an unexpected response.", interactive_request)

    results = []
    for item in states:
        if not isinstance(item, dict):
            continue
        entity_id = str(item.get("entity_id") or "")
        if "." not in entity_id:
            continue
        entity_domain = entity_id.split(".", 1)[0].lower()
        if domain and domain != "all" and entity_domain != domain:
            continue

        attrs = item.get("attributes") or {}
        friendly_name = str(attrs.get("friendly_name") or entity_id)
        state = str(item.get("state") or "")
        device_class = str(attrs.get("device_class") or "")
        unit = str(attrs.get("unit_of_measurement") or "")

        haystack = " ".join(
            [entity_id, friendly_name, state, device_class, unit, entity_domain]
        ).lower()
        if query and query not in haystack:
            continue

        results.append(
            {
                "entity_id": entity_id,
                "friendly_name": friendly_name,
                "domain": entity_domain,
                "state": state,
                "device_class": device_class,
                "unit": unit,
            }
        )

    results.sort(key=lambda x: (x["domain"], x["friendly_name"].lower(), x["entity_id"]))
    return emit({
        "ok": True,
        "count": len(results),
        "entities": results[:250],
        "endpoint": request_url,
        "http_status": status_code,
    })


if __name__ == "__main__":
    raise SystemExit(main())
