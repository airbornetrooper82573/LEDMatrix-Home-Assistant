# LEDMatrix Home Assistant

Native Home Assistant plugin for [ChuckBuilds/LEDMatrix](https://github.com/ChuckBuilds/LEDMatrix).

Displays Home Assistant entities, upcoming calendar events, and real-time text notifications such as **Person detected in driveway** or **Vehicle detected at front door**. Camera snapshots are intentionally out of scope; the focus is fast, readable information on an LED matrix.

## Features

- Home Assistant REST API using HA URL + Long-Lived Access Token
- Persistent Home Assistant WebSocket connection for low-latency state changes
- Entity cards for sensors, binary sensors, covers, locks, people, and more
- Searchable Home Assistant Entity Browser with domain filters and one-click add actions
- Upcoming events from one or more calendar entities
- Wildcard notification rules such as \`binary_sensor.driveway_*\`
- Attribute matching for integrations that expose object type in attributes
- Native LEDMatrix **live-priority takeover** for alerts that should appear immediately
- Per-rule priority override
- Visual color pickers for global and per-item text colors — no hex typing required
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

## Setup Flow

The plugin now uses a gated setup flow:

1. Enter the **Home Assistant URL**.
2. Enter a **Long-Lived Access Token**.
3. Click **Validate Connection**.
4. LEDMatrix calls the Home Assistant `/api/` endpoint and verifies that the URL is reachable and the token authenticates successfully.
5. Only after validation succeeds are entity discovery, display settings, calendars, and notification rules unlocked.

If the URL, token, or SSL verification setting changes, the page locks those options again until the connection is revalidated.

Validation failures are shown directly in the setup card, including invalid URL, missing token, authentication failure, SSL/certificate errors, and connection failures.

## Entity Browser

After the Step 1 connection validation succeeds, the **Home Assistant Entity Browser** can query `/api/states` and search by friendly name, entity ID, current state, domain, device class, or unit.

Use the domain selector to narrow a large Home Assistant installation to sensors, binary sensors, calendars, cameras, covers, locks, people, weather, switches, climate entities, and more. Each search result can be added directly as an **Entity**, **Calendar**, or **Alert Rule** without copying an entity ID by hand.

The token is sent only to the local LEDMatrix backend action that performs the Home Assistant request; the browser does not call Home Assistant directly, which avoids CORS problems.

## Smart Entity Presets

When you add an item from the Entity Browser, the plugin now inspects the Home Assistant domain, device class, unit, friendly name, and entity ID to pre-fill sensible defaults.

Examples:

- Temperature, humidity, and battery sensors carry their Home Assistant unit into the display automatically.
- Garage-related covers are labeled **Garage Door** and common Home Assistant cover states are shown as **Open**, **Closed**, **Opening**, and **Closing**.
- Locks display **Locked**, **Unlocked**, **Locking**, **Unlocking**, or **Jammed** instead of raw machine-state text.
- Binary sensor device classes are translated into useful wording: door/window sensors become **Open/Closed**, motion becomes **Motion/Clear**, occupancy becomes **Detected/Clear**, moisture becomes **Wet/Dry**, presence becomes **Present/Away**, and similar device classes receive appropriate labels.
- Person and device tracker entities show **Home/Away** where appropriate.
- Alert rules created from camera/AI-related binary sensors look at the entity name/device class and suggest messages such as **Person detected in driveway**, **Vehicle detected in driveway**, **Package detected at front door**, **Animal detected**, or **Motion detected**.

These are only starting defaults. Every generated label, unit, message, priority setting, color, scroll speed, and state trigger remains editable in the LEDMatrix configuration UI.

## Visual Colors

The plugin now uses LEDMatrix's visual color controls instead of requiring typed hex values. Global entity/calendar/notification colors have clickable color pickers. Individual rows also expose visual color overrides in their advanced settings.

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

Colors are selected visually in the LEDMatrix configuration UI. Scrolling is based on rendered pixel width rather than character count, which works well on larger chained matrices.

## Requirements

- LEDMatrix with plugin widget support (current LEDMatrix builds recommended)
- Reachable Home Assistant instance
- Home Assistant Long-Lived Access Token
- Pillow
- websocket-client

## Security

Do not commit your real Home Assistant token.

## License

MIT
