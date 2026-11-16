import { addCall, assignTeam, findCall } from '../actions';
import { festivalBoard, POSTS } from '../fixtures';
import { scriptedTakFeed } from '../trackingFeed';
import type { TrainingModule, TrainingStep } from '../types';

const CALL_AT = POSTS.northField;
const TEAM = 'Team 1';
const DROPS = 'Team 2';

const TAK_PANEL = process.env.NEXT_PUBLIC_TAK === 'on';
// The practice device with no matching team (src/features/tak/components/TakTrainingPanel.tsx), and Team 5's id.
const UNMATCHED = 'practice-medic-7';
const LINK_TEAM_ID = 'training-team-5';

/** The real TAK map panel, on practice data: shown only in builds with TAK. */
export const PANEL_STEPS: TrainingStep[] = [
  {
    id: 'open-panel',
    section: 'Use the TAK panel',
    title: 'Open the TAK panel',
    body: 'Click **TAK** at the bottom left of the map. (If the map is closed, open the **map** tab first.)',
    anchors: ['tak-panel-toggle', 'map-tab-button'],
    placement: 'top',
    estSec: 10,
    doneWhenVisible: 'tak-panel',
    doClicks: ['map-tab-button', 'tak-panel-toggle'],
    intents: ['tak panel', 'tak settings', 'tak devices', 'is tak connected'],
    liveSafe: true,
  },
  {
    id: 'panel-tour',
    section: 'Use the TAK panel',
    title: 'Read the TAK panel',
    body: "This panel holds the event's TAK settings: the **TAK server**, **Location history** and the **Live tracking on** switch. Below them is every device and the team it is linked to. Here it shows a practice server.",
    anchor: 'tak-panel',
    placement: 'right',
    estSec: 30,
  },
  {
    id: 'link-device',
    section: 'Use the TAK panel',
    title: 'Link a device to a team',
    body: "The device **MEDIC-7** doesn't match a team name, so it isn't linked. Under **Unassigned TAK devices**, pick **Team 5** for it.",
    anchors: [`tak-assign-option-${LINK_TEAM_ID}`, `tak-assign-${UNMATCHED}`],
    placement: 'right',
    estSec: 25,
    doneWhenVisible: `tak-linked-${UNMATCHED}`,
    doClicks: [`tak-assign-${UNMATCHED}`, `tak-assign-option-${LINK_TEAM_ID}`],
    intents: ['link tak device', 'assign device to team', 'unassigned device'],
  },
];

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
  summary: 'What to set up before a TAK event, the TAK panel, dispatching with live positions, and what to do when a device drops off.',
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
    takPanel: true,
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
      section: 'Set up TAK',
      title: 'Add a TAK server',
      body: 'First, an admin adds your TAK server to CrowdCAD, once: **Settings > Admin > TAK > Add TAK server**. You can\'t do this part here, because this practice board has no TAK server.',
      estSec: 25,
      intents: ['set up tak', 'tak server', 'add tak server', 'connect tak'],
    },
    {
      id: 'setup-event',
      section: 'Set up TAK',
      title: 'Turn on TAK for an event',
      body: 'When you create the event, set **Map** to **TAK live tracking**. Then pick the **TAK server** and a **Location history** setting (Summary is the default).',
      estSec: 25,
      intents: ['tak event', 'turn on tracking', 'location history', 'live tracking setup'],
    },
    {
      id: 'setup-devices',
      section: 'Set up TAK',
      title: 'Set device callsigns',
      body: 'On each phone or radio, set the TAK callsign to the team\'s name, for example "Team 1". CrowdCAD then links the device to that team by itself.',
      estSec: 25,
      intents: ['link device', 'callsign', 'tak device team'],
    },
    {
      id: 'live-card',
      section: 'Track live positions',
      title: 'Read a live Location',
      body: 'This practice event runs as a TAK event. The radio icon on a card means TAK sets that team\'s {{Location}}. You can\'t edit it while the device is connected.',
      anchors: card('Team 1', ' [data-testid="unit-live-location"]'),
      placement: 'right',
      estSec: 20,
      intents: ['location not editable', 'live location', 'radio icon'],
      liveSafe: true,
    },
    {
      id: 'open-map',
      section: 'Track live positions',
      title: 'Open the map',
      body: 'Click the **map** tab. Each team shows where its device last reported. Team 4 is walking around the Food Court.',
      anchor: 'map-tab-button',
      placement: 'bottom',
      estSec: 20,
      doneWhenVisible: 'venue-map-tab',
      intents: ['where are teams', 'live map', 'team positions'],
      liveSafe: true,
    },
    // The TAK panel exists only in builds with TAK (NEXT_PUBLIC_TAK=on); without it, these steps are left out.
    ...(TAK_PANEL ? PANEL_STEPS : []),
    {
      id: 'closest',
      section: 'Dispatch by position',
      title: 'Find the closest team',
      body: 'A call is waiting at **North Field**: someone fainted. The map shows Team 1, at the Main Stage, is closest. Go back to the **Calls** tab.',
      anchor: 'calls-tab-button',
      placement: 'bottom',
      estSec: 25,
      doneWhenVisible: 'call-row-1',
      intents: ['closest team', 'nearest unit'],
    },
    {
      id: 'send',
      section: 'Dispatch by position',
      title: 'Assign the closest team',
      body: 'On the call, click **+**, point to **{{Add Team}}** and pick **Team 1**.',
      anchors: [`call-add-team-${TEAM}`, 'call-add-team', 'css:[data-testid="call-row-1"] [data-testid="call-add-menu"]'],
      placement: 'left',
      estSec: 20,
      done: (e) => !!findCall(e, CALL_AT)?.assignedTeam?.includes(TEAM),
      apply: (e) => assignTeam(findCall(e, CALL_AT) ? e : addCall(e, { location: CALL_AT, chiefComplaint: 'Fainted' }), CALL_AT, TEAM),
    },
    {
      id: 'watch',
      section: 'Dispatch by position',
      title: 'Track a team on the map',
      body: 'Open the map again. Team 1 moves toward North Field as its device reports, so you can see they are on the way without calling them.',
      anchor: 'map-tab-button',
      placement: 'bottom',
      estSec: 30,
    },
    {
      id: 'dropped',
      section: 'Handle a dropped device',
      title: 'Handle a dropped device',
      body: 'Team 2\'s device has stopped reporting. Its map marker fades and its {{Location}} can be edited again. Ask them on the radio where they are and set it by hand until the device reconnects.',
      anchors: card(DROPS),
      placement: 'right',
      estSec: 30,
      intents: ['device offline', 'stale position', 'tak not connected', 'marker faded'],
      liveSafe: true,
    },
  ],
};

export default takLiveTracking;
