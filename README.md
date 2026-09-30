# LEDMatrix Home Assistant

Native Home Assistant plugin for [ChuckBuilds/LEDMatrix](https://github.com/ChuckBuilds/LEDMatrix).

Displays Home Assistant entities, upcoming calendar events, and real-time text notifications such as **Person detected in driveway** or **Vehicle detected at front door**. Camera snapshots are intentionally out of scope; the focus is fast, readable information on an LED matrix.

## Features

- Home Assistant REST API using HA URL + Long-Lived Access Token
- Persistent Home Assistant WebSocket connection for low-latency state changes
- Entity cards for sensors, binary sensors, covers, locks, people, and more
- Upcoming events from one or more calendar entities
- Wildcard notification rules such as \`binary_sensor.driveway_*\`
- Attribute matching for integrations that expose object type in attributes
- Native LEDMatrix **live-priority takeover** for alerts that should appear immediately
- Per-rule priority override
- Global and per-item text colors
- Global and per-item marquee speed, pause, gap, and enable/disable
- Pixel-width-aware scrolling for wide/multi-panel matrices
- Notification duration, queue size, and cooldown controls
- Automatic return to normal LEDMatrix rotation after a priority alert expires

## Installation

Install from the LEDMatrix Plugin Manager using:

\`\`\`text
https://github.com/airbornetrooper82573/LEDMatrix-Home-Assistant
\`\`\`

## Example

\`\`\`json
{
  "home-assistant": {
    "enabled": true,
    "display_duration": 20,
    "ha_url": "http://192.168.1.50:8123",
    "ha_token": "YOUR_LONG_LIVED_ACCESS_TOKEN",

    "notification_priority": true,
    "notification_duration": 10,

    "enable_scroll": true,
    "scroll_speed": 18,
    "scroll_pause": 1.0,
    "scroll_gap": 28,

    "entity_heading_color": "#78DC82",
    "entity_title_color": "#FFFFFF",
    "calendar_heading_color": "#5ABEFF",
    "notification_heading_color": "#FF5A46",

    "entities": [
      {
        "entity_id": "sensor.living_room_temperature",
        "label": "LIVING ROOM",
        "unit": "°F",
        "heading_color": "#00FF88",
        "scroll_speed": 12
      }
    ],

    "calendars": [
      {
        "entity_id": "calendar.family",
        "label": "UPCOMING",
        "days_ahead": 7,
        "max_events": 5,
        "heading_color": "#45BFFF"
      }
    ],

    "event_notifications": [
      {
        "entity_id": "binary_sensor.driveway_person",
        "to": ["on"],
        "title": "DRIVEWAY",
        "message": "Person detected in driveway",
        "priority": true,
        "duration": 10,
        "cooldown": 20,
        "heading_color": "#FF3B30",
        "title_color": "#FFFFFF",
        "scroll_speed": 24
      },
      {
        "entity_id": "binary_sensor.driveway_vehicle",
        "to": ["on"],
        "title": "DRIVEWAY",
        "message": "Vehicle detected in driveway",
        "priority": true
      },
      {
        "entity_id": "binary_sensor.washer_complete",
        "to": ["on"],
        "title": "LAUNDRY",
        "message": "Washer finished",
        "priority": false
      }
    ]
  }
}
\`\`\`

## Priority notifications

\`notification_priority: true\` enables LEDMatrix's native live-priority path.

When the Home Assistant WebSocket receives a matching priority state change, the plugin queues it immediately. LEDMatrix sees \`has_live_content()\` become true and switches to the plugin's \`home-assistant-alert\` live mode instead of waiting for normal rotation.

Each notification rule can override the global setting with:

\`\`\`json
"priority": true
\`\`\`

Set it to \`false\` for lower-importance messages that should wait until the Home Assistant plugin's normal turn.

## Wildcard rules

\`\`\`json
{
  "entity_id": "binary_sensor.driveway_*",
  "to": ["on"],
  "title": "DRIVEWAY",
  "message": "{friendly_name}",
  "priority": true
}
\`\`\`

## Templates

Common placeholders include \`{entity_id}\`, \`{friendly_name}\`, \`{state}\`, \`{old_state}\`, \`{unit}\`, and \`{attr_name}\` for Home Assistant attributes.

## Display customization

Global defaults can be set for scrolling and for entity/calendar/notification colors. Each individual entity, calendar, or notification can override:

- \`heading_color\`
- \`title_color\`
- \`subtitle_color\`
- \`enable_scroll\`
- \`scroll_speed\`
- \`scroll_pause\`
- \`scroll_gap\`

Colors use \`#RRGGBB\` or \`#RGB\`. Scrolling is based on rendered pixel width rather than character count, which works well on larger chained matrices.

## Requirements

- LEDMatrix 2.0.0+
- Reachable Home Assistant instance
- Home Assistant Long-Lived Access Token
- Pillow
- websocket-client

## Security

Do not commit your real Home Assistant token.

## License

MIT
