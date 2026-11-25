import { addCall, findCall, sendEquipment, setEquipmentRunStatus, setTeamStatus, teamOf } from '../actions';
import { trainingBoardAfter, POSTS } from '../fixtures';
import type { TrainingModule } from '../types';

const LOCATION = POSTS.lowerSproul;
// MRC1 is on scene; MRC3, posted at Sather Gate beside Upper Sproul, fetches the wheelchair kept there.
const CARE_TEAM = 'MRC1';
const HELPER = 'MRC3';
const EQUIPMENT = 'Wheelchair 1';
const helperCard = [`team-card-${HELPER}`, `team-card-condensed-${HELPER}`];
const callMenu = 'css:[data-testid="call-row-1"] [data-testid="call-add-menu"]';

/** A team on scene asks for equipment, and a second team brings it without joining the call as a care team. */
const equipmentDelivery: TrainingModule = {
  id: 'equipment-delivery',
  version: 1,
  track: 'dispatcher',
  title: 'Add a helper team to deliver equipment',
  summary: 'Send a second team to bring equipment to a call, follow the run and see who has the equipment afterwards.',
  release: 'stable',
  // A call already in progress: MRC1 on scene with an ankle injury at Lower Sproul.
  seed: () =>
    trainingBoardAfter('equipment-delivery', (e) => {
      const t = Date.now() - 4 * 60 * 1000;
      const next = addCall(e, { location: LOCATION, source: 'Radio', chiefComplaint: 'Ankle injury', assignedTeam: CARE_TEAM }, t);
      return setTeamStatus(next, LOCATION, CARE_TEAM, 'On Scene', t + 90_000);
    }),
  practice: [
    'Send the AED to a new call with a team that is already on another call, and see which teams the menu offers.',
    'Remove a helper team from a call with the x on its chip, and watch where the equipment goes.',
    'Open the equipment list and follow Gurney 1 as you send it to a call.',
  ],
  steps: [
    {
      id: 'intro',
      section: 'Send equipment',
      title: 'Look at the scenario',
      body: "MRC1 is on scene at **Lower Sproul** with a patient who can't walk on an injured ankle. They radio for a wheelchair. You will send a helper {{team}} to bring it while MRC1 stays with the patient.",
      estSec: 20,
    },
    {
      id: 'open-add-menu',
      section: 'Send equipment',
      title: 'Open the call menu',
      body: 'Click the **+** on the call.',
      anchor: callMenu,
      placement: 'left',
      estSec: 10,
      doneWhenVisible: 'call-add-equipment',
      intents: ['send equipment', 'add equipment to call', 'bring a wheelchair', 'helper team', 'equipment run'],
      liveSafe: true,
    },
    {
      id: 'send-equipment',
      section: 'Send equipment',
      title: 'Send a helper team',
      body: "Point to **{{Add Equipment}}**, then **Wheelchair 1**, and pick **MRC3**. MRC3 is posted at Sather Gate, next to Upper Sproul, where the wheelchair is kept.",
      anchors: [`add-equipment-unit-${HELPER}`, `add-equipment-${EQUIPMENT}`, 'call-add-equipment', callMenu],
      placement: 'right',
      estSec: 25,
      intents: ['who brings equipment', 'equipment team'],
      done: (e) => !!findCall(e, LOCATION)?.equipmentTeams?.includes(HELPER),
      apply: (e) => sendEquipment(e, LOCATION, EQUIPMENT, HELPER),
    },
    {
      id: 'retrieving',
      section: 'Send equipment',
      title: 'Look at the helper team card',
      body: "MRC3's card shows it is retrieving equipment, and its {{location}} is where the wheelchair is kept. On the call, MRC3's status names the equipment run, so you can tell it apart from MRC1, the care team.",
      anchors: helperCard,
      placement: 'right',
      estSec: 20,
    },
    {
      id: 'en-route',
      section: 'Follow the delivery',
      title: 'Set En Route with the equipment',
      body: "MRC3 radios that they have the wheelchair. Click MRC3's status on the call and pick **En Route - Wheelchair 1**.",
      anchors: ['team-status-option-En Route Eq', `team-status-${HELPER}`],
      placement: 'right',
      estSec: 20,
      intents: ['picked up equipment', 'equipment en route'],
      done: (e) => teamOf(e, HELPER)?.status === 'En Route Eq',
      apply: (e) => setEquipmentRunStatus(e, LOCATION, HELPER, 'En Route Eq'),
      liveSafe: true,
    },
    {
      id: 'delivered',
      section: 'Follow the delivery',
      title: 'Set Delivered',
      body: "MRC3 hands the wheelchair to MRC1. Change MRC3's status to **Delivered Wheelchair 1**. MRC3 leaves the call and is **{{Available}}** at its post again, and MRC1 keeps the call.",
      anchors: ['team-status-option-Delivered Eq', `team-status-${HELPER}`],
      placement: 'right',
      estSec: 20,
      intents: ['delivered equipment', 'equipment dropped off'],
      done: (e) => teamOf(e, HELPER)?.status === 'Available' && !!findCall(e, LOCATION)?.detachedTeams?.some((d) => d.team === HELPER),
      apply: (e) => setEquipmentRunStatus(e, LOCATION, HELPER, 'Delivered Eq'),
    },
    {
      id: 'open-equipment',
      section: 'Check the equipment',
      title: 'Open Equipment',
      body: 'Open the menu at the top of the left side and choose **{{Equipment}}**.',
      anchors: ['left-panel-option-equipment', 'left-panel-select'],
      placement: 'right',
      estSec: 15,
      doneWhenVisible: `equipment-card-${EQUIPMENT}`,
      doClicks: ['left-panel-select', 'left-panel-option-equipment'],
    },
    {
      id: 'with-care-team',
      section: 'Check the equipment',
      title: 'See who has the equipment',
      body: 'Wheelchair 1 is now with MRC1 at Lower Sproul. When MRC1 finishes the call, the wheelchair goes with them, to the clinic or back to where it is kept.',
      anchor: `equipment-card-${EQUIPMENT}`,
      placement: 'right',
      estSec: 20,
      intents: ['where is the wheelchair', 'who has the equipment'],
    },
  ],
};

export default equipmentDelivery;
