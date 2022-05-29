// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Waypoint } from 'msfs-navdata';
import { FlightPlanElement, FlightPlanLeg } from '@fmgc/flightplanning/new/legs/FlightPlanLeg';
import { BaseFlightPlan } from '@fmgc/flightplanning/new/plans/BaseFlightPlan';
import { SegmentClass } from '@fmgc/flightplanning/new/segments/SegmentClass';
import { FlightPlanSegment } from './FlightPlanSegment';

export class EnrouteSegment extends FlightPlanSegment {
    class = SegmentClass.Enroute

    allLegs: FlightPlanElement[] = []

    constructor(
        flightPlan: BaseFlightPlan,
    ) {
        super(flightPlan);
    }

    insertWaypoint(waypoint: Waypoint) {
        this.insertLeg(FlightPlanLeg.fromEnrouteWaypoint(this, waypoint));
    }

    insertLeg(leg: FlightPlanLeg) {
        this.allLegs.push(leg);
    }

    insertLegs(...elements: FlightPlanLeg[]) {
        this.allLegs.push(...elements);
    }

    clone(forPlan: BaseFlightPlan): EnrouteSegment {
        const newSegment = new EnrouteSegment(forPlan);

        newSegment.allLegs = [...this.allLegs];

        return newSegment;
    }
}

export interface EnrouteElement {
    airwayIdent?: string,
    waypoint: Waypoint,
}
