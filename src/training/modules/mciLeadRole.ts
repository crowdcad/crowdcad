import type { Event } from '@/app/types';
import { byTransportOrder } from '@/lib/mci';
import { areaIdOf, areaStatsOf, asRole, MCI_AREA, mciRoleBoard, unitOf } from '../mciScenario';
import type { TrainingModule } from '../types';

const UNIT = 'MRC4';
const as = (e: Event, action: Parameters<typeof asRole>[3]) => asRole(e, 'treatment_lead', UNIT, action);
const ordered = (e: Event) => [...(areaStatsOf(e, MCI_AREA)?.patients ?? [])].sort(byTransportOrder);
const byComplaint = (e: Event, text: string) => ordered(e).find((p) => p.details.complaint?.toLowerCase().includes(text));

/** The Treatment Lead role login on a phone: runs a treatment location and sets its transport order. */
const mciLeadRole: TrainingModule = {
  id: 'mci-role-treatment-lead',
  version: 1,
  track: 'mci',
  title: 'Treatment Lead login: transport order',
  summary: 'Lead a treatment location from a phone: see its patients, set who leaves first and retriage a patient.',
  release: 'stable',
  device: 'phone',
  surface: { role: 'treatment_lead', unit: UNIT },
  seed: () => mciRoleBoard('mci-role-treatment-lead'),
  practice: [
    'Move a patient down the order and watch the numbers change.',
    'Pick a treating color to see only that color, then tap it again to see everyone.',
    'Add a walk-in patient and give them a place in the order.',
  ],
  steps: [
    {
      id: 'intro',
      section: 'Lead a treatment location',
      title: 'Read the scenario',
      body: "MRC4 holds the **Treatment Lead** login for the Dwinelle Tent. The lead can do everything a Responder does in treatment, and also decides who leaves by ambulance first. Transport and the dispatcher follow that order.",
      estSec: 20,
    },
    {
      id: 'pick-area',
      section: 'Lead a treatment location',
      title: 'Pick your location',
      body: 'Tap **Dwinelle Tent**, the location you lead.',
      anchor: `role-area-${MCI_AREA}`,
      placement: 'bottom',
      estSec: 10,
      done: (e) => unitOf(e, UNIT)?.mciAssignment?.kind === 'area' && unitOf(e, UNIT)?.mciAssignment?.id === areaIdOf(e, MCI_AREA),
      apply: (e) => as(e, { type: 'assign', assignment: { kind: 'area', id: areaIdOf(e, MCI_AREA) } }),
    },
    {
      id: 'read-order',
      section: 'Lead a treatment location',
      title: 'Read the transport order',
      body: 'Patients are listed red first, then yellow, then green. The number on each is their place in line for an ambulance: Transport takes **#1** first. A priority only moves a patient among patients of the same color.',
      anchor: 'role-patient',
      placement: 'bottom',
      estSec: 20,
      intents: ['transport order', 'transport priority'],
    },
    {
      id: 'priority',
      section: 'Set the order',
      title: 'Move a patient up',
      body: 'The 23-year-old with the open leg fracture is getting worse. Tap **▲** on her (the second red patient) so she leaves first.',
      anchor: 'css:[data-testid="role-patient"]:nth-of-type(2) [data-testid="role-patient-up"]',
      placement: 'left',
      estSec: 15,
      intents: ['move patient up', 'change transport order'],
      done: (e) => !!ordered(e)[0]?.details.complaint?.toLowerCase().includes('fracture'),
      apply: (e) => as(e, { type: 'priority', patientId: byComplaint(e, 'fracture')!.id, direction: 'up' }),
    },
    {
      id: 'open-yellow',
      section: 'Retriage',
      title: 'Open the yellow patient',
      body: 'The patient with the head laceration is bleeding heavily again. Tap them (the last in the list) to open their details.',
      anchor: 'css:[data-testid="role-patient"]:last-of-type [data-testid="role-patient-open"]',
      placement: 'top',
      estSec: 10,
      doneWhenVisible: 'role-patient-sheet',
    },
    {
      id: 'retriage',
      section: 'Retriage',
      title: 'Retriage to red',
      body: 'Tap **Red**, then **Save**. They move into the red patients, at the end of the red order.',
      anchors: ['role-patient-color-red', 'role-patient-save'],
      placement: 'top',
      estSec: 15,
      intents: ['retriage', 'change tag color'],
      done: (e) => byComplaint(e, 'laceration')?.color === 'red',
      apply: (e) => as(e, { type: 'reassign', patientId: byComplaint(e, 'laceration')!.id, color: 'red' }),
    },
    {
      id: 'done',
      section: 'Retriage',
      title: 'Read the new order',
      body: 'Three red patients now wait, in the order you set. The Transport login and the dispatcher see the same numbers.',
      anchor: 'role-patient',
      placement: 'bottom',
      estSec: 15,
    },
  ],
};

export default mciLeadRole;
