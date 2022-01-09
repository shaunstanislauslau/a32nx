// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Geometry } from '@fmgc/guidance/Geometry';
import { LnavConfig } from '@fmgc/guidance/LnavConfig';
import { BaseFlightPlan } from '@fmgc/flightplanning/new/plans/BaseFlightPlan';
import { Leg } from '@fmgc/guidance/lnav/legs/Leg';
import { Transition } from '@fmgc/guidance/lnav/Transition';
import { FlightPlanElement, FlightPlanLeg } from '@fmgc/flightplanning/new/legs/FlightPlanLeg';
import { LegType } from 'msfs-navdata';
import { TFLeg } from '@fmgc/guidance/lnav/legs/TF';
import { SegmentType } from '@fmgc/flightplanning/FlightPlanSegment';
import { IFLeg } from '@fmgc/guidance/lnav/legs/IF';
import { CALeg } from '@fmgc/guidance/lnav/legs/CA';
import { AFLeg } from '@fmgc/guidance/lnav/legs/AF';
import { fixCoordinates } from '@fmgc/flightplanning/new/utils';
import { CFLeg } from '@fmgc/guidance/lnav/legs/CF';
import { CILeg } from '@fmgc/guidance/lnav/legs/CI';
import { TransitionPicker } from '@fmgc/guidance/lnav/TransitionPicker';
import { DFLeg } from '@fmgc/guidance/lnav/legs/DF';
import { legMetadataFromFlightPlanLeg } from '@fmgc/guidance/lnav/legs';
import { XFLeg } from '@fmgc/guidance/lnav/legs/XF';
import { VMLeg } from '@fmgc/guidance/lnav/legs/VM';
import { RFLeg } from '@fmgc/guidance/lnav/legs/RF';

export namespace GeometryFactory {
    export function createFromFlightPlan(plan: BaseFlightPlan, doGenerateTransitions = true): Geometry {
        const legs = new Map<number, Leg>();
        const transitions = new Map<number, Transition>();

        let runningMagvar = 0;

        const planElements = plan.allLegs;
        for (let i = 0; i < planElements.length; i++) {
            const prevElement = planElements[i - 1];
            const element = planElements[i];
            const nextElement = planElements[i + 1];

            if (element.isDiscontinuity === true) {
                continue;
            }

            if (element.isXF()) {
                const fixLocation = element.terminationWaypoint().location;

                runningMagvar = Facilities.getMagVar(fixLocation.lat, fixLocation.lon);
            }

            let nextGeometryLeg;
            if (nextElement?.isDiscontinuity === false && nextElement.type !== LegType.CI && nextElement.type !== LegType.VI) {
                nextGeometryLeg = geometryLegFromFlightPlanLeg(runningMagvar, element, nextElement);
            }

            const geometryLeg = geometryLegFromFlightPlanLeg(runningMagvar, prevElement, element, nextGeometryLeg);

            const previousGeometryLwg = legs.get(i - 1);

            if (previousGeometryLwg && doGenerateTransitions && doGenerateTransitionsForLeg(geometryLeg, i, plan)) {
                const transition = TransitionPicker.forLegs(previousGeometryLwg, geometryLeg);

                transitions.set(i - 1, transition);
            }

            legs.set(i, geometryLeg);
        }

        return new Geometry(transitions, legs, false);
    }

    export function updateFromFlightPlan(geometry: Geometry, flightPlan: BaseFlightPlan, doGenerateTransitions = true) {
        if (LnavConfig.DEBUG_GEOMETRY) {
            console.log('[Fms/Geometry/Update] Starting geometry update.');
        }

        let runningMagvar = 0;

        for (let i = flightPlan.activeLegIndex - 1; i < flightPlan.legCount; i++) {
            const oldLeg = geometry.legs.get(i);

            const previousPlanLeg = flightPlan.allLegs[i - 1];
            const nextPlanLeg = flightPlan.allLegs[i + 1];

            const planLeg = flightPlan.allLegs[i];

            if (planLeg.isDiscontinuity === false && planLeg.isXF()) {
                const fixLocation = planLeg.terminationWaypoint().location;

                runningMagvar = Facilities.getMagVar(fixLocation.lat, fixLocation.lon);
            }

            let nextLeg: Leg;
            if (nextPlanLeg?.isDiscontinuity === false && nextPlanLeg.type !== LegType.CI && nextPlanLeg.type !== LegType.VI) {
                nextLeg = geometryLegFromFlightPlanLeg(runningMagvar, planLeg, nextPlanLeg);
            }

            const newLeg = planLeg?.isDiscontinuity === false ? geometryLegFromFlightPlanLeg(runningMagvar, previousPlanLeg, planLeg, nextLeg) : undefined;

            if (LnavConfig.DEBUG_GEOMETRY) {
                console.log(`[FMS/Geometry/Update] Old leg #${i} = ${oldLeg?.repr ?? '<none>'}`);
                console.log(`[FMS/Geometry/Update] New leg #${i} = ${newLeg?.repr ?? '<none>'}`);
            }

            const legsMatch = oldLeg?.repr === newLeg?.repr;

            if (legsMatch) {
                if (LnavConfig.DEBUG_GEOMETRY) {
                    console.log('[FMS/Geometry/Update] Old and new leg are the same. Keeping old leg.');
                }

                // Sync fixes

                if (oldLeg instanceof XFLeg && newLeg instanceof XFLeg) {
                    oldLeg.fix = newLeg.fix;
                }

                const prevLeg = geometry.legs.get(i - 1);

                const oldInboundTransition = geometry.transitions.get(i - 1);
                const newInboundTransition = TransitionPicker.forLegs(prevLeg, newLeg);

                const transitionsMatch = oldInboundTransition?.repr === newInboundTransition?.repr;

                if (!transitionsMatch && doGenerateTransitions && doGenerateTransitionsForLeg(newLeg, i, flightPlan)) {
                    geometry.transitions.set(i - 1, newInboundTransition);
                }
            } else {
                if (LnavConfig.DEBUG_GEOMETRY) {
                    if (!oldLeg) console.log('[FMS/Geometry/Update] No old leg. Adding new leg.');
                    else if (!newLeg) console.log('[FMS/Geometry/Update] No new leg. Removing old leg.');
                    else console.log('[FMS/Geometry/Update] Old and new leg are different. Keeping new leg.');
                }

                if (newLeg) {
                    geometry.legs.set(i, newLeg);

                    const prevLeg = geometry.legs.get(i - 1);

                    if (prevLeg && doGenerateTransitions && doGenerateTransitionsForLeg(newLeg, i, flightPlan)) {
                        const newInboundTransition = TransitionPicker.forLegs(prevLeg, newLeg);

                        if (LnavConfig.DEBUG_GEOMETRY) {
                            console.log(`[FMS/Geometry/Update] Set new inbound transition for new leg (${newInboundTransition?.repr ?? '<none>'})`);
                        }

                        if (newInboundTransition) {
                            geometry.transitions.set(i - 1, newInboundTransition);
                        } else {
                            geometry.transitions.delete(i - 1);
                        }
                    } else {
                        geometry.transitions.delete(i - 1);
                    }
                } else {
                    geometry.legs.delete(i);
                    geometry.transitions.delete(i - 1);
                    geometry.transitions.delete(i);
                }
            }
        }

        // Trim geometry

        for (const [index] of geometry.legs.entries()) {
            const legBeforePrev = index < flightPlan.activeLegIndex - 1;
            const legAfterLastWpt = index >= flightPlan.legCount;

            if (legBeforePrev || legAfterLastWpt) {
                if (LnavConfig.DEBUG_GEOMETRY) {
                    console.log(`[FMS/Geometry/Update] Removed leg #${index} (${geometry.legs.get(index)?.repr ?? '<unknown>'}) because of trimming.`);
                }

                geometry.legs.delete(index);
                geometry.transitions.delete(index - 1);
            }
        }

        if (LnavConfig.DEBUG_GEOMETRY) {
            console.log('[Fms/Geometry/Update] Done with geometry update.');
        }
    }
}

function geometryLegFromFlightPlanLeg(runningMagvar: Degrees, previousFlightPlanLeg: FlightPlanElement | undefined, flightPlanLeg: FlightPlanLeg, nextGeometryLeg?: Leg): Leg {
    const legType = flightPlanLeg.type;

    if (previousFlightPlanLeg?.isDiscontinuity === true && legType !== LegType.IF) {
        throw new Error('[FMS/Geometry] Cannot create non-IF geometry leg after discontinuity');
    }

    const editableData = legMetadataFromFlightPlanLeg(flightPlanLeg);

    const trueCourse = flightPlanLeg.definition.magneticCourse + runningMagvar;
    const trueTheta = flightPlanLeg.definition.theta + runningMagvar;

    switch (legType) {
    case LegType.AF: {
        const waypoint = flightPlanLeg.terminationWaypoint();
        const recommendedNavaid = flightPlanLeg.definition.recommendedNavaid;
        const navaid = 'vorLocation' in recommendedNavaid ? recommendedNavaid.vorLocation : recommendedNavaid.location;
        const rho = flightPlanLeg.definition.rho;

        return new AFLeg(waypoint, fixCoordinates(navaid), rho, trueTheta, trueCourse, editableData, SegmentType.Departure);
    }
    case LegType.CA:
    case LegType.FA:
    case LegType.VA: {
        const altitude = flightPlanLeg.definition.altitude1;

        return new CALeg(trueCourse, altitude, editableData, SegmentType.Departure);
    }
    case LegType.CD:
        break;
    case LegType.CF: {
        const fix = flightPlanLeg.terminationWaypoint();

        return new CFLeg(fix, trueCourse, editableData, SegmentType.Departure);
    }
    case LegType.CI:
    case LegType.VI: {
        if (!nextGeometryLeg) {
            throw new Error('[FMS/Geometry] Cannot make a CI leg without the next geometry leg being defined');
        }

        return new CILeg(trueCourse, nextGeometryLeg, editableData, SegmentType.Departure);
    }
    case LegType.CR:
        break;
    case LegType.HA:
    case LegType.HF:
    case LegType.HM:
    case LegType.DF: {
        const waypoint = flightPlanLeg.terminationWaypoint();

        return new DFLeg(waypoint, editableData, SegmentType.Departure);
    }
    // case LegType.FA:
    //     break;
    case LegType.FC:
        break;
    case LegType.FD:
        break;
        // case LegType.FM:
        //     break;
    // case LegType.HA:
    //     break;
    // case LegType.HF:
    //     break;
    // case LegType.HM:
    //     break;
    case LegType.IF: {
        const waypoint = flightPlanLeg.terminationWaypoint();

        return new IFLeg(waypoint, editableData, SegmentType.Departure);
    }
    case LegType.PI:
        break;
    case LegType.RF:
    case LegType.TF: {
        const prev = previousFlightPlanLeg as FlightPlanLeg;

        if (!prev.isXF()) {
            throw new Error('[FMS/Geometry] Cannot create a TF leg after a non-XF leg');
        }

        const prevWaypoint = prev.terminationWaypoint();
        const waypoint = flightPlanLeg.terminationWaypoint();
        const center = flightPlanLeg.definition.arcCentreFix;

        if (legType === LegType.RF) {
            return new RFLeg(prevWaypoint, waypoint, fixCoordinates(center.location), editableData, SegmentType.Departure);
        }

        return new TFLeg(prevWaypoint, waypoint, editableData, SegmentType.Departure);
    }
    // case LegType.VA:
    //     break;
    case LegType.VD:
        break;
    // case LegType.VI:
    //     break;
    case LegType.FM:
    case LegType.VM: {
        return new VMLeg(trueCourse, trueCourse, editableData, SegmentType.Departure);
    }
    case LegType.VR:
        break;
    default:
        break;
    }

    throw new Error(`[FMS/Geometry] Could not generate geometry leg for flight plan leg type=${LegType[legType]}`);
}

function doGenerateTransitionsForLeg(leg: Leg, legIndex: number, plan: BaseFlightPlan) {
    const generateAllTransitions = LnavConfig.NUM_COMPUTED_TRANSITIONS_AFTER_ACTIVE === -1;
    const positionFromActiveLeg = legIndex - plan.activeLegIndex;

    const inRange = generateAllTransitions || positionFromActiveLeg < 2;

    if (!inRange) {
        return false;
    }

    if (leg.metadata.isInMissedApproach) {
        return legIndex <= plan.firstMissedApproachLeg;
    }

    return true;
}
