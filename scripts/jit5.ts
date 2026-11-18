import type { NS } from "@ns";

const H = "j5h.ts";
const G = "j5g.ts";
const W = "j5w.ts";

const WORKERS = [H, G, W];

type Phase =
    | "H"
    | "W1"
    | "G"
    | "W2";

type PlayerState =
    ReturnType<NS["getPlayer"]>;

interface Config {
    maxTargets: number;
    portfolioTop: number;
    splitStep: number;

    minLaneGain: number;
    maxPeriodRatio: number;

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

interface Controls {
    takeCap: number;
    gapFloor: number;

    allowedTargets: number;

    stableWindows: number;

    baselineSingleRate: number | null;

    trialTwo: boolean;

    laneCooldown: number;
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

    chance: number;
    hackPct: number;

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

    quota: number;
}

interface Job {
    key: string;

    laneId: number;

    target: string;
    phase: Phase;

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

    driftCount: number;
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

    p95Jitter: number;

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

        ["reserve-pct", 0.20],
        ["remote-reserve-pct", 0.08],

        ["take-min", 0.05],
        ["take-max", 0.25],
        ["take-step", 0.025],

        ["gaps", "200,175,150,125"],

        ["guard", 120],
        ["launch-lead", 1000],

        ["grow-safety", 1.02],

        ["prep-money", 0.999],
        ["prep-sec", 0.05],

        ["window-batches", 40],

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
                ) || 0.25,
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

        safety: 1.15,

        fallbackSafety: 1.15,
    };

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
            cfg.takeMax,

        gapFloor:
            initialGapFloor(
                cfg.gaps
            ),

        /*
         * JIT5 starts with one lane.
         *
         * It must MEASURE the baseline
         * before admitting lane #2.
         */
        allowedTargets: 1,

        stableWindows: 0,

        baselineSingleRate:
            null,

        trialTwo:
            false,

        laneCooldown: 0,
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

        let plan =
            choosePortfolio(
                ns,
                env,
                cfg,
                controls,
                preferred
            );

        if (
            plan.lanes.length === 0
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

        if (cfg.dryRun) {
            printPlan(
                ns,
                plan,
                controls,
                true
            );

            return;
        }

        /*
         * PREP happens outside
         * the rolling scheduler.
         */
        for (
            const lane
            of plan.lanes
        ) {
            if (
                !isReady(
                    ns,
                    lane.target,
                    cfg
                )
            ) {
                ns.tprint(
                    `[PREP] ${lane.target}`
                );

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
            }
        }

        /*
         * Hardware + target state
         * may have changed during prep.
         */
        env =
            buildEnv(
                ns,
                cfg
            );

        plan =
            choosePortfolio(
                ns,
                env,
                cfg,
                controls,
                preferred
            );

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
            controls.allowedTargets = 1;
            controls.trialTwo = false;
            controls.laneCooldown = 2;
        }

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
                : cfg.windowBatches;

        if (
            cfg.limit > 0 &&
            remainingLimit <= 0
        ) {
            break;
        }

        const epochLimit =
            cfg.limit > 0
                ? Math.min(
                      cfg.windowBatches,
                      remainingLimit
                  )
                : cfg.windowBatches;

        const rt =
            initRuntime(
                plan,
                epoch,
                cfg,
                epochLimit
            );

        const initialSignature =
            staticSignature(
                ns
            );

        printPlan(
            ns,
            plan,
            controls,
            false,
            epoch
        );

        let reason = "";

        while (true) {
            const now =
                Date.now();

            drainTelemetry(
                ns,
                cfg.port,
                rt
            );

            scheduleAhead(
                rt,
                now,
                cfg,
                epochLimit
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

                stopFuture(rt);
            }

            if (
                !reason &&
                rt.verified >=
                    epochLimit
            ) {
                reason =
                    "WINDOW";

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

            if (
                !reason &&
                now -
                    rt.startedAt >=
                    cfg.reevalMs
            ) {
                reason =
                    "REEVAL";

                stopFuture(rt);
            }

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

            if (
                rt.stopScheduling &&
                allDrained(
                    ns,
                    rt
                )
            ) {
                /*
                 * Leave a small clean
                 * verification window
                 * after final W2.
                 */
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

        const metrics =
            summarizeEpoch(
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
            cfg
        );

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

        Math.floor(
            ns.getHackingLevel() /
            10
        ),

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
    env: Env
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
                        env.homeCores
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
                    env.homeCores
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
            env.homeCores
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

        chance,
        hackPct,

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
        homeBudget <= 0
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

    for (
        let take =
            cfg.takeMin;

        take <=
            maxTake +
                1e-9;

        take +=
            cfg.takeStep
    ) {
        const batch =
            modelBatch(
                ns,
                target,
                take,
                cfg,
                env
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
                    4 *
                        gap +
                        cfg.guard,
                    500
                );

            /*
             * JIT5 addition:
             *
             * reject a batch that cannot
             * physically fit its OWN
             * overlapping G/W footprint.
             *
             * Period tuning cannot fix
             * impossible instantaneous RAM.
             */
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

            let period =
                minPeriod;

            let homeUse =
                Infinity;

            let remoteUse =
                0;

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

            const candidate:
                LanePlan = {
                ...batch,

                gap,
                period,

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
    preferred: string
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
    epochLimit: number
): Runtime {
    const now =
        Date.now();

    const quota =
        Math.ceil(
            epochLimit /
            plan.lanes.length
        );

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

                quota,

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

        driftCount: 0,
        launchFailures: 0,

        stopScheduling:
            false,
    };
}


function scheduleAhead(
    rt: Runtime,
    now: number,
    cfg: Config,
    epochLimit: number
): void {
    if (
        rt.stopScheduling
    ) {
        return;
    }

    for (
        const lane
        of rt.lanes
    ) {
        const horizon =
            Math.max(
                lane.wTime +
                    30000,
                60000
            );

        while (
            lane.planned <
                lane.quota &&
            rt.totalPlanned <
                epochLimit &&
            lane.nextBase <=
                now +
                    horizon
        ) {
            addBatch(
                rt,
                lane,
                lane.nextBase,
                cfg
            );

            lane.nextBase +=
                lane.period;
        }
    }
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
    rt.jobs.sort(
        (a, b) =>
            a.launchAt -
            b.launchAt
    );

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

        if (
            job.phase === "H"
        ) {
            pids =
                launchHackDistributed(
                    ns,
                    job,
                    env,
                    cfg
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
                pids = [pid];
            }
        }

        if (
            pids.length === 0
        ) {
            return {
                ok:
                    false,

                reason:
                    `LAUNCH ${job.target} ${job.phase}`,
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

    return {
        ok: true,
        reason: "",
    };
}


function launchHackDistributed(
    ns: NS,
    job: Job,
    env: Env,
    cfg: Config
): number[] {
    let remaining =
        job.threads;

    const pids:
        number[] = [];

    let part = 0;

    const hosts = [
        ...env.remoteHosts,
        "home",
    ];

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
                H,
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
                env.workerRam.h
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
                H,
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

        pids.push(pid);

        remaining -=
            use;
    }

    if (
        remaining > 0
    ) {
        for (
            const pid
            of pids
        ) {
            ns.kill(pid);
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

        if (
            moneyRatio <
                cfg.prepMoney ||
            secDelta >
                cfg.prepSec
        ) {
            rt.driftCount++;

            return {
                newVerified,

                reason:
                    `DRIFT ${batch.target} ` +
                    `money=${pct(moneyRatio)} ` +
                    `secΔ=${secDelta.toFixed(3)}`,
            };
        }
    }

    return {
        newVerified,
        reason: "",
    };
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

    const averagePeriod =
        plan.lanes.reduce(
            (
                sum,
                lane
            ) =>
                sum +
                lane.period,
            0
        ) /
        Math.max(
            1,
            plan.lanes.length
        );

    let measuredRate = 0;

    if (
        rt.firstHackAt > 0 &&
        rt.lastHackAt >=
            rt.firstHackAt &&
        rt.actualStolen > 0
    ) {
        const duration =
            Math.max(
                1,
                rt.lastHackAt -
                    rt.firstHackAt +
                    averagePeriod
            );

        measuredRate =
            rt.actualStolen *
            1000 /
            duration;
    }

    const adjustedRate =
        predictedRate *
        realizedRatio;

    const actualRate =
        measuredRate > 0
            ? measuredRate
            : adjustedRate;

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

        p95Jitter:
            percentile(
                rt.jitters,
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


function adaptControls(
    ns: NS,
    controls: Controls,
    metrics: EpochMetrics,
    plan: Portfolio,
    cfg: Config
): void {
    const jitterBad =
        metrics.p95Jitter >
        Math.max(
            40,
            metrics.minGap *
                0.35
        );

    const driftBad =
        metrics.driftCount >
        0;

    const launchBad =
        metrics.launchFailures >
        0 ||
        metrics.reason.startsWith(
            "LAUNCH"
        );
    
    const efficiencyBad =
    metrics.verified >=
        Math.min(
            10,
            cfg.windowBatches
        ) &&
    metrics.realizedRatio <
        0.80;
    
    const unstable =
        jitterBad ||
        driftBad ||
        launchBad ||
        efficiencyBad;

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
            launchBad
        ) {
            controls.gapFloor =
                nextLargerGap(
                    controls.gapFloor,
                    cfg.gaps
                );
        }

        if (
            driftBad ||
            efficiencyBad
        ) {
            controls.takeCap =
                Math.max(
                    cfg.takeMin,
                    controls.takeCap -
                        cfg.takeStep
                );
        }

        ns.tprint(
            `[ADAPT] BACKOFF | ` +
            `takeCap=${pct(controls.takeCap)} | ` +
            `gapFloor=${controls.gapFloor}ms | ` +
            `lanes=${controls.allowedTargets}`
        );

        return;
    }

    controls.stableWindows++;

    /*
     * Two-lane experiment completed.
     */
    if (
        controls.trialTwo
    ) {
        const baseline =
            controls
                .baselineSingleRate;

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
            controls.allowedTargets = 2;
            controls.trialTwo = false;

            ns.tprint(
                `[ADAPT] lane #2 ACCEPTED | ` +
                `${fmtMoney(metrics.actualRate)}/s`
            );
        } else {
            controls.allowedTargets = 1;
            controls.trialTwo = false;
            controls.laneCooldown = 2;

            ns.tprint(
                "[ADAPT] lane #2 REJECTED"
            );
        }

        return;
    }

    /*
     * Existing multi-target portfolio
     * must keep proving its marginal value.
     */
    if (
        controls.allowedTargets ===
            2 &&
        controls.baselineSingleRate !==
            null &&
        metrics.actualRate <
            controls
                .baselineSingleRate *
                (
                    1 +
                    cfg.minLaneGain *
                        0.5
                )
    ) {
        controls.allowedTargets = 1;
        controls.laneCooldown = 2;

        ns.tprint(
            "[ADAPT] lane #2 lost marginal value; reverting."
        );

        return;
    }

    if (
        controls.laneCooldown >
        0
    ) {
        controls.laneCooldown--;
    }

    /*
     * Establish single-lane baseline,
     * then actually TRIAL a second lane.
     */
    if (
        controls.allowedTargets ===
            1 &&
        cfg.maxTargets >= 2 &&
        controls.laneCooldown === 0 &&
        controls.stableWindows >= 1
    ) {
        controls.baselineSingleRate =
            metrics.actualRate;

        controls.allowedTargets = 2;
        controls.trialTwo = true;

        ns.tprint(
            `[ADAPT] trial lane #2 | baseline=` +
            `${fmtMoney(metrics.actualRate)}/s`
        );

        return;
    }

    /*
     * Recover aggression after a
     * previous backoff.
     */
    if (
        controls.takeCap <
        cfg.takeMax
    ) {
        controls.takeCap =
            Math.min(
                cfg.takeMax,
                controls.takeCap +
                    cfg.takeStep
            );

        ns.tprint(
            `[ADAPT] recover takeCap -> ` +
            pct(
                controls.takeCap
            )
        );

        return;
    }

    const minimumGap =
        Math.min(
            ...cfg.gaps
        );

    if (
        controls.gapFloor >
        minimumGap
    ) {
        controls.gapFloor =
            nextSmallerGap(
                controls.gapFloor,
                cfg.gaps
            );

        ns.tprint(
            `[ADAPT] tighten gapFloor -> ` +
            `${controls.gapFloor}ms`
        );
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
        `gapFloor=${controls.gapFloor}ms | ` +
        `allowedTargets=${controls.allowedTargets}` +
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
            `take=${pct(lane.actualTake)} | ` +
            `gap=${lane.gap}ms | ` +
            `period=${lane.period}ms | ` +
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
        `realized=${pct(metrics.realizedRatio)} | ` +
        `p95-jitter=${metrics.p95Jitter.toFixed(1)}ms | ` +
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
              125,
              150,
              175,
              200,
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
                gap >= 125
        );

    return safe.length
        ? Math.min(...safe)
        : Math.max(...gaps);
}