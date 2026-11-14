'use client';

import React, { useMemo } from 'react';
import type { MciState } from '@/app/types';
import type { MciEquipmentItem, MciUnit } from '@/lib/mciDoc';
import LogisticsBoard, { type LogisticsHandlers } from '@/components/dispatch/mci/logisticsboard';
import { ErrorBanner, useRoleActions } from './roleparts';

/**
 * The Logistics role view (#144, D27): the same Logistics board as the dispatcher's tab, with the same
 * abilities (hand equipment to teams, hospitals, incoming staff with arrivals straight onto the board).
 * One section at a time under tabs on a phone, the three columns from laptop width. Every change goes
 * through /api/mci-role, so this login still never writes the event itself.
 */
export default function LogisticsView({ mci, units, equipment }: { mci: MciState; units: MciUnit[]; equipment: MciEquipmentItem[] }) {
  const actions = useRoleActions();
  const send = actions.send;
  const handlers: LogisticsHandlers = {
    incomingAdd: (name) => void send({ type: 'incomingAdd', name }),
    incomingUpdate: (id, changes) => void send({ type: 'incomingUpdate', id, ...changes }),
    incomingArrived: (id) => void send({ type: 'incomingArrived', id }),
    incomingCancel: (id) => void send({ type: 'incomingCancel', id }),
    incomingUndo: (id) => void send({ type: 'incomingUndo', id }),
    equipmentGive: (item, unit, exact) => void send({ type: 'equipmentGive', item, unit, ...(exact ? { exact } : {}) }),
    equipmentReturn: (name) => void send({ type: 'equipmentReturn', name }),
    hospitals: {
      onAdd: (name) => void send({ type: 'hospitalAdd', name }),
      onUpdate: (id, changes) => void send({ type: 'hospitalUpdate', id, ...changes }),
      onRemove: (id) => void send({ type: 'hospitalRemove', id }),
    },
  };
  const unitNames = useMemo(() => units.map((u) => u.name), [units]);
  return (
    <>
      <ErrorBanner error={actions.error} onClose={actions.clearError} />
      <LogisticsBoard
        mci={mci}
        units={unitNames}
        equipment={equipment}
        readOnly={false}
        handlers={handlers}
        tabs
        className="flex-1"
        bodyClassName="flex-1 overflow-y-auto px-4 pb-24 pt-3"
      />
    </>
  );
}
