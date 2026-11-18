/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["auto", false],

        ["pct", 0.10],
        ["gap", 500],
        ["lead", 2000],

        ["reserve", 32],
        ["reserve-pct", 0.10],

        ["grow-safety", 1.03],
        ["max-batches", 128],

        /*
         * Target reevaluation.
         *
         * Every N completed waves, rescan the network.
         */
        ["reeval", 5],

        /*
         * READY challenger:
         * must be >=20% better than current target.
         */
        ["switch-threshold", 0.20],

        /*
         * Unprepared challenger:
         * require >=30% improvement because switching
         * also costs prep time.
         */
        ["cold-switch-threshold", 0.30],

        ["cooldown", 1000],
        ["waves", 0],

        ["tail", false],
        ["help", false],
    ]);

    ns.disableLog("ALL");

    const autoTarget =
        Boolean(flags.auto);

    let target =
        flags._[0]
            ? String(flags._[0])
            : "";

    const pct =
        clamp(
            Number(flags.pct) || 0.10,
            0.01,
            0.40
        );

    const gap =
        Math.max(
            250,
            Number(flags.gap) || 500
        );

    const lead =
        Math.max(
            1000,
            Number(flags.lead) || 2000
        );

    const homeReserve =
        Math.max(
            0,
            Number(flags.reserve) || 0
        );

    const reservePct =
        clamp(
            Number(flags["reserve-pct"]) || 0.10,
            0,
            0.50
        );

    const growSafety =
        clamp(
            Number(flags["grow-safety"]) || 1.03,
            1.00,
            1.20
        );

    const maxBatches =
        Math.max(
            1,
            Math.floor(
                Number(flags["max-batches"]) || 128
            )
        );

    const reevalEvery =
        Math.max(
            1,
            Math.floor(
                Number(flags.reeval) || 5
            )
        );

    const switchThreshold =
        clamp(
            Number(flags["switch-threshold"]) || 0.20,
            0,
            2
        );

    const coldSwitchThreshold =
        clamp(
            Number(flags["cold-switch-threshold"]) || 0.30,
            switchThreshold,
            3
        );

    const cooldown =
        Math.max(
            0,
            Number(flags.cooldown) || 1000
        );

    const maxWaves =
        Math.max(
            0,
            Math.floor(
                Number(flags.waves) || 0
            )
        );

    // ------------------------------------------------------------
    // HELP / VALIDATION
    // ------------------------------------------------------------

    if (
        flags.help ||
        (!target && !autoTarget)
    ) {
        printHelp(ns);
        return;
    }

    if (
        !ns.fileExists(
            "Formulas.exe",
            "home"
        )
    ) {
        ns.tprint(
            "ERROR FARM v2.2 requires Formulas.exe."
        );
        return;
    }

    for (
        const file
        of [
            "shotgun-auto.js",
            "harvest.ts",
            "h.js",
            "g.js",
            "w.js",
        ]
    ) {
        if (
            !ns.fileExists(
                file,
                "home"
            )
        ) {
            ns.tprint(
                `ERROR Missing ${file} on home.`
            );
            return;
        }
    }

    const duplicate =
        ns.ps("home")
            .find(
                (p) =>
                    p.filename === "farm.js" &&
                    p.pid !== ns.pid
            );

    if (duplicate) {
        ns.tprint(
            `ERROR Another farm.js owns the fleet: ` +
            `pid=${duplicate.pid}`
        );
        return;
    }

    if (flags.tail) {
        ns.tail();
    }

    const hosts =
        scanAll(ns);

    /*
     * New servers may become rootable as programs/network change.
     */
    tryRootAll(
        ns,
        hosts
    );

    // ------------------------------------------------------------
    // INITIAL TARGET
    // ------------------------------------------------------------

    if (autoTarget) {
        const ranking =
            rankTargets(
                ns,
                hosts,
                {
                    pct,
                    gap,
                    lead,
                    reservePct,
                    homeReserve,
                    growSafety,
                    maxBatches,
                }
            );

        if (
            ranking.length === 0
        ) {
            ns.tprint(
                "ERROR No profitable hackable target found."
            );
            return;
        }

        if (!target) {
            target =
                ranking[0].host;

            ns.tprint(
                `[TARGET] initial auto-select: ` +
                `${target} | est≈${fmtMoney(
                    ranking[0].rate
                )}/s`
            );
        } else {
            if (
                !ns.serverExists(target)
            ) {
                ns.tprint(
                    `ERROR Unknown initial target: ${target}`
                );
                return;
            }

            ns.tprint(
                `[TARGET] starting pinned candidate: ${target}`
            );

            printRanking(
                ns,
                ranking,
                3
            );
        }
    }

    if (
        !ns.serverExists(target)
    ) {
        ns.tprint(
            `ERROR Unknown target: ${target}`
        );
        return;
    }

    // ------------------------------------------------------------
    // CHILD PROCESS OWNERSHIP
    // ------------------------------------------------------------

    let childPid = 0;
    let childType = "";

    ns.atExit(
        () => {
            if (
                childPid > 0
            ) {
                try {
                    ns.kill(
                        childPid
                    );
                } catch {
                    // already gone
                }

                cleanupWorkers(
                    ns,
                    hosts,
                    childPid,
                    childType
                );
            }
        },
        "farm-v22-cleanup"
    );

    // ------------------------------------------------------------
    // TELEMETRY
    // ------------------------------------------------------------

    const sessionStarted =
        Date.now();

    const startHackIncome =
        getHackMoney(ns);

    const initialHackLevel =
        ns.getHackingLevel();

    let waves = 0;
    let switches = 0;
    let totalWaveMs = 0;

    ns.tprint(
        `7n8 FARM v2.2 | ` +
        `target=${target} | ` +
        `capacity=AUTO | ` +
        `targetMode=${autoTarget ? "AUTO" : "PINNED"}`
    );

    ns.tprint(
        `reserve=${(
            reservePct * 100
        ).toFixed(0)}% | ` +
        `reeval=${reevalEvery} waves | ` +
        `hysteresis=${(
            switchThreshold * 100
        ).toFixed(0)}%`
    );

    // ============================================================
    // DAEMON LOOP
    // ============================================================

    while (
        maxWaves === 0 ||
        waves < maxWaves
    ) {
        // --------------------------------------------------------
        // REEVALUATE TARGET
        // --------------------------------------------------------

        if (
            autoTarget &&
            waves % reevalEvery === 0
        ) {
            tryRootAll(
                ns,
                hosts
            );

            const ranking =
                rankTargets(
                    ns,
                    hosts,
                    {
                        pct,
                        gap,
                        lead,
                        reservePct,
                        homeReserve,
                        growSafety,
                        maxBatches,
                    }
                );

            if (
                ranking.length > 0
            ) {
                const best =
                    ranking[0];

                const current =
                    ranking.find(
                        (x) =>
                            x.host === target
                    );

                ns.print(
                    `====================================================`
                );

                ns.print(
                    `[TARGET SCAN] Hack=${ns.getHackingLevel()}`
                );

                printRanking(
                    ns,
                    ranking,
                    3,
                    true
                );

                if (
                    !current
                ) {
                    ns.print(
                        `[TARGET] current ${target} no longer valid; ` +
                        `switching to ${best.host}`
                    );

                    target =
                        best.host;

                    switches++;
                } else if (
                    best.host !== target
                ) {
                    const improvement =
                        best.rate /
                        Math.max(
                            1,
                            current.rate
                        ) -
                        1;

                    const challengerReady =
                        isReady(
                            getTargetState(
                                ns,
                                best.host
                            )
                        );

                    const requiredGain =
                        challengerReady
                            ? switchThreshold
                            : coldSwitchThreshold;

                    if (
                        improvement >=
                        requiredGain
                    ) {
                        ns.print(
                            `[TARGET] SWITCH ` +
                            `${target} -> ${best.host}`
                        );

                        ns.print(
                            `[TARGET] estimated improvement=` +
                            `${(
                                improvement *
                                100
                            ).toFixed(1)}% | ` +
                            `required=${(
                                requiredGain *
                                100
                            ).toFixed(0)}%`
                        );

                        target =
                            best.host;

                        switches++;
                    } else {
                        ns.print(
                            `[TARGET] KEEP ${target} | ` +
                            `${best.host} only ` +
                            `${(
                                improvement *
                                100
                            ).toFixed(1)}% better; ` +
                            `need ${(
                                requiredGain *
                                100
                            ).toFixed(0)}%`
                        );
                    }
                } else {
                    ns.print(
                        `[TARGET] KEEP ${target} | still #1`
                    );
                }

                ns.print(
                    `====================================================`
                );
            }
        }

        // --------------------------------------------------------
        // PREP / RECOVERY
        // --------------------------------------------------------

        let state =
            getTargetState(
                ns,
                target
            );

        if (!isReady(state)) {
            ns.print(
                `[PREP] ${target} | ` +
                `money=${fmtMoney(state.money)}/` +
                `${fmtMoney(state.maxMoney)} | ` +
                `sec=${state.sec.toFixed(3)}/` +
                `${state.minSec.toFixed(3)}`
            );

            childType =
                "prep";

            childPid =
                ns.run(
                    "harvest.ts",
                    1,

                    target,
                    "--prep-only",

                    "--reserve",
                    homeReserve
                );

            if (
                childPid === 0
            ) {
                ns.tprint(
                    `ERROR Cannot start prep for ${target}.`
                );
                return;
            }

            await waitHomePid(
                ns,
                childPid
            );

            childPid = 0;
            childType = "";

            state =
                getTargetState(
                    ns,
                    target
                );

            if (!isReady(state)) {
                ns.tprint(
                    `ERROR Prep failed: ${target} still not READY.`
                );
                return;
            }

            ns.print(
                `[PREP] PASS | ${target} READY`
            );
        }

        // --------------------------------------------------------
        // WAVE
        // --------------------------------------------------------

        const waveNo =
            waves + 1;

        const hackBefore =
            getHackMoney(ns);

        const walletBefore =
            ns.getPlayer().money;

        const hackLevelBefore =
            ns.getHackingLevel();

        const waveStarted =
            Date.now();

        ns.print(
            `====================================================`
        );

        ns.print(
            `[WAVE ${waveNo}] START | ` +
            `target=${target} | ` +
            `Hack=${hackLevelBefore}`
        );

        childType =
            "shotgun-auto";

        childPid =
            ns.run(
                "shotgun-auto.js",
                1,

                target,

                "--pct",
                pct,

                "--gap",
                gap,

                "--lead",
                lead,

                "--reserve",
                homeReserve,

                "--reserve-pct",
                reservePct,

                "--grow-safety",
                growSafety,

                "--max-batches",
                maxBatches
            );

        if (
            childPid === 0
        ) {
            ns.tprint(
                "ERROR Cannot launch shotgun-auto.js."
            );
            return;
        }

        await waitHomePid(
            ns,
            childPid
        );

        const elapsed =
            Date.now() -
            waveStarted;

        childPid = 0;
        childType = "";

        state =
            getTargetState(
                ns,
                target
            );

        if (
            elapsed < 10000 &&
            isReady(state)
        ) {
            ns.tprint(
                `ERROR Engine exited suspiciously fast: ` +
                `${fmtDuration(elapsed)}`
            );

            return;
        }

        waves++;

        totalWaveMs +=
            elapsed;

        // --------------------------------------------------------
        // TELEMETRY
        // --------------------------------------------------------

        const hackAfter =
            getHackMoney(ns);

        const walletAfter =
            ns.getPlayer().money;

        const hackDelta =
            hackAfter -
            hackBefore;

        const walletDelta =
            walletAfter -
            walletBefore;

        const hackRate =
            hackDelta /
            Math.max(
                1,
                elapsed / 1000
            );

        const sessionHack =
            hackAfter -
            startHackIncome;

        const sessionMs =
            Date.now() -
            sessionStarted;

        const avgHackRate =
            sessionHack /
            Math.max(
                1,
                sessionMs / 1000
            );

        ns.print(
            `[WAVE ${waves}] END | ` +
            `target=${target} | ` +
            `time=${fmtDuration(elapsed)} | ` +
            `hack-income=${fmtMoney(hackDelta)} | ` +
            `rate=${fmtMoney(hackRate)}/s`
        );

        ns.print(
            `[WAVE ${waves}] walletΔ(mixed)=` +
            `${fmtMoney(walletDelta)}`
        );

        ns.print(
            `[SESSION] waves=${waves} | ` +
            `switches=${switches} | ` +
            `hack-income=${fmtMoney(sessionHack)} | ` +
            `avg=${fmtMoney(avgHackRate)}/s`
        );

        const hackLevelAfter =
            ns.getHackingLevel();

        if (
            hackLevelAfter !==
            hackLevelBefore
        ) {
            ns.print(
                `[LEVEL] Hack ` +
                `${hackLevelBefore} -> ${hackLevelAfter}`
            );
        }

        // --------------------------------------------------------
        // VERIFY
        // --------------------------------------------------------

        state =
            getTargetState(
                ns,
                target
            );

        if (isReady(state)) {
            ns.print(
                `[WAVE ${waves}] PASS | ` +
                `${target} | ` +
                `${fmtMoney(state.money)}/` +
                `${fmtMoney(state.maxMoney)} | ` +
                `sec=${state.sec.toFixed(3)}/` +
                `${state.minSec.toFixed(3)}`
            );
        } else {
            ns.print(
                `[WAVE ${waves}] DRIFT | ` +
                `${target} | ` +
                `money=${(
                    state.money /
                    state.maxMoney *
                    100
                ).toFixed(3)}% | ` +
                `sec=${state.sec.toFixed(3)}/` +
                `${state.minSec.toFixed(3)}`
            );

            ns.print(
                `[WAVE ${waves}] recovery next loop`
            );
        }

        ns.print(
            `====================================================`
        );

        if (
            maxWaves > 0 &&
            waves >= maxWaves
        ) {
            break;
        }

        if (
            cooldown > 0
        ) {
            await ns.sleep(
                cooldown
            );
        }
    }

    // ------------------------------------------------------------
    // SESSION END
    // ------------------------------------------------------------

    const finalHackIncome =
        getHackMoney(ns);

    ns.tprint(
        `FARM STOPPED | ` +
        `waves=${waves} | ` +
        `switches=${switches} | ` +
        `runtime=${fmtDuration(
            Date.now() -
            sessionStarted
        )} | ` +
        `Hack=${initialHackLevel}->${ns.getHackingLevel()} | ` +
        `hacking-income=${fmtMoney(
            finalHackIncome -
            startHackIncome
        )}`
    );

    if (
        waves > 0
    ) {
        ns.tprint(
            `Average wave=${fmtDuration(
                totalWaveMs /
                waves
            )}`
        );
    }
}


// =================================================================
// TARGET RANKER
// =================================================================

function rankTargets(
    ns,
    hosts,
    config
) {
    const player =
        ns.getPlayer();

    const pool =
        getPoolStats(
            ns,
            hosts,
            config.homeReserve
        );

    const safeRam =
        pool.free *
        (1 - config.reservePct);

    const ramH =
        ns.getScriptRam(
            "h.js",
            "home"
        );

    const ramG =
        ns.getScriptRam(
            "g.js",
            "home"
        );

    const ramW =
        ns.getScriptRam(
            "w.js",
            "home"
        );

    /*
     * Home is now the dominant RAM provider,
     * so use its CPU core count for ranking estimation.
     *
     * The real shotgun allocator still handles the
     * heterogeneous network exactly.
     */
    let scoringCores = 1;

    try {
        scoringCores =
            Math.max(
                1,
                Number(
                    ns.getServer(
                        "home"
                    ).cpuCores
                ) || 1
            );
    } catch {
        scoringCores = 1;
    }

    const out = [];

    for (
        const host
        of hosts
    ) {
        if (
            !ns.hasRootAccess(host)
        ) {
            continue;
        }

        const maxMoney =
            ns.getServerMaxMoney(
                host
            );

        if (
            maxMoney <= 0
        ) {
            continue;
        }

        if (
            ns.getHackingLevel() <
            ns.getServerRequiredHackingLevel(
                host
            )
        ) {
            continue;
        }

        const server =
            ns.getServer(
                host
            );

        server.moneyAvailable =
            server.moneyMax;

        server.hackDifficulty =
            server.minDifficulty;

        const hackPct =
            ns.formulas.hacking.hackPercent(
                server,
                player
            );

        const chance =
            ns.formulas.hacking.hackChance(
                server,
                player
            );

        if (
            !Number.isFinite(hackPct) ||
            hackPct <= 0 ||
            !Number.isFinite(chance) ||
            chance <= 0
        ) {
            continue;
        }

        const hThreads =
            Math.max(
                1,
                Math.floor(
                    config.pct /
                    hackPct
                )
            );

        const actualTake =
            Math.min(
                0.90,
                hThreads *
                hackPct
            );

        if (
            actualTake <= 0 ||
            actualTake >= 0.90
        ) {
            continue;
        }

        const weakenEffect =
            ns.formulas.hacking.weakenEffect(
                1,
                scoringCores
            );

        const w1Threads =
            Math.max(
                1,
                Math.ceil(
                    ns.hackAnalyzeSecurity(
                        hThreads
                    ) /
                    weakenEffect
                )
            );

        const afterHack = {
            ...server,
        };

        afterHack.moneyAvailable =
            Math.max(
                1,
                server.moneyMax *
                (1 - actualTake)
            );

        afterHack.hackDifficulty =
            afterHack.minDifficulty;

        let gThreads =
            ns.formulas.hacking.growThreads(
                afterHack,
                player,
                server.moneyMax,
                scoringCores
            );

        if (
            !Number.isFinite(gThreads) ||
            gThreads <= 0
        ) {
            continue;
        }

        gThreads =
            Math.max(
                1,
                Math.ceil(
                    gThreads *
                    config.growSafety
                )
            );

        const growSec =
            ns.growthAnalyzeSecurity(
                gThreads
            );

        const w2Threads =
            Math.max(
                1,
                Math.ceil(
                    growSec /
                    weakenEffect
                )
            );

        const batchRam =
            hThreads *
                ramH +

            gThreads *
                ramG +

            (
                w1Threads +
                w2Threads
            ) *
                ramW;

        if (
            batchRam <= 0
        ) {
            continue;
        }

        const capacity =
            Math.max(
                1,
                Math.min(
                    config.maxBatches,
                    Math.floor(
                        safeRam /
                        batchRam
                    )
                )
            );

        const weakenTime =
            ns.formulas.hacking.weakenTime(
                server,
                player
            );

        const expectedBatch =
            server.moneyMax *
            actualTake *
            chance;

        const expectedWave =
            expectedBatch *
            capacity;

        /*
         * Approximate shotgun duration:
         *
         * first H landing:
         *   lead + weakenTime
         *
         * each additional batch consumes 4 landing slots.
         */
        const waveMs =
            config.lead +
            weakenTime +
            (
                capacity *
                4 -
                1
            ) *
            config.gap +
            config.gap;

        const rate =
            expectedWave /
            Math.max(
                1,
                waveMs / 1000
            );

        const state =
            getTargetState(
                ns,
                host
            );

        out.push({
            host,

            rate,
            capacity,

            expectedBatch,
            expectedWave,

            batchRam,

            chance,
            hackPct,
            actualTake,

            hThreads,
            gThreads,
            w1Threads,
            w2Threads,

            weakenTime,

            ready:
                isReady(state),
        });
    }

    out.sort(
        (a, b) =>
            b.rate -
            a.rate
    );

    return out;
}


// =================================================================
// TARGET RANK OUTPUT
// =================================================================

function printRanking(
    ns,
    ranking,
    count = 3,
    useLog = false
) {
    const emit =
        useLog
            ? (text) =>
                ns.print(text)
            : (text) =>
                ns.tprint(text);

    for (
        let i = 0;
        i <
        Math.min(
            count,
            ranking.length
        );
        i++
    ) {
        const x =
            ranking[i];

        emit(
            `  #${i + 1} ` +
            `${x.host} | ` +
            `est=${fmtMoney(x.rate)}/s | ` +
            `cap≈${x.capacity} | ` +
            `chance=${(
                x.chance *
                100
            ).toFixed(1)}% | ` +
            `${x.ready ? "READY" : "COLD"}`
        );
    }
}


// =================================================================
// WORKER POOL
// =================================================================

function getPoolStats(
    ns,
    hosts,
    homeReserve
) {
    let total = 0;
    let free = 0;
    let workers = 0;

    for (
        const host
        of hosts
    ) {
        if (
            !ns.hasRootAccess(host)
        ) {
            continue;
        }

        const maxRam =
            ns.getServerMaxRam(
                host
            );

        if (
            maxRam <= 0
        ) {
            continue;
        }

        const usedRam =
            ns.getServerUsedRam(
                host
            );

        const reserve =
            host === "home"
                ? homeReserve
                : 0;

        total +=
            maxRam;

        free +=
            Math.max(
                0,
                maxRam -
                usedRam -
                reserve
            );

        workers++;
    }

    return {
        total,
        free,
        workers,
    };
}


// =================================================================
// AUTO ROOT
// =================================================================

function tryRootAll(
    ns,
    hosts
) {
    const openers = [
        {
            file:
                "BruteSSH.exe",

            run:
                (host) =>
                    ns.brutessh(host),
        },

        {
            file:
                "FTPCrack.exe",

            run:
                (host) =>
                    ns.ftpcrack(host),
        },

        {
            file:
                "relaySMTP.exe",

            run:
                (host) =>
                    ns.relaysmtp(host),
        },

        {
            file:
                "HTTPWorm.exe",

            run:
                (host) =>
                    ns.httpworm(host),
        },

        {
            file:
                "SQLInject.exe",

            run:
                (host) =>
                    ns.sqlinject(host),
        },
    ];

    for (
        const host
        of hosts
    ) {
        if (
            host === "home" ||
            ns.hasRootAccess(host)
        ) {
            continue;
        }

        for (
            const opener
            of openers
        ) {
            if (
                !ns.fileExists(
                    opener.file,
                    "home"
                )
            ) {
                continue;
            }

            try {
                opener.run(
                    host
                );
            } catch {
                // port may already be open
            }
        }

        try {
            const server =
                ns.getServer(
                    host
                );

            if (
                server.openPortCount >=
                server.numOpenPortsRequired
            ) {
                ns.nuke(
                    host
                );
            }
        } catch {
            // not rootable yet
        }
    }
}


// =================================================================
// TARGET STATE
// =================================================================

function getTargetState(
    ns,
    target
) {
    return {
        money:
            ns.getServerMoneyAvailable(
                target
            ),

        maxMoney:
            ns.getServerMaxMoney(
                target
            ),

        sec:
            ns.getServerSecurityLevel(
                target
            ),

        minSec:
            ns.getServerMinSecurityLevel(
                target
            ),
    };
}


function isReady(
    state
) {
    return (
        state.maxMoney > 0 &&

        state.money >=
            state.maxMoney *
            0.999 &&

        state.sec <=
            state.minSec +
            0.05
    );
}


// =================================================================
// PROCESS CONTROL
// =================================================================

async function waitHomePid(
    ns,
    pid
) {
    while (
        ns.ps("home")
            .some(
                (p) =>
                    p.pid === pid
            )
    ) {
        await ns.sleep(
            250
        );
    }
}


function cleanupWorkers(
    ns,
    hosts,
    childPid,
    type
) {
    for (
        const host
        of hosts
    ) {
        for (
            const process
            of ns.ps(host)
        ) {
            if (
                ![
                    "h.js",
                    "g.js",
                    "w.js",
                ].includes(
                    process.filename
                )
            ) {
                continue;
            }

            const args =
                process.args.map(
                    String
                );

            let owned = false;

            if (
                type ===
                "shotgun-auto"
            ) {
                owned =
                    args.some(
                        (arg) =>
                            arg.startsWith(
                                `auto:${childPid}:`
                            )
                    );
            }

            if (
                type ===
                "prep"
            ) {
                owned =
                    args.some(
                        (arg) =>
                            arg.startsWith(
                                "prep-w-"
                            ) ||
                            arg.startsWith(
                                "prep-g-"
                            )
                    );
            }

            if (owned) {
                try {
                    ns.kill(
                        process.pid
                    );
                } catch {
                    // gone
                }
            }
        }
    }
}


// =================================================================
// NETWORK
// =================================================================

function scanAll(
    ns
) {
    const seen =
        new Set([
            "home",
        ]);

    const queue =
        [
            "home",
        ];

    while (
        queue.length > 0
    ) {
        const host =
            queue.shift();

        for (
            const next
            of ns.scan(
                host
            )
        ) {
            if (
                seen.has(
                    next
                )
            ) {
                continue;
            }

            seen.add(
                next
            );

            queue.push(
                next
            );
        }
    }

    return [
        ...seen,
    ];
}


// =================================================================
// TELEMETRY
// =================================================================

function getHackMoney(
    ns
) {
    try {
        return Number(
            ns.getMoneySources()
                .sinceInstall
                .hacking
        ) || 0;
    } catch {
        return 0;
    }
}


// =================================================================
// FORMAT
// =================================================================

function clamp(
    value,
    min,
    max
) {
    return Math.min(
        max,
        Math.max(
            min,
            value
        )
    );
}


function fmtDuration(
    ms
) {
    if (
        ms >= 3600000
    ) {
        return (
            ms /
            3600000
        ).toFixed(2) +
            "h";
    }

    if (
        ms >= 60000
    ) {
        return (
            ms /
            60000
        ).toFixed(2) +
            "m";
    }

    return (
        ms /
        1000
    ).toFixed(1) +
        "s";
}


function fmtMoney(
    value
) {
    if (
        !Number.isFinite(
            value
        )
    ) {
        return "-";
    }

    const sign =
        value < 0
            ? "-"
            : "";

    const abs =
        Math.abs(
            value
        );

    if (
        abs >= 1e15
    ) {
        return (
            sign +
            "$" +
            (
                abs /
                1e15
            ).toFixed(2) +
            "q"
        );
    }

    if (
        abs >= 1e12
    ) {
        return (
            sign +
            "$" +
            (
                abs /
                1e12
            ).toFixed(2) +
            "t"
        );
    }

    if (
        abs >= 1e9
    ) {
        return (
            sign +
            "$" +
            (
                abs /
                1e9
            ).toFixed(2) +
            "b"
        );
    }

    if (
        abs >= 1e6
    ) {
        return (
            sign +
            "$" +
            (
                abs /
                1e6
            ).toFixed(1) +
            "m"
        );
    }

    if (
        abs >= 1e3
    ) {
        return (
            sign +
            "$" +
            (
                abs /
                1e3
            ).toFixed(1) +
            "k"
        );
    }

    return (
        sign +
        "$" +
        abs.toFixed(0)
    );
}


// =================================================================
// HELP
// =================================================================

function printHelp(
    ns
) {
    ns.tprint(
        "7n8 FARM v2.2"
    );

    ns.tprint("");

    ns.tprint(
        "Pinned target:"
    );

    ns.tprint(
        "  run farm.js phantasy --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Auto target:"
    );

    ns.tprint(
        "  run farm.js phantasy --auto --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Fully automatic initial target:"
    );

    ns.tprint(
        "  run farm.js --auto --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Safe test:"
    );

    ns.tprint(
        "  run farm.js phantasy --auto --waves 5 --reeval 1 --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Defaults:"
    );

    ns.tprint(
        "  switch threshold       = 20%"
    );

    ns.tprint(
        "  cold switch threshold  = 30%"
    );

    ns.tprint(
        "  re-evaluate every      = 5 waves"
    );

    ns.tprint(
        "  RAM reserve            = 10%"
    );
}