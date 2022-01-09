// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { normaliseApproachName } from '@shared/flightplan';
import { FlightPlanService } from './flightplanning/new/FlightPlanService';
import { NavigationDatabase, NavigationDatabaseBackend } from './NavigationDatabase';
import { FlightPlanManager } from './flightplanning/FlightPlanManager';
import { FlightPhaseManager, getFlightPhaseManager } from './flightphase';
import { FlightPlanAsoboSync } from './flightplanning/FlightPlanAsoboSync';
import { GuidanceManager } from './guidance/GuidanceManager';
import { GuidanceController } from './guidance/GuidanceController';
import { NavRadioManager } from './radionav/NavRadioManager';
import { EfisSymbols } from './efis/EfisSymbols';
import { DescentBuilder } from './guidance/vnav/descent/DescentBuilder';
import { DecelPathBuilder } from './guidance/vnav/descent/DecelPathBuilder';
import { VerticalFlightPlanBuilder } from './guidance/vnav/verticalFlightPlan/VerticalFlightPlanBuilder';
import { initComponents, updateComponents, recallMessageById } from './components';
import { WaypointBuilder } from './flightplanning/WaypointBuilder';
import { FlightPlanIndex } from './flightplanning/new/FlightPlanManager';

function initFmgcLoop(baseInstrument: BaseInstrument, flightPlanManager: FlightPlanManager): void {
    initComponents(baseInstrument, flightPlanManager);
}

function updateFmgcLoop(deltaTime: number): void {
    updateComponents(deltaTime);
}

export {
    FlightPlanService,
    NavigationDatabase,
    NavigationDatabaseBackend,
    FlightPlanIndex,
    FlightPhaseManager,
    getFlightPhaseManager,
    FlightPlanManager,
    FlightPlanAsoboSync,
    GuidanceManager,
    GuidanceController,
    NavRadioManager,
    initFmgcLoop,
    updateFmgcLoop,
    recallMessageById,
    EfisSymbols,
    DescentBuilder,
    DecelPathBuilder,
    VerticalFlightPlanBuilder,
    WaypointBuilder,
    normaliseApproachName,
};
