// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Airport, Database, ExternalBackend, MsfsBackend, Waypoint } from 'msfs-navdata';

/**
 * The backend for a navigation database
 */
export enum NavigationDatabaseBackend {
    Msfs,
    Navigraph,
}

/**
 * High level abstraction for the FMS navigation database
 *
 * Only to be used by user-facing functions to search for data. Raw flight plan editing should use the `backendDatabase` property directly
 */
export class NavigationDatabase {
    readonly backendDatabase: Database

    constructor(
        backend: NavigationDatabaseBackend,
    ) {
        if (backend === NavigationDatabaseBackend.Msfs) {
            this.backendDatabase = new Database(new MsfsBackend() as any);
        } else if (backend === NavigationDatabaseBackend.Navigraph) {
            this.backendDatabase = new Database(new ExternalBackend('http://localhost:5000'));
        } else {
            throw new Error('[FMS/DB] Cannot instantiate NavigationDatabase with backend other than \'Msfs\' or \'Navigraph\'');
        }
    }

    async searchAirport(icao: string): Promise<Airport> {
        return this.backendDatabase.getAirports([icao]).then((results) => results[0]);
    }

    async searchFix(ident: string): Promise<Waypoint[]> {
        return this.backendDatabase.getWaypoints([ident]);
    }
}
