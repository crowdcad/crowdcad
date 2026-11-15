import { addCall, assignTeam, findCall } from '../actions';
import { festivalBoard, POSTS } from '../fixtures';
import { scriptedTakFeed } from '../trackingFeed';
import type { TrainingModule } from '../types';

const CALL_AT = POSTS.northField;
const TEAM = 'Team 1';
const DROPS = 'Team 2';
const card = (team: string, inner = '') => [
  `css:[data-testid="team-card-${team}"]${inner}`,
  `css:[data-testid="team-card-condensed-${team}"]${inner}`,
];

/**
 * A TAK event: setting it up (what the admin and event lead do), then
 * dispatching with live positions. The sandbox can't reach a TAK server, so
 * setup is explained, and a scripted feed (src/training/trackingFeed.ts)
 * stands in for the devices on the board.
 */
const takLiveTracking: TrainingModule = {
  id: 'tak-live-tracking',
  version: 1,
  track: 'tak',
  title: 'Set up and run a TAK event',
  summary: 'What has to be in place before a TAK event, then dispatching with live team positions and handling a device that drops off.',
  release: 'preview',
  seed: () => {
    const board = festivalBoard('tak-live-tracking', { tak: true });
    // A call already waiting, so the lesson starts with a decision.
    const now = Date.now();
    board.calls = [
      {
        id: `${now}`,
        order: 1,
        status: 'Pending',
        location: CALL_AT,
        assignedTeam: [],
        chiefComplaint: 'Fainted',
        source: 'Radio',
        priority: false,
        log: [{ timestamp: now, message: 'Call created' }],
      },
    ];
    return board;
  },
  tracking: scriptedTakFeed({
    wandering: ['Team 4'],
    // Team 2's device drops off once Team 1 has been sent: the lesson's last section.
    stale: (unit, event) => unit === DROPS && !!findCall(event, CALL_AT)?.assignedTeam?.includes(TEAM),
  }),
  practice: [
    'Send another team to a new call and watch it travel on the map.',
    'Set Team 2\'s Location by hand now that its device is offline.',
    'Click a team marker on the map to see its card.',
  ],
  steps: [
    {
      id: 'setup-server',
      section: 'Before the event',
      title: 'A TAK server for CrowdCAD',
      body: 'TAK events need a TAK server linked to CrowdCAD. An admin adds it once, in **Settings > Admin > TAK > Add TAK server**, and can give other users access to it. This sandbox has no TAK server, so this part is explained rather than practised.',
      estSec: 30,
      intents: ['set up tak', 'tak server', 'add tak server', 'connect tak'],
    },
    {
      id: 'setup-event',
      section: 'Before the event',
      title: 'Make it a TAK event',
      body: 'In the event builder, set **Map** to **TAK live tracking**, pick the **TAK server**, and choose **Location history** (Summary is the default: 5-minute summaries and a heat map).',
      estSec: 30,
      intents: ['tak event', 'turn on tracking', 'location history', 'live tracking setup'],
    },
    {
      id: 'setup-devices',
      section: 'Before the event',
      title: 'Devices find their teams',
      body: 'Set each device\'s TAK callsign to its {{Team}} name ("Team 1"): CrowdCAD links them automatically, ignoring case and spaces, and remembers the link for next time. Image maps need aligning once so positions land in the right place.',
      estSec: 30,
      intents: ['link device', 'callsign', 'tak device team', 'align map'],
    },
    {
      id: 'live-card',
      section: 'Live positions',
      title: 'A live Location',
      body: 'This practice event is a TAK event with a simulated feed. The radio icon on a card means its {{Location}} comes from TAK: it updates by itself and can\'t be edited while the device is connected.',
      anchors: card('Team 1', ' [data-testid="unit-live-location"]'),
      placement: 'right',
      estSec: 20,
      intents: ['location not editable', 'live location', 'radio icon'],
      liveSafe: true,
    },
    {
      id: 'open-map',
      section: 'Live positions',
      title: 'Open the map',
      body: 'Click the **map** tab. Markers sit where each device last reported; Team 4 is walking around the Food Court. (The street map underneath needs internet.)',
      anchor: 'map-tab-button',
      placement: 'bottom',
      estSec: 20,
      doneWhenVisible: 'venue-map-tab',
      intents: ['where are teams', 'live map', 'team positions'],
      liveSafe: true,
    },
    {
      id: 'closest',
      section: 'Dispatch with positions',
      title: 'Who is closest?',
      body: 'A call is waiting at **North Field** (someone fainted). On the map, Team 1 at the Main Stage is nearest, since Team 5 is on the far side. Go back to the **Calls** tab.',
      anchor: 'calls-tab-button',
      placement: 'bottom',
      estSec: 25,
      doneWhenVisible: 'call-row-1',
      intents: ['closest team', 'nearest unit'],
    },
    {
      id: 'send',
      section: 'Dispatch with positions',
      title: 'Send Team 1',
      body: 'On the call row, click **+**, hover **{{Add Team}}** and pick **Team 1**.',
      anchors: [`call-add-team-${TEAM}`, 'call-add-team', 'css:[data-testid="call-row-1"] [data-testid="call-add-menu"]'],
      placement: 'left',
      estSec: 20,
      done: (e) => !!findCall(e, CALL_AT)?.assignedTeam?.includes(TEAM),
      apply: (e) => assignTeam(findCall(e, CALL_AT) ? e : addCall(e, { location: CALL_AT, chiefComplaint: 'Fainted' }), CALL_AT, TEAM),
    },
    {
      id: 'watch',
      section: 'Dispatch with positions',
      title: 'Watch them travel',
      body: 'Open the map again: Team 1\'s marker moves toward North Field as the device reports. You can see a team is on its way without asking on the radio.',
      anchor: 'map-tab-button',
      placement: 'bottom',
      estSec: 30,
    },
    {
      id: 'dropped',
      section: 'When a device drops off',
      title: 'A device went quiet',
      body: 'Team 2\'s device has stopped reporting. Its marker fades, and its card goes back to an ordinary {{Location}} you can edit, as on a standard event. Confirm where they are on the radio and set it by hand until the device reconnects.',
      anchors: card(DROPS),
      placement: 'right',
      estSec: 30,
      intents: ['device offline', 'stale position', 'tak not connected', 'marker faded'],
      liveSafe: true,
    },
  ],
};

export default takLiveTracking;
