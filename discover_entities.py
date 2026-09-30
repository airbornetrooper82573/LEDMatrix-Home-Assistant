#!/usr/bin/env python3
"""Discover Home Assistant entities for the LEDMatrix configuration UI."""

import json
import os
import ssl
import sys
import urllib.request
from pathlib import Path


def fail(message):
    print(json.dumps({"ok": False, "error": str(message), "entities": []}))
    return 0


def main():
    try:
        raw = sys.stdin.read().strip()
        params = json.loads(raw) if raw else {}
    except Exception as exc:
        return fail(f"Invalid request: {exc}")

    if not params.get("ha_url") or not params.get("ha_token"):
        try:
            root = Path(os.environ.get("LEDMATRIX_ROOT", "."))
            with open(root / "config" / "config.json", "r", encoding="utf-8") as handle:
                saved = json.load(handle).get("home-assistant", {})
            params = {**saved, **params}
        except Exception:
            pass

    ha_url = str(params.get("ha_url") or "").rstrip("/")
    token = str(params.get("ha_token") or "")
    query = str(params.get("query") or "").strip().lower()
    domain = str(params.get("domain") or "").strip().lower()
    mode = str(params.get("mode") or "discover").strip().lower()
    verify_ssl = bool(params.get("verify_ssl", True))

    if not ha_url.startswith(("http://", "https://")):
        return fail("Enter a valid Home Assistant URL first.")
    if not token:
        return fail("Enter a Home Assistant Long-Lived Access Token first.")

    endpoint = "/api/" if mode == "validate" else "/api/states"
    req = urllib.request.Request(
        f"{ha_url}{endpoint}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "LEDMatrix-Home-Assistant-Entity-Discovery/1.4.0",
        },
    )
    context = None if verify_ssl else ssl._create_unverified_context()

    try:
        with urllib.request.urlopen(req, timeout=10, context=context) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        return fail(f"Home Assistant connection failed: {exc}")

    if mode == "validate":
        message = "Home Assistant API authenticated successfully."
        if isinstance(payload, dict) and payload.get("message"):
            message = str(payload.get("message"))
        print(json.dumps({"ok": True, "message": message, "entities": []}))
        return 0

    states = payload
    if not isinstance(states, list):
        return fail("Home Assistant returned an unexpected response.")

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
    print(json.dumps({"ok": True, "count": len(results), "entities": results[:250]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
