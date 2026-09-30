# CrowdCAD User Guide

A short guide to CrowdCAD's main workflows for dispatchers, supervisors and event organizers. Screenshots and feature walkthroughs are at [crowdcad.org/features](https://crowdcad.org/features).

## Who this is for

- Event medical volunteers and supervisors
- Teams running first-aid posts and clinics at public events
- Organizers who need call logs, team tracking and post-event reports

## Quick start

1. Open the CrowdCAD address your organization gave you and sign in with your email and password.
2. Pick a venue on **Venue Selection**, or click **Create Venue** to build one.
3. Create an event at that venue and walk through the setup steps.
4. Launch the event to open the dispatch board.
5. Log calls, assign teams and track clinic patients until the event ends.
6. End the event and review or export the summary.

## Lite mode (local-only)

- Open `/lite` to use CrowdCAD Lite with no account or server.
- Lite mode stores data in this browser on this device only. Clearing browser data deletes it, and other devices cannot see it.
- Lite event setup covers event configuration, locations, staff assignments, equipment and the post schedule, then opens the same dispatch board as the full app.
- Use Lite mode to evaluate CrowdCAD, for training or when a small event has no network.

## Basic concepts

- **Venue:** a physical site with one or more map floors. A venue holds locations (posts and clinics), map areas and default equipment, and is reused across events.
- **Location / post:** a named marker on the venue map where a team can be stationed. A location can be marked as a clinic.
- **Dispatch zone:** a map area drawn on the venue. Calls inside it are grouped under their own tab on the dispatch board.
- **Event:** one operational period at a venue, with its own teams, supervisors, equipment, post schedule and log.
- **Team:** a group of responders with a status (available, on a call, on break, in clinic and so on).
- **Call:** a logged patient encounter or service request, with location, complaint, assigned teams and status.
- **Clinic patient:** a walk-up or delivered patient tracked on a clinic tab.

## Typical workflows

### Build a venue

Click **Create Venue** on Venue Selection. The venue wizard has five steps:

1. **Venue Configuration:** name and basic details.
2. **Map:** upload a map image per floor, or import a GIS map (see below). Draw areas with **Add Area** and check "Mark as Dispatch Zone" to give an area its own call tab.
3. **Locations:** place post markers and mark clinics.
4. **Equipment:** add equipment and set each item's default location.
5. **Review:** confirm and save.

### Create an event

From a venue, start a new event. The event wizard has five steps:

1. **Event Configuration:** name and date (both required), start and end time, and advanced settings such as surge criteria.
2. **Staff Assignments:** add teams and supervisors by hand, or import them from the CSV template.
3. **Equipment:** choose venue equipment or add event-only items.
4. **Post schedule:** choose posts (or **Enable All**) and generate the rotation schedule.
5. **Review & launch:** check the summary and open the dispatch board.

### Run dispatch

- The left panel lists teams, supervisors and equipment. Change a team's status or post from its card.
- The availability strip shows how many teams are available, on break or in clinic, and on calls. A surge alert appears when a configured threshold is reached, and can also be toggled by hand.
- Click **Add Call** on the Calls tab to log a call with location, age and sex, and chief complaint. Assign one or more teams, update status as the call progresses and add notes to its log.
- Calls inside a dispatch zone also appear on that zone's tab.
- Record transports with "Transporting to" and capture the transport unit when prompted.
- Use the Clinic tab to track walk-ups and patients delivered from calls.
- The Map tab shows posts, teams, supervisors and equipment on the venue map.
- **Posting Schedule** opens the rotation, and **Update all posts** moves every team to its next scheduled post.

### End an event and review it

- **End Event** (available to the event's creator or a site admin) stops data collection after confirmation.
- The Summary page shows charts, per-team activity and a zone breakdown. **Export Summary** and the log export produce CSV files with a full date and time per entry.

### Import a GIS venue map

On the venue Map step, "Or import a GIS map with pre-placed points and areas" opens the GIS import dialog. Use it when the venue layout already exists in a GIS tool such as ArcGIS.

- **Inputs:** a flattened background image of the map, plus one or two GeoJSON files. One file holds point locations and the other holds polygon areas. Either can be omitted, and a single combined file with both geometry types also works in either input. Most GIS tools export one geometry type per layer, which matches the two inputs.
- **Point features** need a `name` property. An optional `isClinic` boolean marks the location as a clinic.
- **Polygon features** (or MultiPolygon, using the first polygon's outer ring) need a `name` property. Optional `isDispatchZone` (boolean) marks a dispatch zone, and optional `color` (hex string such as `"#22c55e"`) sets the map color. Colors are assigned automatically when omitted.
- **Georeferencing** uses the FeatureCollection's `bbox`, or the extent of the features when `bbox` is missing. When both files are uploaded they share one set of bounds so they line up with each other.
- `docs/examples/venue-map-import.geojson` is a minimal example with one clinic point and one dispatch-zone polygon. Check the import preview before confirming. If features are offset, the `bbox` probably does not match the image's extent.

### Profile and admin

- **Profile** holds your details, language, preferences and password.
- Admins also see **Profile > Admin**, which manages the certification list, venues, users and **Manage Admins**.

## Privacy and data handling

- Collect only the information needed to provide care.
- Avoid personally identifying information unless it is essential, and follow your organization's privacy policies and any BAAs that apply.
- Lite mode data stays in the browser on the device where it was entered.

## Help and support

- Report bugs or request features by opening a GitHub issue.
- Report security issues as described in [`SECURITY.md`](../SECURITY.md).
- For deployment questions see [`DEPLOYMENT.md`](DEPLOYMENT.md), [`SETUP_FIREBASE.md`](SETUP_FIREBASE.md) or [`SETUP_POCKETBASE.md`](SETUP_POCKETBASE.md).
- Join the [CrowdCAD Discord](https://discord.gg/7detyFE7GM) or email support@crowdcad.org.
