import { DISPATCH_TERMS } from './terms';

export const DEFAULT_PRESET_ID = 'crowdcad-default';
export const FRENCH_PRESET_ID = 'crowdcad-french';

export const BUILTIN_PRESET_IDS = [DEFAULT_PRESET_ID, FRENCH_PRESET_ID] as const;
export type BuiltinPresetId = (typeof BUILTIN_PRESET_IDS)[number];

export interface DispatchVocabularyPresetSummary {
  id: string;
  name: string;
  terms: Record<string, string>;
  /** Built-in presets have no owner; custom (forked) presets do. */
  createdByName?: string;
}

// Identity mapping — every key displays as itself.
const CROWDCAD_DEFAULT_TERMS: Record<string, string> = Object.fromEntries(
  DISPATCH_TERMS.map((t) => [t.key, t.defaultLabel]),
);

// CrowdCAD French. Entries marked with the user's own supplied swaps are
// used verbatim; the rest are filled in with contextually-appropriate
// French event-medical/dispatch terminology.
const CROWDCAD_FRENCH_TERMS: Record<string, string> = {
  // Entities & roles
  Team: 'Équipe',
  Call: 'Appel',
  Clinic: 'Poste de secours',
  Supervisor: 'Superviseur',
  Post: 'Poste',
  Equipment: 'Équipement',
  Roaming: 'Mobile',
  Lead: 'Responsable',
  Walkup: 'Présentation spontanée',
  Unknown: 'Inconnu',

  // Call statuses
  Pending: 'En attente',
  Assigned: 'Assigné',
  'En Route': 'En route',
  'On Scene': 'Sur les lieux',
  Transporting: 'En transport',
  Delivered: 'Remis',
  Refusal: 'Refus de soins',
  NMM: 'Sans objet médical',
  'Treat and Release': 'Soigné sur place',
  'Unable to Locate': 'Introuvable',
  Rolled: 'Évacué',
  'Rolled from Scene': 'Transport direct',
  Resolved: 'Résolu',

  // Team / supervisor / equipment-run statuses
  Available: 'Disponible',
  Detached: 'Dégagé',
  'On Break': 'En pause',
  'In Clinic': 'À la clinique',
  'Delivered Eq': 'Équipement livré',
  'En Route Eq': 'Équipement en route',
  Assisting: 'En assistance',

  // Equipment
  'In Use': 'En utilisation',

  // Clinic outcomes
  Discharged: 'Sortie',
  AMA: 'SCAM',
  'Rolled from Clinic': 'Transféré',
  Transported: 'Transporté',
  'Pending Transport': 'En attente de transport',

  // Actions & labels
  'Total Calls': 'Appels totaux',
  'Call #': "Appel",
  'Chief Complaint': 'Plainte principale',
  'A/S': 'A/S',
  'Age/Sex': 'A/S',
  Status: 'Statut',
  'Primary Team': 'Équipe principale',
  Location: 'Position',
  'Add Call': 'Ajouter un appel',
  'New Call': 'Nouvel appel',
  'Add Team': 'Ajouter une équipe',
  'Add Supervisor': 'Ajouter un superviseur',
  'Add Equipment': 'Ajouter un équipement',
  'Add Patient': 'Ajouter un patient',
  Calls: 'Appels',
  Teams: 'Équipes',
  Supervisors: 'Superviseurs',
  'No calls': 'Aucun appel',
  'No clinic calls': 'Aucun appel au poste de secours',
  'No teams available': 'Aucune équipe disponible',
  'No available teams': 'Aucune équipe disponible',
  'No supervisors available': 'Aucun superviseur disponible',
  'No available supervisors': 'Aucun superviseur disponible',
  'No equipment available': 'Aucun équipement disponible',
  'No available equipment': 'Aucun équipement disponible',
  'No equipment configured': 'Aucun équipement configuré',
  'Show Resolved Calls': 'Afficher les appels résolus',
  'Hide Resolved Calls': 'Masquer les appels résolus',
  'Show Resolved Clinic Calls': 'Afficher les appels résolus du poste de secours',
  'Hide Resolved Clinic Calls': 'Masquer les appels résolus du poste de secours',
  'Total Patients': 'Total des patients',
  'Show Log': 'Afficher le registre',
  'Hide Log': 'Masquer le registre',
  'Mark as Duplicate': 'Marquer comme doublon',
  'Mark as Priority': 'Marquer comme prioritaire',
  'Remove Priority': 'Retirer la priorité',
  'Delete Call': "Supprimer l'appel",
  'Staging Location': 'Emplacement de préparation',
  'Delivery Team': 'Équipe de livraison',
  'Mark Ready': 'Marquer comme prêt',
  'Equipment Details': "Détails de l'équipement",
  'Supervisor Call Sign': 'Indicatif du superviseur',
  'Supervisor Name (optional)': 'Nom du superviseur (facultatif)',
  Certification: 'Certification',
  'Refresh Post': 'Actualiser le poste',
  'No location': 'Aucune position',
  'Clinic Status': 'Statut du poste de secours',
  'Team Members': "Membres de l'équipe",
  'Team Status': "Statut de l'équipe",
  'Team Name': "Nom de l'équipe",
  'Add New Team': 'Ajouter une nouvelle équipe',
  'Edit Team': "Modifier l'équipe",
  'Add New Supervisor': 'Ajouter un nouveau superviseur',
  'Edit Supervisor': 'Modifier le superviseur',
  Notes: 'Notes',
  'Add notes': 'Ajouter des notes',
  'Add notes about this equipment': 'Ajouter des notes sur cet équipement',
  'Not Set': 'Non défini',
  'Call ID': "ID d'appel",
  'No log entries': "Aucune entrée dans le registre",
  'Log for Call': "Registre de l'appel",
  'PRIORITY CALL: Life threat to patient/provider': 'APPEL PRIORITAIRE : menace vitale pour le patient ou l’intervenant',
  Edit: 'Modifier',
  Delete: 'Supprimer',
  'No members': 'Aucun membre',
  'Activity Log': 'Registre d’activité',
  'Add Clinic Walkup': 'Ajouter une présentation spontanée',
  Cancel: 'Annuler',
  Submit: 'Envoyer',
  'Member name': 'Nom du membre',
  'Save Changes': 'Enregistrer les modifications',
  'Save & add another': 'Enregistrer et ajouter une autre',
  'Save & close': 'Enregistrer et fermer',
  'Create Supervisor': 'Créer le superviseur',
  Source: 'Source',
  'Assign Team': 'Assigner une équipe',
  'Select a team': 'Sélectionner une équipe',
  'Venue Map': 'Plan du site',
  'Posting Schedule': 'Horaire des postes',
  'End Event': "Terminer l'événement",
  Venues: 'Sites',
  'Clear Event': "Réinitialiser l'événement",
  'Export Summary': 'Exporter le résumé',
  'On Calls': 'En intervention',
  'On Break/Clinic': 'En pause/clinique',
  'Surge limit reached': "Seuil d'affluence atteint",
  'Call pending': 'Appel en attente depuis',
  'surge alert activated': "alerte d'affluence activée",
  'Surge alert: multiple clinic calls pending transport': "Alerte d'affluence : plusieurs appels du poste de secours en attente de transport",
  'Reopen Call': "Rouvrir l'appel",
  'Revert this status and reopen the call?': "Annuler ce statut et rouvrir l'appel?",
  'Revert this equipment status and reattach it to the team?': "Annuler ce statut d'équipement et le réattribuer à l'équipe?",
  'Revert this supervisor detachment and reattach them to the call?': "Annuler le dégagement du superviseur et le réattribuer à l'appel?",
  'Revert this clinic outcome?': 'Annuler ce résultat clinique?',
  'Transport Unit #': "N° d'unité de transport",
  'Enter Transport Unit': 'Unité de transport',
  'All Calls': 'Tous les appels',
  'Sort calls': 'Trier les appels',
  Newest: 'Plus récent',
  Oldest: 'Plus ancien',
  'Filter by zone': 'Filtrer par zone',
  Map: 'Carte',
  Active: 'Actifs',
  Inactive: 'Inactif',
  'Pin Call': "Épingler l'appel",
  'Unpin Call': "Désépingler l'appel",
  Surge: 'Affluence',
  'Start surge': "Activer l'affluence",
  'Disable surge': "Désactiver l'affluence",
  'Are you sure you want to enable surge?': "Voulez-vous vraiment activer l'affluence?",
  'Are you sure you want to disable surge?': "Voulez-vous vraiment désactiver l'affluence?",
  'Total Calls Logged': 'Total des appels enregistrés',
  'No teams added yet': "Aucune équipe ajoutée pour l'instant",
  'No supervisors added yet': "Aucun superviseur ajouté pour l'instant",
  'Select clinic': 'Sélectionner un poste de secours',
  'Add patient (mobile)': 'Ajouter un patient (mobile)',
  'Add member': 'Ajouter un membre',
  'Remove member': 'Retirer un membre',
  'Equipment Name': "Nom de l'équipement",
  'Starting Location (optional)': 'Emplacement de départ (facultatif)',
  'Please enter a team name.': "Veuillez entrer un nom d'équipe.",
  'Team name already used.': 'Ce nom d\'équipe est déjà utilisé.',
  'This event has ended': 'Cet événement est terminé',
  'Data collection is locked. Go to the Event Summary for a read-only record.':
    'La collecte de données est verrouillée. Consultez le résumé de l\'événement pour un enregistrement en lecture seule.',
  'Go to Event Summary': "Consulter le résumé de l'événement",
};

export const BUILTIN_PRESETS: Record<BuiltinPresetId, DispatchVocabularyPresetSummary> = {
  [DEFAULT_PRESET_ID]: {
    id: DEFAULT_PRESET_ID,
    name: 'CrowdCAD Default',
    terms: CROWDCAD_DEFAULT_TERMS,
  },
  [FRENCH_PRESET_ID]: {
    id: FRENCH_PRESET_ID,
    name: 'CrowdCAD French',
    terms: CROWDCAD_FRENCH_TERMS,
  },
};

export function isBuiltinPresetId(id: string): id is BuiltinPresetId {
  return (BUILTIN_PRESET_IDS as readonly string[]).includes(id);
}
