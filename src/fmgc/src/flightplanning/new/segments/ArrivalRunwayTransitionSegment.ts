// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ProcedureTransition } from 'msfs-navdata';
import { FlightPlanSegment } from '@fmgc/flightplanning/new/segments/FlightPlanSegment';
import { FlightPlanElement } from '@fmgc/flightplanning/new/legs/FlightPlanLeg';
import { BaseFlightPlan } from '@fmgc/flightplanning/new/plans/BaseFlightPlan';
import { SegmentClass } from '@fmgc/flightplanning/new/segments/SegmentClass';

export class ArrivalRunwayTransitionSegment extends FlightPlanSegment {
    class = SegmentClass.Arrival

    allLegs: FlightPlanElement[] = []

    private arrivalRunwayTransition: ProcedureTransition | undefined = undefined

    get arrivalRunwayTransitionProcedure() {
        return this.arrivalRunwayTransition;
    }

    constructor(
        flightPlan: BaseFlightPlan,
    ) {
        super(flightPlan);
    }

    setArrivalRunwayTransition(transition: ProcedureTransition, legs: FlightPlanElement[]) {
        this.allLegs.length = 0;
        this.allLegs.push(...legs);
        this.strung = false;

        this.arrivalRunwayTransition = transition;

        this.flightPlan.restring();
    }

    clone(forPlan: BaseFlightPlan): ArrivalRunwayTransitionSegment {
        const newSegment = new ArrivalRunwayTransitionSegment(forPlan);

        newSegment.allLegs = [...this.allLegs];
        newSegment.arrivalRunwayTransition = this.arrivalRunwayTransition;

        return newSegment;
    }
}
