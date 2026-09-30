"""Home Assistant display plugin for ChuckBuilds LEDMatrix."""

from __future__ import annotations

import fnmatch
import json
import queue
import ssl
import threading
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image, ImageDraw, ImageFont
from src.plugin_system.base_plugin import BasePlugin

try:
    import websocket
except Exception:
    websocket = None


@dataclass
class DisplayItem:
    kind: str
    heading: str
    title: str
    subtitle: str = ""
    source: str = ""
    duration: float = 0.0
    priority: bool = False
    heading_color: Any = None
    title_color: Any = None
    subtitle_color: Any = None
    enable_scroll: Optional[bool] = None
    scroll_speed: Optional[float] = None
    scroll_pause: Optional[float] = None
    scroll_gap: Optional[int] = None
    created_at: float = field(default_factory=time.time)


class SafeFormatDict(dict):
    def __missing__(self, key):
        return "{" + key + "}"


class HomeAssistantPlugin(BasePlugin):
    def __init__(self, plugin_id, config, display_manager, cache_manager, plugin_manager):
        super().__init__(plugin_id, config, display_manager, cache_manager, plugin_manager)

        self.ha_url = str(config.get("ha_url", "")).rstrip("/")
        self.ha_token = str(config.get("ha_token", ""))
        self.verify_ssl = bool(config.get("verify_ssl", True))
        self.request_timeout = max(1.0, float(config.get("request_timeout", 8)))

        self.entity_cards = list(config.get("entities", []))
        self.calendar_cards = list(config.get("calendars", []))
        self.event_rules = list(config.get("event_notifications", []))

        self.show_entities = bool(config.get("show_entities", True))
        self.show_calendars = bool(config.get("show_calendars", True))
        self.enable_realtime_events = bool(config.get("enable_realtime_events", True))
        self.notification_priority = bool(
            config.get("notification_priority", config.get("live_priority", True))
        )

        self.notification_duration = max(1.0, float(config.get("notification_duration", 10)))
        self.notification_queue_size = max(1, int(config.get("notification_queue_size", 20)))
        self.default_cooldown = max(0.0, float(config.get("notification_cooldown", 15)))
        self.max_calendar_events = max(1, int(config.get("max_calendar_events", 10)))

        self.display_layout = str(config.get("layout", "auto"))
        self.show_heading = bool(config.get("show_heading", True))
        self.title_font_size = max(6, int(config.get("title_font_size", 11)))
        self.subtitle_font_size = max(5, int(config.get("subtitle_font_size", 7)))
        self.heading_font_size = max(5, int(config.get("heading_font_size", 6)))
        self.row_gap = max(0, int(config.get("row_gap", 1)))

        self.enable_scroll = bool(config.get("enable_scroll", True))
        self.scroll_speed = max(1.0, float(config.get("scroll_speed", 14)))
        self.scroll_pause = max(0.0, float(config.get("scroll_pause", 1.25)))
        self.scroll_gap = max(8, int(config.get("scroll_gap", 28)))
        self.scroll_trigger_ratio = min(
            1.0, max(0.4, float(config.get("scroll_trigger_ratio", 0.85)))
        )

        self.entity_heading_color = config.get("entity_heading_color", [120, 220, 130])
        self.entity_title_color = config.get("entity_title_color", [255, 255, 255])
        self.entity_subtitle_color = config.get("entity_subtitle_color", [180, 180, 180])
        self.calendar_heading_color = config.get("calendar_heading_color", [90, 190, 255])
        self.calendar_title_color = config.get("calendar_title_color", [255, 255, 255])
        self.calendar_subtitle_color = config.get("calendar_subtitle_color", [180, 180, 180])
        self.notification_heading_color = config.get("notification_heading_color", [255, 90, 70])
        self.notification_title_color = config.get("notification_title_color", [255, 255, 255])
        self.notification_subtitle_color = config.get("notification_subtitle_color", [220, 220, 220])

        self.W = int(display_manager.width)
        self.H = int(display_manager.height)
        self._font_heading = self._load_font(self.heading_font_size)
        self._font_title = self._load_font(self.title_font_size)
        self._font_subtitle = self._load_font(self.subtitle_font_size)

        self._rotation_items: List[DisplayItem] = []
        self._rotation_index = 0
        self.current_item: Optional[DisplayItem] = None
        self.last_update = 0.0
        self.last_error = ""

        self._priority_queue: "queue.Queue[DisplayItem]" = queue.Queue(
            maxsize=self.notification_queue_size
        )
        self._normal_queue: "queue.Queue[DisplayItem]" = queue.Queue(
            maxsize=self.notification_queue_size
        )
        self._active_notification: Optional[DisplayItem] = None
        self._notification_expires = 0.0
        self._rule_last_fired: Dict[str, float] = {}

        self._ws_thread: Optional[threading.Thread] = None
        self._ws_stop = threading.Event()
        self._ws_connected = False
        self._ws_last_error = ""

        if self.enable_realtime_events:
            self._start_websocket_thread()

        self.logger.info(
            "Home Assistant initialized for %dx%d; entities=%d calendars=%d rules=%d",
            self.W, self.H, len(self.entity_cards), len(self.calendar_cards), len(self.event_rules)
        )

    def _load_font(self, size: int):
        for path in (
            Path("assets/fonts/PressStart2P-Regular.ttf"),
            Path("/home/ledpi/LEDMatrix/assets/fonts/PressStart2P-Regular.ttf"),
        ):
            if path.exists():
                try:
                    return ImageFont.truetype(str(path), size)
                except Exception:
                    pass
        return ImageFont.load_default()

    def _ssl_context(self):
        return None if self.verify_ssl else ssl._create_unverified_context()

    def _api_json(self, path: str):
        if not self.ha_url or not self.ha_token:
            self.last_error = "Configure ha_url and ha_token"
            return None
        req = urllib.request.Request(
            f"{self.ha_url}{path}",
            headers={
                "Authorization": f"Bearer {self.ha_token}",
                "Content-Type": "application/json",
                "User-Agent": "LEDMatrix-Home-Assistant/1.2.0",
            },
        )
        try:
            with urllib.request.urlopen(
                req, timeout=self.request_timeout, context=self._ssl_context()
            ) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            self.last_error = str(exc)
            self.logger.warning("Home Assistant request failed for %s: %s", path, exc)
            return None

    @staticmethod
    def _state_context(entity: Dict[str, Any], old_state: str = "") -> Dict[str, Any]:
        attrs = entity.get("attributes") or {}
        entity_id = str(entity.get("entity_id", ""))
        ctx = {
            "entity_id": entity_id,
            "state": str(entity.get("state", "")),
            "old_state": old_state,
            "friendly_name": attrs.get("friendly_name") or entity_id,
            "unit": attrs.get("unit_of_measurement") or "",
        }
        for key, value in attrs.items():
            ctx[f"attr_{key}"] = value
        return ctx

    @staticmethod
    def _format_template(template: str, context: Dict[str, Any]) -> str:
        try:
            return str(template).format_map(SafeFormatDict(context)).strip()
        except Exception:
            return str(template).strip()

    @staticmethod
    def _friendly_state_value(entity_id: str, state: Any, attrs: Dict[str, Any]) -> str:
        """Turn common HA machine states into concise display-friendly text."""
        raw = str(state if state is not None else "")
        domain = entity_id.split(".", 1)[0] if "." in entity_id else ""
        device_class = str((attrs or {}).get("device_class") or "").lower()
        lowered = raw.lower()

        if domain == "binary_sensor":
            pairs = {
                "door": ("Closed", "Open"),
                "garage_door": ("Closed", "Open"),
                "window": ("Closed", "Open"),
                "opening": ("Closed", "Open"),
                "lock": ("Locked", "Unlocked"),
                "motion": ("Clear", "Motion"),
                "occupancy": ("Clear", "Detected"),
                "presence": ("Away", "Present"),
                "moving": ("Stopped", "Moving"),
                "moisture": ("Dry", "Wet"),
                "smoke": ("Clear", "Smoke"),
                "gas": ("Clear", "Detected"),
                "carbon_monoxide": ("Clear", "Detected"),
                "problem": ("OK", "Problem"),
                "safety": ("Safe", "Unsafe"),
                "tamper": ("Clear", "Tampered"),
                "vibration": ("Clear", "Detected"),
                "sound": ("Quiet", "Detected"),
                "connectivity": ("Disconnected", "Connected"),
                "plug": ("Unplugged", "Plugged In"),
                "power": ("Off", "On"),
                "running": ("Stopped", "Running"),
                "battery": ("Normal", "Low"),
                "battery_charging": ("Not Charging", "Charging"),
            }
            if lowered in ("off", "on") and device_class in pairs:
                return pairs[device_class][1 if lowered == "on" else 0]
            if lowered == "on":
                return "On"
            if lowered == "off":
                return "Off"

        if domain == "cover":
            return {
                "open": "Open", "closed": "Closed", "opening": "Opening",
                "closing": "Closing", "unknown": "Unknown", "unavailable": "Unavailable"
            }.get(lowered, raw.replace("_", " ").title())

        if domain == "lock":
            return {
                "locked": "Locked", "unlocked": "Unlocked", "locking": "Locking",
                "unlocking": "Unlocking", "jammed": "Jammed"
            }.get(lowered, raw.replace("_", " ").title())

        if domain in ("person", "device_tracker"):
            return {"home": "Home", "not_home": "Away"}.get(
                lowered, raw.replace("_", " ").title()
            )

        if domain in ("switch", "light", "input_boolean"):
            return {"on": "On", "off": "Off"}.get(lowered, raw.replace("_", " ").title())

        return raw.replace("_", " ").title() if raw.islower() and "_" in raw else raw

    def _style_kwargs(self, cfg: Dict[str, Any], kind: str) -> Dict[str, Any]:
        defaults = {
            "entity": (
                self.entity_heading_color, self.entity_title_color, self.entity_subtitle_color
            ),
            "calendar": (
                self.calendar_heading_color, self.calendar_title_color,
                self.calendar_subtitle_color
            ),
            "notification": (
                self.notification_heading_color, self.notification_title_color,
                self.notification_subtitle_color
            ),
        }[kind]
        return {
            "heading_color": cfg.get("heading_color", defaults[0]),
            "title_color": cfg.get("title_color", defaults[1]),
            "subtitle_color": cfg.get("subtitle_color", defaults[2]),
            "enable_scroll": cfg.get("enable_scroll"),
            "scroll_speed": cfg.get("scroll_speed"),
            "scroll_pause": cfg.get("scroll_pause"),
            "scroll_gap": cfg.get("scroll_gap"),
        }

    def _entity_item(self, cfg: Dict[str, Any]) -> Optional[DisplayItem]:
        entity_id = str(cfg.get("entity_id", "")).strip()
        if not entity_id:
            return None
        entity = self._api_json(f"/api/states/{urllib.parse.quote(entity_id, safe='.')}")
        if not isinstance(entity, dict):
            return None

        attrs = entity.get("attributes") or {}
        ctx = self._state_context(entity)
        label = str(cfg.get("label") or attrs.get("friendly_name") or entity_id)
        attribute = str(cfg.get("attribute", "")).strip()
        raw_value = attrs.get(attribute) if attribute else entity.get("state", "")
        if raw_value is None:
            raw_value = ""

        state_map = cfg.get("state_map") or {}
        if attribute:
            value = str(state_map.get(str(raw_value), raw_value))
        else:
            mapped = state_map.get(str(raw_value))
            value = str(mapped if mapped is not None else self._friendly_state_value(
                entity_id, raw_value, attrs
            ))
        unit = str(cfg.get("unit", ctx.get("unit", "")) or "")
        ctx.update({"value": value, "unit": unit, "label": label})

        heading = self._format_template(str(cfg.get("title_template", "{label}")), ctx)
        title = self._format_template(str(cfg.get("value_template", "{value}{unit}")), ctx)
        subtitle_template = str(cfg.get("subtitle_template", ""))
        subtitle = self._format_template(subtitle_template, ctx) if subtitle_template else ""

        return DisplayItem(
            kind="entity", heading=heading or "HOME ASSISTANT", title=title or value,
            subtitle=subtitle, source=entity_id, **self._style_kwargs(cfg, "entity")
        )

    @staticmethod
    def _event_time_value(event: Dict[str, Any], key: str) -> str:
        value = event.get(key)
        if isinstance(value, dict):
            return str(value.get("dateTime") or value.get("date") or "")
        return str(value or "")

    @staticmethod
    def _parse_event_time(value: str) -> Optional[datetime]:
        if not value:
            return None
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone()
        except Exception:
            return None

    def _calendar_items(self, cfg: Dict[str, Any]) -> List[DisplayItem]:
        entity_id = str(cfg.get("entity_id", "")).strip()
        if not entity_id:
            return []
        days_ahead = max(1, int(cfg.get("days_ahead", 7)))
        limit = max(1, int(cfg.get("max_events", self.max_calendar_events)))
        now = datetime.now(timezone.utc)
        query = urllib.parse.urlencode(
            {"start": now.isoformat(), "end": (now + timedelta(days=days_ahead)).isoformat()}
        )
        path = f"/api/calendars/{urllib.parse.quote(entity_id, safe='.')}?{query}"
        events = self._api_json(path)
        if not isinstance(events, list):
            return []

        result = []
        local_now = datetime.now().astimezone()
        for event in events[:limit]:
            if not isinstance(event, dict):
                continue
            summary = str(event.get("summary") or event.get("message") or "Calendar Event")
            start_raw = self._event_time_value(event, "start")
            start = self._parse_event_time(start_raw)
            if start:
                if start.date() == local_now.date():
                    when = f"Today {start.strftime('%-I:%M %p')}"
                elif start.date() == (local_now + timedelta(days=1)).date():
                    when = f"Tomorrow {start.strftime('%-I:%M %p')}"
                else:
                    when = start.strftime("%a %-m/%-d %-I:%M %p")
            else:
                try:
                    when = datetime.fromisoformat(start_raw).strftime("%a %-m/%-d")
                except Exception:
                    when = "Upcoming"
            location = str(event.get("location") or "")
            result.append(
                DisplayItem(
                    kind="calendar",
                    heading=str(cfg.get("label") or "UPCOMING"),
                    title=summary,
                    subtitle=f"{when}{' • ' + location if location else ''}",
                    source=entity_id,
                    **self._style_kwargs(cfg, "calendar"),
                )
            )
        return result

    def _ws_url(self) -> str:
        parsed = urllib.parse.urlparse(self.ha_url)
        scheme = "wss" if parsed.scheme == "https" else "ws"
        return urllib.parse.urlunparse((scheme, parsed.netloc, "/api/websocket", "", "", ""))

    def _start_websocket_thread(self):
        if websocket is None:
            self._ws_last_error = "websocket-client is not installed"
            self.logger.warning(self._ws_last_error)
            return
        if not self.ha_url or not self.ha_token or self._ws_thread:
            return
        self._ws_thread = threading.Thread(
            target=self._websocket_worker,
            name="LEDMatrix-HomeAssistant-WebSocket",
            daemon=True,
        )
        self._ws_thread.start()

    def _websocket_worker(self):
        backoff = 2.0
        while not self._ws_stop.is_set():
            ws = None
            try:
                sslopt = {"cert_reqs": ssl.CERT_NONE} if not self.verify_ssl else {}
                ws = websocket.create_connection(self._ws_url(), timeout=10, sslopt=sslopt)
                ws.settimeout(30)

                hello = json.loads(ws.recv())
                if hello.get("type") != "auth_required":
                    raise RuntimeError(f"Unexpected WebSocket greeting: {hello.get('type')}")
                ws.send(json.dumps({"type": "auth", "access_token": self.ha_token}))
                auth = json.loads(ws.recv())
                if auth.get("type") != "auth_ok":
                    raise RuntimeError(auth.get("message") or "WebSocket auth failed")

                ws.send(json.dumps(
                    {"id": 1, "type": "subscribe_events", "event_type": "state_changed"}
                ))
                self._ws_connected = True
                self._ws_last_error = ""
                backoff = 2.0
                self.logger.info("Home Assistant WebSocket connected")

                while not self._ws_stop.is_set():
                    try:
                        raw = ws.recv()
                    except Exception as exc:
                        if "timed out" in str(exc).lower():
                            ws.ping()
                            continue
                        raise
                    message = json.loads(raw)
                    if message.get("type") != "event":
                        continue
                    event = message.get("event") or {}
                    if event.get("event_type") == "state_changed":
                        self._handle_state_changed(event.get("data") or {})
            except Exception as exc:
                self._ws_connected = False
                self._ws_last_error = str(exc)
                self.logger.warning("Home Assistant WebSocket disconnected: %s", exc)
                self._ws_stop.wait(backoff)
                backoff = min(60.0, backoff * 2.0)
            finally:
                self._ws_connected = False
                if ws is not None:
                    try:
                        ws.close()
                    except Exception:
                        pass

    def _handle_state_changed(self, data: Dict[str, Any]):
        entity_id = str(data.get("entity_id", ""))
        old_obj = data.get("old_state") or {}
        new_obj = data.get("new_state") or {}
        if not entity_id or not isinstance(new_obj, dict):
            return

        old_state = str(old_obj.get("state", "")) if isinstance(old_obj, dict) else ""
        new_state = str(new_obj.get("state", ""))
        ctx = self._state_context(new_obj, old_state=old_state)

        for index, rule in enumerate(self.event_rules):
            pattern = str(rule.get("entity_id", "")).strip()
            if not pattern or not fnmatch.fnmatchcase(entity_id, pattern):
                continue

            def _states(value):
                if value is None:
                    return []
                if isinstance(value, str):
                    return [part.strip() for part in value.split(",") if part.strip()]
                if isinstance(value, (list, tuple, set)):
                    return [str(v).strip() for v in value if str(v).strip()]
                return [str(value).strip()]

            to_states = _states(rule.get("to", []))
            from_states = _states(rule.get("from", []))
            if to_states and new_state not in to_states:
                continue
            if from_states and old_state not in from_states:
                continue

            attrs = new_obj.get("attributes") or {}
            attr_equals = rule.get("attribute_equals") or {}
            if any(str(attrs.get(k)) != str(v) for k, v in attr_equals.items()):
                continue

            key = f"{index}:{entity_id}"
            cooldown = max(0.0, float(rule.get("cooldown", self.default_cooldown)))
            now = time.time()
            if now - self._rule_last_fired.get(key, 0.0) < cooldown:
                continue
            self._rule_last_fired[key] = now

            item = DisplayItem(
                kind="notification",
                heading=self._format_template(str(rule.get("title", "HOME ALERT")), ctx),
                title=self._format_template(
                    str(rule.get("message", "{friendly_name}: {state}")), ctx
                ),
                subtitle=self._format_template(str(rule.get("subtitle", "")), ctx),
                source=entity_id,
                duration=max(1.0, float(rule.get("duration", self.notification_duration))),
                priority=bool(rule.get("priority", self.notification_priority)),
                **self._style_kwargs(rule, "notification"),
            )
            self._enqueue_notification(item)

    def _enqueue_notification(self, item: DisplayItem):
        target = self._priority_queue if item.priority else self._normal_queue
        try:
            target.put_nowait(item)
        except queue.Full:
            try:
                target.get_nowait()
            except queue.Empty:
                pass
            try:
                target.put_nowait(item)
            except queue.Full:
                return
        self.logger.info(
            "Queued HA notification priority=%s: %s / %s",
            item.priority, item.heading, item.title
        )

    def _activate_next_notification(self, priority_only: bool = False) -> bool:
        now = time.time()

        if self._active_notification and now < self._notification_expires:
            if not (priority_only and not self._active_notification.priority):
                self.current_item = self._active_notification
                return True
            if self._priority_queue.empty():
                return False

        self._active_notification = None
        self._notification_expires = 0.0

        item = None
        try:
            item = self._priority_queue.get_nowait()
        except queue.Empty:
            if not priority_only:
                try:
                    item = self._normal_queue.get_nowait()
                except queue.Empty:
                    pass

        if item is None:
            return False

        item.created_at = now
        self._active_notification = item
        self._notification_expires = now + (item.duration or self.notification_duration)
        self.current_item = item
        return True

    def has_live_priority(self) -> bool:
        return bool(self.notification_priority and self.enable_realtime_events)

    def has_live_content(self) -> bool:
        if not self.has_live_priority():
            return False
        if (
            self._active_notification
            and self._active_notification.priority
            and time.time() < self._notification_expires
        ):
            return True
        return not self._priority_queue.empty()

    def get_live_modes(self) -> List[str]:
        return ["home-assistant-alert"]

    def update(self):
        self.last_update = time.time()

        if self._active_notification and time.time() < self._notification_expires:
            return
        if self._active_notification:
            self._active_notification = None
            self._notification_expires = 0.0

        items: List[DisplayItem] = []
        if self.show_entities:
            for cfg in self.entity_cards:
                try:
                    item = self._entity_item(cfg)
                    if item:
                        items.append(item)
                except Exception as exc:
                    self.logger.warning("Entity card failed: %s", exc)

        if self.show_calendars:
            for cfg in self.calendar_cards:
                try:
                    items.extend(self._calendar_items(cfg))
                except Exception as exc:
                    self.logger.warning("Calendar card failed: %s", exc)

        self._rotation_items = items
        if items:
            self.current_item = items[self._rotation_index % len(items)]
            self._rotation_index = (self._rotation_index + 1) % len(items)
            self.last_error = ""
        else:
            self.current_item = None
            if not self.last_error:
                self.last_error = "No Home Assistant content configured"

    @staticmethod
    def _parse_color(value: Any, fallback=(255, 255, 255)):
        if isinstance(value, (list, tuple)) and len(value) == 3:
            try:
                return tuple(max(0, min(255, int(v))) for v in value)
            except Exception:
                return fallback
        text = str(value or "").strip().lstrip("#")
        if len(text) == 3:
            text = "".join(ch * 2 for ch in text)
        if len(text) == 6:
            try:
                return tuple(int(text[i:i + 2], 16) for i in (0, 2, 4))
            except ValueError:
                pass
        return fallback

    @staticmethod
    def _text_width(draw: ImageDraw.ImageDraw, text: str, font) -> int:
        if not text:
            return 0
        box = draw.textbbox((0, 0), text, font=font)
        return max(0, box[2] - box[0])

    @staticmethod
    def _font_height(draw: ImageDraw.ImageDraw, font) -> int:
        box = draw.textbbox((0, 0), "Ag", font=font)
        return max(1, box[3] - box[1])

    def _item_scroll_enabled(self, item: DisplayItem) -> bool:
        return self.enable_scroll if item.enable_scroll is None else bool(item.enable_scroll)

    def _item_scroll_speed(self, item: DisplayItem) -> float:
        try:
            return max(1.0, float(
                item.scroll_speed if item.scroll_speed is not None else self.scroll_speed
            ))
        except Exception:
            return self.scroll_speed

    def _item_scroll_pause(self, item: DisplayItem) -> float:
        try:
            return max(0.0, float(
                item.scroll_pause if item.scroll_pause is not None else self.scroll_pause
            ))
        except Exception:
            return self.scroll_pause

    def _item_scroll_gap(self, item: DisplayItem) -> int:
        try:
            return max(8, int(item.scroll_gap if item.scroll_gap is not None else self.scroll_gap))
        except Exception:
            return self.scroll_gap

    def _scroll_x(
        self, item: DisplayItem, text_width: int, available_width: int, started_at: float
    ) -> int:
        if (
            not self._item_scroll_enabled(item)
            or text_width <= int(available_width * self.scroll_trigger_ratio)
        ):
            return 0
        gap = self._item_scroll_gap(item)
        speed = self._item_scroll_speed(item)
        pause = self._item_scroll_pause(item)
        move_time = (text_width + gap) / speed
        position = max(0.0, time.time() - started_at) % (pause + move_time)
        if position < pause:
            return 0
        return -int((position - pause) * speed)

    def _draw_scrolling_text(
        self, canvas, draw, text, font, xy, width, fill, started_at, item
    ):
        x, y = xy
        text_width = self._text_width(draw, text, font)
        offset = self._scroll_x(item, text_width, width, started_at)

        if offset == 0:
            draw.text((x, y), text, font=font, fill=fill)
            return

        row_h = max(self.H, self._font_height(draw, font) + 4)
        row = Image.new("RGB", (width, row_h), "black")
        row_draw = ImageDraw.Draw(row)
        row_draw.text((offset, 0), text, font=font, fill=fill)
        row_draw.text(
            (offset + text_width + self._item_scroll_gap(item), 0),
            text, font=font, fill=fill
        )
        canvas.paste(row.crop((0, 0, width, min(row_h, self.H - y))), (x, y))

    def _render_item(self, item: DisplayItem) -> Image.Image:
        canvas = Image.new("RGB", (self.W, self.H), "black")
        draw = ImageDraw.Draw(canvas)
        left = 4
        width = max(1, self.W - 8)
        y = 1
        started_at = item.created_at

        heading_fill = self._parse_color(item.heading_color)
        title_fill = self._parse_color(item.title_color)
        subtitle_fill = self._parse_color(item.subtitle_color, (180, 180, 180))

        if self.show_heading and item.heading:
            self._draw_scrolling_text(
                canvas, draw, item.heading, self._font_heading, (left, y), width,
                heading_fill, started_at, item
            )
            y += self._font_height(draw, self._font_heading) + self.row_gap + 1

        if item.title and y < self.H:
            self._draw_scrolling_text(
                canvas, draw, item.title, self._font_title, (left, y), width,
                title_fill, started_at, item
            )
            y += self._font_height(draw, self._font_title) + self.row_gap + 1

        if item.subtitle and y < self.H:
            self._draw_scrolling_text(
                canvas, draw, item.subtitle, self._font_subtitle, (left, y), width,
                subtitle_fill, started_at, item
            )

        return canvas

    def _render(self) -> Image.Image:
        if self.current_item is not None:
            return self._render_item(self.current_item)
        canvas = Image.new("RGB", (self.W, self.H), "black")
        draw = ImageDraw.Draw(canvas)
        draw.text(
            (3, max(0, self.H // 2 - 4)),
            self.last_error or "Waiting for Home Assistant",
            font=self._font_subtitle,
            fill="white",
        )
        return canvas

    def _item_needs_scroll(self, item: Optional[DisplayItem]) -> bool:
        if item is None or not self._item_scroll_enabled(item):
            return False
        probe = Image.new("RGB", (max(1, self.W), max(1, self.H)), "black")
        draw = ImageDraw.Draw(probe)
        width = max(1, self.W - 8)
        rows = (
            (item.heading, self._font_heading),
            (item.title, self._font_title),
            (item.subtitle, self._font_subtitle),
        )
        return any(
            text and self._text_width(draw, text, font) > int(width * self.scroll_trigger_ratio)
            for text, font in rows
        )

    def display(self, force_clear=False, display_mode: Optional[str] = None):
        try:
            if display_mode == "home-assistant-alert":
                if not self._activate_next_notification(priority_only=True):
                    return False
            else:
                if self._active_notification and time.time() >= self._notification_expires:
                    self._active_notification = None
                    self._notification_expires = 0.0
                    self.current_item = None
                if self._active_notification is None:
                    self._activate_next_notification(priority_only=False)
                if (
                    self._active_notification is None
                    and self.current_item is None
                    and not self.last_error
                ):
                    self.update()

            if force_clear:
                self.display_manager.clear()

            self.display_manager.image.paste(self._render(), (0, 0))
            set_scroll = getattr(self.display_manager, "set_scrolling_state", None)
            if callable(set_scroll):
                set_scroll(self._item_needs_scroll(self.current_item))
            self.display_manager.update_display()
            return True
        except Exception as exc:
            self.logger.error("Home Assistant display failed: %s", exc, exc_info=True)
            try:
                self.display_manager.set_scrolling_state(False)
            except Exception:
                pass
            return False

    def validate_config(self):
        if not super().validate_config():
            return False
        if not self.ha_url.startswith(("http://", "https://")):
            self.logger.error("ha_url must start with http:// or https://")
            return False
        if not self.ha_token:
            self.logger.error("ha_token is required")
            return False
        return True

    def get_info(self):
        info = super().get_info()
        info.update({
            "last_update": self.last_update,
            "last_error": self.last_error,
            "current_kind": self.current_item.kind if self.current_item else "",
            "current_title": self.current_item.title if self.current_item else "",
            "websocket_connected": self._ws_connected,
            "websocket_last_error": self._ws_last_error,
            "queued_notifications": self._normal_queue.qsize(),
            "queued_priority_notifications": self._priority_queue.qsize(),
            "notification_priority": self.notification_priority,
            "event_rule_count": len(self.event_rules),
            "rotation_item_count": len(self._rotation_items),
        })
        return info

    def cleanup(self):
        self._ws_stop.set()
        try:
            self.display_manager.set_scrolling_state(False)
        except Exception:
            pass
        try:
            super().cleanup()
        except Exception:
            pass
