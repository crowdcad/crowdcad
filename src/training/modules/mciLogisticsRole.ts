import type { Event } from '@/app/types';
import { mciEquipmentFor } from '@/lib/mciDoc';
import { asRole, HOSPITALS, INCOMING_TEAM, mciRoleBoard } from '../mciScenario';
import type { TrainingModule } from '../types';

const UNIT = 'Sup 1';
const as = (e: Event, action: Parameters<typeof asRole>[3]) => asRole(e, 'logistics', UNIT, action);
const hospital = (e: Event, name: string) => e.mci?.logistics?.hospitals?.find((h) => h.name === name);
const incoming = (e: Event, name: string) => e.mci?.logistics?.incoming?.find((x) => x.name === name);
const held = (e: Event, prefix: string, unit: string) => mciEquipmentFor(e).some((x) => x.name.toLowerCase().startsWith(prefix.toLowerCase()) && x.holder === unit);
const NEW_TEAM = 'Engine 3';

/** The Logistics role login on a laptop: incoming staff, hospitals, equipment and logins. */
const mciLogisticsRole: TrainingModule = {
  id: 'mci-role-logistics',
  version: 1,
  track: 'mci',
  title: 'Logistics login: staff, hospitals, equipment',
  summary: 'Track teams on their way, set hospital capacity, hand out and take back equipment, and resend logins.',
  release: 'stable',
  device: 'laptop',
  surface: { role: 'logistics', unit: UNIT },
  seed: () => mciRoleBoard('mci-role-logistics'),
  practice: ['Give an AED to MRC4, then give it on to MRC5.', 'Add a hospital and set its capacity.', 'Cancel Engine 3, then undo it under Arrived and cancelled.'],
  steps: [
    {
      id: 'intro',
      section: 'Incoming staff',
      title: 'Read the scenario',
      body: "Sup 1 holds the **Logistics** login, usually on a laptop. Logistics keeps track of extra staff on their way, where patients are sent and who has which equipment. It sees the same board as the dispatcher's **MCI Logistics** tab and can change everything on it.",
      estSec: 25,
    },
    {
      id: 'incoming',
      section: 'Incoming staff',
      title: 'Read an incoming team',
      body: '**Medic 12** is on its way. Each team on its way has an ETA (a time, or Pending, En route or Attempted contact), its members and notes. A time that has passed turns red.',
      anchor: `incoming-${INCOMING_TEAM}`,
      placement: 'left',
      estSec: 20,
      intents: ['incoming staff', 'eta', 'mutual aid'],
    },
    {
      id: 'arrived',
      section: 'Incoming staff',
      title: 'Mark a team arrived',
      body: 'Medic 12 has arrived. Click **Arrived**: they join the dispatch interface as an Available team at once.',
      anchor: `incoming-${INCOMING_TEAM}-arrived`,
      placement: 'left',
      estSec: 10,
      done: (e) => (e.staff || []).some((s) => s.team === INCOMING_TEAM),
      apply: (e) => as(e, { type: 'incomingArrived', id: incoming(e, INCOMING_TEAM)!.id }),
    },
    {
      id: 'add-incoming',
      section: 'Incoming staff',
      title: 'Add a team on its way',
      body: 'The fire department says an engine company is coming. Type `Engine 3` and click **Add**.',
      anchors: ['incoming-name', 'incoming-add'],
      placement: 'left',
      estSec: 15,
      done: (e) => !!incoming(e, NEW_TEAM),
      apply: (e) => as(e, { type: 'incomingAdd', name: NEW_TEAM }),
    },
    {
      id: 'hospitals',
      section: 'Hospitals',
      title: 'Read the hospitals',
      body: '**Sent** counts the patients Transport recorded to each hospital, so you can see when one is filling up. **Capacity** is how many it said it can take. The arrow lists the patients sent there. A hospital Transport types that is not on the list is added here.',
      anchor: 'hospitals',
      placement: 'left',
      estSec: 25,
      intents: ['hospital capacity', 'patients sent'],
    },
    {
      id: 'capacity',
      section: 'Hospitals',
      title: 'Set a capacity',
      body: 'Alta Bates calls back: it can take 3 patients. Type `3` in its **Capacity** and press Enter.',
      anchor: `hospital-${HOSPITALS[1]}-capacity`,
      placement: 'left',
      estSec: 15,
      done: (e) => hospital(e, HOSPITALS[1])?.capacity === 3,
      apply: (e) => as(e, { type: 'hospitalUpdate', id: hospital(e, HOSPITALS[1])!.id, capacity: 3 }),
    },
    {
      id: 'give',
      section: 'Equipment',
      title: 'Give equipment to a team',
      body: 'MRC3 needs a trauma bag. Under **Give**, pick **Trauma bag** and the team **MRC3**, then click **Give**. It shows on MRC3’s card for the dispatcher at once.',
      anchors: ['logistics-give-submit', 'logistics-give'],
      placement: 'right',
      estSec: 25,
      intents: ['give equipment', 'issue equipment'],
      done: (e) => held(e, 'Trauma bag', 'MRC3'),
      apply: (e) => as(e, { type: 'equipmentGive', item: 'Trauma bag', unit: 'MRC3' }),
    },
    {
      id: 'return',
      section: 'Equipment',
      title: 'Take equipment back',
      body: 'MRC1 has finished with the triage bag. Click **Return** beside it: it goes back to staging.',
      anchor: 'logistics-return-Triage bag',
      placement: 'right',
      estSec: 10,
      done: (e) => !held(e, 'Triage bag', 'MRC1'),
      apply: (e) => as(e, { type: 'equipmentReturn', name: 'Triage bag' }),
    },
    {
      id: 'logins',
      section: 'Logins',
      title: 'Read the logins',
      body: "**Logins** lists every team and supervisor with the role login it holds. Logistics can't make logins (the dispatcher does), but can **Reset password** to send a login again, for example when someone hands their phone to a new person.",
      anchor: 'role-logins',
      placement: 'top',
      estSec: 20,
      intents: ['resend login', 'reset password'],
    },
    {
      id: 'phone',
      section: 'Logins',
      title: 'On a phone',
      body: 'On a phone this board shows one section at a time, with tabs for Incoming, Hospitals, Equipment and Logins. Everything works the same.',
      estSec: 10,
    },
  ],
};

export default mciLogisticsRole;
