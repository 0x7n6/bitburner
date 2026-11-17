const H = "j4h.js";
const G = "j4g.js";
const W = "j4w.js";

const WORKERS = [H, G, W];

/** @param {NS} ns */
export async function main(ns) {
    const f = ns.flags([
        ["auto", true],
        ["targets", 2],

        ["reserve-pct", 0.20],
        ["remote-reserve-pct", 0.08],

        ["take-min", 0.05],
        ["take-max", 0.25],
        ["take-step", 0.025],

        ["gaps", "200,175,150,125"],
        ["guard", 120],
        ["launch-lead", 1000],

        ["grow-safety", 1.02],

        ["hysteresis", 0.18],
        ["reeval-ms", 120000],
        ["env-ms", 5000],

        ["prep-money", 0.999],
        ["prep-sec", 0.05],

        ["limit", 0],

        ["dry-run", false],
        ["tail", false],
        ["debug", false],
        ["help", false],
    ]);

    if (f.help) {
        return printHelp(ns);
    }

    if (f.tail) {
        ns.tail();
    }

    for (
        const fn of [
            "sleep",
            "scan",

            "getServer",
            "getServerMaxRam",
            "getServerUsedRam",
            "getServerMoneyAvailable",
            "getServerSecurityLevel",

            "getHackingLevel",
            "getScriptRam",
            "getPlayer",

            "fileExists",
            "hasRootAccess",
            "ps",
        ]
    ) {
        try {
            ns.disableLog(fn);
        } catch {
            // noop
        }
    }

    const cfg = {
        auto: Boolean(f.auto),

        maxTargets: Math.max(
            1,
            Math.floor(Number(f.targets))
        ),

        reservePct: clamp(
            Number(f["reserve-pct"]),
            0.05,
            0.60
        ),

        remoteReservePct: clamp(
            Number(f["remote-reserve-pct"]),
            0,
            0.50
        ),

        takeMin: clamp(
            Number(f["take-min"]),
            0.01,
            0.80
        ),

        takeMax: clamp(
            Number(f["take-max"]),
            0.01,
            0.80
        ),

        takeStep: clamp(
            Number(f["take-step"]),
            0.005,
            0.25
        ),

        gaps: parseGaps(
            String(f.gaps)
        ),

        guard: Math.max(
            50,
            Math.floor(Number(f.guard))
        ),

        launchLead: Math.max(
            100,
            Math.floor(
                Number(f["launch-lead"])
            )
        ),

        growSafety: clamp(
            Number(f["grow-safety"]),
            1.0,
            1.25
        ),

        hysteresis: clamp(
            Number(f.hysteresis),
            0.05,
            1.0
        ),

        reevalMs: Math.max(
            30000,
            Math.floor(
                Number(f["reeval-ms"])
            )
        ),

        envMs: Math.max(
            2000,
            Math.floor(
                Number(f["env-ms"])
            )
        ),

        prepMoney: clamp(
            Number(f["prep-money"]),
            0.95,
            1
        ),

        prepSec: clamp(
            Number(f["prep-sec"]),
            0.001,
            1
        ),

        limit: Math.max(
            0,
            Math.floor(Number(f.limit))
        ),

        dryRun: Boolean(
            f["dry-run"]
        ),

        debug: Boolean(f.debug),

        safety: 1.15,

        fallbackSafety: 1.15,

        verifyDelay: 40,
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

    const preferred =
        String(
            f._[0] ?? ""
        ).trim();

    for (
        const file of WORKERS
    ) {
        if (
            !ns.fileExists(
                file,
                "home"
            )
        ) {
            ns.tprint(
                `jit4.js: ERROR missing ${file} on home.`
            );

            return;
        }
    }

    let totalVerified = 0;

    let epoch = 0;

    let lastEnvCheck = 0;

    let lastReeval = 0;

    let lastSignature = "";

    let currentProjected = 0;

    const startHack =
        ns.getHackingLevel();

    const startMoney =
        ns.getPlayer().money;

    const startAt =
        Date.now();

    ns.tprint(
        "jit4.js: 7n8 JIT4 OPTIMIZER v4.0"
    );

    ns.tprint(
        `jit4.js: preferred=${preferred || "AUTO"} | ` +
        `targets<=${cfg.maxTargets} | ` +
        `reserve=${pct(cfg.reservePct)}`
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

        let epochPlan =
            chooseEpoch(
                ns,
                env,
                cfg,
                preferred
            );

        if (
            epochPlan
                .lanes
                .length === 0
        ) {
            ns.print(
                `[BOOT] no profitable hackable target yet | ` +
                `Hack=${env.hack} | ` +
                `rooted=${env.rooted}/${env.hosts.length}`
            );

            if (
                cfg.dryRun
            ) {
                ns.tprint(
                    "jit4.js: DRY RUN: no usable target yet."
                );

                return;
            }

            await ns.sleep(
                5000
            );

            continue;
        }

        if (
            cfg.dryRun
        ) {
            printEpoch(
                ns,
                env,
                epochPlan,
                cfg,
                true
            );

            return;
        }

        /*
         * Prepare selected targets
         * before opening the epoch.
         */
        for (
            const lane
            of epochPlan.lanes
        ) {
            if (
                !isReady(
                    ns,
                    lane.target,
                    cfg
                )
            ) {
                ns.print(
                    `[PREP] ${lane.target} is COLD; preparing...`
                );

                const ok =
                    await prepTarget(
                        ns,
                        lane.target,
                        cfg
                    );

                if (!ok) {
                    ns.print(
                        `[PREP] failed ${lane.target}; rescanning.`
                    );
                }
            }
        }

        /*
         * Re-read hardware/server state
         * after preparation.
         */
        env =
            buildEnv(
                ns,
                cfg
            );

        epochPlan =
            chooseEpoch(
                ns,
                env,
                cfg,
                preferred,
                epochPlan
                    .lanes
                    .map(
                        x =>
                            x.target
                    )
            );

        if (
            epochPlan
                .lanes
                .length === 0
        ) {
            await ns.sleep(
                1000
            );

            continue;
        }

        epoch++;

        currentProjected =
            epochPlan.totalEV;

        lastSignature =
            env.signature;

        lastEnvCheck =
            Date.now();

        lastReeval =
            Date.now();

        printEpoch(
            ns,
            env,
            epochPlan,
            cfg,
            false,
            epoch
        );

        await deployWorkers(
            ns,
            env.remoteHosts
        );

        const runtime =
            initRuntime(
                epochPlan,
                cfg,
                epoch
            );

        let reconfigReason =
            "";

        while (true) {
            const now =
                Date.now();

            scheduleAhead(
                runtime,
                now,
                cfg,
                totalVerified
            );

            const launchResult =
                await launchDue(
                    ns,
                    runtime,
                    env,
                    cfg,
                    now
                );

            if (
                !launchResult.ok &&
                !reconfigReason
            ) {
                reconfigReason =
                    launchResult.reason;
            }

            const verifyResult =
                verifyDue(
                    ns,
                    runtime,
                    cfg,
                    now
                );

            totalVerified +=
                verifyResult
                    .newVerified;

            if (
                !verifyResult.ok &&
                !reconfigReason
            ) {
                reconfigReason =
                    verifyResult
                        .reason;
            }

            cleanupRuntime(
                runtime,
                now
            );

            /*
             * Controlled finite run.
             */
            if (
                cfg.limit > 0 &&
                totalVerified >=
                    cfg.limit
            ) {
                reconfigReason =
                    "LIMIT";
            }

            /*
             * HOT RELOAD CHECK:
             *
             * detects:
             * - RAM upgrade
             * - core upgrade
             * - Formulas.exe appearing
             * - new port opener
             * - newly rooted RAM fleet
             */
            if (
                now -
                    lastEnvCheck >=
                cfg.envMs
            ) {
                const fresh =
                    buildEnv(
                        ns,
                        cfg
                    );

                const newRoot =
                    autoRoot(
                        ns,
                        fresh.hosts
                    );

                const fresher =
                    newRoot > 0
                        ? buildEnv(
                              ns,
                              cfg
                          )
                        : fresh;

                if (
                    fresher
                        .signature !==
                        lastSignature &&
                    !reconfigReason
                ) {
                    reconfigReason =
                        `ENV ${lastSignature} -> ${fresher.signature}`;
                }

                lastEnvCheck =
                    now;
            }

            /*
             * TARGET / PLAN RE-EVALUATION
             *
             * Do NOT switch because a
             * candidate is 1% better.
             *
             * Require hysteresis.
             */
            if (
                now -
                    lastReeval >=
                    cfg.reevalMs &&
                !reconfigReason
            ) {
                const fresh =
                    buildEnv(
                        ns,
                        cfg
                    );

                const candidate =
                    chooseEpoch(
                        ns,
                        fresh,
                        cfg,
                        preferred,
                        []
                    );

                if (
                    candidate
                        .totalEV >
                    currentProjected *
                        (
                            1 +
                            cfg.hysteresis
                        )
                ) {
                    reconfigReason =
                        `BETTER PLAN +${(
                            (
                                candidate.totalEV /
                                    currentProjected -
                                1
                            ) *
                            100
                        ).toFixed(1)}%`;
                }

                lastReeval =
                    now;
            }

            /*
             * Reconfiguration uses an
             * epoch drain.
             *
             * No old-model and new-model
             * batch is mixed together.
             */
            if (
                reconfigReason
            ) {
                stopFuture(
                    runtime
                );

                if (
                    allDrained(
                        runtime,
                        now
                    )
                ) {
                    if (
                        reconfigReason ===
                        "LIMIT"
                    ) {
                        const endHack =
                            ns.getHackingLevel();

                        const elapsed =
                            (
                                Date.now() -
                                startAt
                            ) /
                            1000;

                        const wallet =
                            ns.getPlayer()
                                .money -
                            startMoney;

                        ns.tprint(
                            `jit4.js: JIT4 COMPLETE | ` +
                            `verified=${totalVerified}/${cfg.limit} | ` +
                            `time=${fmtTime(elapsed)}`
                        );

                        ns.tprint(
                            `jit4.js: Hack=${startHack}->${endHack} | ` +
                            `walletΔ(mixed)=${money(wallet)} | ` +
                            `avg=${money(
                                wallet /
                                    Math.max(
                                        1,
                                        elapsed
                                    )
                            )}/s`
                        );

                        return;
                    }

                    ns.print(
                        `[EPOCH] drain complete | reason=${reconfigReason}`
                    );

                    /*
                     * SELF HEAL
                     */
                    for (
                        const lane
                        of runtime.lanes
                    ) {
                        if (
                            !isReady(
                                ns,
                                lane.target,
                                cfg
                            )
                        ) {
                            ns.print(
                                `[HEAL] ${lane.target} -> prep`
                            );

                            await prepTarget(
                                ns,
                                lane.target,
                                cfg
                            );
                        }
                    }

                    /*
                     * Return to outer loop.
                     * Environment and optimizer
                     * will be rebuilt.
                     */
                    break;
                }
            }

            if (
                cfg.debug &&
                now % 5000 < 25
            ) {
                printRuntime(
                    ns,
                    runtime,
                    env,
                    totalVerified
                );
            }

            await ns.sleep(10);
        }
    }
}

/*
 * -------------------------------------------------------
 * HELP
 * -------------------------------------------------------
 */

function printHelp(ns) {
    ns.tprint(
        "7n8 JIT4 OPTIMIZER v4.0"
    );

    ns.tprint(
        ""
    );

    ns.tprint(
        "Production:"
    );

    ns.tprint(
        "  run jit4.js --auto --targets 2 --tail"
    );

    ns.tprint(
        ""
    );

    ns.tprint(
        "Preferred primary + auto secondary:"
    );

    ns.tprint(
        "  run jit4.js phantasy --targets 2 --tail"
    );

    ns.tprint(
        ""
    );

    ns.tprint(
        "Finite burn-in:"
    );

    ns.tprint(
        "  run jit4.js --auto --targets 2 --limit 240 --tail"
    );

    ns.tprint(
        ""
    );

    ns.tprint(
        "Dry optimizer:"
    );

    ns.tprint(
        "  run jit4.js --auto --dry-run --tail"
    );

    ns.tprint(
        ""
    );

    ns.tprint(
        "Hot reload:"
    );

    ns.tprint(
        "  home RAM / cores / Formulas.exe / openers / rooted fleet"
    );

    ns.tprint(
        ""
    );

    ns.tprint(
        "Prestige bootstrap:"
    );

    ns.tprint(
        "  works without Formulas.exe and climbs targets automatically"
    );
}

/*
 * -------------------------------------------------------
 * ENVIRONMENT
 * -------------------------------------------------------
 */

function buildEnv(
    ns,
    cfg
) {
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

    const cores =
        Math.max(
            1,
            Number(
                home.cpuCores ??
                    1
            )
        );

    const workerRam = {
        h: ns.getScriptRam(
            H,
            "home"
        ),

        g: ns.getScriptRam(
            G,
            "home"
        ),

        w: ns.getScriptRam(
            W,
            "home"
        ),
    };

    const foreignHome =
        foreignUsed(
            ns,
            "home"
        );

    const homeBudget =
        Math.max(
            0,
            homeRam *
                (
                    1 -
                    cfg.reservePct
                ) -
                foreignHome
        );

    const remoteHosts =
        [];

    let remoteBudget = 0;

    let rooted = 0;

    for (
        const host of hosts
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

        const foreign =
            foreignUsed(
                ns,
                host
            );

        const usable =
            Math.max(
                0,
                max *
                    (
                        1 -
                        cfg.remoteReservePct
                    ) -
                    foreign
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
            ns.getServerMaxRam(
                b
            ) -
            ns.getServerMaxRam(
                a
            )
    );

    const openers =
        getOpeners(ns);

    /*
     * Anything here changing causes
     * an epoch transition.
     */
    const signature = [
        Math.round(
            homeRam
        ),

        cores,

        formulas
            ? 1
            : 0,

        openers.length,

        rooted,

        Math.round(
            remoteBudget
        ),
    ].join(":");

    return {
        hosts,
        hack,
        player,
        formulas,

        homeRam,
        cores,

        workerRam,

        foreignHome,
        homeBudget,

        remoteHosts,
        remoteBudget,

        rooted,
        openers,

        signature,
    };
}

function foreignUsed(
    ns,
    host
) {
    let sum = 0;

    for (
        const p
        of ns.ps(host)
    ) {
        /*
         * Our own JIT4 workers
         * are not "foreign".
         */
        if (
            WORKERS.includes(
                p.filename
            )
        ) {
            continue;
        }

        if (
            host === "home" &&
            p.pid === ns.pid
        ) {
            continue;
        }

        sum +=
            ns.getScriptRam(
                p.filename,
                host
            ) *
            p.threads;
    }

    return sum;
}

function scanAll(ns) {
    const seen =
        new Set([
            "home",
        ]);

    const q = [
        "home",
    ];

    while (
        q.length
    ) {
        const h =
            q.shift();

        for (
            const n
            of ns.scan(h)
        ) {
            if (
                !seen.has(n)
            ) {
                seen.add(n);

                q.push(n);
            }
        }
    }

    return [
        ...seen,
    ];
}

/*
 * -------------------------------------------------------
 * ROOT ENGINE
 * -------------------------------------------------------
 */

function getOpeners(ns) {
    const all = [
        [
            "BruteSSH.exe",
            x =>
                ns.brutessh(x),
        ],

        [
            "FTPCrack.exe",
            x =>
                ns.ftpcrack(x),
        ],

        [
            "relaySMTP.exe",
            x =>
                ns.relaysmtp(x),
        ],

        [
            "HTTPWorm.exe",
            x =>
                ns.httpworm(x),
        ],

        [
            "SQLInject.exe",
            x =>
                ns.sqlinject(x),
        ],
    ];

    return all.filter(
        ([file]) =>
            ns.fileExists(
                file,
                "home"
            )
    );
}

function autoRoot(
    ns,
    hosts
) {
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

        let s;

        try {
            s =
                ns.getServer(
                    host
                );
        } catch {
            continue;
        }

        if (
            Number(
                s.numOpenPortsRequired ??
                    99
            ) >
            openers.length
        ) {
            continue;
        }

        for (
            const [, fn]
            of openers
        ) {
            try {
                fn(host);
            } catch {
                // noop
            }
        }

        try {
            ns.nuke(host);
        } catch {
            // noop
        }

        if (
            ns.hasRootAccess(
                host
            )
        ) {
            rooted++;
        }
    }

    return rooted;
}

/*
 * -------------------------------------------------------
 * TARGET + MULTI-LANE OPTIMIZER
 * -------------------------------------------------------
 */

function chooseEpoch(
    ns,
    env,
    cfg,
    preferred = "",
    keepTargets = []
) {
    const candidates =
        [];

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

        const s =
            ns.getServer(
                host
            );

        const maxMoney =
            Number(
                s.moneyMax ??
                    0
            );

        const req =
            Number(
                s.requiredHackingSkill ??
                    Infinity
            );

        if (
            maxMoney <= 0 ||
            req > env.hack ||
            s.purchasedByPlayer
        ) {
            continue;
        }

        const potential =
            optimizeTarget(
                ns,
                host,
                env.homeBudget,
                env.remoteBudget,
                cfg,
                env
            );

        if (
            !potential
        ) {
            continue;
        }

        const ready =
            isReady(
                ns,
                host,
                cfg
            );

        /*
         * Cold target gets a small
         * temporary penalty.
         *
         * Not enough to permanently
         * prevent upgrading targets.
         */
        const warm =
            ready
                ? 1
                : 0.82;

        candidates.push({
            target: host,

            ready,

            potential,

            rankScore:
                potential.evps *
                warm,
        });
    }

    candidates.sort(
        (a, b) =>
            b.rankScore -
            a.rankScore
    );

    const ordered =
        [];

    const pushUnique =
        c => {
            if (
                c &&
                !ordered.some(
                    x =>
                        x.target ===
                        c.target
                )
            ) {
                ordered.push(c);
            }
        };

    /*
     * Preferred target stays primary.
     */
    if (preferred) {
        pushUnique(
            candidates.find(
                x =>
                    x.target ===
                    preferred
            )
        );
    }

    /*
     * When rebuilding an epoch after
     * preparation, preserve selected
     * targets first.
     */
    for (
        const t
        of keepTargets
    ) {
        pushUnique(
            candidates.find(
                x =>
                    x.target ===
                    t
            )
        );
    }

    for (
        const c
        of candidates
    ) {
        pushUnique(c);
    }

    let homeLeft =
        env.homeBudget;

    let remoteLeft =
        env.remoteBudget;

    const lanes = [];

    for (
        const c
        of ordered
    ) {
        if (
            lanes.length >=
            cfg.maxTargets
        ) {
            break;
        }

        const plan =
            optimizeTarget(
                ns,
                c.target,
                homeLeft,
                remoteLeft,
                cfg,
                env
            );

        if (
            !plan ||
            plan.evps <= 0
        ) {
            continue;
        }

        lanes.push({
            ...plan,

            ready:
                c.ready,
        });

        homeLeft =
            Math.max(
                0,
                homeLeft -
                    plan.homeUse
            );

        remoteLeft =
            Math.max(
                0,
                remoteLeft -
                    plan.remoteUse
            );

        if (
            !cfg.auto &&
            preferred &&
            lanes.length >= 1
        ) {
            break;
        }

        if (
            homeLeft <
            env.workerRam.g *
                4
        ) {
            break;
        }
    }

    return {
        lanes,

        totalEV:
            lanes.reduce(
                (
                    a,
                    x
                ) =>
                    a +
                    x.evps,
                0
            ),

        homeLeft,

        remoteLeft,

        candidates:
            candidates.slice(
                0,
                8
            ),
    };
}

function optimizeTarget(
    ns,
    target,
    homeBudget,
    remoteBudget,
    cfg,
    env
) {
    if (
        homeBudget <= 0
    ) {
        return null;
    }

    let best = null;

    /*
     * Fallback mode intentionally
     * refuses aggressive theft.
     *
     * Once Formulas.exe appears
     * JIT4 automatically unlocks
     * full optimizer range.
     */
    const maxTake =
        env.formulas
            ? cfg.takeMax
            : Math.min(
                  cfg.takeMax,
                  0.10
              );

    const gaps =
        env.formulas
            ? cfg.gaps
            : cfg.gaps.filter(
                  x =>
                      x >= 200
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

        if (
            !batch
        ) {
            continue;
        }

        for (
            const gap
            of (
                gaps.length
                    ? gaps
                    : [200]
            )
        ) {
            /*
             * A complete batch occupies:
             *
             * H
             * W1
             * G
             * W2
             *
             * plus a guard before the
             * next H.
             */
            const minPeriod =
                Math.max(
                    4 *
                        gap +
                        cfg.guard,
                    500
                );

            /*
             * Resource-time product.
             *
             * GB * milliseconds.
             */
            const gwWeighted =
                (
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
                        )
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

            /*
             * Iteratively solve required
             * cadence for available RAM.
             */
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

                /*
                 * Overflow H is allowed
                 * to fall back to home.
                 */
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

            const evps =
                batch.expected *
                1000 /
                period;

            const candidate = {
                ...batch,

                gap,

                period,

                homeUse,

                remoteUse,

                evps,

                minPeriod,
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
 * -------------------------------------------------------
 * FORMULAS / FALLBACK MODEL
 * -------------------------------------------------------
 */

function modelBatch(
    ns,
    target,
    wantedTake,
    cfg,
    env
) {
    const s0 =
        ns.getServer(
            target
        );

    const moneyMax =
        Number(
            s0.moneyMax ??
                0
        );

    const minSec =
        Number(
            s0.minDifficulty ??
                1
        );

    if (
        moneyMax <= 0
    ) {
        return null;
    }

    let chance;

    let hpct;

    let hTime;

    let gTime;

    let wTime;

    let h;

    let g;

    let w1;

    let w2;

    /*
     * Hypothetical fully-prepped
     * server.
     */
    const prep = {
        ...s0,

        moneyAvailable:
            moneyMax,

        hackDifficulty:
            minSec,
    };

    if (
        env.formulas
    ) {
        chance =
            ns.formulas
                .hacking
                .hackChance(
                    prep,
                    env.player
                );

        hpct =
            ns.formulas
                .hacking
                .hackPercent(
                    prep,
                    env.player
                );

        hTime =
            ns.formulas
                .hacking
                .hackTime(
                    prep,
                    env.player
                );

        gTime =
            ns.formulas
                .hacking
                .growTime(
                    prep,
                    env.player
                );

        wTime =
            ns.formulas
                .hacking
                .weakenTime(
                    prep,
                    env.player
                );
    } else {
        /*
         * Prestige/bootstrap fallback.
         *
         * Conservative projected values
         * until Formulas.exe returns.
         */
        const curSec =
            Math.max(
                minSec,
                Number(
                    s0.hackDifficulty ??
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
                            curSec
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

        hpct =
            Math.max(
                1e-9,
                ns.hackAnalyze(
                    target
                ) *
                    secScale
            );

        const req =
            Math.max(
                1,
                Number(
                    s0.requiredHackingSkill ??
                        1
                )
            );

        /*
         * Security contribution to
         * hacking-time formula.
         */
        const ratio =
            (
                2.5 *
                    req *
                    minSec +
                500
            ) /
            (
                2.5 *
                    req *
                    curSec +
                500
            );

        hTime =
            ns.getHackTime(
                target
            ) *
            ratio;

        gTime =
            ns.getGrowTime(
                target
            ) *
            ratio;

        wTime =
            ns.getWeakenTime(
                target
            ) *
            ratio;
    }

    if (
        !(hpct > 0) ||
        chance <= 0
    ) {
        return null;
    }

    /*
     * Round to nearest thread.
     * Optimizer evaluates actualTake,
     * not desiredTake.
     */
    h =
        Math.max(
            1,
            Math.round(
                wantedTake /
                    hpct
            )
        );

    const actualTake =
        clamp(
            h *
                hpct,
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

    if (
        env.formulas
    ) {
        /*
         * Grow lands after W1,
         * so it sees min security.
         */
        const post = {
            ...prep,

            moneyAvailable:
                remaining,

            hackDifficulty:
                minSec,
        };

        g =
            Math.ceil(
                ns.formulas
                    .hacking
                    .growThreads(
                        post,
                        env.player,
                        moneyMax,
                        env.cores
                    ) *
                    cfg.growSafety
            );
    } else {
        const mult =
            moneyMax /
            remaining;

        const curSec =
            Math.max(
                minSec,
                Number(
                    s0.hackDifficulty ??
                        minSec
                )
            );

        const raw =
            ns.growthAnalyze(
                target,
                mult,
                env.cores
            );

        /*
         * Approximate growth at
         * min-security.
         */
        const scale =
            growthLog(
                curSec
            ) /
            growthLog(
                minSec
            );

        g =
            Math.ceil(
                raw *
                    scale *
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
        env.formulas
            ? ns.formulas
                  .hacking
                  .weakenEffect(
                      1,
                      env.cores
                  )
            : ns.weakenAnalyze(
                  1,
                  env.cores
              );

    const hackSec =
        ns.hackAnalyzeSecurity(
            h,
            target
        );

    const growSec =
        ns.growthAnalyzeSecurity(g);


    w1 =
        Math.max(
            1,
            Math.ceil(
                hackSec /
                    weakenOne
            )
        );

    w2 =
        Math.max(
            1,
            Math.ceil(
                growSec /
                    weakenOne
            )
        );

    const expected =
        moneyMax *
        actualTake *
        chance;

    return {
        target,

        chance,
        hpct,

        actualTake,

        moneyMax,
        minSec,

        h,
        g,
        w1,
        w2,

        hTime,
        gTime,
        wTime,

        expected,
    };
}

function growthLog(sec) {
    const rate =
        Math.min(
            1 +
                0.03 /
                    Math.max(
                        1,
                        sec
                    ),

            1.0035
        );

    return Math.max(
        1e-12,
        Math.log(rate)
    );
}

/*
 * -------------------------------------------------------
 * PREP / SELF-HEAL
 * -------------------------------------------------------
 */

async function prepTarget(
    ns,
    target,
    cfg
) {
    if (
        !ns.hasRootAccess(
            target
        )
    ) {
        return false;
    }

    const cores =
        Math.max(
            1,
            Number(
                ns.getServer(
                    "home"
                ).cpuCores ??
                    1
            )
        );

    for (
        let round = 0;

        round < 12;

        round++
    ) {
        const s =
            ns.getServer(
                target
            );

        const max =
            Number(
                s.moneyMax ??
                    0
            );

        const moneyNow =
            Number(
                s.moneyAvailable ??
                    0
            );

        const min =
            Number(
                s.minDifficulty ??
                    1
            );

        const sec =
            Number(
                s.hackDifficulty ??
                    min
            );

        if (
            max <= 0
        ) {
            return false;
        }

        /*
         * SECURITY FIRST
         */
        if (
            sec >
            min +
                cfg.prepSec
        ) {
            const one =
                ns.weakenAnalyze(
                    1,
                    cores
                );

            let threads =
                Math.ceil(
                    (
                        sec -
                        min
                    ) /
                        one
                );

            threads =
                Math.min(
                    threads,
                    maxThreadsHome(
                        ns,
                        W,
                        cfg
                    )
                );

            if (
                threads <= 0
            ) {
                await ns.sleep(
                    1000
                );

                continue;
            }

            const t =
                ns.getWeakenTime(
                    target
                );

            const finish =
                Date.now() +
                t +
                250;

            const pid =
                ns.exec(
                    W,
                    "home",
                    threads,

                    target,

                    finish,

                    t,

                    `prep-w-${Date.now()}`
                );

            if (!pid) {
                return false;
            }

            await ns.sleep(
                t +
                    500
            );

            continue;
        }

        /*
         * THEN MONEY.
         */
        if (
            moneyNow <
            max *
                cfg.prepMoney
        ) {
            const factor =
                max /
                Math.max(
                    1,
                    moneyNow
                );

            let gThreads;

            if (
                ns.fileExists(
                    "Formulas.exe",
                    "home"
                )
            ) {
                const player =
                    ns.getPlayer();

                const prep = {
                    ...s,

                    hackDifficulty:
                        min,
                };

                gThreads =
                    Math.ceil(
                        ns.formulas
                            .hacking
                            .growThreads(
                                prep,
                                player,
                                max,
                                cores
                            ) *
                            cfg.growSafety
                    );
            } else {
                gThreads =
                    Math.ceil(
                        ns.growthAnalyze(
                            target,
                            factor,
                            cores
                        ) *
                            cfg.growSafety *
                            cfg.fallbackSafety
                    );
            }

            /*
             * Leave some room for W2.
             */
            const maxG =
                Math.max(
                    1,
                    Math.floor(
                        maxThreadsHome(
                            ns,
                            G,
                            cfg
                        ) *
                            0.90
                    )
                );

            gThreads =
                Math.max(
                    1,
                    Math.min(
                        gThreads,
                        maxG
                    )
                );

            const growSec =
                ns.growthAnalyzeSecurity(
                    gThreads,
                    target,
                    cores
                );

            const wThreads =
                Math.max(
                    1,
                    Math.ceil(
                        growSec /
                            ns.weakenAnalyze(
                                1,
                                cores
                            )
                    )
                );

            const gt =
                ns.getGrowTime(
                    target
                );

            const wt =
                ns.getWeakenTime(
                    target
                );

            /*
             * Finish Grow first,
             * then recovery weaken.
             */
            const base =
                Date.now() +
                wt +
                1000;

            const gPid =
                ns.exec(
                    G,
                    "home",
                    gThreads,

                    target,

                    base,

                    gt,

                    `prep-g-${Date.now()}`
                );

            const wPid =
                ns.exec(
                    W,
                    "home",
                    wThreads,

                    target,

                    base +
                        300,

                    wt,

                    `prep-w2-${Date.now()}`
                );

            if (
                !gPid ||
                !wPid
            ) {
                return false;
            }

            await ns.sleep(
                wt +
                    1600
            );

            continue;
        }

        return true;
    }

    return isReady(
        ns,
        target,
        cfg
    );
}

function maxThreadsHome(
    ns,
    script,
    cfg
) {
    const max =
        ns.getServerMaxRam(
            "home"
        );

    const free =
        Math.max(
            0,
            max *
                (
                    1 -
                    cfg.reservePct
                ) -
                ns.getServerUsedRam(
                    "home"
                )
        );

    return Math.floor(
        free /
        ns.getScriptRam(
            script,
            "home"
        )
    );
}

/*
 * -------------------------------------------------------
 * RUNTIME / ROLLING SCHEDULER
 * -------------------------------------------------------
 */

function initRuntime(
    plan,
    cfg,
    epoch
) {
    const now =
        Date.now();

    const lanes =
        plan.lanes.map(
            (
                p,
                i
            ) => ({
                ...p,

                id: i,

                planned: 0,

                verified: 0,

                /*
                 * Earliest base time where
                 * longest W can be safely
                 * launched with launchLead.
                 */
                nextBase:
                    now +
                    p.wTime +
                    cfg.launchLead +
                    2500 +
                    i *
                        250,

                draining:
                    false,
            })
        );

    return {
        epoch,

        lanes,

        jobs: [],

        batches:
            new Map(),

        pids: [],

        stopScheduling:
            false,
    };
}

function scheduleAhead(
    rt,
    now,
    cfg,
    totalVerified
) {
    if (
        rt.stopScheduling
    ) {
        return;
    }

    for (
        const lane
        of rt.lanes
    ) {
        if (
            lane.draining
        ) {
            continue;
        }

        /*
         * Keep enough future batches
         * planned that W never starves.
         */
        const horizon =
            Math.max(
                lane.wTime +
                    30000,

                60000
            );

        while (
            lane.nextBase <=
            now +
                horizon
        ) {
            if (
                cfg.limit > 0 &&
                totalVerified +
                    countUnverified(
                        rt
                    ) >=
                    cfg.limit
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
        }
    }
}

function addBatch(
    rt,
    lane,
    base,
    cfg
) {
    lane.planned++;

    const key =
        `${rt.epoch}:` +
        `${lane.id}:` +
        `${lane.planned}`;

    /*
     * Completion order:
     *
     * H
     * W1
     * G
     * W2
     */
    const defs = [
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

    const jobs =
        defs.map(
            (
                [
                    phase,
                    script,
                    threads,
                    finishAt,
                    actionTime,
                ]
            ) => ({
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

    /*
     * Verify inside clean window
     * after W2 and before next H.
     */
    const verifyAt =
        base +
        3 *
            lane.gap +
        Math.min(
            cfg.verifyDelay,

            Math.max(
                10,
                lane.gap *
                    0.20
            )
        );

    rt.batches.set(
        key,
        {
            key,

            laneId:
                lane.id,

            target:
                lane.target,

            jobs,

            verifyAt,

            verified:
                false,

            started:
                false,
        }
    );

    rt.jobs.push(
        ...jobs
    );
}

/*
 * -------------------------------------------------------
 * JOB LAUNCHER
 * -------------------------------------------------------
 */

async function launchDue(
    ns,
    rt,
    env,
    cfg,
    now
) {
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

        let pids = [];

        /*
         * Hack is core-independent,
         * so burn remote RAM first.
         */
        if (
            job.phase === "H"
        ) {
            const launched =
                await launchHackDistributed(
                    ns,
                    job,
                    env
                );

            if (
                !launched.ok
            ) {
                return {
                    ok: false,

                    reason:
                        `LAUNCH FAIL ` +
                        `${job.target} ` +
                        `${job.phase}`,
                };
            }

            pids =
                launched.pids;
        } else {
            /*
             * Grow and weaken stay on
             * home to exploit CPU cores.
             */
            const pid =
                ns.exec(
                    job.script,
                    "home",
                    job.threads,

                    job.target,

                    job.finishAt,

                    job.actionTime,

                    job.key,

                    job.phase
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
            batch.started =
                batch.started ||
                batch.jobs.some(
                    x =>
                        x.launched
                );

            return {
                ok: false,

                reason:
                    `LAUNCH FAIL ` +
                    `${job.target} ` +
                    `${job.phase}`,
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

                finishAt:
                    job.finishAt,

                target:
                    job.target,

                phase:
                    job.phase,
            });
        }
    }

    return {
        ok: true,
        reason: "",
    };
}

async function launchHackDistributed(
    ns,
    job,
    env
) {
    let remaining =
        job.threads;

    const pids = [];

    let part = 0;

    /*
     * Remote first.
     * Home fallback last.
     */
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
            try {
                await ns.scp(
                    H,
                    host,
                    "home"
                );
            } catch {
                continue;
            }
        }

        const scriptRam =
            ns.getScriptRam(
                H,
                host
            );

        const free =
            Math.max(
                0,
                ns.getServerMaxRam(
                    host
                ) -
                    ns.getServerUsedRam(
                        host
                    )
            );

        const fit =
            Math.floor(
                free /
                    scriptRam
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

                part++
            );

        if (!pid) {
            continue;
        }

        pids.push(pid);

        remaining -=
            use;
    }

    /*
     * Never leave half a hack
     * distributed after allocation
     * failure.
     */
    if (
        remaining > 0
    ) {
        for (
            const pid
            of pids
        ) {
            try {
                ns.kill(pid);
            } catch {
                // noop
            }
        }

        return {
            ok: false,
            pids: [],
        };
    }

    return {
        ok: true,
        pids,
    };
}

/*
 * -------------------------------------------------------
 * VERIFICATION + DRIFT
 * -------------------------------------------------------
 */

function verifyDue(
    ns,
    rt,
    cfg,
    now
) {
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
                x =>
                    x.launched
            )
        ) {
            continue;
        }

        batch.verified =
            true;

        const lane =
            rt.lanes[
                batch.laneId
            ];

        lane.verified++;

        newVerified++;

        const s =
            ns.getServer(
                batch.target
            );

        const max =
            Number(
                s.moneyMax ??
                    0
            );

        const moneyRatio =
            max > 0
                ? Number(
                      s.moneyAvailable ??
                          0
                  ) /
                  max
                : 1;

        const secDelta =
            Number(
                s.hackDifficulty ??
                    0
            ) -
            Number(
                s.minDifficulty ??
                    0
            );

        if (
            moneyRatio <
                cfg.prepMoney ||
            secDelta >
                cfg.prepSec
        ) {
            return {
                ok: false,

                newVerified,

                reason:
                    `DRIFT ${batch.target} ` +
                    `money=${pct(moneyRatio)} ` +
                    `secΔ=${secDelta.toFixed(3)}`,
            };
        }
    }

    return {
        ok: true,

        newVerified,

        reason: "",
    };
}

/*
 * -------------------------------------------------------
 * EPOCH DRAIN
 * -------------------------------------------------------
 */

function stopFuture(rt) {
    if (
        rt.stopScheduling
    ) {
        return;
    }

    rt.stopScheduling =
        true;

    for (
        const lane
        of rt.lanes
    ) {
        lane.draining =
            true;
    }

    /*
     * A batch with ZERO launched jobs
     * can safely be cancelled.
     *
     * A batch that already started must
     * finish all remaining H/W/G/W.
     */
    const cancellable =
        new Set();

    for (
        const [
            key,
            b,
        ]
        of rt.batches
    ) {
        if (
            !b.started &&
            !b.jobs.some(
                x =>
                    x.launched
            )
        ) {
            cancellable.add(
                key
            );
        }
    }

    rt.jobs =
        rt.jobs.filter(
            j =>
                !cancellable.has(
                    j.key
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

function cleanupRuntime(
    rt,
    now
) {
    /*
     * PIDs are globally unique.
     *
     * We can conservatively track
     * expected completion instead of
     * polling every PID continuously.
     */
    rt.pids =
        rt.pids.filter(
            p =>
                p.finishAt +
                    1000 >
                now
        );

    rt.jobs =
        rt.jobs.filter(
            j =>
                !j.launched ||
                j.finishAt +
                    1000 >
                    now
        );

    for (
        const [
            key,
            b,
        ]
        of rt.batches
    ) {
        if (
            b.verified &&
            b.verifyAt +
                2000 <
                now
        ) {
            rt.batches.delete(
                key
            );
        }
    }
}

function allDrained(
    rt,
    now
) {
    const unlaunchedStarted =
        rt.jobs.some(
            j =>
                !j.launched &&
                rt.batches.get(
                    j.key
                )?.started
        );

    const live =
        rt.pids.some(
            p =>
                p.finishAt +
                    500 >
                now
        );

    return (
        !unlaunchedStarted &&
        !live
    );
}

function countUnverified(rt) {
    let n = 0;

    for (
        const b
        of rt.batches.values()
    ) {
        if (
            !b.verified
        ) {
            n++;
        }
    }

    return n;
}

/*
 * -------------------------------------------------------
 * WORKER DEPLOYMENT
 * -------------------------------------------------------
 */

async function deployWorkers(
    ns,
    hosts
) {
    for (
        const host
        of hosts
    ) {
        try {
            await ns.scp(
                WORKERS,
                host,
                "home"
            );
        } catch {
            // noop
        }
    }
}

/*
 * -------------------------------------------------------
 * READY STATE
 * -------------------------------------------------------
 */

function isReady(
    ns,
    target,
    cfg
) {
    const s =
        ns.getServer(
            target
        );

    const max =
        Number(
            s.moneyMax ??
                0
        );

    if (
        max <= 0
    ) {
        return false;
    }

    const moneyRatio =
        Number(
            s.moneyAvailable ??
                0
        ) /
        max;

    const secDelta =
        Number(
            s.hackDifficulty ??
                0
        ) -
        Number(
            s.minDifficulty ??
                0
        );

    return (
        moneyRatio >=
            cfg.prepMoney &&
        secDelta <=
            cfg.prepSec
    );
}

/*
 * -------------------------------------------------------
 * DISPLAY
 * -------------------------------------------------------
 */

function printEpoch(
    ns,
    env,
    plan,
    cfg,
    dry = false,
    epoch = 0
) {
    ns.print(
        "============================================================"
    );

    ns.print(
        `[JIT4${
            dry
                ? " DRY"
                : ` EPOCH ${epoch}`
        }] ` +
        `Hack=${env.hack} | ` +
        `Formulas=${
            env.formulas
                ? "YES"
                : "FALLBACK"
        } | ` +
        `home=${ram(env.homeRam)} ` +
        `c${env.cores}`
    );

    ns.print(
        `[RAM] ` +
        `homeBudget=${ram(env.homeBudget)} | ` +
        `remoteH=${ram(env.remoteBudget)} | ` +
        `reserve=${pct(cfg.reservePct)}`
    );

    let i = 0;

    for (
        const x
        of plan.lanes
    ) {
        i++;

        ns.print(
            `[L${i}] ${x.target} | ` +
            `${x.ready ? "READY" : "COLD"} | ` +
            `take=${pct(x.actualTake)} ` +
            `chance=${pct(x.chance)}`
        );

        ns.print(
            `     H=${x.h} ` +
            `W1=${x.w1} ` +
            `G=${x.g} ` +
            `W2=${x.w2} | ` +
            `gap=${x.gap}ms ` +
            `period=${x.period}ms`
        );

        ns.print(
            `     EV=${money(x.evps)}/s | ` +
            `home≈${ram(x.homeUse)} ` +
            `remoteH≈${ram(x.remoteUse)}`
        );
    }

    ns.print(
        `[TOTAL] projected EV≈${money(plan.totalEV)}/s | ` +
        `spareHome≈${ram(plan.homeLeft)} | ` +
        `spareRemote≈${ram(plan.remoteLeft)}`
    );

    if (
        !env.formulas
    ) {
        ns.print(
            "[BOOT] Formulas.exe absent: conservative take/gap + estimated prepped model enabled."
        );
    }

    ns.print(
        "============================================================"
    );
}

function printRuntime(
    ns,
    rt,
    env,
    verified
) {
    const used =
        ns.getServerUsedRam(
            "home"
        );

    const max =
        ns.getServerMaxRam(
            "home"
        );

    ns.print(
        `[LIVE] ` +
        `verified=${verified} | ` +
        `home=${ram(used)}/${ram(max)} | ` +
        `queuedJobs=${rt.jobs.length} | ` +
        `live≈${rt.pids.length}`
    );
}

/*
 * -------------------------------------------------------
 * UTIL
 * -------------------------------------------------------
 */

function parseGaps(s) {
    const out =
        s
            .split(",")
            .map(
                x =>
                    Math.floor(
                        Number(
                            x.trim()
                        )
                    )
            )
            .filter(
                x =>
                    Number.isFinite(
                        x
                    ) &&
                    x >= 75
            );

    return [
        ...new Set(out),
    ].sort(
        (a, b) =>
            b - a
    );
}

function clamp(
    x,
    a,
    b
) {
    return Math.max(
        a,
        Math.min(
            b,
            x
        )
    );
}

function pct(x) {
    return `${(
        100 *
        x
    ).toFixed(1)}%`;
}

function money(x) {
    const a =
        Math.abs(x);

    const sign =
        x < 0
            ? "-"
            : "";

    if (
        a >= 1e12
    ) {
        return (
            sign +
            "$" +
            (
                a /
                1e12
            ).toFixed(2) +
            "t"
        );
    }

    if (
        a >= 1e9
    ) {
        return (
            sign +
            "$" +
            (
                a /
                1e9
            ).toFixed(2) +
            "b"
        );
    }

    if (
        a >= 1e6
    ) {
        return (
            sign +
            "$" +
            (
                a /
                1e6
            ).toFixed(2) +
            "m"
        );
    }

    if (
        a >= 1e3
    ) {
        return (
            sign +
            "$" +
            (
                a /
                1e3
            ).toFixed(2) +
            "k"
        );
    }

    return (
        sign +
        "$" +
        a.toFixed(0)
    );
}

function ram(gb) {
    return gb >= 1024
        ? (
              gb /
              1024
          ).toFixed(2) +
              "T"
        : gb.toFixed(1) +
              "G";
}

function fmtTime(sec) {
    if (
        sec < 60
    ) {
        return (
            sec.toFixed(1) +
            "s"
        );
    }

    if (
        sec < 3600
    ) {
        return (
            (
                sec /
                60
            ).toFixed(2) +
            "m"
        );
    }

    return (
        (
            sec /
            3600
        ).toFixed(2) +
        "h"
    );
}