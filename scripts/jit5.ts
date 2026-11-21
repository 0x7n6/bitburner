import type { NS } from "@ns";

const H = "j5h.ts";
const G = "j5g.ts";
const W = "j5w.ts";

const WORKERS = [H, G, W];

/*
 * ================================================================
 * γ3.6 EMPIRICAL ECONOMIC FRONTIER
 *
 * Stability answers:
 *   "Can this policy run?"
 *
 * Economic learning answers:
 *   "Should this policy run?"
 *
 * A challenger must prove a real wall-clock advantage before
 * replacing the current champion.
 * ================================================================
 */

const ECON_MIN_SAMPLES =
    5;

const ECON_MAX_CHALLENGER_SAMPLES =
    12;

const ECON_EWMA_ALPHA =
    0.35;

const ECON_PROMOTE_GAIN =
    0.02;

const ECON_REJECT_LOSS =
    0.03;

const ECON_RETEST_WINDOWS =
    30;

/*
 * γ3.6.1
 *
 * Cold pipeline windows can have excellent hot throughput but
 * terrible wall throughput simply because the pipeline is still
 * filling. They are operationally real, but they must not teach
 * the steady-state policy frontier.
 */
const ECON_MIN_WALL_HOT_RATIO =
    0.50;

/*
 * Cadence is now a first-class policy dimension.
 *
 * 270ms was repeatedly able to run with healthy PID/jitter while
 * still allowing target collapse. Pure target drift therefore
 * challenges cadence before sacrificing take.
 */
const ECON_PERIOD_STEP =
    50;

const ECON_PERIOD_MAX =
    520;

const ECON_PERIOD_CHALLENGE_SAMPLES =
    12;

type Phase =
    | "H"
    | "W1"
    | "G"
    | "W2";

type Topology =
    | "HOME_GW"
    | "REMOTE_ALL";

type PlayerState =
    ReturnType<NS["getPlayer"]>;

interface Config {
    maxTargets: number;
    portfolioTop: number;
    splitStep: number;

    minLaneGain: number;
    maxPeriodRatio: number;

    experimentalMultiLane: boolean;

    reservePct: number;
    remoteReservePct: number;

    takeMin: number;
    takeMax: number;
    takeStep: number;

    gaps: number[];

    guard: number;
    launchLead: number;

    growSafety: number;

    prepMoney: number;
    prepSec: number;

    windowBatches: number;

    /*
     * γ3.4 POLICY-ISOLATED GOVERNOR
     *
     * RAM capacity is not the same as runtime scheduler capacity.
     * Thousands of long-lived Netscript processes can saturate
     * the game/browser event loop before RAM is exhausted.
     */
    pidSoftLimit: number;
    pidHardLimit: number;

    /*
     * γ3.5 PREDICTIVE CONCURRENCY
     *
     * RAM capacity != runtime scheduler capacity.
     */
    pidPlanHeadroom: number;
    pidEstimateSafety: number;

    /*
     * Bootstrap readiness remains strict.
     * These thresholds are for an already-running continuous pipe.
     */
    driftMoney: number;
    driftSec: number;

    driftHardMoney: number;
    driftHardSec: number;

    driftConfirm: number;
    driftSampleMs: number;

    reevalMs: number;
    envMs: number;

    port: number;

    limit: number;

    dryRun: boolean;
    debug: boolean;
    tail: boolean;

    safety: number;
    fallbackSafety: number;
}

interface EconomicPolicyStats {
    key: string;

    target: string;
    topology: Topology;

    requestedTake: number;
    actualTake: number;

    gap: number;
    period: number;

    samples: number;

    wallEwma: number;
    actualEwma: number;

    /*
     * Exponentially weighted variance of wall-rate samples.
     *
     * This is deliberately used as a noise estimate rather
     * than pretending one short window is exact.
     */
    wallVarianceEwma: number;

    pidActualEwma: number;
    pidEstimate: number;
    pidRatioEwma: number;

    predictionErrorEwma: number;

    failures: number;
}


interface StabilityProfile {
    key: string;

    target: string;
    topology: Topology;

    takeCap: number;
    learnedTakeCeiling: number;

    periodFloor: number;

    stableWindows: number;
    takeProbeCooldown: number;

    baselineSingleRate:
        number | null;

    /*
     * Economic observations are isolated not only by
     * target/topology, but also by environment generation.
     *
     * A 25% policy measured at Hack 580 should not be blindly
     * compared with one measured after a material environment
     * change.
     */
    economicEnvironment: string;

    economicPolicies:
        Map<
            string,
            EconomicPolicyStats
        >;

    economicChampionKey:
        string | null;

    failures: number;
}


interface Controls {
    takeCap: number;
    gapFloor: number;

    /*
     * Minimum allowed inter-batch cadence.
     *
     * 0 means the ordinary planner minimum.
     */
    periodFloor: number;

    allowedTargets: number;

    stableWindows: number;

    /*
     * γ3.3 LEARNED STABILITY GOVERNOR
     *
     * The configured takeMax is only the absolute search ceiling.
     * This learned ceiling represents the highest aggression that
     * has survived real runtime pressure.
     */
    learnedTakeCeiling: number;

    /*
     * Healthy measurement windows required before reopening
     * another +takeStep probe.
     */
    takeProbeCooldown: number;

    /*
     * Learned aggression MUST be scoped to the workload that
     * produced the evidence.
     *
     * 40% on n00dles/HOME_GW says nothing about
     * 40% on alpha-ent/REMOTE_ALL.
     */
    activeProfileKey: string;

    profiles:
        Map<
            string,
            StabilityProfile
        >;

    baselineSingleRate: number | null;

    trialTwo: boolean;

    laneCooldown: number;

    laneRejectedSignature:
        string | null;
}

interface RamCosts {
    h: number;
    g: number;
    w: number;
}

interface Env {
    hosts: string[];
    remoteHosts: string[];

    hack: number;

    player: PlayerState;
    formulas: boolean;

    homeRam: number;
    homeCores: number;

    homeBudget: number;
    remoteBudget: number;

    workerRam: RamCosts;

    rooted: number;

    signature: string;
}

interface BatchModel {
    target: string;

    topology: Topology;

    chance: number;
    hackPct: number;

    /*
     * requestedTake is the control-plane policy.
     *
     * actualTake is the quantized result after converting
     * that request into an integer number of hack threads.
     */
    requestedTake: number;
    actualTake: number;

    moneyMax: number;

    h: number;
    g: number;
    w1: number;
    w2: number;

    hTime: number;
    gTime: number;
    wTime: number;

    expected: number;
}

interface LanePlan extends BatchModel {
    gap: number;
    period: number;

    /*
     * Estimated steady-state concurrent Netscript processes.
     */
    estimatedPids: number;

    homeUse: number;
    remoteUse: number;

    evps: number;

    ready: boolean;
}

interface Portfolio {
    lanes: LanePlan[];

    totalEV: number;

    homeLeft: number;
    remoteLeft: number;
}

interface Candidate {
    target: string;
    ready: boolean;
    rankScore: number;
}

interface LaneRuntime extends LanePlan {
    id: number;

    planned: number;
    nextBase: number;
}

interface Job {
    key: string;

    laneId: number;

    target: string;
    phase: Phase;

    topology: Topology;

    script: string;
    threads: number;

    finishAt: number;
    actionTime: number;

    launchAt: number;

    launched: boolean;
}

interface BatchRuntime {
    key: string;

    laneId: number;
    target: string;

    expected: number;

    jobs: Job[];

    verifyAt: number;

    started: boolean;
    verified: boolean;
    verifiedWindow: number;

    actualStolen: number;

    hackFinishedAt: number;

    jitters: number[];
}

interface PidRef {
    pid: number;
    batchId: string;
}

interface Runtime {
    epoch: number;

    startedAt: number;
    lastEnvCheck: number;

    hackingMoneyAtStart: number;

    measurementId: number;
    lastGcAt: number;

    lanes: LaneRuntime[];

    jobs: Job[];

    batches: Map<string, BatchRuntime>;

    pids: PidRef[];

    totalPlanned: number;

    verified: number;

    expectedStolen: number;
    actualStolen: number;

    firstHackAt: number;
    lastHackAt: number;

    jitters: number[];
    lateBy: number[];

    driftCount: number;

    driftStreaks:
        Map<
            string,
            number
        >;

    driftSampleAt:
        Map<
            string,
            number
        >;

    launchFailures: number;

    stopScheduling: boolean;
}

interface TelemetryEvent {
    version: number;

    batchId: string;
    target: string;

    phase: string;

    part: number;
    pid: number;

    startedAt: number;

    scheduledFinish: number;
    finishedAt: number;

    jitter: number;

    baseTime?: number;
    lateBy?: number;

    value: number;
}

interface VerifyResult {
    newVerified: number;
    reason: string;
}

interface LaunchResult {
    ok: boolean;
    reason: string;
}

interface EpochMetrics {
    verified: number;

    expected: number;
    actual: number;

    realizedRatio: number;

    predictedRate: number;
    measuredRate: number;
    actualRate: number;

    wallRate: number;

    trackedPids: number;

    p95Jitter: number;
    p95LateBy: number;

    minGap: number;

    driftCount: number;
    launchFailures: number;

    reason: string;
}

type Opener = readonly [
    file: string,
    run: (host: string) => boolean,
];


export async function main(
    ns: NS
): Promise<void> {
    const f = ns.flags([
        ["targets", 2],
        ["portfolio-top", 6],
        ["split-step", 0.10],

        ["min-lane-gain", 0.03],
        ["max-period-ratio", 10],

        /*
         * γ3.2 PRODUCTION LOCK
         *
         * Multi-lane live trials are deliberately opt-in until
         * reservation-calendar scheduling can transition portfolios
         * without disturbing the production floor.
         */
        ["experimental-multilane", false],

        ["reserve-pct", 0.05],
        ["remote-reserve-pct", 0.02],

        ["take-min", 0.05],
        ["take-max", 0.40],
        ["take-step", 0.01],

        ["gaps", "250,200,175,150,125,100,80,60,50"],

        ["guard", 120],
        ["launch-lead", 100],

        ["grow-safety", 1.02],

        ["prep-money", 0.999],
        ["prep-sec", 0.05],

        ["window-batches", 40],

        /*
         * Empirical starting envelope from γ3.3:
         *
         * ~9.3k PIDs still operated normally.
         * ~12.4k PIDs preceded scheduler starvation.
         *
         * Soft = stop exploring.
         * Hard = proactively retreat.
         */
        ["pid-soft-limit", 8000],
        ["pid-hard-limit", 9500],

        /*
         * Aim below the runtime soft ceiling.
         *
         * 8000 * .85 = 6800 predicted concurrent PIDs.
         */
        ["pid-plan-headroom", 0.85],
        ["pid-estimate-safety", 1.15],

        /*
         * Continuous runtime envelope.
         *
         * A 0.5% transient money miss is NOT a reactor SCRAM.
         */
        ["drift-money", 0.97],
        ["drift-sec", 0.25],

        ["drift-hard-money", 0.90],
        ["drift-hard-sec", 1.00],

        ["drift-confirm", 4],
        ["drift-sample-ms", 250],

        ["reeval-ms", 120000],
        ["env-ms", 5000],

        ["port", 20],

        ["limit", 0],

        ["dry-run", false],
        ["tail", false],
        ["debug", false],
        ["help", false],
    ]);

    if (Boolean(f.help)) {
        printHelp(ns);
        return;
    }

    const cfg: Config = {
        maxTargets:
            clampInt(
                Number(f.targets),
                1,
                2
            ),

        portfolioTop:
            Math.max(
                2,
                Math.floor(
                    Number(
                        f["portfolio-top"]
                    ) || 6
                )
            ),

        splitStep:
            clamp(
                Number(
                    f["split-step"]
                ) || 0.10,
                0.05,
                0.25
            ),

        minLaneGain:
            clamp(
                Number(
                    f["min-lane-gain"]
                ) || 0.03,
                0,
                0.50
            ),

        maxPeriodRatio:
            Math.max(
                2,
                Number(
                    f["max-period-ratio"]
                ) || 10
            ),

        experimentalMultiLane:
            Boolean(
                f["experimental-multilane"]
            ),

        reservePct:
            clamp(
                Number(
                    f["reserve-pct"]
                ) || 0.20,
                0.05,
                0.60
            ),

        remoteReservePct:
            clamp(
                Number(
                    f["remote-reserve-pct"]
                ) || 0.08,
                0,
                0.50
            ),

        takeMin:
            clamp(
                Number(
                    f["take-min"]
                ) || 0.05,
                0.01,
                0.80
            ),

        takeMax:
            clamp(
                Number(
                    f["take-max"]
                ) || 0.40,
                0.01,
                0.80
            ),

        takeStep:
            clamp(
                Number(
                    f["take-step"]
                ) || 0.025,
                0.005,
                0.25
            ),

        gaps:
            parseGaps(
                String(f.gaps)
            ),

        guard:
            Math.max(
                50,
                Math.floor(
                    Number(f.guard) || 120
                )
            ),

        launchLead:
            Math.max(
                100,
                Math.floor(
                    Number(
                        f["launch-lead"]
                    ) || 1000
                )
            ),

        growSafety:
            clamp(
                Number(
                    f["grow-safety"]
                ) || 1.02,
                1,
                1.25
            ),

        prepMoney:
            clamp(
                Number(
                    f["prep-money"]
                ) || 0.999,
                0.95,
                1
            ),

        prepSec:
            clamp(
                Number(
                    f["prep-sec"]
                ) || 0.05,
                0.001,
                1
            ),

        windowBatches:
            Math.max(
                10,
                Math.floor(
                    Number(
                        f["window-batches"]
                    ) || 40
                )
            ),

        pidSoftLimit:
            Math.max(
                500,
                Math.floor(
                    Number(
                        f["pid-soft-limit"]
                    ) || 8000
                )
            ),

        pidHardLimit:
            Math.max(
                1000,
                Math.floor(
                    Number(
                        f["pid-hard-limit"]
                    ) || 9500
                )
            ),

        pidPlanHeadroom:
            clamp(
                Number(
                    f["pid-plan-headroom"]
                ) || 0.85,
                0.50,
                0.95
            ),

        pidEstimateSafety:
            clamp(
                Number(
                    f["pid-estimate-safety"]
                ) || 1.15,
                1.00,
                2.00
            ),

        driftMoney:
            clamp(
                Number(
                    f["drift-money"]
                ) || 0.97,
                0.50,
                0.9999
            ),

        driftSec:
            clamp(
                Number(
                    f["drift-sec"]
                ) || 0.25,
                0.01,
                10
            ),

        driftHardMoney:
            clamp(
                Number(
                    f["drift-hard-money"]
                ) || 0.90,
                0.10,
                0.999
            ),

        driftHardSec:
            clamp(
                Number(
                    f["drift-hard-sec"]
                ) || 1.00,
                0.05,
                50
            ),

        driftConfirm:
            Math.max(
                2,
                Math.floor(
                    Number(
                        f["drift-confirm"]
                    ) || 4
                )
            ),

        driftSampleMs:
            Math.max(
                100,
                Math.floor(
                    Number(
                        f["drift-sample-ms"]
                    ) || 250
                )
            ),

        reevalMs:
            Math.max(
                30000,
                Math.floor(
                    Number(
                        f["reeval-ms"]
                    ) || 120000
                )
            ),

        envMs:
            Math.max(
                2000,
                Math.floor(
                    Number(
                        f["env-ms"]
                    ) || 5000
                )
            ),

        port:
            clampInt(
                Number(f.port) || 20,
                1,
                20
            ),

        limit:
            Math.max(
                0,
                Math.floor(
                    Number(f.limit) || 0
                )
            ),

        dryRun:
            Boolean(
                f["dry-run"]
            ),

        tail:
            Boolean(f.tail),

        debug:
            Boolean(f.debug),

        safety: 1.10,

        fallbackSafety: 1.15,
    };

    if (
        cfg.pidHardLimit <=
        cfg.pidSoftLimit
    ) {
        cfg.pidHardLimit =
            cfg.pidSoftLimit +
            1500;
    }

    if (
        cfg.takeMin >
        cfg.takeMax
    ) {
        [
            cfg.takeMin,
            cfg.takeMax,
        ] = [
            cfg.takeMax,
            cfg.takeMin,
        ];
    }

    if (cfg.tail) {
        ns.ui.openTail();
    }

    ns.disableLog("ALL");

    const positional =
        Array.isArray(f._)
            ? f._
            : [];

    const preferred =
        positional[0]
            ? String(
                  positional[0]
              ).trim()
            : "";

    for (
        const file
        of [
            ...WORKERS,
            "harvest.ts",
        ]
    ) {
        if (
            !ns.fileExists(
                file,
                "home"
            )
        ) {
            ns.tprint(
                `JIT5 ERROR: missing ${file}`
            );

            return;
        }
    }

    /*
     * Port 20 is reserved by default
     * for JIT5 telemetry.
     */
    ns.getPortHandle(
        cfg.port
    ).clear();

    const controls: Controls = {
        takeCap:
            Math.max(
                cfg.takeMin,
                Math.min(
                    0.25,
                    cfg.takeMax
                )
            ),

        gapFloor:
            initialGapFloor(
                cfg.gaps
            ),

        periodFloor: 0,

        /*
         * JIT5 starts with one lane.
         *
         * It must MEASURE the baseline
         * before admitting lane #2.
         */
        allowedTargets: 1,

        stableWindows: 0,

        learnedTakeCeiling:
            Math.min(
                cfg.takeMax,
                0.26
            ),

        takeProbeCooldown: 0,

        activeProfileKey:
            "",

        profiles:
            new Map<
                string,
                StabilityProfile
            >(),

        baselineSingleRate:
            null,

        trialTwo:
            false,

        laneCooldown: 0,

        laneRejectedSignature:
            null,
    };

    let totalVerified = 0;
    let epoch = 0;

    ns.tprint(
        "JIT5 | 7n8 CLOSED-LOOP OPTIMIZER"
    );

    ns.tprint(
        `preferred=${preferred || "AUTO"} | ` +
        `maxTargets=${cfg.maxTargets} | ` +
        `telemetryPort=${cfg.port}`
    );

    ns.tprint(
        `γ3.6.1 CADENCE-AWARE ECONOMIC FRONTIER | ` +
        `takeStart=${pct(controls.takeCap)} | ` +
        `takeCeiling=${pct(cfg.takeMax)} | ` +
        `multiLane=${
            cfg.experimentalMultiLane
                ? "EXPERIMENTAL"
                : "LOCKED"
        } | ` +
        `pidSoft=${cfg.pidSoftLimit} | ` +
        `pidHard=${cfg.pidHardLimit} | ` +
        `pidPlan=${Math.floor(
            cfg.pidSoftLimit *
            cfg.pidPlanHeadroom
        )} | ` +
        `driftSoft=${pct(cfg.driftMoney)}x${cfg.driftConfirm}`
    );

    while (true) {
        let env =
            buildEnv(
                ns,
                cfg
            );

        const rootedNow =
            autoRoot(
                ns,
                env.hosts
            );

        if (
            rootedNow > 0
        ) {
            env =
                buildEnv(
                    ns,
                    cfg
                );
        }

        /*
         * IDEAL PLAN:
         *
         * May include targets that are not READY yet.
         * This is our strategic destination.
         */
        let idealPlan =
            choosePortfolio(
                ns,
                env,
                cfg,
                controls,
                preferred,
                false
            );

        if (
            idealPlan.lanes.length === 0
        ) {
            ns.print(
                `[BOOT] no profitable target | ` +
                `Hack=${env.hack}`
            );

            if (cfg.dryRun) {
                return;
            }

            await ns.sleep(5000);
            continue;
        }

        /*
         * Dry-run deliberately shows the IDEAL economic
         * destination, even if that target still needs prep.
         */
        if (cfg.dryRun) {
            printPlan(
                ns,
                idealPlan,
                controls,
                cfg,
                true
            );

            return;
        }

        /*
         * ========================================================
         * BACKGROUND PREWARM
         *
         * Never shut down a healthy production target merely
         * because a stronger future target still needs prep.
         * ========================================================
         */
        for (
            const lane
            of idealPlan.lanes
        ) {
            if (
                isReady(
                    ns,
                    lane.target,
                    cfg
                )
            ) {
                continue;
            }

            startBackgroundPrep(
                ns,
                lane.target
            );
        }

        /*
         * ACTIVE PLAN:
         *
         * Only targets already READY are allowed to become
         * production lanes.
         */
        let plan =
            choosePortfolio(
                ns,
                env,
                cfg,
                controls,
                preferred,
                true
            );

        /*
         * Bootstrap exception:
         *
         * Immediately after an augmentation reset it is possible
         * that literally no profitable target is READY.
         *
         * In that case we still need one blocking prep to bootstrap
         * the economy. After one target is READY, future upgrades
         * use background prewarming.
         */
        if (
            plan.lanes.length === 0
        ) {
            ns.tprint(
                "[BOOT] no READY production target; " +
                "performing one bootstrap prep."
            );

            for (
                const lane
                of idealPlan.lanes
            ) {
                if (
                    isReady(
                        ns,
                        lane.target,
                        cfg
                    )
                ) {
                    continue;
                }

                const ok =
                    await prepTarget(
                        ns,
                        lane.target,
                        env,
                        cfg
                    );

                if (!ok) {
                    ns.tprint(
                        `[PREP] FAILED ${lane.target}`
                    );
                }

                /*
                 * One successfully prepared lane is enough
                 * to bootstrap production.
                 */
                if (
                    isReady(
                        ns,
                        lane.target,
                        cfg
                    )
                ) {
                    break;
                }
            }

            env =
                buildEnv(
                    ns,
                    cfg
                );

            idealPlan =
                choosePortfolio(
                    ns,
                    env,
                    cfg,
                    controls,
                    preferred,
                    false
                );

            plan =
                choosePortfolio(
                    ns,
                    env,
                    cfg,
                    controls,
                    preferred,
                    true
                );
        }

        if (
            plan.lanes.length === 0
        ) {
            await ns.sleep(1000);
            continue;
        }

        /*
         * A requested two-lane trial
         * may turn out to have no
         * economically valid lane #2.
         */
        if (
            controls.trialTwo &&
            plan.lanes.length < 2
        ) {
            ns.tprint(
                "[ADAPT] lane #2 not economically admissible " +
                "under current RAM / target set; returning to single-lane optimization."
            );

            controls.allowedTargets = 1;
            controls.trialTwo = false;
            controls.laneCooldown = 3;
            controls.stableWindows = 0;

            controls.laneRejectedSignature =
                env.signature;
        }

        activatePolicyProfile(
            ns,
            controls,
            plan,
            cfg
        );

        deployWorkers(
            ns,
            env.remoteHosts
        );

        epoch++;

        const remainingLimit =
            cfg.limit > 0
                ? Math.max(
                      0,
                      cfg.limit -
                          totalVerified
                  )
                : Infinity;

        if (
            remainingLimit <= 0
        ) {
            break;
        }

        const runtimeLimit =
            remainingLimit;

        const rt =
            initRuntime(
                plan,
                epoch,
                cfg,
                ns.getMoneySources()
                    .sinceStart
                    .hacking
            );

        let initialSignature =
            staticSignature(
                ns
            );

        printPlan(
            ns,
            plan,
            controls,
            cfg,
            false,
            epoch
        );

        let reason = "";

        let terminalMetricsHandled =
            false;

        while (true) {
            const now =
                Date.now();

            drainTelemetry(
                ns,
                cfg.port,
                rt
            );

            if (
                now -
                    rt.lastGcAt >=
                2000
            ) {
                rt.lastGcAt =
                    now;

                garbageCollectRuntime(
                    ns,
                    rt
                );
            }

            scheduleAhead(
                rt,
                now,
                cfg,
                runtimeLimit
            );

            const launch =
                launchDue(
                    ns,
                    rt,
                    env,
                    cfg,
                    now
                );

            if (
                !launch.ok
            ) {
                reason =
                    launch.reason;

                rt.launchFailures++;

                abortRuntime(
                    ns,
                    rt
                );

                break;
            }

            const verify =
                verifyDue(
                    ns,
                    rt,
                    cfg,
                    now
                );

            totalVerified +=
                verify.newVerified;

            if (
                verify.reason &&
                !reason
            ) {
                reason =
                    verify.reason;

                /*
                 * γ3.3 fault snapshot.
                 *
                 * Close the statistical observation at the FIRST
                 * failure. The subsequent physical drain is safety
                 * cleanup, not part of the healthy measurement.
                 */
                const faultMetrics =
                    summarizeEpoch(
                        ns,
                        rt,
                        plan,
                        reason
                    );

                printMetrics(
                    ns,
                    epoch,
                    faultMetrics
                );

                adaptControls(
                    ns,
                    controls,
                    faultMetrics,
                    plan,
                    cfg,
                    env.signature
                );

                terminalMetricsHandled =
                    true;

                stopFuture(rt);
            }

            if (
                !reason &&
                cfg.limit > 0 &&
                totalVerified >=
                    cfg.limit
            ) {
                reason =
                    "LIMIT";

                stopFuture(rt);
            }

            /*
             * Structural changes remain hard generation boundaries.
             *
             * Hacking-level growth itself was intentionally removed
             * from staticSignature(), so gaining Hack skill no longer
             * kills a healthy pipeline.
             */
            if (
                !reason &&
                now -
                    rt.lastEnvCheck >=
                    cfg.envMs
            ) {
                rt.lastEnvCheck =
                    now;

                const sig =
                    staticSignature(
                        ns
                    );

                if (
                    sig !==
                    initialSignature
                ) {
                    reason =
                        "ENVIRONMENT";

                    stopFuture(rt);
                }
            }

            /*
             * ====================================================
             * γ3 MEASUREMENT WINDOW
             *
             * WINDOW IS NOT PIPELINE LIFETIME.
             *
             * Measure -> adapt -> hot-apply compatible policy ->
             * reset telemetry only -> keep producing.
             * ====================================================
             */
            if (
                !reason &&
                rt.verified >=
                    cfg.windowBatches
            ) {
                const metrics =
                    summarizeEpoch(
                        ns,
                        rt,
                        plan,
                        "WINDOW"
                    );

                printMetrics(
                    ns,
                    epoch,
                    metrics
                );

                adaptControls(
                    ns,
                    controls,
                    metrics,
                    plan,
                    cfg,
                    env.signature
                );

                if (
                    cfg.limit > 0 &&
                    totalVerified >=
                        cfg.limit
                ) {
                    reason =
                        "LIMIT";

                    stopFuture(rt);

                    terminalMetricsHandled =
                        true;
                } else {
                    /*
                     * Preserve the cold-start capacity envelope.
                     *
                     * buildEnv() subtracts currently-running JIT workers
                     * from free RAM, which would make a hot pipeline look
                     * artificially resource-starved. We refresh the model
                     * inputs (Hack/player) without forgetting total
                     * scheduler capacity.
                     */
                    const nextEnv =
                        refreshModelEnv(
                            ns,
                            env
                        );

                    let nextPlan =
                        choosePortfolio(
                            ns,
                            nextEnv,
                            cfg,
                            controls,
                            preferred,
                            true
                        );

                    if (
                        controls.trialTwo &&
                        nextPlan.lanes.length <
                            2
                    ) {
                        ns.tprint(
                            "[ADAPT] lane #2 not economically admissible " +
                            "under current RAM / target set; returning to single-lane optimization."
                        );

                        controls.allowedTargets = 1;
                        controls.trialTwo = false;
                        controls.laneCooldown = 3;
                        controls.stableWindows = 0;

                        controls.laneRejectedSignature =
                            nextEnv.signature;

                        nextPlan =
                            choosePortfolio(
                                ns,
                                nextEnv,
                                cfg,
                                controls,
                                preferred,
                                true
                            );
                    }

                    if (
                        nextPlan.lanes.length ===
                        0
                    ) {
                        reason =
                            "POLICY no READY lane";

                        stopFuture(rt);

                        terminalMetricsHandled =
                            true;
                    } else if (
                        canHotSwapPlan(
                            rt,
                            nextPlan
                        )
                    ) {
                        env =
                            nextEnv;

                        plan =
                            nextPlan;

                        deployWorkers(
                            ns,
                            env.remoteHosts
                        );

                        epoch++;

                        applyHotPlan(
                            rt,
                            plan,
                            epoch
                        );

                        resetMeasurementWindow(
                            ns,
                            rt
                        );

                        initialSignature =
                            staticSignature(
                                ns
                            );

                        printPlan(
                            ns,
                            plan,
                            controls,
                            cfg,
                            false,
                            epoch
                        );
                    } else {
                        /*
                         * γ3 stage 1 deliberately refuses to blindly mix
                         * incompatible target/topology generations.
                         */
                        reason =
                            "POLICY";

                        stopFuture(rt);

                        terminalMetricsHandled =
                            true;
                    }
                }
            }

            if (
                rt.stopScheduling &&
                allDrained(
                    ns,
                    rt
                )
            ) {
                await ns.sleep(80);

                drainTelemetry(
                    ns,
                    cfg.port,
                    rt
                );

                const finalVerify =
                    verifyDue(
                        ns,
                        rt,
                        cfg,
                        Date.now()
                    );

                totalVerified +=
                    finalVerify.newVerified;

                if (
                    finalVerify.reason &&
                    !reason
                ) {
                    reason =
                        finalVerify.reason;
                }

                break;
            }

            await ns.sleep(20);
        }

        /*
         * WINDOW metrics have already been printed before a
         * deliberate incompatible-policy drain.
         *
         * Real faults still get their partial-window telemetry.
         */
        if (
            !terminalMetricsHandled
        ) {
            const metrics =
                summarizeEpoch(
                    ns,
                    rt,
                    plan,
                    reason
                );

            printMetrics(
                ns,
                epoch,
                metrics
            );

            adaptControls(
                ns,
                controls,
                metrics,
                plan,
                cfg,
                env.signature
            );
        }

        if (
            cfg.limit > 0 &&
            totalVerified >=
                cfg.limit
        ) {
            break;
        }

        await ns.sleep(200);
    }


    ns.tprint(
        `JIT5 DONE | verified=${totalVerified}`
    );
}


/*
 * ================================================================
 * ENVIRONMENT
 * ================================================================
 */

function buildEnv(
    ns: NS,
    cfg: Config
): Env {
    const hosts =
        scanAll(ns);

    const hack =
        ns.getHackingLevel();

    const player =
        ns.getPlayer();

    const formulas =
        ns.fileExists(
            "Formulas.exe",
            "home"
        );

    const home =
        ns.getServer(
            "home"
        );

    const homeRam =
        ns.getServerMaxRam(
            "home"
        );

    const homeCores =
        Math.max(
            1,
            Number(
                home.cpuCores ?? 1
            )
        );

    const workerRam: RamCosts = {
        h:
            ns.getScriptRam(
                H,
                "home"
            ),

        g:
            ns.getScriptRam(
                G,
                "home"
            ),

        w:
            ns.getScriptRam(
                W,
                "home"
            ),
    };

    const homeBudget =
        Math.max(
            0,
            homeRam *
                (
                    1 -
                    cfg.reservePct
                ) -
                ns.getServerUsedRam(
                    "home"
                )
        );

    const remoteHosts:
        string[] = [];

    let remoteBudget = 0;
    let rooted = 0;
    let totalRemoteRam = 0;

    for (
        const host
        of hosts
    ) {
        if (
            !ns.hasRootAccess(
                host
            )
        ) {
            continue;
        }

        rooted++;

        if (
            host === "home"
        ) {
            continue;
        }

        const max =
            ns.getServerMaxRam(
                host
            );

        if (
            max <= 0
        ) {
            continue;
        }

        totalRemoteRam +=
            max;

        const usable =
            Math.max(
                0,
                max *
                    (
                        1 -
                        cfg.remoteReservePct
                    ) -
                    ns.getServerUsedRam(
                        host
                    )
            );

        if (
            usable >=
            workerRam.h
        ) {
            remoteHosts.push(
                host
            );

            remoteBudget +=
                usable;
        }
    }

    remoteHosts.sort(
        (a, b) =>
            ns.getServerMaxRam(b) -
            ns.getServerMaxRam(a)
    );

    const signature = [
        Math.round(homeRam),

        homeCores,

        formulas
            ? 1
            : 0,

        getOpeners(ns).length,

        rooted,

        Math.floor(
            hack / 10
        ),

        Math.round(
            totalRemoteRam
        ),
    ].join(":");

    return {
        hosts,
        remoteHosts,

        hack,

        player,
        formulas,

        homeRam,
        homeCores,

        homeBudget,
        remoteBudget,

        workerRam,

        rooted,

        signature,
    };
}


function staticSignature(
    ns: NS
): string {
    const hosts =
        scanAll(ns);

    let rooted = 0;
    let ram = 0;

    for (
        const host
        of hosts
    ) {
        if (
            !ns.hasRootAccess(host)
        ) {
            continue;
        }

        rooted++;

        if (
            host !== "home"
        ) {
            ram +=
                ns.getServerMaxRam(
                    host
                );
        }
    }

    const home =
        ns.getServer(
            "home"
        );

    return [
        ns.getServerMaxRam(
            "home"
        ),

        home.cpuCores ?? 1,

        ns.fileExists(
            "Formulas.exe",
            "home"
        )
            ? 1
            : 0,

        getOpeners(ns).length,

        rooted,

        Math.round(ram),
    ].join(":");
}


/*
 * ================================================================
 * TARGET MODEL
 * ================================================================
 */

function modelBatch(
    ns: NS,
    target: string,
    wantedTake: number,
    cfg: Config,
    env: Env,
    gwCores: number,
    topology: Topology
): BatchModel | null {
    const server =
        ns.getServer(
            target
        );

    const moneyMax =
        Number(
            server.moneyMax ?? 0
        );

    const minSec =
        Number(
            server.minDifficulty ?? 1
        );

    if (
        moneyMax <= 0
    ) {
        return null;
    }

    const prep = {
        ...server,

        moneyAvailable:
            moneyMax,

        hackDifficulty:
            minSec,
    };

    let chance: number;
    let hackPct: number;

    let hTime: number;
    let gTime: number;
    let wTime: number;

    if (env.formulas) {
        chance =
            ns.formulas.hacking
                .hackChance(
                    prep,
                    env.player
                );

        hackPct =
            ns.formulas.hacking
                .hackPercent(
                    prep,
                    env.player
                );

        hTime =
            ns.formulas.hacking
                .hackTime(
                    prep,
                    env.player
                );

        gTime =
            ns.formulas.hacking
                .growTime(
                    prep,
                    env.player
                );

        wTime =
            ns.formulas.hacking
                .weakenTime(
                    prep,
                    env.player
                );
    } else {
        /*
         * Conservative fallback until
         * Formulas.exe becomes available.
         */
        const currentSec =
            Math.max(
                minSec,
                Number(
                    server.hackDifficulty ??
                    minSec
                )
            );

        const secScale =
            clamp(
                (
                    100 -
                    minSec
                ) /
                Math.max(
                    1e-9,
                    100 -
                    currentSec
                ),
                0.05,
                20
            );

        chance =
            clamp(
                ns.hackAnalyzeChance(
                    target
                ) *
                    secScale,
                0,
                1
            );

        hackPct =
            Math.max(
                1e-9,
                ns.hackAnalyze(
                    target
                ) *
                    secScale
            );

        hTime =
            ns.getHackTime(
                target
            );

        gTime =
            ns.getGrowTime(
                target
            );

        wTime =
            ns.getWeakenTime(
                target
            );
    }

    if (
        chance <= 0 ||
        hackPct <= 0
    ) {
        return null;
    }

    const h =
        Math.max(
            1,
            Math.round(
                wantedTake /
                hackPct
            )
        );

    const actualTake =
        clamp(
            h *
                hackPct,
            0.001,
            0.90
        );

    const remaining =
        Math.max(
            1,
            moneyMax *
                (
                    1 -
                    actualTake
                )
        );

    let g: number;

    if (env.formulas) {
        const postHack = {
            ...prep,

            moneyAvailable:
                remaining,
        };

        g =
            Math.ceil(
                ns.formulas.hacking
                    .growThreads(
                        postHack,
                        env.player,
                        moneyMax,
                        gwCores
                    ) *
                    cfg.growSafety
            );
    } else {
        g =
            Math.ceil(
                ns.growthAnalyze(
                    target,
                    moneyMax /
                        remaining,
                    gwCores
                ) *
                    cfg.growSafety *
                    cfg.fallbackSafety
            );
    }

    g =
        Math.max(
            1,
            g
        );

    const weakenOne =
        ns.weakenAnalyze(
            1,
            gwCores
        );

    const hackSec =
        ns.hackAnalyzeSecurity(
            h,
            target
        );

    /*
     * Deliberately omit hostname.
     * This is hypothetical post-hack
     * grow security.
     */
    const growSec =
        ns.growthAnalyzeSecurity(
            g
        );

    const w1 =
        Math.max(
            1,
            Math.ceil(
                hackSec /
                weakenOne
            )
        );

    const w2 =
        Math.max(
            1,
            Math.ceil(
                growSec /
                weakenOne
            )
        );

    return {
        target,

        topology,

        chance,
        hackPct,

        requestedTake:
            wantedTake,

        actualTake,

        moneyMax,

        h,
        g,
        w1,
        w2,

        hTime,
        gTime,
        wTime,

        expected:
            moneyMax *
            actualTake *
            chance,
    };
}


function estimateConcurrentPids(
    batch: BatchModel,
    period: number,
    cfg: Config
): number {
    const cadence =
        Math.max(
            1,
            period
        );

    const h =
        Math.ceil(
            (
                batch.hTime +
                cfg.launchLead
            ) /
            cadence
        );

    const w1 =
        Math.ceil(
            (
                batch.wTime +
                cfg.launchLead
            ) /
            cadence
        );

    const g =
        Math.ceil(
            (
                batch.gTime +
                cfg.launchLead
            ) /
            cadence
        );

    const w2 =
        Math.ceil(
            (
                batch.wTime +
                cfg.launchLead
            ) /
            cadence
        );

    const raw =
        h +
        w1 +
        g +
        w2;

    return Math.ceil(
        raw *
        cfg.pidEstimateSafety
    );
}


function fitPidEnvelope(
    batch: BatchModel,
    initialPeriod: number,
    cfg: Config
): {
    period: number;
    estimatedPids: number;
} {
    let period =
        Math.max(
            1,
            initialPeriod
        );

    const target =
        Math.max(
            256,
            Math.floor(
                cfg.pidSoftLimit *
                cfg.pidPlanHeadroom
            )
        );

    let estimatedPids =
        estimateConcurrentPids(
            batch,
            period,
            cfg
        );

    /*
     * Widen only the inter-batch cadence.
     *
     * Internal HWGW geometry remains:
     *
     * H -> W1 -> G -> W2
     */
    for (
        let i = 0;
        i < 24 &&
        estimatedPids > target;
        i++
    ) {
        period =
            Math.ceil(
                period *
                Math.max(
                    1.02,
                    estimatedPids /
                    target
                )
            );

        estimatedPids =
            estimateConcurrentPids(
                batch,
                period,
                cfg
            );
    }

    return {
        period,
        estimatedPids,
    };
}


function optimizeTarget(
    ns: NS,
    target: string,
    homeBudget: number,
    remoteBudget: number,
    cfg: Config,
    env: Env,
    controls: Controls
): LanePlan | null {
    if (
        homeBudget <= 0 &&
        remoteBudget <= 0
    ) {
        return null;
    }

    let best:
        LanePlan | null =
        null;

    const maxTake =
        env.formulas
            ? Math.min(
                  cfg.takeMax,
                  controls.takeCap
              )
            : Math.min(
                  0.10,
                  controls.takeCap
              );

    const gaps =
        cfg.gaps.filter(
            gap =>
                gap >=
                controls.gapFloor
        );

    /*
     * HOME_GW
     *
     * H   -> remote first
     * G/W -> home cores
     *
     * REMOTE_ALL
     *
     * H/G/W -> remote fleet
     * G/W modeled conservatively at 1 core.
     */
    const topologies:
        Topology[] = [
        "HOME_GW",
    ];

    if (
        remoteBudget > 0
    ) {
        topologies.push(
            "REMOTE_ALL"
        );
    }

    for (
        let take =
            cfg.takeMin;

        take <=
            maxTake +
                1e-9;

        take +=
            cfg.takeStep
    ) {
        for (
            const topology
            of topologies
        ) {
            const gwCores =
                topology ===
                    "HOME_GW"
                    ? env.homeCores
                    : 1;

            const batch =
                modelBatch(
                    ns,
                    target,
                    take,
                    cfg,
                    env,
                    gwCores,
                    topology
                );

            if (!batch) {
                continue;
            }

            for (
                const gap
                of gaps
            ) {
                const minPeriod =
                    Math.max(
                        3 *
                            gap +
                            cfg.guard,
                        250
                    );

                let period =
                    minPeriod;

                let homeUse =
                    0;

                let remoteUse =
                    0;

                /*
                 * =================================================
                 * HOME_GW
                 * =================================================
                 */
                if (
                    topology ===
                    "HOME_GW"
                ) {
                    if (
                        homeBudget <= 0
                    ) {
                        continue;
                    }

                    const peakGW =
                        batch.w1 *
                            env.workerRam.w +

                        batch.g *
                            env.workerRam.g +

                        batch.w2 *
                            env.workerRam.w;

                    const remoteHackCapacity =
                        remoteBudget /
                        Math.max(
                            env.workerRam.h,
                            1e-9
                        );

                    const overflowHackThreads =
                        Math.max(
                            0,
                            batch.h -
                                remoteHackCapacity
                        );

                    const peakHome =
                        peakGW +
                        overflowHackThreads *
                            env.workerRam.h;

                    if (
                        peakHome >
                        homeBudget *
                            0.98
                    ) {
                        continue;
                    }

                    const gwWeighted =
                        batch.w1 *
                            env.workerRam.w *
                            (
                                batch.wTime +
                                cfg.launchLead
                            ) +

                        batch.g *
                            env.workerRam.g *
                            (
                                batch.gTime +
                                cfg.launchLead
                            ) +

                        batch.w2 *
                            env.workerRam.w *
                            (
                                batch.wTime +
                                cfg.launchLead
                            );

                    const hWeighted =
                        batch.h *
                        env.workerRam.h *
                        (
                            batch.hTime +
                            cfg.launchLead
                        );

                    homeUse =
                        Infinity;

                    for (
                        let i = 0;
                        i < 24;
                        i++
                    ) {
                        const remoteDemand =
                            hWeighted *
                            cfg.safety /
                            period;

                        remoteUse =
                            Math.min(
                                remoteBudget,
                                remoteDemand
                            );

                        const homeHack =
                            Math.max(
                                0,
                                remoteDemand -
                                    remoteBudget
                            );

                        homeUse =
                            gwWeighted *
                                cfg.safety /
                                period +
                            homeHack;

                        if (
                            homeUse <=
                            homeBudget
                        ) {
                            break;
                        }

                        period =
                            Math.ceil(
                                period *
                                Math.max(
                                    1.02,
                                    homeUse /
                                        Math.max(
                                            1,
                                            homeBudget
                                        )
                                )
                            );
                    }

                    if (
                        !Number.isFinite(
                            homeUse
                        ) ||
                        homeUse >
                            homeBudget *
                                1.001
                    ) {
                        continue;
                    }
                }

                /*
                 * =================================================
                 * REMOTE_ALL
                 * =================================================
                 *
                 * Model G/W at one core and place the entire
                 * batch into the remote fleet.
                 */
                else {
                    if (
                        remoteBudget <= 0
                    ) {
                        continue;
                    }

                    const peakRemote =
                        batch.h *
                            env.workerRam.h +

                        batch.w1 *
                            env.workerRam.w +

                        batch.g *
                            env.workerRam.g +

                        batch.w2 *
                            env.workerRam.w;

                    /*
                     * One complete batch must physically fit.
                     */
                    if (
                        peakRemote >
                        remoteBudget *
                            0.98
                    ) {
                        continue;
                    }

                    const remoteWeighted =
                        batch.h *
                            env.workerRam.h *
                            (
                                batch.hTime +
                                cfg.launchLead
                            ) +

                        batch.w1 *
                            env.workerRam.w *
                            (
                                batch.wTime +
                                cfg.launchLead
                            ) +

                        batch.g *
                            env.workerRam.g *
                            (
                                batch.gTime +
                                cfg.launchLead
                            ) +

                        batch.w2 *
                            env.workerRam.w *
                            (
                                batch.wTime +
                                cfg.launchLead
                            );

                    remoteUse =
                        Infinity;

                    for (
                        let i = 0;
                        i < 24;
                        i++
                    ) {
                        remoteUse =
                            remoteWeighted *
                            cfg.safety /
                            period;

                        if (
                            remoteUse <=
                            remoteBudget
                        ) {
                            break;
                        }

                        period =
                            Math.ceil(
                                period *
                                Math.max(
                                    1.02,
                                    remoteUse /
                                        Math.max(
                                            1,
                                            remoteBudget
                                        )
                                )
                            );
                    }

                    if (
                        !Number.isFinite(
                            remoteUse
                        ) ||
                        remoteUse >
                            remoteBudget *
                                1.001
                    ) {
                        continue;
                    }

                    homeUse = 0;
                }

                /*
                 * RAM decides whether a batch physically fits.
                 *
                 * PID pressure decides whether its cadence is
                 * sustainable by the game runtime.
                 */
                const pidFit =
                    fitPidEnvelope(
                        batch,
                        period,
                        cfg
                    );

                /*
                 * PID fit defines the runtime-safe minimum.
                 *
                 * γ3.6.1 may deliberately widen cadence beyond
                 * that minimum when empirical target-state
                 * stability says the theoretical cadence is too
                 * aggressive.
                 */
                period =
                    Math.max(
                        pidFit.period,
                        controls.periodFloor
                    );

                const estimatedPids =
                    estimateConcurrentPids(
                        batch,
                        period,
                        cfg
                    );

                if (
                    estimatedPids >
                    cfg.pidHardLimit
                ) {
                    continue;
                }

                const candidate:
                    LanePlan = {
                    ...batch,

                    gap,
                    period,

                    estimatedPids,

                    homeUse,
                    remoteUse,

                    evps:
                        batch.expected *
                        1000 /
                        period,

                    ready:
                        isReady(
                            ns,
                            target,
                            cfg
                        ),
                };

                if (
                    !best ||
                    candidate.evps >
                        best.evps
                ) {
                    best =
                        candidate;
                }
            }
        }
    }

    return best;
}


/*
 * ================================================================
 * PORTFOLIO
 * ================================================================
 */

function choosePortfolio(
    ns: NS,
    env: Env,
    cfg: Config,
    controls: Controls,
    preferred: string,
    readyOnly = false
): Portfolio {
    const candidates:
        Candidate[] = [];

    for (
        const host
        of env.hosts
    ) {
        if (
            !ns.hasRootAccess(
                host
            )
        ) {
            continue;
        }

        const server =
            ns.getServer(
                host
            );

        const moneyMax =
            Number(
                server.moneyMax ?? 0
            );

        const required =
            Number(
                server.requiredHackingSkill ??
                Infinity
            );

        if (
            moneyMax <= 0 ||
            required >
                env.hack ||
            server.purchasedByPlayer
        ) {
            continue;
        }

        const plan =
            optimizeTarget(
                ns,
                host,
                env.homeBudget,
                env.remoteBudget,
                cfg,
                env,
                controls
            );

        if (!plan) {
            continue;
        }

        if (
            readyOnly &&
            !plan.ready
        ) {
            continue;
        }

        candidates.push({
            target:
                host,

            ready:
                plan.ready,

            rankScore:
                plan.evps *
                (
                    plan.ready
                        ? 1
                        : 0.82
                ),
        });
    }

    candidates.sort(
        (a, b) =>
            b.rankScore -
            a.rankScore
    );

    const pool =
        candidates.slice(
            0,
            cfg.portfolioTop
        );

    if (
        preferred
    ) {
        const preferredCandidate =
            candidates.find(
                x =>
                    x.target ===
                    preferred
            );

        if (
            preferredCandidate &&
            !pool.some(
                x =>
                    x.target ===
                    preferred
            )
        ) {
            pool.unshift(
                preferredCandidate
            );
        }
    }

    let best:
        Portfolio = {
        lanes: [],

        totalEV: 0,

        homeLeft:
            env.homeBudget,

        remoteLeft:
            env.remoteBudget,
    };

    /*
     * SINGLE TARGET
     */
    for (
        const c
        of pool
    ) {
        if (
            preferred &&
            c.target !==
                preferred
        ) {
            continue;
        }

        const p =
            optimizeTarget(
                ns,
                c.target,
                env.homeBudget,
                env.remoteBudget,
                cfg,
                env,
                controls
            );

        if (!p) {
            continue;
        }

        if (
            p.evps >
            best.totalEV
        ) {
            best = {
                lanes: [p],

                totalEV:
                    p.evps,

                homeLeft:
                    Math.max(
                        0,
                        env.homeBudget -
                            p.homeUse
                    ),

                remoteLeft:
                    Math.max(
                        0,
                        env.remoteBudget -
                            p.remoteUse
                    ),
            };
        }
    }

    if (
        controls.allowedTargets < 2 ||
        cfg.maxTargets < 2
    ) {
        return best;
    }

    /*
     * TWO TARGET TRIAL SEARCH
     */
    for (
        let i = 0;
        i < pool.length;
        i++
    ) {
        for (
            let j = 0;
            j < pool.length;
            j++
        ) {
            if (
                i === j
            ) {
                continue;
            }

            const a =
                pool[i];

            const b =
                pool[j];

            if (
                preferred &&
                a.target !==
                    preferred
            ) {
                continue;
            }

            for (
                let share = 0.25;

                share <=
                    0.90 +
                        1e-9;

                share +=
                    cfg.splitStep
            ) {
                const firstHome =
                    env.homeBudget *
                    share;

                const firstRemote =
                    env.remoteBudget *
                    share;

                const p1 =
                    optimizeTarget(
                        ns,
                        a.target,
                        firstHome,
                        firstRemote,
                        cfg,
                        env,
                        controls
                    );

                if (!p1) {
                    continue;
                }

                const homeLeft =
                    Math.max(
                        0,
                        env.homeBudget -
                            p1.homeUse
                    );

                const remoteLeft =
                    Math.max(
                        0,
                        env.remoteBudget -
                            p1.remoteUse
                    );

                const p2 =
                    optimizeTarget(
                        ns,
                        b.target,
                        homeLeft,
                        remoteLeft,
                        cfg,
                        env,
                        controls
                    );

                if (!p2) {
                    continue;
                }

                const marginal =
                    p2.evps /
                    Math.max(
                        1,
                        p1.evps
                    );

                if (
                    marginal <
                    cfg.minLaneGain
                ) {
                    continue;
                }

                if (
                    p2.period >
                    p1.period *
                        cfg.maxPeriodRatio
                ) {
                    continue;
                }

                const total =
                    p1.evps +
                    p2.evps;

                if (
                    total <=
                    best.totalEV
                ) {
                    continue;
                }

                best = {
                    lanes: [
                        p1,
                        p2,
                    ],

                    totalEV:
                        total,

                    homeLeft:
                        Math.max(
                            0,
                            homeLeft -
                                p2.homeUse
                        ),

                    remoteLeft:
                        Math.max(
                            0,
                            remoteLeft -
                                p2.remoteUse
                        ),
                };
            }
        }
    }

    return best;
}


/*
 * ================================================================
 * PREP
 * ================================================================
 */

function startBackgroundPrep(
    ns: NS,
    target: string
): boolean {
    /*
     * Do not launch duplicate preppers for the same target.
     */
    const existing =
        ns.ps("home")
            .find(
                process =>
                    process.filename ===
                        "harvest.ts" &&
                    String(
                        process.args[0] ??
                        ""
                    ) ===
                        target &&
                    process.args.some(
                        arg =>
                            String(arg) ===
                            "--prep-only"
                    )
            );

    if (existing) {
        return true;
    }

    /*
     * Keep HOME out of background preparation.
     *
     * The current production lane may still depend heavily
     * on home's CPU cores for efficient G/W.
     *
     * Our giant remote fleet handles the speculative prep.
     */
    const pid =
        ns.run(
            "harvest.ts",
            1,

            target,

            "--prep-only",
            "--no-home"
        );

    if (!pid) {
        ns.tprint(
            `[PREWARM] failed to launch ${target}`
        );

        return false;
    }

    ns.tprint(
        `[PREWARM] ${target} started in background | PID ${pid}`
    );

    return true;
}


async function prepTarget(
    ns: NS,
    target: string,
    env: Env,
    cfg: Config
): Promise<boolean> {
    const reserveGb =
        Math.ceil(
            env.homeRam *
            cfg.reservePct
        );

    const pid =
        ns.run(
            "harvest.ts",
            1,

            target,

            "--prep-only",

            "--reserve",
            reserveGb
        );

    if (!pid) {
        return false;
    }

    while (
        ns.isRunning(pid)
    ) {
        await ns.sleep(200);
    }

    return isReady(
        ns,
        target,
        cfg
    );
}


function isReady(
    ns: NS,
    target: string,
    cfg: Config
): boolean {
    const server =
        ns.getServer(
            target
        );

    const max =
        Number(
            server.moneyMax ?? 0
        );

    const money =
        Number(
            server.moneyAvailable ?? 0
        );

    const min =
        Number(
            server.minDifficulty ?? 0
        );

    const sec =
        Number(
            server.hackDifficulty ??
            min
        );

    return (
        max > 0 &&
        money >=
            max *
                cfg.prepMoney &&
        sec <=
            min +
                cfg.prepSec
    );
}


/*
 * ================================================================
 * RUNTIME SCHEDULER
 * ================================================================
 */

function initRuntime(
    plan: Portfolio,
    epoch: number,
    cfg: Config,
    hackingMoneyAtStart: number
): Runtime {
    const now =
        Date.now();

    const lanes:
        LaneRuntime[] =
        plan.lanes.map(
            (
                lane,
                id
            ) => ({
                ...lane,

                id,

                planned: 0,

                nextBase:
                    now +
                    lane.wTime +
                    cfg.launchLead +
                    2500 +
                    id *
                        250,
            })
        );

    return {
        epoch,

        startedAt:
            now,

        lastEnvCheck:
            now,

        hackingMoneyAtStart,

        measurementId: 1,
        lastGcAt: now,

        lanes,

        jobs: [],

        batches:
            new Map(),

        pids: [],

        totalPlanned: 0,

        verified: 0,

        expectedStolen: 0,
        actualStolen: 0,

        firstHackAt: 0,
        lastHackAt: 0,

        jitters: [],
        lateBy: [],

        driftCount: 0,

        driftStreaks:
            new Map(),

        driftSampleAt:
            new Map(),

        launchFailures: 0,

        stopScheduling:
            false,
    };
}


function scheduleAhead(
    rt: Runtime,
    now: number,
    cfg: Config,
    runtimeLimit: number
): void {
    if (
        rt.stopScheduling
    ) {
        return;
    }

    /*
     * Do not materialize the whole long weaken horizon.
     *
     * Only keep a few seconds of not-yet-launched work queued.
     * Workers already running provide the deep pipeline.
     */
    const launchHorizon =
        3000;

    const staleTolerance =
        Math.max(
            60,
            cfg.guard *
                0.50
        );

    let added = false;

    for (
        const lane
        of rt.lanes
    ) {
        let scheduledThisPass = 0;

        while (
            rt.totalPlanned <
                runtimeLimit &&
            scheduledThisPass <
                128
        ) {
            const earliest =
                earliestLaunchAt(
                    lane,
                    lane.nextBase,
                    cfg
                );

            /*
             * Runtime stall / app suspension:
             * never launch stale timing slots.
             * Advance the cadence instead.
             */
            if (
                earliest <
                now -
                    staleTolerance
            ) {
                const behind =
                    now -
                    earliest;

                const skips =
                    Math.max(
                        1,
                        Math.floor(
                            behind /
                            Math.max(
                                1,
                                lane.period
                            )
                        )
                    );

                lane.nextBase +=
                    skips *
                    lane.period;

                continue;
            }

            if (
                earliest >
                now +
                    launchHorizon
            ) {
                break;
            }

            addBatch(
                rt,
                lane,
                lane.nextBase,
                cfg
            );

            lane.nextBase +=
                lane.period;

            scheduledThisPass++;
            added = true;
        }
    }

    /*
     * launchDue() runs every ~20 ms.
     * Sort only when new work was appended, not every loop.
     */
    if (added) {
        rt.jobs.sort(
            (a, b) =>
                a.launchAt -
                b.launchAt
        );
    }
}


function earliestLaunchAt(
    lane: LaneRuntime,
    base: number,
    cfg: Config
): number {
    return Math.min(
        base -
            lane.hTime -
            cfg.launchLead,

        base +
            lane.gap -
            lane.wTime -
            cfg.launchLead,

        base +
            2 *
                lane.gap -
            lane.gTime -
            cfg.launchLead,

        base +
            3 *
                lane.gap -
            lane.wTime -
            cfg.launchLead
    );
}


function addBatch(
    rt: Runtime,
    lane: LaneRuntime,
    base: number,
    cfg: Config
): void {
    lane.planned++;
    rt.totalPlanned++;

    const key =
        `${rt.epoch}:` +
        `${lane.id}:` +
        `${lane.planned}`;

    const definitions: [
        Phase,
        string,
        number,
        number,
        number,
    ][] = [
        [
            "H",
            H,
            lane.h,
            base,
            lane.hTime,
        ],

        [
            "W1",
            W,
            lane.w1,
            base +
                lane.gap,
            lane.wTime,
        ],

        [
            "G",
            G,
            lane.g,
            base +
                2 *
                    lane.gap,
            lane.gTime,
        ],

        [
            "W2",
            W,
            lane.w2,
            base +
                3 *
                    lane.gap,
            lane.wTime,
        ],
    ];

    const jobs:
        Job[] =
        definitions.map(
            ([
                phase,
                script,
                threads,
                finishAt,
                actionTime,
            ]) => ({
                key,

                laneId:
                    lane.id,

                target:
                    lane.target,

                phase,

                topology:
                    lane.topology,

                script,
                threads,

                finishAt,
                actionTime,

                launchAt:
                    finishAt -
                    actionTime -
                    cfg.launchLead,

                launched:
                    false,
            })
        );

    const verifyDelay =
        clamp(
            lane.gap *
                0.25,
            50,
            120
        );

    rt.batches.set(
        key,
        {
            key,

            laneId:
                lane.id,

            target:
                lane.target,

            expected:
                lane.expected,

            jobs,

            verifyAt:
                base +
                3 *
                    lane.gap +
                verifyDelay,

            started:
                false,

            verified:
                false,

            verifiedWindow:
                -1,

            actualStolen: 0,

            hackFinishedAt: 0,

            jitters: [],
        }
    );

    rt.jobs.push(
        ...jobs
    );
}


function launchDue(
    ns: NS,
    rt: Runtime,
    env: Env,
    cfg: Config,
    now: number
): LaunchResult {
    for (
        const job
        of rt.jobs
    ) {
        if (
            job.launched ||
            job.launchAt >
                now +
                    15
        ) {
            continue;
        }

        const batch =
            rt.batches.get(
                job.key
            );

        if (!batch) {
            continue;
        }

        let pids:
            number[] = [];

        /*
         * H always prefers remote.
         *
         * HOME_GW:
         *   G/W stay on home.
         *
         * REMOTE_ALL:
         *   every phase runs in the remote fleet.
         */
        if (
            job.phase === "H"
        ) {
            pids =
                launchDistributed(
                    ns,
                    job,
                    env,
                    cfg,
                    true
                );
        } else if (
            job.topology ===
            "REMOTE_ALL"
        ) {
            pids =
                launchDistributed(
                    ns,
                    job,
                    env,
                    cfg,
                    false
                );
        } else {
            const pid =
                ns.exec(
                    job.script,
                    "home",
                    job.threads,

                    job.target,

                    job.finishAt,

                    job.actionTime,

                    job.key,

                    job.phase,

                    cfg.port,

                    0
                );

            if (pid) {
                pids = [
                    pid,
                ];
            }
        }

        if (
            pids.length === 0
        ) {
            return {
                ok:
                    false,

                reason:
                    `LAUNCH ${job.target} ${job.phase} ${job.topology}`,
            };
        }

        job.launched =
            true;

        batch.started =
            true;

        for (
            const pid
            of pids
        ) {
            rt.pids.push({
                pid,

                batchId:
                    job.key,
            });
        }
    }

    /*
     * BatchRuntime keeps its own Job references.
     * The global queue only needs jobs that have not launched yet.
     */
    rt.jobs =
        rt.jobs.filter(
            job =>
                !job.launched
        );

    return {
        ok: true,
        reason: "",
    };
}


function launchDistributed(
    ns: NS,
    job: Job,
    env: Env,
    cfg: Config,
    allowHome: boolean
): number[] {
    let remaining =
        job.threads;

    const pids:
        number[] = [];

    let part =
        0;

    const hosts =
        allowHome
            ? [
                  ...env.remoteHosts,
                  "home",
              ]
            : [
                  ...env.remoteHosts,
              ];

    const scriptRam =
        job.phase === "H"
            ? env.workerRam.h
            : job.phase === "G"
                ? env.workerRam.g
                : env.workerRam.w;

    for (
        const host
        of hosts
    ) {
        if (
            remaining <= 0
        ) {
            break;
        }

        if (
            host !== "home" &&
            !ns.fileExists(
                job.script,
                host
            )
        ) {
            continue;
        }

        const max =
            ns.getServerMaxRam(
                host
            );

        const used =
            ns.getServerUsedRam(
                host
            );

        const reservePct =
            host === "home"
                ? cfg.reservePct
                : cfg.remoteReservePct;

        const usable =
            Math.max(
                0,
                max *
                    (
                        1 -
                        reservePct
                    ) -
                    used
            );

        const fit =
            Math.floor(
                usable /
                Math.max(
                    scriptRam,
                    1e-9
                )
            );

        if (
            fit <= 0
        ) {
            continue;
        }

        const use =
            Math.min(
                fit,
                remaining
            );

        const pid =
            ns.exec(
                job.script,
                host,
                use,

                job.target,

                job.finishAt,

                job.actionTime,

                job.key,

                job.phase,

                cfg.port,

                part++
            );

        if (!pid) {
            continue;
        }

        pids.push(
            pid
        );

        remaining -=
            use;
    }

    /*
     * Phase launches are atomic.
     *
     * Partial G/W is especially dangerous,
     * because it destroys the batch state.
     */
    if (
        remaining > 0
    ) {
        for (
            const pid
            of pids
        ) {
            ns.kill(
                pid
            );
        }

        return [];
    }

    return pids;
}


/*
 * ================================================================
 * TELEMETRY
 * ================================================================
 */

function drainTelemetry(
    ns: NS,
    port: number,
    rt: Runtime
): void {
    const handle =
        ns.getPortHandle(
            port
        );

    while (
        !handle.empty()
    ) {
        const raw =
            handle.read();

        if (
            typeof raw !==
                "object" ||
            raw === null
        ) {
            continue;
        }

        const event =
            raw as
                Partial<TelemetryEvent>;

        if (
            typeof event.batchId !==
                "string" ||
            typeof event.phase !==
                "string" ||
            typeof event.finishedAt !==
                "number" ||
            typeof event.scheduledFinish !==
                "number" ||
            typeof event.value !==
                "number"
        ) {
            continue;
        }

        const batch =
            rt.batches.get(
                event.batchId
            );

        if (!batch) {
            continue;
        }

        const jitter =
            Math.abs(
                event.finishedAt -
                event.scheduledFinish
            );

        batch.jitters.push(
            jitter
        );

        if (
            typeof event.lateBy ===
                "number"
        ) {
            rt.lateBy.push(
                Math.max(
                    0,
                    event.lateBy
                )
            );
        }

        if (
            event.phase === "H"
        ) {
            batch.actualStolen +=
                Math.max(
                    0,
                    event.value
                );

            batch.hackFinishedAt =
                Math.max(
                    batch.hackFinishedAt,
                    event.finishedAt
                );
        }
    }
}


/*
 * ================================================================
 * VERIFICATION
 * ================================================================
 */

function verifyDue(
    ns: NS,
    rt: Runtime,
    cfg: Config,
    now: number
): VerifyResult {
    let newVerified = 0;

    for (
        const batch
        of rt.batches.values()
    ) {
        if (
            batch.verified ||
            batch.verifyAt >
                now
        ) {
            continue;
        }

        if (
            !batch.jobs.every(
                job =>
                    job.launched
            )
        ) {
            continue;
        }

        batch.verified =
            true;

        batch.verifiedWindow =
            rt.measurementId;

        rt.verified++;

        newVerified++;

        rt.expectedStolen +=
            batch.expected;

        rt.actualStolen +=
            batch.actualStolen;

        rt.jitters.push(
            ...batch.jitters
        );

        if (
            batch.hackFinishedAt >
            0
        ) {
            if (
                rt.firstHackAt === 0
            ) {
                rt.firstHackAt =
                    batch.hackFinishedAt;
            }

            rt.lastHackAt =
                Math.max(
                    rt.lastHackAt,
                    batch.hackFinishedAt
                );
        }

        const server =
            ns.getServer(
                batch.target
            );

        const max =
            Number(
                server.moneyMax ?? 0
            );

        const money =
            Number(
                server.moneyAvailable ?? 0
            );

        const min =
            Number(
                server.minDifficulty ?? 0
            );

        const sec =
            Number(
                server.hackDifficulty ??
                min
            );

        const moneyRatio =
            max > 0
                ? money /
                    max
                : 1;

        const secDelta =
            sec -
            min;

        const softDrift =
            moneyRatio <
                cfg.driftMoney ||
            secDelta >
                cfg.driftSec;

        const hardDrift =
            moneyRatio <
                cfg.driftHardMoney ||
            secDelta >
                cfg.driftHardSec;

        let driftReason =
            "";

        /*
         * Genuine target collapse trips immediately.
         */
        if (
            !rt.stopScheduling &&
            hardDrift
        ) {
            driftReason =
                `DRIFT-HARD ${batch.target} ` +
                `money=${pct(moneyRatio)} ` +
                `secΔ=${secDelta.toFixed(3)}`;
        }

        /*
         * Mild deviations are only evidence when they persist.
         *
         * Many batches can verify in one event-loop tick.
         * They count as ONE state sample, not N failures.
         */
        if (
            !driftReason
        ) {
            const lastSample =
                rt.driftSampleAt.get(
                    batch.target
                ) ??
                0;

            if (
                now -
                    lastSample >=
                cfg.driftSampleMs
            ) {
                rt.driftSampleAt.set(
                    batch.target,
                    now
                );

                const streak =
                    softDrift
                        ? (
                              rt.driftStreaks.get(
                                  batch.target
                              ) ??
                              0
                          ) + 1
                        : 0;

                rt.driftStreaks.set(
                    batch.target,
                    streak
                );

                if (
                    !rt.stopScheduling &&
                    streak >=
                        cfg.driftConfirm
                ) {
                    driftReason =
                        `DRIFT-PERSIST ${batch.target} ` +
                        `money=${pct(moneyRatio)} ` +
                        `secΔ=${secDelta.toFixed(3)} ` +
                        `streak=${streak}`;
                }
            }
        }

        if (driftReason) {
            rt.driftCount++;

            return {
                newVerified,
                reason:
                    driftReason,
            };
        }
    }

    return {
        newVerified,
        reason: "",
    };
}


function refreshModelEnv(
    ns: NS,
    base: Env
): Env {
    const hack =
        ns.getHackingLevel();

    const signatureParts =
        base.signature.split(
            ":"
        );

    /*
     * buildEnv() keeps hack-bucket at index 5.
     * Preserve its signature format for adaptation hysteresis.
     */
    if (
        signatureParts.length >=
        7
    ) {
        signatureParts[5] =
            String(
                Math.floor(
                    hack /
                    10
                )
            );
    }

    return {
        ...base,

        hack,

        player:
            ns.getPlayer(),

        signature:
            signatureParts.join(
                ":"
            ),
    };
}


function canHotSwapPlan(
    rt: Runtime,
    next: Portfolio
): boolean {
    if (
        next.lanes.length !==
        rt.lanes.length
    ) {
        return false;
    }

    /*
     * Same target + same topology:
     * future batches may safely receive new thread counts,
     * timings, gap and period.
     *
     * Already-created batches remain immutable.
     */
    return next.lanes.every(
        (
            lane,
            index
        ) => {
            const current =
                rt.lanes[
                    index
                ];

            return (
                current !==
                    undefined &&
                current.target ===
                    lane.target &&
                current.topology ===
                    lane.topology
            );
        }
    );
}


function applyHotPlan(
    rt: Runtime,
    next: Portfolio,
    epoch: number
): void {
    rt.epoch =
        epoch;

    /*
     * Preserve scheduler cursor.
     *
     * New policy applies only to batches created after this point.
     * Existing BatchRuntime objects keep their old immutable jobs.
     */
    rt.lanes =
        next.lanes.map(
            (
                lane,
                index
            ) => {
                const current =
                    rt.lanes[
                        index
                    ];

                return {
                    ...lane,

                    id:
                        current.id,

                    planned:
                        current.planned,

                    nextBase:
                        current.nextBase,
                };
            }
        );
}


function resetMeasurementWindow(
    ns: NS,
    rt: Runtime
): void {
    const now =
        Date.now();

    rt.measurementId++;

    rt.startedAt =
        now;

    rt.lastEnvCheck =
        now;

    rt.hackingMoneyAtStart =
        ns.getMoneySources()
            .sinceStart
            .hacking;

    rt.verified = 0;

    rt.expectedStolen = 0;
    rt.actualStolen = 0;

    rt.firstHackAt = 0;
    rt.lastHackAt = 0;

    rt.jitters = [];
    rt.lateBy = [];

    rt.driftCount = 0;
    rt.launchFailures = 0;
}


function garbageCollectRuntime(
    ns: NS,
    rt: Runtime
): void {
    /*
     * Do not ns.isRunning() every PID every 20 ms.
     *
     * Only verified batches are candidates for retirement.
     */
    rt.pids =
        rt.pids.filter(
            ref => {
                const batch =
                    rt.batches.get(
                        ref.batchId
                    );

                if (!batch) {
                    return false;
                }

                if (!batch.verified) {
                    return true;
                }

                return ns.isRunning(
                    ref.pid
                );
            }
        );

    const liveBatchIds =
        new Set(
            rt.pids.map(
                ref =>
                    ref.batchId
            )
        );

    /*
     * Keep current-window verified batches for statistics.
     * Previous measurement generations can disappear once
     * their worker PIDs are truly gone.
     */
    for (
        const [
            key,
            batch,
        ]
        of rt.batches
    ) {
        if (
            batch.verified &&
            batch.verifiedWindow <
                rt.measurementId &&
            !liveBatchIds.has(
                key
            )
        ) {
            rt.batches.delete(
                key
            );
        }
    }

    rt.jobs =
        rt.jobs.filter(
            job => {
                const batch =
                    rt.batches.get(
                        job.key
                    );

                return Boolean(
                    batch &&
                    !job.launched &&
                    !batch.verified
                );
            }
        );
}


/*
 * ================================================================
 * γ3.4 POLICY PROFILE MEMORY
 * ================================================================
 */

function policyProfileKey(
    plan: Portfolio
): string {
    const lane =
        plan.lanes[0];

    if (!lane) {
        return "";
    }

    return (
        lane.target +
        "|" +
        lane.topology
    );
}


function saveActivePolicyProfile(
    controls: Controls
): void {
    if (
        !controls.activeProfileKey
    ) {
        return;
    }

    const profile =
        controls.profiles.get(
            controls.activeProfileKey
        );

    if (!profile) {
        return;
    }

    profile.takeCap =
        controls.takeCap;

    profile.learnedTakeCeiling =
        controls.learnedTakeCeiling;

    profile.periodFloor =
        controls.periodFloor;

    profile.stableWindows =
        controls.stableWindows;

    profile.takeProbeCooldown =
        controls.takeProbeCooldown;

    profile.baselineSingleRate =
        controls.baselineSingleRate;
}


function activatePolicyProfile(
    ns: NS,
    controls: Controls,
    plan: Portfolio,
    cfg: Config
): void {
    const key =
        policyProfileKey(
            plan
        );

    if (!key) {
        return;
    }

    if (
        key ===
        controls.activeProfileKey
    ) {
        return;
    }

    /*
     * Preserve the evidence of the workload we're leaving.
     */
    saveActivePolicyProfile(
        controls
    );

    const lane =
        plan.lanes[0];

    if (!lane) {
        return;
    }

    let profile =
        controls.profiles.get(
            key
        );

    if (!profile) {
        const floorTake =
            Math.max(
                cfg.takeMin,
                Math.min(
                    0.25,
                    cfg.takeMax
                )
            );

        profile = {
            key,

            target:
                lane.target,

            topology:
                lane.topology,

            /*
             * Every UNKNOWN workload starts from the known
             * production floor.
             *
             * It does NOT inherit aggression learned elsewhere.
             */
            takeCap:
                floorTake,

            learnedTakeCeiling:
                Math.min(
                    cfg.takeMax,
                    Math.max(
                        floorTake,
                        0.26
                    )
                ),

            periodFloor: 0,

            stableWindows: 0,

            takeProbeCooldown: 0,

            baselineSingleRate:
                null,

            economicEnvironment:
                "",

            economicPolicies:
                new Map<
                    string,
                    EconomicPolicyStats
                >(),

            economicChampionKey:
                null,

            failures: 0,
        };

        controls.profiles.set(
            key,
            profile
        );

        ns.tprint(
            `[PROFILE] NEW | ${key} | ` +
            `take=${pct(profile.takeCap)} | ` +
            `ceiling=${pct(profile.learnedTakeCeiling)}`
        );
    } else {
        ns.tprint(
            `[PROFILE] RESTORE | ${key} | ` +
            `take=${pct(profile.takeCap)} | ` +
            `ceiling=${pct(profile.learnedTakeCeiling)} | ` +
            `failures=${profile.failures}`
        );
    }

    controls.activeProfileKey =
        key;

    controls.takeCap =
        profile.takeCap;

    controls.learnedTakeCeiling =
        profile.learnedTakeCeiling;

    controls.periodFloor =
        profile.periodFloor;

    controls.stableWindows =
        profile.stableWindows;

    controls.takeProbeCooldown =
        profile.takeProbeCooldown;

    controls.baselineSingleRate =
        profile.baselineSingleRate;

    /*
     * Lane experiments are workload-specific evidence too.
     * γ3.4 production mode starts each new policy clean.
     */
    controls.allowedTargets = 1;

    controls.trialTwo = false;

    controls.laneCooldown = 0;

    controls.laneRejectedSignature =
        null;
}


function recordPolicyFailure(
    controls: Controls
): void {
    const profile =
        controls.profiles.get(
            controls.activeProfileKey
        );

    if (!profile) {
        return;
    }

    profile.failures++;
}


/*
 * ================================================================
 * DRAIN / ABORT
 * ================================================================
 */

function stopFuture(
    rt: Runtime
): void {
    if (
        rt.stopScheduling
    ) {
        return;
    }

    rt.stopScheduling =
        true;

    const cancellable =
        new Set<string>();

    for (
        const [
            key,
            batch,
        ]
        of rt.batches
    ) {
        if (
            !batch.started &&
            !batch.jobs.some(
                job =>
                    job.launched
            )
        ) {
            cancellable.add(
                key
            );
        }
    }

    rt.jobs =
        rt.jobs.filter(
            job =>
                !cancellable.has(
                    job.key
                )
        );

    for (
        const key
        of cancellable
    ) {
        rt.batches.delete(
            key
        );
    }
}


function abortRuntime(
    ns: NS,
    rt: Runtime
): void {
    rt.stopScheduling =
        true;

    for (
        const ref
        of rt.pids
    ) {
        if (
            ns.isRunning(
                ref.pid
            )
        ) {
            ns.kill(
                ref.pid
            );
        }
    }
}


function allDrained(
    ns: NS,
    rt: Runtime
): boolean {
    const pendingStarted =
        rt.jobs.some(
            job =>
                !job.launched &&
                Boolean(
                    rt.batches.get(
                        job.key
                    )?.started
                )
        );

    if (
        pendingStarted
    ) {
        return false;
    }

    return !rt.pids.some(
        ref =>
            ns.isRunning(
                ref.pid
            )
    );
}


/*
 * ================================================================
 * METRICS / ADAPTATION
 * ================================================================
 */

function summarizeEpoch(
    ns: NS,
    rt: Runtime,
    plan: Portfolio,
    reason: string
): EpochMetrics {
    const realizedRatio =
        rt.expectedStolen > 0
            ? rt.actualStolen /
                rt.expectedStolen
            : 0;

    const predictedRate =
        plan.totalEV;

    let measuredRate = 0;

    /*
    * Measure hot throughput per lane independently.
    *
    * Different targets can have very different H/G/W durations.
    * A single global firstHackAt -> lastHackAt window therefore
    * massively understates throughput for a multi-lane portfolio.
    *
    * Each lane gets its own temporal window; portfolio throughput
    * is the sum of those independently measured lane rates.
    */
    for (
        const lane
        of rt.lanes
    ) {
        let laneActual = 0;

        let firstHackAt = 0;
        let lastHackAt = 0;

        for (
            const batch
            of rt.batches.values()
        ) {
            if (
                !batch.verified ||
                batch.verifiedWindow !==
                    rt.measurementId ||
                batch.laneId !==
                    lane.id ||
                batch.hackFinishedAt <=
                    0
            ) {
                continue;
            }

            laneActual +=
                batch.actualStolen;

            if (
                firstHackAt === 0 ||
                batch.hackFinishedAt <
                    firstHackAt
            ) {
                firstHackAt =
                    batch.hackFinishedAt;
            }

            lastHackAt =
                Math.max(
                    lastHackAt,
                    batch.hackFinishedAt
                );
        }

        if (
            laneActual > 0 &&
            firstHackAt > 0 &&
            lastHackAt >=
                firstHackAt
        ) {
            const duration =
                Math.max(
                    1,
                    lastHackAt -
                        firstHackAt +
                        lane.period
                );

            measuredRate +=
                laneActual *
                1000 /
                duration;
        }
    }

    const adjustedRate =
        predictedRate *
        realizedRatio;

    const actualRate =
        measuredRate > 0
            ? measuredRate
            : adjustedRate;

    const wallElapsed =
    Math.max(
        1,
        Date.now() -
            rt.startedAt
    );

    const wallHacking =
        Math.max(
            0,
            ns.getMoneySources()
                .sinceStart
                .hacking -
                rt.hackingMoneyAtStart
        );

    const wallRate =
        wallHacking *
        1000 /
        wallElapsed;

    return {
        verified:
            rt.verified,

        expected:
            rt.expectedStolen,

        actual:
            rt.actualStolen,

        realizedRatio,

        predictedRate,
        measuredRate,
        actualRate,

        wallRate,

        trackedPids:
            rt.pids.length,

        p95Jitter:
            percentile(
                rt.jitters,
                0.95
            ),

        p95LateBy:
            percentile(
                rt.lateBy,
                0.95
            ),

        minGap:
            Math.min(
                ...plan.lanes.map(
                    lane =>
                        lane.gap
                )
            ),

        driftCount:
            rt.driftCount,

        launchFailures:
            rt.launchFailures,

        reason,
    };
}


/*
 * ================================================================
 * γ3.6 EMPIRICAL ECONOMIC FRONTIER
 * ================================================================
 */

function economicPolicyKey(
    lane: LanePlan
): string {
    return (
        lane.target +
        "|" +
        lane.topology +
        "|take=" +
        lane.requestedTake.toFixed(4) +
        "|gap=" +
        lane.gap +
        "|period=" +
        lane.period
    );
}


function createEconomicPolicyStats(
    lane: LanePlan
): EconomicPolicyStats {
    return {
        key:
            economicPolicyKey(
                lane
            ),

        target:
            lane.target,

        topology:
            lane.topology,

        requestedTake:
            lane.requestedTake,

        actualTake:
            lane.actualTake,

        gap:
            lane.gap,

        period:
            lane.period,

        samples: 0,

        wallEwma: 0,
        actualEwma: 0,

        wallVarianceEwma: 0,

        pidActualEwma: 0,

        pidEstimate:
            lane.estimatedPids,

        pidRatioEwma: 0,

        predictionErrorEwma: 0,

        failures: 0,
    };
}


function economicScore(
    stats: EconomicPolicyStats
): number {
    if (
        stats.samples <=
        0
    ) {
        return 0;
    }

    /*
     * Conservative throughput score.
     *
     * wallEWMA is the center.
     * One estimated standard-error is subtracted as a
     * noise penalty.
     *
     * This is not presented as a formal confidence interval.
     * It is a robust ranking heuristic for noisy short windows.
     */
    const sigma =
        Math.sqrt(
            Math.max(
                0,
                stats.wallVarianceEwma
            )
        );

    const uncertainty =
        sigma /
        Math.sqrt(
            Math.max(
                1,
                stats.samples
            )
        );

    return Math.max(
        0,
        stats.wallEwma -
            uncertainty
    );
}


function resetEconomicEnvironment(
    profile: StabilityProfile,
    environmentSignature: string
): boolean {
    if (
        profile.economicEnvironment ===
        environmentSignature
    ) {
        return false;
    }

    profile.economicEnvironment =
        environmentSignature;

    profile.economicPolicies.clear();

    profile.economicChampionKey =
        null;

    return true;
}


function recordEconomicPolicyFailure(
    controls: Controls,
    plan: Portfolio,
    environmentSignature: string
): void {
    if (
        plan.lanes.length !==
        1
    ) {
        return;
    }

    const profile =
        controls.profiles.get(
            controls.activeProfileKey
        );

    if (!profile) {
        return;
    }

    resetEconomicEnvironment(
        profile,
        environmentSignature
    );

    const lane =
        plan.lanes[0];

    if (!lane) {
        return;
    }

    const key =
        economicPolicyKey(
            lane
        );

    let stats =
        profile.economicPolicies.get(
            key
        );

    if (!stats) {
        stats =
            createEconomicPolicyStats(
                lane
            );

        profile.economicPolicies.set(
            key,
            stats
        );
    }

    stats.failures++;

    /*
     * A policy that produced a genuine runtime fault can no
     * longer be treated as the current economic champion.
     *
     * Stability evidence always dominates economic evidence.
     */
    if (
        profile.economicChampionKey ===
        key
    ) {
        profile.economicChampionKey =
            null;
    }
}


function observeEconomicFrontier(
    ns: NS,
    controls: Controls,
    metrics: EpochMetrics,
    plan: Portfolio,
    cfg: Config,
    environmentSignature: string
): boolean {
    /*
     * Return true when γ3.6 wants the controller to DWELL
     * instead of changing another control during this window.
     */

    if (
        plan.lanes.length !==
            1 ||
        metrics.reason !==
            "WINDOW" ||
        metrics.wallRate <=
            0
    ) {
        return false;
    }

    /*
     * γ3.6.1 WARM-WINDOW FILTER
     *
     * After prep / pipeline resurrection, measured hot throughput
     * may already be healthy while wall-clock throughput still
     * contains several seconds of pipeline fill.
     *
     * Example observed in production:
     *
     * actual ~= $5b/s
     * wall   ~= $100m/s
     *
     * That is lifecycle evidence, not steady-state policy
     * evidence. Hold all adaptation for this window and do not
     * feed it into the economic EWMA.
     */
    const hotWallRatio =
        metrics.actualRate > 0
            ? metrics.wallRate /
                metrics.actualRate
            : 1;

    if (
        metrics.actualRate >
            0 &&
        hotWallRatio <
            ECON_MIN_WALL_HOT_RATIO
    ) {
        ns.tprint(
            `[ECON] WARM-SKIP | ` +
            `wall=${fmtMoney(metrics.wallRate)}/s | ` +
            `hot=${fmtMoney(metrics.actualRate)}/s | ` +
            `ratio=${pct(hotWallRatio)}`
        );

        return true;
    }

    const profile =
        controls.profiles.get(
            controls.activeProfileKey
        );

    if (!profile) {
        return false;
    }

    const environmentReset =
        resetEconomicEnvironment(
            profile,
            environmentSignature
        );

    if (environmentReset) {
        ns.tprint(
            `[ECON] ENV-RESET | ` +
            `${controls.activeProfileKey || "-"} | ` +
            `${environmentSignature}`
        );
    }

    const lane =
        plan.lanes[0];

    if (!lane) {
        return false;
    }

    const key =
        economicPolicyKey(
            lane
        );

    let stats =
        profile.economicPolicies.get(
            key
        );

    if (!stats) {
        stats =
            createEconomicPolicyStats(
                lane
            );

        profile.economicPolicies.set(
            key,
            stats
        );
    }

    const alpha =
        ECON_EWMA_ALPHA;

    const pidRatio =
        metrics.trackedPids /
        Math.max(
            1,
            lane.estimatedPids
        );

    const predictionError =
        Math.abs(
            metrics.predictedRate -
            metrics.wallRate
        ) /
        Math.max(
            1,
            metrics.predictedRate
        );

    if (
        stats.samples ===
        0
    ) {
        stats.wallEwma =
            metrics.wallRate;

        stats.actualEwma =
            metrics.actualRate;

        stats.wallVarianceEwma =
            0;

        stats.pidActualEwma =
            metrics.trackedPids;

        stats.pidRatioEwma =
            pidRatio;

        stats.predictionErrorEwma =
            predictionError;
    } else {
        const oldWall =
            stats.wallEwma;

        const wallDelta =
            metrics.wallRate -
            oldWall;

        stats.wallEwma =
            oldWall +
            alpha *
                wallDelta;

        /*
         * Exponentially weighted variance update.
         */
        stats.wallVarianceEwma =
            (
                1 -
                alpha
            ) *
            (
                stats.wallVarianceEwma +
                alpha *
                    wallDelta *
                    wallDelta
            );

        stats.actualEwma =
            stats.actualEwma *
                (
                    1 -
                    alpha
                ) +
            metrics.actualRate *
                alpha;

        stats.pidActualEwma =
            stats.pidActualEwma *
                (
                    1 -
                    alpha
                ) +
            metrics.trackedPids *
                alpha;

        stats.pidRatioEwma =
            stats.pidRatioEwma *
                (
                    1 -
                    alpha
                ) +
            pidRatio *
                alpha;

        stats.predictionErrorEwma =
            stats.predictionErrorEwma *
                (
                    1 -
                    alpha
                ) +
            predictionError *
                alpha;
    }

    stats.samples++;

    stats.pidEstimate =
        lane.estimatedPids;

    const sigma =
        Math.sqrt(
            Math.max(
                0,
                stats.wallVarianceEwma
            )
        );

    const noise =
        sigma /
        Math.max(
            1,
            stats.wallEwma
        );

    const score =
        economicScore(
            stats
        );

    /*
     * Don't spam every single rolling window.
     */
    if (
        stats.samples ===
            1 ||
        stats.samples ===
            ECON_MIN_SAMPLES ||
        stats.samples %
            5 ===
            0
    ) {
        ns.tprint(
            `[ECON] OBS | ` +
            `${pct(stats.actualTake)}(req=${pct(stats.requestedTake)}) ` +
            `gap=${stats.gap}ms ` +
            `period=${stats.period}ms | ` +
            `n=${stats.samples} | ` +
            `wallEWMA=${fmtMoney(stats.wallEwma)}/s | ` +
            `score=${fmtMoney(score)}/s | ` +
            `noise=${pct(noise)} | ` +
            `pid=${Math.round(stats.pidActualEwma)}/${stats.pidEstimate} | ` +
            `pidRatio=${stats.pidRatioEwma.toFixed(3)} | ` +
            `predErr=${pct(stats.predictionErrorEwma)} | ` +
            `fail=${stats.failures}`
        );
    }

    /*
     * ------------------------------------------------------------
     * No champion yet.
     *
     * Force a real baseline dwell before allowing higher take.
     * ------------------------------------------------------------
     */
    if (
        profile.economicChampionKey ===
        null
    ) {
        if (
            stats.samples <
            ECON_MIN_SAMPLES
        ) {
            return true;
        }

        profile.economicChampionKey =
            key;

        ns.tprint(
            `[ECON] CHAMPION | ` +
            `${pct(stats.actualTake)}(req=${pct(stats.requestedTake)}) ` +
            `gap=${stats.gap}ms ` +
            `period=${stats.period}ms | ` +
            `wallEWMA=${fmtMoney(stats.wallEwma)}/s | ` +
            `score=${fmtMoney(score)}/s`
        );

        /*
         * Baseline is established.
         *
         * Existing γ3.x logic may now create ONE controlled
         * challenger.
         */
        return false;
    }

    const champion =
        profile.economicPolicies.get(
            profile.economicChampionKey
        );

    /*
     * Defensive recovery if profile memory became inconsistent.
     */
    if (!champion) {
        profile.economicChampionKey =
            key;

        return true;
    }

    /*
     * Current production policy is already champion.
     *
     * Existing controller may eventually unlock the next
     * controlled challenger.
     */
    if (
        champion.key ===
        key
    ) {
        const theoreticalMinimum =
            Math.max(
                3 *
                    lane.gap +
                    cfg.guard,
                250
            );

        /*
         * If stability previously forced us to widen cadence,
         * periodically challenge one faster cadence step.
         *
         * Only one dimension changes at a time.
         */
        if (
            stats.samples >=
                ECON_PERIOD_CHALLENGE_SAMPLES &&
            controls.takeProbeCooldown ===
                0 &&
            champion.period >
                theoreticalMinimum
        ) {
            const challengerPeriod =
                Math.max(
                    theoreticalMinimum,
                    champion.period -
                        ECON_PERIOD_STEP
                );

            if (
                challengerPeriod <
                champion.period
            ) {
                controls.periodFloor =
                    challengerPeriod;

                controls.takeProbeCooldown =
                    Math.max(
                        controls.takeProbeCooldown,
                        8
                    );

                controls.stableWindows =
                    0;

                ns.tprint(
                    `[ECON] PERIOD-CHALLENGE | ` +
                    `${champion.period}ms -> ` +
                    `${challengerPeriod}ms | ` +
                    `take=${pct(champion.actualTake)} ` +
                    `(req=${pct(champion.requestedTake)})`
                );

                return true;
            }
        }

        return false;
    }

    /*
     * ------------------------------------------------------------
     * Challenger dwell.
     * ------------------------------------------------------------
     */

    if (
        stats.samples <
        ECON_MIN_SAMPLES
    ) {
        return true;
    }

    const championScore =
        economicScore(
            champion
        );

    const challengerScore =
        score;

    /*
     * A challenger must demonstrate a MATERIAL wall-clock gain.
     *
     * Predicted EV is deliberately not the deciding metric.
     */
    if (
        challengerScore >=
        championScore *
            (
                1 +
                ECON_PROMOTE_GAIN
            )
    ) {
        profile.economicChampionKey =
            key;

        ns.tprint(
            `[ECON] PROMOTE | ` +
            `${pct(stats.actualTake)}(req=${pct(stats.requestedTake)}) ` +
            `${stats.period}ms ` +
            `${fmtMoney(challengerScore)}/s ` +
            `> ` +
            `${pct(champion.actualTake)}(req=${pct(champion.requestedTake)}) ` +
            `${champion.period}ms ` +
            `${fmtMoney(championScore)}/s`
        );

        /*
         * Don't immediately mutate another policy dimension
         * in the same observation that promoted a champion.
         */
        return true;
    }

    const materiallyWorse =
        challengerScore <=
        championScore *
            (
                1 -
                ECON_REJECT_LOSS
            );

    const noMaterialGain =
        stats.samples >=
        ECON_MAX_CHALLENGER_SAMPLES;

    if (
        materiallyWorse ||
        noMaterialGain
    ) {
        controls.takeCap =
            clamp(
                champion.requestedTake,
                cfg.takeMin,
                cfg.takeMax
            );

        controls.gapFloor =
            champion.gap;

        controls.periodFloor =
            champion.period;

        /*
         * Economic rejection is weaker than a safety failure,
         * but it still lowers the trusted frontier until a
         * long clean dwell permits a re-test.
         */
        controls.learnedTakeCeiling =
            Math.max(
                cfg.takeMin,
                Math.min(
                    controls.learnedTakeCeiling,
                    champion.requestedTake
                )
            );

        controls.takeProbeCooldown =
            Math.max(
                controls.takeProbeCooldown,
                ECON_RETEST_WINDOWS
            );

        controls.stableWindows =
            0;

        ns.tprint(
            `[ECON] REJECT | ` +
            `${pct(stats.actualTake)}(req=${pct(stats.requestedTake)}) ` +
            `${stats.period}ms ` +
            `${fmtMoney(challengerScore)}/s ` +
            `vs champion ` +
            `${pct(champion.actualTake)}(req=${pct(champion.requestedTake)}) ` +
            `${champion.period}ms ` +
            `${fmtMoney(championScore)}/s | ` +
            `${
                materiallyWorse
                    ? "materially-worse"
                    : "no-material-gain"
            } | ` +
            `retest=${ECON_RETEST_WINDOWS}`
        );

        return true;
    }

    /*
     * Challenger is still gathering evidence.
     *
     * Do not let a third policy enter yet.
     */
    return true;
}


function adaptControls(
    ns: NS,
    controls: Controls,
    metrics: EpochMetrics,
    plan: Portfolio,
    cfg: Config,
    environmentSignature: string
): void {
    const jitterBad =
        metrics.p95Jitter >
        Math.max(
            12,
            metrics.minGap *
                0.30
        );

    const lateBad =
        metrics.p95LateBy >
        Math.max(
            10,
            metrics.minGap *
                0.20
        );

    const driftBad =
        metrics.driftCount >
        0;

    const pidSoftBad =
        metrics.trackedPids >=
        cfg.pidSoftLimit;

    const pidHardBad =
        metrics.trackedPids >=
        cfg.pidHardLimit;

    const launchBad =
        metrics.launchFailures >
        0 ||
        metrics.reason.startsWith(
            "LAUNCH"
        );

    const unstable =
        jitterBad ||
        lateBad ||
        driftBad ||
        launchBad ||
        pidHardBad;

    if (unstable) {
        controls.stableWindows = 0;

        if (
            controls.allowedTargets >
            1
        ) {
            controls.allowedTargets = 1;
            controls.trialTwo = false;
            controls.laneCooldown = 2;
        }

        if (
            jitterBad ||
            lateBad ||
            launchBad ||
            pidHardBad
        ) {
            controls.gapFloor =
                nextLargerGap(
                    controls.gapFloor,
                    cfg.gaps
                );

            cfg.launchLead =
                Math.min(
                    1500,
                    cfg.launchLead +
                        50
                );

            cfg.safety =
                Math.min(
                    1.20,
                    cfg.safety +
                        0.03
                );
        }

        /*
         * γ3.6.1 CADENCE-AWARE DRIFT CONTROL
         *
         * If target state collapses while scheduler telemetry is
         * otherwise healthy, do NOT immediately blame take.
         *
         * First widen inter-batch cadence.
         *
         * This addresses the production pattern we observed:
         *
         *   pids ~5.3k < soft limit
         *   p95-late = 0
         *   jitter healthy
         *   launchFail = 0
         *   BUT target money still collapses
         */
        const lane =
            plan.lanes[0];

        const pureTargetDrift =
            driftBad &&
            !jitterBad &&
            !lateBad &&
            !launchBad &&
            !pidSoftBad &&
            !pidHardBad;

        let cadenceBackedOff =
            false;

        if (
            pureTargetDrift &&
            lane &&
            lane.period <
                ECON_PERIOD_MAX
        ) {
            const nextPeriod =
                Math.min(
                    ECON_PERIOD_MAX,
                    Math.max(
                        lane.period +
                            ECON_PERIOD_STEP,
                        controls.periodFloor +
                            ECON_PERIOD_STEP
                    )
                );

            if (
                nextPeriod >
                lane.period
            ) {
                controls.periodFloor =
                    nextPeriod;

                controls.takeProbeCooldown =
                    Math.max(
                        controls.takeProbeCooldown,
                        12
                    );

                cadenceBackedOff =
                    true;

                ns.tprint(
                    `[ADAPT] CADENCE-BACKOFF | ` +
                    `${lane.period}ms -> ` +
                    `${controls.periodFloor}ms | ` +
                    `take=${pct(lane.actualTake)} | ` +
                    `pids=${metrics.trackedPids} | ` +
                    `jitter=${metrics.p95Jitter.toFixed(1)}ms | ` +
                    `late=${metrics.p95LateBy.toFixed(1)}ms`
                );
            }
        }

        /*
         * Lower take only when:
         *
         * - cadence has already reached its adaptive ceiling, or
         * - runtime PID pressure itself is the fault.
         */
        if (
            (
                driftBad &&
                !cadenceBackedOff
            ) ||
            pidHardBad
        ) {
            const safeTake =
                Math.max(
                    cfg.takeMin,
                    controls.takeCap -
                        cfg.takeStep
                );

            controls.takeCap =
                safeTake;

            if (
                controls.takeCap >=
                    0.25 -
                        1e-9
            ) {
                controls.learnedTakeCeiling =
                    Math.min(
                        controls.learnedTakeCeiling,
                        safeTake
                    );

                controls.takeProbeCooldown =
                    Math.max(
                        controls.takeProbeCooldown,
                        20
                    );
            } else {
                controls.takeProbeCooldown =
                    Math.max(
                        controls.takeProbeCooldown,
                        8
                    );
            }
        }

        /*
         * Extreme scheduler lateness is also pressure evidence,
         * even if target-state drift has not appeared yet.
         */
        if (
            lateBad &&
            controls.takeCap >
                0.25 +
                    1e-9
        ) {
            const pressureSafe =
                Math.max(
                    0.25,
                    controls.takeCap -
                        cfg.takeStep
                );

            controls.takeCap =
                pressureSafe;

            controls.learnedTakeCeiling =
                Math.min(
                    controls.learnedTakeCeiling,
                    pressureSafe
                );

            controls.takeProbeCooldown =
                Math.max(
                    controls.takeProbeCooldown,
                    20
                );
        }

        recordEconomicPolicyFailure(
            controls,
            plan,
            environmentSignature
        );

        recordPolicyFailure(
            controls
        );

        ns.tprint(
            `[ADAPT] BACKOFF | ` +
            `takeCap=${pct(controls.takeCap)} | ` +
            `learnedCeiling=${pct(controls.learnedTakeCeiling)} | ` +
            `probeCooldown=${controls.takeProbeCooldown} | ` +
            `pids=${metrics.trackedPids}/${cfg.pidSoftLimit}/${cfg.pidHardLimit} | ` +
            `profile=${controls.activeProfileKey || "-"} | ` +
            `gapFloor=${controls.gapFloor}ms | ` +
            `periodFloor=${controls.periodFloor || 0}ms | ` +
            `lead=${cfg.launchLead}ms | ` +
            `safety=${cfg.safety.toFixed(3)} | ` +
            `lanes=${controls.allowedTargets}`
        );

        return;
    }

    controls.stableWindows++;

    if (
        controls.takeProbeCooldown >
        0
    ) {
        controls.takeProbeCooldown--;
    }

    /*
     * Measured throughput contains hack RNG noise.
     * Smooth it instead of trusting one short window.
     */
    if (
        controls.allowedTargets === 1 &&
        !controls.trialTwo
    ) {
        controls.baselineSingleRate =
            controls.baselineSingleRate === null
                ? metrics.actualRate
                : controls.baselineSingleRate *
                      0.70 +
                  metrics.actualRate *
                      0.30;
    }

    /*
     * A real multi-lane experiment finished.
     */
    if (controls.trialTwo) {
        const baseline =
            controls.baselineSingleRate;

        const keep =
            plan.lanes.length >= 2 &&
            baseline !== null &&
            metrics.actualRate >=
                baseline *
                    (
                        1 +
                        cfg.minLaneGain
                    );

        if (keep) {
            controls.allowedTargets =
                plan.lanes.length;

            controls.trialTwo =
                false;

            controls.laneRejectedSignature =
                null;

            ns.tprint(
                `[ADAPT] lane #2 ACCEPTED | ` +
                `${fmtMoney(metrics.actualRate)}/s`
            );
        } else {
            controls.allowedTargets =
                1;

            controls.trialTwo =
                false;

            controls.laneCooldown =
                3;

            controls.laneRejectedSignature =
                environmentSignature;

            ns.tprint(
                "[ADAPT] lane #2 REJECTED; " +
                "suppressing retry until environment changes."
            );
        }

        return;
    }

    /*
     * Existing lane #2 must continuously justify itself.
     */
    if (
        controls.allowedTargets >= 2 &&
        controls.baselineSingleRate !== null &&
        metrics.actualRate <
            controls.baselineSingleRate *
                (
                    1 +
                    cfg.minLaneGain *
                        0.5
                )
    ) {
        controls.allowedTargets =
            1;

        controls.laneCooldown =
            3;

        controls.laneRejectedSignature =
            environmentSignature;

        ns.tprint(
            "[ADAPT] extra lane lost marginal value; reverting."
        );

        return;
    }

    if (
        controls.laneCooldown > 0
    ) {
        controls.laneCooldown--;
    }

    /*
     * ========================================================
     * SELF-OVERCLOCK
     *
     * We change the complete timing envelope one controlled
     * step per healthy epoch.
     * ========================================================
     */

    let overclocked =
        false;

    if (
        cfg.launchLead > 50
    ) {
        cfg.launchLead =
            Math.max(
                50,
                cfg.launchLead -
                    25
            );

        overclocked =
            true;
    }

    if (
        cfg.safety > 1.03
    ) {
        cfg.safety =
            Math.max(
                1.03,
                cfg.safety -
                    0.02
            );

        overclocked =
            true;
    }

    if (
        controls.gapFloor > 50
    ) {
        controls.gapFloor =
            nextSmallerGap(
                controls.gapFloor,
                cfg.gaps
            );

        overclocked =
            true;
    }

    if (overclocked) {
        ns.tprint(
            `[ADAPT] OVERCLOCK | ` +
            `gap=${controls.gapFloor}ms | ` +
            `lead=${cfg.launchLead}ms | ` +
            `safety=${cfg.safety.toFixed(3)}`
        );

        return;
    }

    /*
     * ========================================================
     * γ3.2 ADAPTIVE TAKE OVERDRIVE
     *
     * Raising takeCap only expands the optimizer's search
     * space. It does NOT force the selected lane to use the
     * ceiling.
     *
     * If the model still prefers 25%, actualTake stays ~25%.
     *
     * If a more aggressive batch is genuinely more profitable
     * and still fits RAM/timing constraints, JIT5 may climb
     * gradually toward the configured ceiling.
     * ========================================================
     */
    /*
     * ========================================================
     * γ3.4 PID PRESSURE HOLD
     * ========================================================
     */

    if (pidSoftBad) {
        ns.tprint(
            `[ADAPT] PID-HOLD | ` +
            `pids=${metrics.trackedPids} | ` +
            `soft=${cfg.pidSoftLimit} | ` +
            `hard=${cfg.pidHardLimit} | ` +
            `take=${pct(controls.takeCap)} | ` +
            `profile=${controls.activeProfileKey || "-"}`
        );

        return;
    }

    /*
     * ========================================================
     * γ3.6 ECONOMIC FRONTIER
     *
     * Timing envelope is already stable here.
     *
     * Before increasing aggression again, require wall-clock
     * evidence that the current policy deserves to remain.
     * ========================================================
     */

    const economicHold =
        observeEconomicFrontier(
            ns,
            controls,
            metrics,
            plan,
            cfg,
            environmentSignature
        );

    if (economicHold) {
        return;
    }

    /*
     * ========================================================
     * γ3.3 EMPIRICAL TAKE PROBING
     *
     * There are now TWO ceilings:
     *
     * cfg.takeMax
     *   absolute configured search bound
     *
     * learnedTakeCeiling
     *   highest aggression currently trusted by runtime evidence
     * ========================================================
     */

    if (
        controls.takeProbeCooldown ===
            0 &&
        controls.takeCap >=
            controls.learnedTakeCeiling -
                1e-9 &&
        controls.learnedTakeCeiling <
            cfg.takeMax -
                1e-9 &&
        controls.stableWindows >=
            20
    ) {
        controls.learnedTakeCeiling =
            Math.min(
                cfg.takeMax,
                controls.learnedTakeCeiling +
                    cfg.takeStep
            );

        /*
         * Unlock only.
         * Do not increase take in the same observation window.
         */
        ns.tprint(
            `[ADAPT] TAKE-PROBE-UNLOCK | ` +
            `newCeiling=${pct(controls.learnedTakeCeiling)}`
        );

        return;
    }

    const effectiveTakeCeiling =
        Math.min(
            cfg.takeMax,
            controls.learnedTakeCeiling
        );

    if (
        controls.takeCap <
            effectiveTakeCeiling -
                1e-9 &&
        controls.stableWindows >=
            2 &&
        controls.takeProbeCooldown ===
            0
    ) {
        controls.takeCap =
            Math.min(
                effectiveTakeCeiling,
                controls.takeCap +
                    cfg.takeStep
            );

        /*
         * Once we reach the learned frontier, dwell there for
         * twenty clean windows before even allowing a higher probe.
         */
        if (
            controls.takeCap >=
                effectiveTakeCeiling -
                    1e-9 &&
            effectiveTakeCeiling <
                cfg.takeMax -
                    1e-9
        ) {
            controls.takeProbeCooldown =
                20;
        }

        ns.tprint(
            `[ADAPT] TAKE-EXPAND | ` +
            `cap=${pct(controls.takeCap)} | ` +
            `learnedCeiling=${pct(controls.learnedTakeCeiling)} | ` +
            `hardCeiling=${pct(cfg.takeMax)} | ` +
            `dwell=${controls.takeProbeCooldown}`
        );

        return;
    }

    /*
     * Only search for lane #2 AFTER the single-target engine
     * has reached its current timing envelope.
     *
     * Also don't retry a portfolio that was already proven
     * economically useless under the same environment.
     */
    if (
        cfg.experimentalMultiLane &&
        controls.allowedTargets === 1 &&
        cfg.maxTargets >= 2 &&
        controls.laneCooldown === 0 &&
        controls.stableWindows >= 2 &&
        controls.laneRejectedSignature !==
            environmentSignature
    ) {
        controls.allowedTargets =
            2;

        controls.trialTwo =
            true;

        ns.tprint(
            `[ADAPT] trial lane #2 | baseline=` +
            `${
                controls.baselineSingleRate === null
                    ? "-"
                    : fmtMoney(
                          controls.baselineSingleRate
                      ) + "/s"
            }`
        );

        return;
    }

}


/*
 * ================================================================
 * NETWORK / ROOT / DEPLOY
 * ================================================================
 */

function scanAll(
    ns: NS
): string[] {
    const seen =
        new Set<string>([
            "home",
        ]);

    const queue:
        string[] = [
            "home",
        ];

    while (
        queue.length >
        0
    ) {
        const host =
            queue.shift();

        if (
            host ===
            undefined
        ) {
            break;
        }

        for (
            const next
            of ns.scan(host)
        ) {
            if (
                seen.has(
                    next
                )
            ) {
                continue;
            }

            seen.add(next);
            queue.push(next);
        }
    }

    return [
        ...seen,
    ];
}


function getOpeners(
    ns: NS
): Opener[] {
    const definitions:
        Opener[] = [
        [
            "BruteSSH.exe",
            host =>
                ns.brutessh(
                    host
                ),
        ],

        [
            "FTPCrack.exe",
            host =>
                ns.ftpcrack(
                    host
                ),
        ],

        [
            "relaySMTP.exe",
            host =>
                ns.relaysmtp(
                    host
                ),
        ],

        [
            "HTTPWorm.exe",
            host =>
                ns.httpworm(
                    host
                ),
        ],

        [
            "SQLInject.exe",
            host =>
                ns.sqlinject(
                    host
                ),
        ],
    ];

    return definitions.filter(
        ([file]) =>
            ns.fileExists(
                file,
                "home"
            )
    );
}


function autoRoot(
    ns: NS,
    hosts: string[]
): number {
    const openers =
        getOpeners(ns);

    let rooted = 0;

    for (
        const host
        of hosts
    ) {
        if (
            host === "home" ||
            ns.hasRootAccess(
                host
            )
        ) {
            continue;
        }

        if (
            ns.getServerNumPortsRequired(
                host
            ) >
            openers.length
        ) {
            continue;
        }

        try {
            for (
                const [
                    ,
                    opener,
                ]
                of openers
            ) {
                opener(host);
            }

            if (
                ns.nuke(
                    host
                )
            ) {
                rooted++;
            }
        } catch {
            // inaccessible special server
        }
    }

    return rooted;
}


function deployWorkers(
    ns: NS,
    hosts: string[]
): void {
    for (
        const host
        of hosts
    ) {
        try {
            ns.scp(
                WORKERS,
                host,
                "home"
            );
        } catch {
            // best effort
        }
    }
}


/*
 * ================================================================
 * OUTPUT
 * ================================================================
 */

function printPlan(
    ns: NS,
    plan: Portfolio,
    controls: Controls,
    cfg: Config,
    dryRun: boolean,
    epoch = 0
): void {
    ns.tprint("");

    ns.tprint(
        `JIT5 ${dryRun ? "DRY" : `EPOCH ${epoch}`} | ` +
        `lanes=${plan.lanes.length} | ` +
        `pred=${fmtMoney(plan.totalEV)}/s`
    );

    ns.tprint(
        `controls | ` +
        `takeCap=${pct(controls.takeCap)} | ` +
        `takeLearned=${pct(controls.learnedTakeCeiling)} | ` +
        `probeCd=${controls.takeProbeCooldown} | ` +
        `profile=${controls.activeProfileKey || "-"} | ` +
        `gapFloor=${controls.gapFloor}ms | ` +
        `lead=${cfg.launchLead}ms | ` +
        `safety=${cfg.safety.toFixed(3)} | ` +
        `allowedTargets=${controls.allowedTargets} | ` +
        `multi=${
            cfg.experimentalMultiLane
                ? "EXPERIMENTAL"
                : "LOCKED"
        }` +
        (
            controls.trialTwo
                ? " | TRIAL-2"
                : ""
        )
    );

    for (
        const [
            index,
            lane,
        ]
        of plan.lanes.entries()
    ) {
        ns.tprint(
            `L${index + 1} ${lane.target} | ` +
            `topology=${lane.topology} | ` +
            `take=${pct(lane.actualTake)} | ` +
            `gap=${lane.gap}ms | ` +
            `period=${lane.period}ms | ` +
            `pidEst=${lane.estimatedPids} | ` +
            `H/G/W1/W2=${lane.h}/${lane.g}/${lane.w1}/${lane.w2} | ` +
            `EV=${fmtMoney(lane.evps)}/s`
        );
    }

    ns.tprint("");
}


function printMetrics(
    ns: NS,
    epoch: number,
    metrics: EpochMetrics
): void {
    ns.tprint(
        `[EPOCH ${epoch}] ${metrics.reason || "DONE"} | ` +
        `verified=${metrics.verified} | ` +
        `pred=${fmtMoney(metrics.predictedRate)}/s | ` +
        `actual=${fmtMoney(metrics.actualRate)}/s | ` +
        `wall=${fmtMoney(metrics.wallRate)}/s | ` +
        `realized=${pct(metrics.realizedRatio)} | ` +
        `pids=${metrics.trackedPids} | ` +
        `p95-jitter=${metrics.p95Jitter.toFixed(1)}ms | ` +
        `p95-late=${metrics.p95LateBy.toFixed(1)}ms | ` +
        `drift=${metrics.driftCount} | ` +
        `launchFail=${metrics.launchFailures}`
    );
}


function printHelp(
    ns: NS
): void {
    ns.tprint(
        "7n8 JIT5 CLOSED-LOOP OPTIMIZER"
    );

    ns.tprint(
        "run jit5.ts --tail"
    );

    ns.tprint(
        "run jit5.ts phantasy --tail"
    );

    ns.tprint(
        "run jit5.ts --targets 2 --dry-run"
    );

    ns.tprint(
        "run jit5.ts --limit 100 --tail"
    );

    ns.tprint(
        "run jit5.ts --experimental-multilane --tail"
    );

    ns.tprint("");

    ns.tprint(
        "γ3.2 defaults to single-lane production lock; " +
        "take ceiling is explored adaptively from a safe 25% start."
    );

    ns.tprint("");
    ns.tprint(
        "JIT5 measures actual hack results and scheduler jitter,"
    );

    ns.tprint(
        "then adapts take, gap, and lane count."
    );
}


/*
 * ================================================================
 * HELPERS
 * ================================================================
 */

function parseGaps(
    raw: string
): number[] {
    const values =
        raw.split(",")
            .map(
                value =>
                    Number(
                        value.trim()
                    )
            )
            .filter(
                value =>
                    Number.isFinite(
                        value
                    ) &&
                    value >= 50
            );

    const unique =
        [
            ...new Set(
                values
                    .map(
                        value =>
                            Math.floor(
                                value
                            )
                    )
            ),
        ];

    unique.sort(
        (a, b) =>
            a -
            b
    );

    return unique.length
        ? unique
        : [
              50,
              60,
              80,
              100,
              125,
              150,
              175,
              200,
              250,
          ];
}


function nextLargerGap(
    current: number,
    gaps: number[]
): number {
    const sorted =
        [
            ...gaps,
        ].sort(
            (a, b) =>
                a -
                b
        );

    return (
        sorted.find(
            gap =>
                gap >
                current
        ) ??
        sorted[
            sorted.length -
            1
        ]
    );
}


function nextSmallerGap(
    current: number,
    gaps: number[]
): number {
    const sorted =
        [
            ...gaps,
        ].sort(
            (a, b) =>
                b -
                a
        );

    return (
        sorted.find(
            gap =>
                gap <
                current
        ) ??
        Math.min(
            ...gaps
        )
    );
}


function percentile(
    values: number[],
    p: number
): number {
    if (
        values.length ===
        0
    ) {
        return 0;
    }

    const sorted =
        [
            ...values,
        ].sort(
            (a, b) =>
                a -
                b
        );

    const index =
        Math.min(
            sorted.length -
                1,
            Math.max(
                0,
                Math.ceil(
                    sorted.length *
                    p
                ) -
                    1
            )
        );

    return sorted[
        index
    ];
}


function clamp(
    value: number,
    min: number,
    max: number
): number {
    return Math.min(
        max,
        Math.max(
            min,
            value
        )
    );
}


function clampInt(
    value: number,
    min: number,
    max: number
): number {
    return Math.floor(
        clamp(
            Number.isFinite(
                value
            )
                ? value
                : min,
            min,
            max
        )
    );
}


function pct(
    value: number
): string {
    return (
        value *
        100
    ).toFixed(2) + "%";
}


function fmtMoney(
    value: number
): string {
    if (
        !Number.isFinite(
            value
        )
    ) {
        return "-";
    }

    if (
        value >= 1e15
    ) {
        return (
            "$" +
            (
                value /
                1e15
            ).toFixed(2) +
            "q"
        );
    }

    if (
        value >= 1e12
    ) {
        return (
            "$" +
            (
                value /
                1e12
            ).toFixed(2) +
            "t"
        );
    }

    if (
        value >= 1e9
    ) {
        return (
            "$" +
            (
                value /
                1e9
            ).toFixed(2) +
            "b"
        );
    }

    if (
        value >= 1e6
    ) {
        return (
            "$" +
            (
                value /
                1e6
            ).toFixed(2) +
            "m"
        );
    }

    if (
        value >= 1e3
    ) {
        return (
            "$" +
            (
                value /
                1e3
            ).toFixed(1) +
            "k"
        );
    }

    return (
        "$" +
        value.toFixed(0)
    );
}

function initialGapFloor(
    gaps: number[]
): number {
    const safe =
        gaps.filter(
            gap =>
                gap >= 100
        );

    return safe.length
        ? Math.min(...safe)
        : Math.max(...gaps);
}