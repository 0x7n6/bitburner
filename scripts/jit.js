/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["batches", 20],

        ["pct", 0.10],

        /*
         * Landing gap inside one batch:
         *
         * H
         * W1 + gap
         * G  + 2gap
         * W2 + 3gap
         *
         * 50ms is intentionally conservative for first JIT tests.
         */
        ["gap", 50],

        /*
         * Time before first worker starts.
         */
        ["lead", 2000],

        /*
         * Keep this fraction of HOME unused.
         */
        ["reserve-pct", 0.15],

        /*
         * Slight grow overprovisioning protects against
         * hacking-level movement during the stream.
         */
        ["grow-safety", 1.05],

        /*
         * Controller launches the worker slightly before
         * its calculated start time.
         *
         * Worker then uses small additionalMsec correction.
         */
        ["launch-lead", 50],

        /*
         * Optional manual lower-bound for batch period.
         * 0 = calculate automatically.
         */
        ["min-period", 0],

        ["dry-run", false],
        ["tail", false],
        ["help", false],
    ]);

    ns.disableLog("ALL");

    const target =
        flags._[0]
            ? String(flags._[0])
            : "";

    const batches =
        Math.max(
            1,
            Math.floor(
                Number(flags.batches) || 20
            )
        );

    const pct =
        clamp(
            Number(flags.pct) || 0.10,
            0.01,
            0.40
        );

    const gap =
        Math.max(
            20,
            Number(flags.gap) || 50
        );

    const lead =
        Math.max(
            1000,
            Number(flags.lead) || 2000
        );

    const reservePct =
        clamp(
            Number(flags["reserve-pct"]) || 0.15,
            0.05,
            0.50
        );

    const growSafety =
        clamp(
            Number(flags["grow-safety"]) || 1.05,
            1.00,
            1.20
        );

    const launchLead =
        clamp(
            Number(flags["launch-lead"]) || 50,
            10,
            2000
        );

    const minPeriod =
        Math.max(
            0,
            Number(flags["min-period"]) || 0
        );

    const dryRun =
        Boolean(flags["dry-run"]);

    if (
        flags.help ||
        !target
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
            "ERROR JIT requires Formulas.exe."
        );
        return;
    }

    for (
        const file
        of [
            "jh.js",
            "jg.js",
            "jw.js",
        ]
    ) {
        if (
            !ns.fileExists(
                file,
                "home"
            )
        ) {
            ns.tprint(
                `ERROR Missing ${file}.`
            );
            return;
        }
    }

    if (
        !ns.serverExists(target) ||
        !ns.hasRootAccess(target)
    ) {
        ns.tprint(
            `ERROR Invalid/unrooted target: ${target}`
        );
        return;
    }

    if (
        ns.getHackingLevel() <
        ns.getServerRequiredHackingLevel(
            target
        )
    ) {
        ns.tprint(
            `ERROR Hack level too low for ${target}.`
        );
        return;
    }

    const state =
        getTargetState(
            ns,
            target
        );

    if (!isReady(state)) {
        ns.tprint(
            `ERROR ${target} is not READY.`
        );

        ns.tprint(
            `money=${fmtMoney(state.money)}/` +
            `${fmtMoney(state.maxMoney)} | ` +
            `sec=${state.sec.toFixed(3)}/` +
            `${state.minSec.toFixed(3)}`
        );

        return;
    }

    if (flags.tail) {
        ns.tail();
    }

    // ============================================================
    // HOME HARDWARE
    // ============================================================

    const home =
        ns.getServer(
            "home"
        );

    const cores =
        Math.max(
            1,
            Number(home.cpuCores) || 1
        );

    const maxRam =
        ns.getServerMaxRam(
            "home"
        );

    /*
     * jit.js itself and any unrelated home processes are
     * already included here.
     */
    const usedRamNow =
        ns.getServerUsedRam(
            "home"
        );

    const hardRamLimit =
        maxRam *
        (1 - reservePct);

    const workerBudget =
        Math.max(
            0,
            hardRamLimit -
            usedRamNow
        );

    // ============================================================
    // SCRIPT RAM
    // ============================================================

    const ram = {
        h:
            ns.getScriptRam(
                "jh.js",
                "home"
            ),

        g:
            ns.getScriptRam(
                "jg.js",
                "home"
            ),

        w:
            ns.getScriptRam(
                "jw.js",
                "home"
            ),
    };

    // ============================================================
    // EXACT PREPPED MODEL
    // ============================================================

    const player =
        ns.getPlayer();

    const server =
        ns.getServer(
            target
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
        hackPct <= 0
    ) {
        ns.tprint(
            "ERROR Invalid hack percentage."
        );
        return;
    }

    const hThreads =
        Math.max(
            1,
            Math.floor(
                pct /
                hackPct
            )
        );

    const actualTake =
        hThreads *
        hackPct;

    if (
        actualTake <= 0 ||
        actualTake >= 0.90
    ) {
        ns.tprint(
            "ERROR Invalid batch take."
        );
        return;
    }

    // ------------------------------------------------------------
    // W1
    // ------------------------------------------------------------

    const weakenPerThread =
        ns.formulas.hacking.weakenEffect(
            1,
            cores
        );

    const hackSecurity =
        ns.hackAnalyzeSecurity(
            hThreads,
            target
        );

    const w1Threads =
        Math.max(
            1,
            Math.ceil(
                hackSecurity /
                weakenPerThread
            )
        );

    // ------------------------------------------------------------
    // GROW
    // ------------------------------------------------------------

    const afterHack = {
        ...server,

        moneyAvailable:
            Math.max(
                1,
                server.moneyMax *
                (1 - actualTake)
            ),

        hackDifficulty:
            server.minDifficulty,
    };

    let gThreads =
        ns.formulas.hacking.growThreads(
            afterHack,
            player,
            server.moneyMax,
            cores
        );

    if (
        !Number.isFinite(gThreads) ||
        gThreads <= 0
    ) {
        ns.tprint(
            "ERROR growThreads failed."
        );
        return;
    }

    gThreads =
        Math.max(
            1,
            Math.ceil(
                gThreads *
                growSafety
            )
        );

    // ------------------------------------------------------------
    // W2
    // ------------------------------------------------------------

    const growSecurity =
        getGrowSecurity(
            ns,
            gThreads,
            cores
        );

    const w2Threads =
        Math.max(
            1,
            Math.ceil(
                growSecurity /
                weakenPerThread
            )
        );

    // ============================================================
    // TIMES
    // ============================================================

    const times = {
        h:
            ns.formulas.hacking.hackTime(
                server,
                player
            ),

        g:
            ns.formulas.hacking.growTime(
                server,
                player
            ),

        w:
            ns.formulas.hacking.weakenTime(
                server,
                player
            ),
    };

    // ============================================================
    // ACTION RAM
    // ============================================================

    const actionRam = {
        h:
            hThreads *
            ram.h,

        w1:
            w1Threads *
            ram.w,

        g:
            gThreads *
            ram.g,

        w2:
            w2Threads *
            ram.w,
    };

    const singleBatchRam =
        actionRam.h +
        actionRam.w1 +
        actionRam.g +
        actionRam.w2;

    if (
        singleBatchRam >
        workerBudget
    ) {
        ns.tprint(
            "ERROR One JIT batch does not fit HOME budget."
        );

        ns.tprint(
            `batch=${fmtRam(singleBatchRam)} | ` +
            `budget=${fmtRam(workerBudget)}`
        );

        return;
    }

    // ============================================================
    // FIND SUSTAINABLE BATCH PERIOD
    // ============================================================

    /*
     * Never allow the next batch's H to land before
     * the previous batch's W2.
     */
    const orderingFloor =
        4 *
        gap;

    const lowerBound =
        Math.max(
            orderingFloor,
            minPeriod
        );

    /*
     * Simulate enough batches to reach steady-state RAM load.
     *
     * Even a small real test should not get an unrealistically
     * aggressive period just because startup hasn't saturated yet.
     */
    const simulationBatches =
        Math.max(
            250,
            batches
        );

    const period =
        findSustainablePeriod(
            workerBudget,
            lowerBound,
            times,
            actionRam,
            gap,
            simulationBatches
        );

    if (
        !Number.isFinite(period)
    ) {
        ns.tprint(
            "ERROR Could not find sustainable JIT period."
        );
        return;
    }

    const simulatedPeak =
        peakRamForPeriod(
            period,
            simulationBatches,
            times,
            actionRam,
            gap
        );

    const expectedBatch =
        server.moneyMax *
        actualTake *
        chance;

    const steadyExpectedRate =
        expectedBatch /
        (
            period /
            1000
        );

    const expectedTotal =
        expectedBatch *
        batches;

    const expectedStreamMs =
        times.w +
        (
            Math.max(
                0,
                batches - 1
            ) *
            period
        ) +
        3 *
        gap;

    // ============================================================
    // INFO
    // ============================================================

    ns.tprint(
        "7n8 JIT v0.1 | HOME-ONLY"
    );

    ns.tprint(
        `target=${target} | ` +
        `Hack=${ns.getHackingLevel()} | ` +
        `cores=${cores} | ` +
        `Formulas=YES`
    );

    ns.tprint(
        `H=${hThreads} ` +
        `W1=${w1Threads} ` +
        `G=${gThreads} ` +
        `W2=${w2Threads} | ` +
        `take≈${(
            actualTake *
            100
        ).toFixed(2)}% | ` +
        `chance=${(
            chance *
            100
        ).toFixed(1)}%`
    );

    ns.tprint(
        `H=${fmtRam(actionRam.h)} | ` +
        `W1=${fmtRam(actionRam.w1)} | ` +
        `G=${fmtRam(actionRam.g)} | ` +
        `W2=${fmtRam(actionRam.w2)}`
    );

    ns.tprint(
        `home=${fmtRam(maxRam)} | ` +
        `workerBudget=${fmtRam(workerBudget)} | ` +
        `simPeak≈${fmtRam(simulatedPeak)} | ` +
        `reserve=${(
            reservePct *
            100
        ).toFixed(0)}%`
    );

    ns.tprint(
        `times H=${fmtDuration(times.h)} | ` +
        `G=${fmtDuration(times.g)} | ` +
        `W=${fmtDuration(times.w)}`
    );

    ns.tprint(
        `landing gap=${gap}ms | ` +
        `batch period=${period}ms | ` +
        `~${(
            60000 /
            period
        ).toFixed(1)} batches/min`
    );

    ns.tprint(
        `batches=${batches} | ` +
        `EV≈${fmtMoney(expectedTotal)} | ` +
        `steady EV≈${fmtMoney(
            steadyExpectedRate
        )}/s`
    );

    ns.tprint(
        `expected stream≈${fmtDuration(
            expectedStreamMs
        )}`
    );

    if (dryRun) {
        ns.tprint(
            "DRY RUN PASS. Nothing launched."
        );
        return;
    }

    // ============================================================
    // BUILD ABSOLUTE SCHEDULE
    // ============================================================

    /*
     * First H lands after one full weaken duration.
     *
     * This guarantees the earliest W worker does not need
     * to be launched before the controller has started.
     */
    const firstHFinish =
        Date.now() +
        lead +
        times.w;

    const jobs =
        buildJobs(
            batches,
            firstHFinish,
            period,
            gap,
            times,
            {
                hThreads,
                w1Threads,
                gThreads,
                w2Threads,
            },
            ram
        );

    const pids = [];

    let aborted =
        false;

    ns.atExit(
        () => {
            for (
                const pid
                of pids
            ) {
                try {
                    ns.kill(
                        pid
                    );
                } catch {
                    // already dead
                }
            }
        },
        "jit-cleanup"
    );

    const incomeBefore =
        getHackMoney(
            ns
        );

    const walletBefore =
        ns.getPlayer().money;

    const started =
        Date.now();

    // ============================================================
    // JUST-IN-TIME LAUNCH LOOP
    // ============================================================

    for (
        let i = 0;
        i < jobs.length;
        i++
    ) {
        const job =
            jobs[i];

        /*
         * Don't instantiate the worker process until it is
         * actually about to begin its HGW operation.
         */
        while (
            Date.now() <
            job.startAt -
            launchLead
        ) {
            const remaining =
                job.startAt -
                launchLead -
                Date.now();

            await ns.sleep(
                Math.min(
                    25,
                    Math.max(
                        1,
                        remaining
                    )
                )
            );
        }

        const freeRam =
            ns.getServerMaxRam(
                "home"
            ) -
            ns.getServerUsedRam(
                "home"
            );

        if (
            freeRam +
                1e-6 <
            job.ram
        ) {
            ns.tprint(
                `ERROR JIT RAM collision at ` +
                `${job.tag}.`
            );

            ns.tprint(
                `need=${fmtRam(job.ram)} | ` +
                `free=${fmtRam(freeRam)}`
            );

            aborted = true;
            break;
        }

        const pid =
            ns.exec(
                job.script,
                "home",
                job.threads,

                target,
                job.finishAt,
                job.startAt,
                job.tag,
                Math.max(
                    100,
                    gap * 2
                )
            );

        if (
            pid === 0
        ) {
            ns.tprint(
                `ERROR exec failed: ${job.tag}`
            );

            aborted = true;
            break;
        }

        pids.push(
            pid
        );
    }

    if (aborted) {
        killPids(
            ns,
            pids
        );

        ns.tprint(
            "JIT ABORTED. Workers cleaned."
        );

        return;
    }

    ns.tprint(
        `JIT LAUNCHED | ` +
        `${batches} batches | ` +
        `${jobs.length} jobs | ` +
        `period=${period}ms`
    );

    // ============================================================
    // WAIT FOR STREAM TO DRAIN
    // ============================================================

    await waitPids(
        ns,
        pids
    );

    await ns.sleep(
        Math.max(
            250,
            gap * 2
        )
    );

    const elapsed =
        Date.now() -
        started;

    const incomeAfter =
        getHackMoney(
            ns
        );

    const walletAfter =
        ns.getPlayer().money;

    const hackIncome =
        incomeAfter -
        incomeBefore;

    const realRate =
        hackIncome /
        Math.max(
            1,
            elapsed /
            1000
        );

    const final =
        getTargetState(
            ns,
            target
        );

    ns.tprint("");

    ns.tprint(
        `JIT COMPLETE | ` +
        `time=${fmtDuration(elapsed)} | ` +
        `hack-income=${fmtMoney(hackIncome)} | ` +
        `REAL=${fmtMoney(realRate)}/s`
    );

    ns.tprint(
        `walletΔ(mixed)=${fmtMoney(
            walletAfter -
            walletBefore
        )}`
    );

    ns.tprint(
        `target=${fmtMoney(final.money)}/` +
        `${fmtMoney(final.maxMoney)} ` +
        `(${(
            final.money /
            final.maxMoney *
            100
        ).toFixed(3)}%) | ` +
        `sec=${final.sec.toFixed(3)}/` +
        `${final.minSec.toFixed(3)}`
    );

    if (isReady(final)) {
        ns.tprint(
            `JIT PASS: ${batches}/${batches} ` +
            `batch schedule returned target READY.`
        );
    } else {
        ns.tprint(
            "JIT DRIFT: target did not return READY."
        );

        ns.tprint(
            `Recover with: ` +
            `run harvest.js ${target} --prep-only --tail`
        );
    }
}


// =================================================================
// JOB SCHEDULE
// =================================================================

function buildJobs(
    batches,
    firstHFinish,
    period,
    gap,
    times,
    threads,
    ram
) {
    const jobs = [];

    for (
        let b = 0;
        b < batches;
        b++
    ) {
        const hFinish =
            firstHFinish +
            b *
            period;

        const w1Finish =
            hFinish +
            gap;

        const gFinish =
            hFinish +
            2 *
            gap;

        const w2Finish =
            hFinish +
            3 *
            gap;

        jobs.push({
            action:
                "H",

            script:
                "jh.js",

            threads:
                threads.hThreads,

            startAt:
                hFinish -
                times.h,

            finishAt:
                hFinish,

            ram:
                threads.hThreads *
                ram.h,

            tag:
                `JIT:B${b + 1}:H`,
        });

        jobs.push({
            action:
                "W1",

            script:
                "jw.js",

            threads:
                threads.w1Threads,

            startAt:
                w1Finish -
                times.w,

            finishAt:
                w1Finish,

            ram:
                threads.w1Threads *
                ram.w,

            tag:
                `JIT:B${b + 1}:W1`,
        });

        jobs.push({
            action:
                "G",

            script:
                "jg.js",

            threads:
                threads.gThreads,

            startAt:
                gFinish -
                times.g,

            finishAt:
                gFinish,

            ram:
                threads.gThreads *
                ram.g,

            tag:
                `JIT:B${b + 1}:G`,
        });

        jobs.push({
            action:
                "W2",

            script:
                "jw.js",

            threads:
                threads.w2Threads,

            startAt:
                w2Finish -
                times.w,

            finishAt:
                w2Finish,

            ram:
                threads.w2Threads *
                ram.w,

            tag:
                `JIT:B${b + 1}:W2`,
        });
    }

    jobs.sort(
        (a, b) =>
            a.startAt -
                b.startAt ||
            a.finishAt -
                b.finishAt
    );

    return jobs;
}


// =================================================================
// RAM MODEL
// =================================================================

function findSustainablePeriod(
    budget,
    lowerBound,
    times,
    actionRam,
    gap,
    simulationBatches
) {
    let lo =
        Math.max(
            1,
            Math.ceil(
                lowerBound
            )
        );

    /*
     * At this upper bound batches are effectively
     * almost sequential.
     */
    let hi =
        Math.max(
            lo,
            Math.ceil(
                times.w +
                4 *
                gap
            )
        );

    if (
        peakRamForPeriod(
            hi,
            simulationBatches,
            times,
            actionRam,
            gap
        ) >
        budget
    ) {
        return Infinity;
    }

    /*
     * Binary search smallest safe period.
     */
    while (
        lo < hi
    ) {
        const mid =
            Math.floor(
                (
                    lo +
                    hi
                ) /
                2
            );

        const peak =
            peakRamForPeriod(
                mid,
                simulationBatches,
                times,
                actionRam,
                gap
            );

        if (
            peak <=
            budget
        ) {
            hi =
                mid;
        } else {
            lo =
                mid +
                1;
        }
    }

    return lo;
}


function peakRamForPeriod(
    period,
    batches,
    times,
    actionRam,
    gap
) {
    const events = [];

    for (
        let b = 0;
        b < batches;
        b++
    ) {
        const hFinish =
            b *
            period;

        addRamInterval(
            events,
            hFinish -
                times.h,
            hFinish,
            actionRam.h
        );

        addRamInterval(
            events,
            hFinish +
                gap -
                times.w,
            hFinish +
                gap,
            actionRam.w1
        );

        addRamInterval(
            events,
            hFinish +
                2 *
                gap -
                times.g,
            hFinish +
                2 *
                gap,
            actionRam.g
        );

        addRamInterval(
            events,
            hFinish +
                3 *
                gap -
                times.w,
            hFinish +
                3 *
                gap,
            actionRam.w2
        );
    }

    /*
     * If a worker ends at the exact same millisecond
     * another starts, free RAM first.
     */
    events.sort(
        (a, b) =>
            a.time -
                b.time ||
            a.delta -
                b.delta
    );

    let current = 0;
    let peak = 0;

    for (
        const event
        of events
    ) {
        current +=
            event.delta;

        peak =
            Math.max(
                peak,
                current
            );
    }

    return peak;
}


function addRamInterval(
    events,
    start,
    end,
    ram
) {
    events.push({
        time:
            start,

        delta:
            ram,
    });

    events.push({
        time:
            end,

        delta:
            -ram,
    });
}


// =================================================================
// SECURITY
// =================================================================

function getGrowSecurity(
    ns,
    threads,
    cores
) {
    try {
        return ns.growthAnalyzeSecurity(
            threads,
            undefined,
            cores
        );
    } catch {
        /*
         * v3.0.1 server fortify amount:
         * grow produces 2x the normal fortification.
         *
         * Conservative compatibility fallback.
         */
        return (
            0.004 *
            threads
        );
    }
}


// =================================================================
// TARGET
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
        state.money >=
            state.maxMoney *
            0.999 &&

        state.sec <=
            state.minSec +
            0.05
    );
}


// =================================================================
// PROCESS
// =================================================================

async function waitPids(
    ns,
    pids
) {
    const wanted =
        new Set(
            pids
        );

    while (
        wanted.size >
        0
    ) {
        const running =
            new Set(
                ns.ps("home")
                    .map(
                        (p) =>
                            p.pid
                    )
            );

        for (
            const pid
            of [...wanted]
        ) {
            if (
                !running.has(
                    pid
                )
            ) {
                wanted.delete(
                    pid
                );
            }
        }

        if (
            wanted.size >
            0
        ) {
            await ns.sleep(
                50
            );
        }
    }
}


function killPids(
    ns,
    pids
) {
    for (
        const pid
        of pids
    ) {
        try {
            ns.kill(
                pid
            );
        } catch {
            // gone
        }
    }
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
// HELPERS
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


function fmtRam(
    value
) {
    if (
        value >= 1024
    ) {
        return (
            value /
            1024
        ).toFixed(2) +
            "T";
    }

    return (
        value.toFixed(1) +
        "G"
    );
}


function fmtDuration(
    ms
) {
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
    ).toFixed(2) +
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
        value <
        0
            ? "-"
            : "";

    const abs =
        Math.abs(
            value
        );

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
        "7n8 JIT v0.1"
    );

    ns.tprint("");

    ns.tprint(
        "Dry run:"
    );

    ns.tprint(
        "  run jit.js phantasy --batches 20 --dry-run --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Controlled test:"
    );

    ns.tprint(
        "  run jit.js phantasy --batches 20 --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Larger test:"
    );

    ns.tprint(
        "  run jit.js phantasy --batches 60 --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Defaults:"
    );

    ns.tprint(
        "  pct          = 10%"
    );

    ns.tprint(
        "  gap          = 50ms"
    );

    ns.tprint(
        "  reserve-pct  = 15%"
    );

    ns.tprint(
        "  grow-safety  = 1.05"
    );

    ns.tprint(
        "  HOME ONLY"
    );
}