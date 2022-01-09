// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Airport, Waypoint } from 'msfs-navdata';
import { FlightPlanDefinition } from '@fmgc/flightplanning/new/FlightPlanDefinition';
import { FlightPlanSegment } from '@fmgc/flightplanning/new/segments/FlightPlanSegment';
import { AlternateFlightPlan } from '@fmgc/flightplanning/new/plans/AlternateFlightPlan';
import { BaseFlightPlan } from '@fmgc/flightplanning/new/plans/BaseFlightPlan';
import { FlightPlanElement } from '@fmgc/flightplanning/new/legs/FlightPlanLeg';

export class FlightPlan extends BaseFlightPlan {
    static empty(): FlightPlan {
        return new FlightPlan();
    }

    static fromDefinition(definition: FlightPlanDefinition): FlightPlan {
        return new FlightPlan();
    }

    /**
     * Alternate flight plan associated with this flight plan
     */
    alternateFlightPlan = new AlternateFlightPlan(this);

    clone(): FlightPlan {
        const newPlan = FlightPlan.empty();

        newPlan.originSegment = this.originSegment.clone(newPlan);
        newPlan.departureRunwayTransitionSegment = this.departureRunwayTransitionSegment.clone(newPlan);
        newPlan.departureSegment = this.departureSegment.clone(newPlan);
        newPlan.departureEnrouteTransitionSegment = this.departureEnrouteTransitionSegment.clone(newPlan);
        newPlan.enrouteSegment = this.enrouteSegment.clone(newPlan);
        newPlan.arrivalEnrouteTransitionSegment = this.arrivalEnrouteTransitionSegment.clone(newPlan);
        newPlan.arrivalSegment = this.arrivalSegment.clone(newPlan);
        newPlan.arrivalRunwayTransitionSegment = this.arrivalRunwayTransitionSegment.clone(newPlan);
        newPlan.approachViaSegment = this.approachViaSegment.clone(newPlan);
        newPlan.approachSegment = this.approachSegment.clone(newPlan);
        newPlan.destinationSegment = this.destinationSegment.clone(newPlan);
        newPlan.missedApproachSegment = this.missedApproachSegment.clone(newPlan);
        newPlan.alternateFlightPlan = this.alternateFlightPlan.clone(newPlan);

        newPlan.availableOriginRunways = [...this.availableOriginRunways];
        newPlan.availableDepartures = [...this.availableDepartures];
        newPlan.availableDestinationRunways = [...this.availableDestinationRunways];
        newPlan.availableArrivals = [...this.availableArrivals];
        newPlan.availableApproaches = [...this.availableApproaches];
        newPlan.availableApproachVias = [...this.availableApproachVias];

        return newPlan;
    }

    get alternateDestinationAirport(): Airport {
        return this.alternateFlightPlan.destinationAirport;
    }

    async setAlternateDestinationAirport(icao: string) {
        return this.alternateFlightPlan.setDestinationAirport(icao);
    }

    insertElementAfter(index: number, element: FlightPlanElement, insertDiscontinuity = false) {
        if (index < 0 || index > this.allLegs.length) {
            throw new Error(`[FMS/FPM] Tried to insert waypoint out of bounds (index=${index})`);
        }

        const [startSegment, indexInStartSegment] = this.getIndexInSegment(index);

        startSegment.insertAfter(indexInStartSegment, element);

        if (insertDiscontinuity) {
            startSegment.insertAfter(indexInStartSegment + 1, { isDiscontinuity: true });

            this.incrementVersion();
            return;
        }

        if (element.isDiscontinuity === false && element.isXF()) {
            const duplicate = this.findDuplicate(element.terminationWaypoint(), index + 1);

            if (duplicate) {
                const [,, duplicatePlanIndex] = duplicate;

                this.removeRange(index + 2, duplicatePlanIndex + 1);
            } else {
                startSegment.insertAfter(indexInStartSegment + 1, { isDiscontinuity: true });
            }
        }

        this.incrementVersion();
        this.redistributeLegsAt(index + 1);
    }

    private getIndexInSegment(index: number): [segment: FlightPlanSegment, index: number] {
        let accumulator = 0;

        for (const segment of this.orderedSegments) {
            if (segment.allLegs.length === 0) {
                continue;
            }

            accumulator += segment.allLegs.length;

            if (accumulator >= index) {
                return [segment, index - (accumulator - segment.allLegs.length)];
            }
        }

        throw new Error(`[FMS/FPM] Tried to find segment for an out of bounds index (index=${index})`);
    }

    findDuplicate(waypoint: Waypoint, afterIndex?: number): [FlightPlanSegment, number, number] | null {
        // There is never gonna be a duplicate in the origin

        let indexAccumulator = 0;

        for (const segment of this.orderedSegments) {
            indexAccumulator += segment.allLegs.length;

            if (indexAccumulator > afterIndex) {
                const dupeIndexInSegment = segment.findIndexOfWaypoint(waypoint, afterIndex - (indexAccumulator - segment.allLegs.length));

                const planIndex = indexAccumulator - segment.allLegs.length + dupeIndexInSegment;

                if (planIndex <= afterIndex) {
                    continue;
                }

                if (dupeIndexInSegment !== -1) {
                    return [segment, dupeIndexInSegment, planIndex];
                }
            }
        }

        return null;
    }

    private removeRange(start: number, end: number) {
        const [startSegment, indexInStartSegment] = this.getIndexInSegment(start);
        const [endSegment, indexInEndSegment] = this.getIndexInSegment(end);

        if (!startSegment || !endSegment) {
            throw new Error('[FMS/FPM] Range out of bounds');
        }

        if (startSegment === endSegment) {
            startSegment.removeRange(indexInStartSegment, indexInEndSegment);
        } else {
            let startFound = false;
            for (const segment of this.orderedSegments) {
                if (!startFound && segment !== startSegment) {
                    continue;
                }

                if (segment === startSegment) {
                    startFound = true;

                    segment.removeAfter(indexInStartSegment);
                    continue;
                }

                if (segment === endSegment) {
                    segment.removeBefore(indexInEndSegment);
                    return;
                }

                segment.allLegs.length = 0;
            }
        }
    }
}
