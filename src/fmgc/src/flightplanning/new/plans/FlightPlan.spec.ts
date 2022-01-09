// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import fetch from 'node-fetch';

import { setupNavigraphDatabase } from '@fmgc/flightplanning/new/test/Database';
import { FlightPlan } from '@fmgc/flightplanning/new/plans/FlightPlan';
import { loadSingleWaypoint } from '@fmgc/flightplanning/new/segments/enroute/WaypointLoading';
import { FlightPlanLeg } from '@fmgc/flightplanning/new/legs/FlightPlanLeg';
import { assertDiscontinuity, assertNotDiscontinuity } from '@fmgc/flightplanning/new/test/LegUtils';
import { LegType } from 'msfs-navdata';
import { loadAirwayLegs } from '@fmgc/flightplanning/new/segments/enroute/AirwayLoading';

if (!globalThis.fetch) {
    globalThis.fetch = fetch;
}

describe('a base flight plan', () => {
    beforeAll(() => {
        setupNavigraphDatabase();
    });

    it('can insert a leg', async () => {
        const fp = FlightPlan.empty();

        await fp.setOriginAirport('CYUL');
        await fp.setOriginRunway('RW06R');
        await fp.setDeparture('CYUL1');

        await fp.setDestinationAirport('CYYZ');
        await fp.setDestinationRunway('RW05');
        await fp.setApproach('I05');
        await fp.setArrival('BOXUM5');

        const waypoint = await loadSingleWaypoint('NOSUS', 'WCYCYULNOSUS');

        const leg = FlightPlanLeg.fromEnrouteWaypoint(fp.enrouteSegment, waypoint);

        fp.insertElementAfter(3, leg, true);

        const fpLeg = assertNotDiscontinuity(fp.allLegs[4]);

        expect(fpLeg.ident).toEqual('NOSUS');
        expect(fp.allLegs[5].isDiscontinuity).toBeTruthy();

        expect(fp.allLegs).toHaveLength(24);
    });

    describe('deleting legs', () => {
        it('without inserting a discontinuity', async () => {
            const fp = FlightPlan.empty();

            await fp.setOriginAirport('CYYZ');
            await fp.setOriginRunway('RW06R');
            await fp.setDeparture('AVSEP6');

            fp.removeElementAt(5, false);

            expect(assertNotDiscontinuity(fp.elementAt(5)).ident).toBe('AVSEP');
        });

        it('inserting a discontinuity', async () => {
            const fp = FlightPlan.empty();

            await fp.setOriginAirport('CYYZ');
            await fp.setOriginRunway('RW06R');
            await fp.setDeparture('AVSEP6');

            fp.removeElementAt(5, true);

            assertDiscontinuity(fp.elementAt(5));
            expect(assertNotDiscontinuity(fp.elementAt(6)).ident).toBe('AVSEP');
        });

        it('not duplicating a discontinuity', async () => {
            const fp = FlightPlan.empty();

            await fp.setOriginAirport('CYYZ');
            await fp.setOriginRunway('RW06R');
            await fp.setDeparture('AVSEP6');

            fp.removeElementAt(4, true);

            expect(assertNotDiscontinuity(fp.elementAt(4)).ident).toBe('DUVKO');
        });
    });

    describe('editing the departure or arrival', () => {
        it('should truncate departure segment after it is edited', async () => {
            const flightPlan = FlightPlan.empty();

            await flightPlan.setOriginAirport('CYYZ');
            await flightPlan.setOriginRunway('RW06R');
            await flightPlan.setDeparture('AVSEP6');

            flightPlan.removeElementAt(4);

            expect(flightPlan.departureRunwayTransitionSegment.allLegs).toHaveLength(4);

            const lastLegOfTruncatedDeparture = assertNotDiscontinuity(flightPlan.departureRunwayTransitionSegment.allLegs[3]);
            expect(lastLegOfTruncatedDeparture.ident).toEqual('DUVKO');

            expect(flightPlan.departureSegment.allLegs).toHaveLength(0);

            expect(flightPlan.departureEnrouteTransitionSegment.allLegs).toHaveLength(0);

            expect(flightPlan.enrouteSegment.allLegs).toHaveLength(2);

            const firstLegOfEnroute = assertNotDiscontinuity(flightPlan.enrouteSegment.allLegs[0]);
            expect(firstLegOfEnroute.ident).toEqual('AVSEP');
        });

        it('should insert a discontinuity when deleting a leg', async () => {
            const flightPlan = FlightPlan.empty();

            await flightPlan.setOriginAirport('CYYZ');
            await flightPlan.setOriginRunway('RW06R');
            await flightPlan.setDeparture('AVSEP6');

            flightPlan.removeElementAt(5, true);

            expect(assertNotDiscontinuity(flightPlan.elementAt(4)).ident).toBe('KEDSI');
            assertDiscontinuity(flightPlan.elementAt(5));
            expect(assertNotDiscontinuity(flightPlan.elementAt(6)).ident).toBe('AVSEP');
        });
    });

    describe('collapsing waypoints', () => {
        it('should collapse waypoints within one segment', async () => {
            const flightPlan = FlightPlan.empty();
            const segment = flightPlan.enrouteSegment;

            const w1 = await loadSingleWaypoint('NOSUS', 'WCYCYULNOSUS');
            const w2 = await loadSingleWaypoint('NAPEE', 'WCY    NAPEE');
            const w3 = await loadSingleWaypoint('PBERG', 'WK6    PBERG');
            const w4 = await loadSingleWaypoint('HOVOB', 'WK6    HOVOB');

            segment.insertWaypoint(w1);
            segment.insertWaypoint(w2);
            segment.insertWaypoint(w3);
            segment.insertWaypoint(w4);

            const l1 = assertNotDiscontinuity(flightPlan.allLegs[0]);
            const l2 = assertNotDiscontinuity(flightPlan.allLegs[1]);
            const l3 = assertNotDiscontinuity(flightPlan.allLegs[2]);
            const l4 = assertNotDiscontinuity(flightPlan.allLegs[3]);

            expect(l1.ident).toEqual('NOSUS');
            expect(l2.ident).toEqual('NAPEE');
            expect(l3.ident).toEqual('PBERG');
            expect(l4.ident).toEqual('HOVOB');

            flightPlan.insertElementAfter(0, FlightPlanLeg.fromEnrouteWaypoint(segment, w4));

            expect(flightPlan.allLegs).toHaveLength(2);
            expect(assertNotDiscontinuity(flightPlan.allLegs[1]).ident).toEqual('HOVOB');
        });

        it('should collapse waypoints across segments', async () => {
            const flightPlan = FlightPlan.empty();
            const departure = flightPlan.departureSegment;

            await flightPlan.setOriginAirport('NZQN');
            await flightPlan.setOriginRunway('RW05');
            await departure.setDepartureProcedure('ANPO3A');

            await flightPlan.setDepartureEnrouteTransition('SAVLA');

            const enroute = flightPlan.enrouteSegment;

            const airwayLegs = await loadAirwayLegs(enroute, 'Y569', 'ENZ    Y569', 'WNZ    SAVLA', 'WNZ   PEDPO');

            enroute.insertLegs(...airwayLegs);

            expect(flightPlan.allLegs).toHaveLength(14);

            const w1 = await loadSingleWaypoint('PEDPO', 'WNZ    PEDPO');

            flightPlan.insertElementAfter(4, FlightPlanLeg.fromEnrouteWaypoint(enroute, w1));

            expect(flightPlan.allLegs).toHaveLength(6);
            expect(assertNotDiscontinuity(flightPlan.allLegs[4]).ident).toEqual('QN852');
            expect(assertNotDiscontinuity(flightPlan.allLegs[5]).ident).toEqual('PEDPO');
        });
    });

    it('connects segments by merging TF -> XF legs', async () => {
        const fp = FlightPlan.empty();

        await fp.setDestinationAirport('EGLL');
        await fp.setDestinationRunway('RW27R');
        await fp.setApproach('I27R');
        await fp.setApproachVia('LAM');
        await fp.setArrival('LOGA2H');

        const leg4 = fp.allLegs[4];
        const leg5 = fp.allLegs[5];

        expect(assertNotDiscontinuity(leg4).ident).toBe('LAM');
        expect(assertNotDiscontinuity(leg4).type).toBe(LegType.TF);
        expect(assertNotDiscontinuity(leg5).ident).toBe('LAM/11');
        expect(assertNotDiscontinuity(leg5).type).toBe(LegType.FD);
    });
});
