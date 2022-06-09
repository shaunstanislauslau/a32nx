import { RequestedVerticalMode, TargetAltitude, TargetVerticalSpeed } from '@fmgc/guidance/ControlLaws';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { AircraftToDescentProfileRelation } from '@fmgc/guidance/vnav/descent/AircraftToProfileRelation';
import { NavGeometryProfile } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { VerticalMode } from '@shared/autopilot';
import { FmgcFlightPhase } from '@shared/flightphase';
import { SpeedMargin } from './SpeedMargin';

enum DescentVerticalGuidanceState {
    InvalidProfile,
    ProvidingGuidance,
    Observing
}

enum DescentSpeedGuidanceState {
    NotInDescentPhase,
    TargetOnly,
    TargetAndMargins,
}

export class LatchedDescentGuidance {
    private verticalState: DescentVerticalGuidanceState = DescentVerticalGuidanceState.InvalidProfile;

    private speedState: DescentSpeedGuidanceState = DescentSpeedGuidanceState.NotInDescentPhase;

    private requestedVerticalMode: RequestedVerticalMode = RequestedVerticalMode.None;

    private targetAltitude: TargetAltitude = 0;

    private targetAltitudeGuidance: TargetAltitude = 0;

    private targetVerticalSpeed: TargetVerticalSpeed = 0;

    private showLinearDeviationOnPfd: boolean = false;

    private showDescentLatchOnPfd: boolean = false;

    private speedMargin: SpeedMargin;

    private speedTarget: Knots | Mach;

    private tdReached: boolean;

    // An "overspeed condition" just means we are above the speed margins, not that we are in the red band.
    // We use a boolean here for hysteresis
    private isInOverspeedCondition: boolean = false;

    constructor(
        private aircraftToDescentProfileRelation: AircraftToDescentProfileRelation,
        private observer: VerticalProfileComputationParametersObserver,
        private atmosphericConditions: AtmosphericConditions,
    ) {
        this.speedMargin = new SpeedMargin(this.observer);

        this.writeToSimVars();
    }

    updateProfile(profile: NavGeometryProfile) {
        this.aircraftToDescentProfileRelation.updateProfile(profile);

        if (!this.aircraftToDescentProfileRelation.isValid) {
            this.changeState(DescentVerticalGuidanceState.InvalidProfile);
        }
    }

    private changeState(newState: DescentVerticalGuidanceState) {
        if (this.verticalState === newState) {
            return;
        }

        if (this.verticalState !== DescentVerticalGuidanceState.InvalidProfile && newState === DescentVerticalGuidanceState.InvalidProfile) {
            this.reset();
            this.writeToSimVars();
        }

        this.verticalState = newState;
    }

    private reset() {
        this.requestedVerticalMode = RequestedVerticalMode.None;
        this.targetAltitude = 0;
        this.targetVerticalSpeed = 0;
        this.showLinearDeviationOnPfd = false;
        this.showDescentLatchOnPfd = false;
        this.isInOverspeedCondition = false;
    }

    update() {
        this.aircraftToDescentProfileRelation.update();

        if (!this.aircraftToDescentProfileRelation.isValid) {
            return;
        }

        if ((this.observer.get().fcuVerticalMode === VerticalMode.DES) !== (this.verticalState === DescentVerticalGuidanceState.ProvidingGuidance)) {
            this.changeState(this.verticalState === DescentVerticalGuidanceState.ProvidingGuidance ? DescentVerticalGuidanceState.Observing : DescentVerticalGuidanceState.ProvidingGuidance);
        }
        this.updateSpeedMarginState();

        this.updateSpeedTarget();
        this.updateSpeedGuidance();
        this.updateOverspeedCondition();
        this.updateLinearDeviation();

        if (this.verticalState === DescentVerticalGuidanceState.ProvidingGuidance) {
            this.updateDesModeGuidance();
        }

        this.writeToSimVars();
        this.updateTdReached();
    }

    updateTdReached() {
        const { flightPhase } = this.observer.get();
        const isPastTopOfDescent = this.aircraftToDescentProfileRelation.isPastTopOfDescent();
        const isInManagedSpeed = Simplane.getAutoPilotAirspeedManaged();

        const tdReached = flightPhase <= FmgcFlightPhase.Cruise && isPastTopOfDescent && isInManagedSpeed;
        if (tdReached !== this.tdReached) {
            this.tdReached = tdReached;
            SimVar.SetSimVarValue('L:A32NX_PFD_MSG_TD_REACHED', 'boolean', this.tdReached);
        }
    }

    private updateLinearDeviation() {
        this.targetAltitude = this.aircraftToDescentProfileRelation.currentTargetAltitude();

        this.showLinearDeviationOnPfd = this.observer.get().flightPhase >= FmgcFlightPhase.Descent || this.aircraftToDescentProfileRelation.isPastTopOfDescent();
    }

    private updateDesModeGuidance() {
        const isAboveSpeedLimitAltitude = this.aircraftToDescentProfileRelation.isAboveSpeedLimitAltitude();
        const isBeforeTopOfDescent = !this.aircraftToDescentProfileRelation.isPastTopOfDescent();
        const linearDeviation = this.aircraftToDescentProfileRelation.computeLinearDeviation();

        this.targetAltitudeGuidance = this.atmosphericConditions.estimatePressureAltitudeInMsfs(
            this.aircraftToDescentProfileRelation.currentTargetAltitude(),
        );

        if (linearDeviation > 200 || this.isInOverspeedCondition) {
            // Above path
            this.requestedVerticalMode = RequestedVerticalMode.SpeedThrust;
            this.showDescentLatchOnPfd = false;
        } else if (isBeforeTopOfDescent || linearDeviation < -200) {
            // Below path
            this.requestedVerticalMode = RequestedVerticalMode.VsSpeed;
            this.targetVerticalSpeed = (isAboveSpeedLimitAltitude ? -1000 : -500);
            this.showDescentLatchOnPfd = false;
        } else {
            // On path
            this.requestedVerticalMode = RequestedVerticalMode.VpathSpeed;
            this.targetVerticalSpeed = this.aircraftToDescentProfileRelation.currentTargetVerticalSpeed();
            this.showDescentLatchOnPfd = true;
        }
    }

    private updateSpeedTarget() {
        const { fcuSpeed, managedDescentSpeedMach } = this.observer.get();
        const inManagedSpeed = Simplane.getAutoPilotAirspeedManaged();

        this.speedTarget = inManagedSpeed
            ? Math.round(this.iasOrMach(this.aircraftToDescentProfileRelation.currentTargetSpeed(), managedDescentSpeedMach))
            : fcuSpeed;
    }

    private writeToSimVars() {
        SimVar.SetSimVarValue('L:A32NX_FG_REQUESTED_VERTICAL_MODE', 'Enum', this.requestedVerticalMode);
        SimVar.SetSimVarValue('L:A32NX_FG_TARGET_ALTITUDE', 'Feet', this.targetAltitudeGuidance);
        SimVar.SetSimVarValue('L:A32NX_FG_TARGET_VERTICAL_SPEED', 'number', this.targetVerticalSpeed);

        SimVar.SetSimVarValue('L:A32NX_PFD_TARGET_ALTITUDE', 'Feet', this.targetAltitude);
        SimVar.SetSimVarValue('L:A32NX_PFD_LINEAR_DEVIATION_ACTIVE', 'Bool', this.showLinearDeviationOnPfd);
        SimVar.SetSimVarValue('L:A32NX_PFD_VERTICAL_PROFILE_LATCHED', 'Bool', this.showDescentLatchOnPfd);
    }

    private updateSpeedGuidance() {
        if (this.speedState === DescentSpeedGuidanceState.NotInDescentPhase) {
            return;
        }

        SimVar.SetSimVarValue('L:A32NX_SPEEDS_MANAGED_PFD', 'knots', this.speedTarget);

        const guidanceTarget = this.speedState === DescentSpeedGuidanceState.TargetAndMargins
            ? this.speedMargin.getMargins(this.speedTarget)[1]
            : this.speedTarget;
        SimVar.SetSimVarValue('L:A32NX_SPEEDS_MANAGED_ATHR', 'knots', guidanceTarget);

        if (this.speedState === DescentSpeedGuidanceState.TargetAndMargins) {
            const [lower, upper] = this.speedMargin.getMargins(this.speedTarget);

            SimVar.SetSimVarValue('L:A32NX_PFD_LOWER_SPEED_MARGIN', 'Knots', lower);
            SimVar.SetSimVarValue('L:A32NX_PFD_UPPER_SPEED_MARGIN', 'Knots', upper);
        }
    }

    private updateSpeedMarginState() {
        const { flightPhase } = this.observer.get();

        if (flightPhase !== FmgcFlightPhase.Descent) {
            this.changeSpeedState(DescentSpeedGuidanceState.NotInDescentPhase);
            return;
        }

        const shouldShowMargins = this.verticalState === DescentVerticalGuidanceState.ProvidingGuidance && Simplane.getAutoPilotAirspeedManaged() && !this.showDescentLatchOnPfd;
        this.changeSpeedState(shouldShowMargins ? DescentSpeedGuidanceState.TargetAndMargins : DescentSpeedGuidanceState.TargetOnly);
    }

    private changeSpeedState(newState: DescentSpeedGuidanceState) {
        if (this.speedState === newState) {
            return;
        }

        // Hide margins if they were previously visible, but the state changed to literally anything else
        if (this.speedState === DescentSpeedGuidanceState.TargetAndMargins) {
            SimVar.SetSimVarValue('L:A32NX_PFD_SHOW_SPEED_MARGINS', 'boolean', false);
            SimVar.SetSimVarValue('L:A32NX_PFD_LOWER_SPEED_MARGIN', 'Knots', 0);
            SimVar.SetSimVarValue('L:A32NX_PFD_UPPER_SPEED_MARGIN', 'Knots', 0);
        } else if (newState === DescentSpeedGuidanceState.TargetAndMargins) {
            SimVar.SetSimVarValue('L:A32NX_PFD_SHOW_SPEED_MARGINS', 'boolean', true);
        }

        this.speedState = newState;
    }

    private iasOrMach(ias: Knots, mach: Mach) {
        const machAsIas = SimVar.GetGameVarValue('FROM MACH TO KIAS', 'number', mach);

        if (ias > machAsIas) {
            return machAsIas;
        }

        return ias;
    }

    private updateOverspeedCondition() {
        const airspeed = this.atmosphericConditions.currentAirspeed;

        let overspeedResolutionSpeed = this.speedTarget;
        if (this.speedState === DescentSpeedGuidanceState.TargetAndMargins) {
            const [_, upper] = this.speedMargin.getMargins(this.speedTarget);
            overspeedResolutionSpeed = upper;
        }

        const overspeedTriggerSpeed = this.iasOrMach(345, 0.81);

        if (this.isInOverspeedCondition && airspeed < overspeedResolutionSpeed) {
            this.isInOverspeedCondition = false;
        } if (!this.isInOverspeedCondition && airspeed > overspeedTriggerSpeed) {
            this.isInOverspeedCondition = true;
        }
    }
}
