// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Airport, Runway, WaypointDescriptor } from 'msfs-navdata';
import { FlightPlanElement, FlightPlanLeg } from '@fmgc/flightplanning/new/legs/FlightPlanLeg';
import { BaseFlightPlan } from '@fmgc/flightplanning/new/plans/BaseFlightPlan';
import { SegmentClass } from '@fmgc/flightplanning/new/segments/SegmentClass';
import { loadAllApproaches, loadAllArrivals, loadAllRunways } from '@fmgc/flightplanning/new/DataLoading';
import { FlightPlanSegment } from './FlightPlanSegment';
import { NavigationDatabaseService } from '../NavigationDatabaseService';

export class DestinationSegment extends FlightPlanSegment {
    class = SegmentClass.Arrival

    allLegs: FlightPlanElement[] = []

    private airport: Airport;

    constructor(
        flightPlan: BaseFlightPlan,
    ) {
        super(flightPlan);
    }

    public get destinationAirport() {
        return this.airport;
    }

    public async setDestinationIcao(icao: string) {
        const db = NavigationDatabaseService.activeDatabase.backendDatabase;

        const airports = await db.getAirports([icao]);
        const airport = airports.find((a) => a.ident === icao);

        if (!airport) {
            throw new Error(`[FMS/FPM] Can't find airport with ICAO '${icao}'`);
        }

        this.airport = airport;

        this.flightPlan.availableDestinationRunways = await loadAllRunways(this.destinationAirport);

        await this.refresh();

        this.flightPlan.availableArrivals = await loadAllArrivals(this.destinationAirport);
        this.flightPlan.availableApproaches = await loadAllApproaches(this.destinationAirport);
    }

    private runway?: Runway;

    public get destinationRunway() {
        return this.runway;
    }

    public async setDestinationRunway(runwayIdent: string) {
        const db = NavigationDatabaseService.activeDatabase.backendDatabase;

        if (!this.airport) {
            throw new Error('[FMS/FPM] Cannot set destination runway without destination airport');
        }

        const runways = await db.getRunways(this.airport.ident);

        const matchingRunway = runways.find((runway) => runway.ident === runwayIdent);

        if (!matchingRunway) {
            throw new Error(`[FMS/FPM] Can't find runway '${runwayIdent}' at ${this.airport.ident}`);
        }

        this.runway = matchingRunway;

        await this.refresh();
    }

    private async refresh() {
        this.allLegs.length = 0;

        const approach = this.flightPlan.approach;

        if (this.airport && approach) {
            const approachName = approach.ident ?? '';

            const lastApproachLeg = approach.legs[approach.legs.length - 1];
            const lastApproachLegIsRunway = lastApproachLeg.waypointDescriptor === WaypointDescriptor.Runway;

            if (lastApproachLegIsRunway) {
                this.allLegs.push(FlightPlanLeg.fromAirportAndRunway(this, approachName, this.airport, this.runway));
            }
        }

        this.flightPlan.availableApproaches = await loadAllApproaches(this.destinationAirport);
    }

    clone(forPlan: BaseFlightPlan): DestinationSegment {
        const newSegment = new DestinationSegment(forPlan);

        newSegment.allLegs = [...this.allLegs];
        newSegment.airport = this.airport;
        newSegment.runway = this.runway;

        return newSegment;
    }

    removeRange(_from: number, _to: number) {
        throw new Error('Not implemented');
    }

    removeAfter(_from: number) {
        throw new Error('Not implemented');
    }

    removeBefore(_before: number) {
        throw new Error('Not implemented');
    }
}
