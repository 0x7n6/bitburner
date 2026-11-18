/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["pct", 0.10],

        // Landing order:
        // H -> W1 -> G -> W2
        ["gap", 200],

        // Keep this fraction of HOME untouched.
        ["reserve-pct", 0.20],

        // Extra grow padding.
        ["grow-safety", 1.05],

        // Worker may be launched this many ms
        // before its nominal start time.
        ["launch-lead", 1000],

        // Compensate controller -> exec -> worker startup latency.
        ["exec-fudge", 50],

        // Initial rolling horizon.
        ["horizon", 60],

        // Append this many whenever horizon drops.
        ["refill", 10],

        // 0 = continuous.
        // Use finite value for testing.
        ["limit", 0],

        // Give newly planned work enough runway.
        ["plan-lead", 2000],

        // RAM scheduler resolution.
        ["search-step", 25],

        ["tail", false],
        ["help", false],
    ]);

    ns.disableLog("ALL");

    const target =
        flags._[0]
            ? String(flags._[0])
            : "";

    const pct =
        clamp(Number(flags.pct) || 0.10, 0.01, 0.40);

    const gap =
        Math.max(100, Number(flags.gap) || 200);

    const reservePct =
        clamp(
            Number(flags["reserve-pct"]) || 0.20,
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
        Math.max(
            250,
            Number(flags["launch-lead"]) || 1000
        );

    const execFudge =
        Math.max(
            0,
            Number(flags["exec-fudge"]) || 50
        );

    const horizon =
        Math.max(
            20,
            Math.floor(
                Number(flags.horizon) || 60
            )
        );

    const refill =
        Math.max(
            1,
            Math.min(
                horizon - 5,
                Math.floor(
                    Number(flags.refill) || 10
                )
            )
        );

    const limit =
        Math.max(
            0,
            Math.floor(
                Number(flags.limit) || 0
            )
        );

    const planLead =
        Math.max(
            500,
            Number(flags["plan-lead"]) || 2000
        );

    const searchStep =
        Math.max(
            10,
            Number(flags["search-step"]) || 25
        );

    if (
        flags.help ||
        !target
    ) {
        printHelp(ns);
        return;
    }

    // ============================================================
    // VALIDATION
    // ============================================================

    if (
        !ns.fileExists(
            "Formulas.exe",
            "home"
        )
    ) {
        ns.tprint(
            "ERROR jit2.js requires Formulas.exe."
        );
        return;
    }

    for (
        const file
        of [
            "lh.js",
            "lg.js",
            "lw.js",
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
        ns.getServerRequiredHackingLevel(target)
    ) {
        ns.tprint(
            `ERROR Hacking level too low for ${target}.`
        );
        return;
    }

    const initialState =
        targetState(ns, target);

    if (!isReady(initialState)) {
        ns.tprint(
            `ERROR ${target} is not READY.`
        );

        ns.tprint(
            `money=${fmtMoney(initialState.money)}/` +
            `${fmtMoney(initialState.maxMoney)} | ` +
            `sec=${initialState.sec.toFixed(3)}/` +
            `${initialState.minSec.toFixed(3)}`
        );

        ns.tprint(
            `Run: harvest.ts ${target} --prep-only --tail`
        );

        return;
    }

    const duplicate =
        ns.ps("home").find(
            (p) =>
                p.filename === "jit2.js" &&
                p.pid !== ns.pid
        );

    if (duplicate) {
        ns.tprint(
            `ERROR jit2.js already running: pid=${duplicate.pid}`
        );
        return;
    }

    if (flags.tail) {
        ns.tail();
    }

    // ============================================================
    // HOME / RAM
    // ============================================================

    const home =
        ns.getServer("home");

    const cores =
        Math.max(
            1,
            Number(home.cpuCores) || 1
        );

    const homeRam =
        ns.getServerMaxRam("home");

    /*
     * This includes jit2.js itself plus any other
     * scripts already running when JIT starts.
     */
    const baseUsedRam =
        ns.getServerUsedRam("home");

    const hardRamLimit =
        homeRam *
        (1 - reservePct);

    const workerBudget =
        Math.max(
            0,
            hardRamLimit -
            baseUsedRam
        );

    const ram = {
        h:
            ns.getScriptRam(
                "lh.js",
                "home"
            ),

        g:
            ns.getScriptRam(
                "lg.js",
                "home"
            ),

        w:
            ns.getScriptRam(
                "lw.js",
                "home"
            ),
    };

    if (
        workerBudget <= 0
    ) {
        ns.tprint(
            "ERROR No HOME worker RAM available."
        );
        return;
    }

    // ============================================================
    // ROLLING STATE
    // ============================================================

    let batches = [];
    let jobs = [];

    const livePids =
        new Set();

    let totalPlanned = 0;
    let totalVerified = 0;

    let nextBatchId = 1;

    let lastHFinish = 0;

    let fatal = false;
    let fatalReason = "";

    const startedAt =
        Date.now();

    const incomeAtStart =
        hackingIncome(ns);

    const startingHack =
        ns.getHackingLevel();

    let lastPidSweep =
        0;

    let lastTelemetryVerified =
        -1;

    ns.atExit(
        () => {
            for (
                const pid
                of livePids
            ) {
                try {
                    ns.kill(pid);
                } catch {
                    // already gone
                }
            }
        },
        "jit2-cleanup"
    );

    // ============================================================
    // PLANNER
    // ============================================================

    function appendBatches(count) {
        if (count <= 0) {
            return true;
        }

        const model =
            makeModel(
                ns,
                target,
                pct,
                growSafety,
                cores,
                ram
            );

        if (!model) {
            fatal = true;
            fatalReason =
                "Unable to calculate fresh batch model.";
            return false;
        }

        const hackLevel =
            ns.getHackingLevel();

        let firstPeriod = null;
        let finalPeriod = null;

        for (
            let i = 0;
            i < count;
            i++
        ) {
            const now =
                Date.now();

            /*
             * Ensure newly appended batch has enough runway
             * for the longest action (weaken).
             */
            const runwayFloor =
                now +
                planLead +
                model.times.w +
                launchLead;

            let candidate =
                lastHFinish > 0
                    ? Math.max(
                        lastHFinish +
                            4 * gap,
                        runwayFloor
                    )
                    : runwayFloor;

            const previousFinish =
                lastHFinish;

            const found =
                findEarliestFit(
                    candidate,
                    batches,
                    model,
                    workerBudget,
                    gap,
                    launchLead,
                    searchStep,
                    now
                );

            if (
                !Number.isFinite(found)
            ) {
                fatal = true;
                fatalReason =
                    "RAM scheduler could not place next batch.";
                return false;
            }

            const batch =
                buildBatch(
                    nextBatchId,
                    found,
                    model,
                    gap,
                    launchLead
                );

            batches.push(batch);

            for (
                const job
                of batch.jobs
            ) {
                jobs.push(job);
            }

            if (
                previousFinish > 0
            ) {
                const period =
                    found -
                    previousFinish;

                if (
                    firstPeriod === null
                ) {
                    firstPeriod =
                        period;
                }

                finalPeriod =
                    period;
            }

            lastHFinish =
                found;

            totalPlanned++;
            nextBatchId++;
        }

        jobs.sort(
            (a, b) =>
                a.earliestLaunch -
                    b.earliestLaunch ||
                a.finishAt -
                    b.finishAt
        );

        const future =
            totalPlanned -
            totalVerified;

        ns.print(
            `====================================================`
        );

        ns.print(
            `[PLAN] Hack=${hackLevel} | ` +
            `+${count} batches | ` +
            `future=${future}`
        );

        ns.print(
            `[PLAN] H=${model.h} ` +
            `W1=${model.w1} ` +
            `G=${model.g} ` +
            `W2=${model.w2} | ` +
            `take=${(
                model.take *
                100
            ).toFixed(2)}% | ` +
            `chance=${(
                model.chance *
                100
            ).toFixed(1)}%`
        );

        ns.print(
            `[PLAN] batchRAM=${fmtRam(
                model.batchRam
            )} | ` +
            `EV=${fmtMoney(
                model.expectedBatch
            )}/batch`
        );

        if (
            firstPeriod !== null
        ) {
            ns.print(
                `[PLAN] placement≈` +
                `${firstPeriod.toFixed(0)}-` +
                `${finalPeriod.toFixed(0)}ms`
            );
        }

        ns.print(
            `====================================================`
        );

        return true;
    }

    // ============================================================
    // INITIAL HORIZON
    // ============================================================

    const initialCount =
        limit > 0
            ? Math.min(
                horizon,
                limit
            )
            : horizon;

    if (
        !appendBatches(initialCount)
    ) {
        ns.tprint(
            `ERROR ${fatalReason}`
        );
        return;
    }

    ns.tprint(
        `7n8 JIT v0.2 ROLLING | target=${target}`
    );

    ns.tprint(
        `HOME=${fmtRam(homeRam)} | ` +
        `cores=${cores} | ` +
        `workerBudget=${fmtRam(workerBudget)} | ` +
        `reserve=${(
            reservePct *
            100
        ).toFixed(0)}%`
    );

    ns.tprint(
        `gap=${gap}ms | ` +
        `launchLead=${launchLead}ms | ` +
        `horizon=${horizon} | ` +
        `refill=${refill} | ` +
        `limit=${limit === 0 ? "∞" : limit}`
    );

    // ============================================================
    // ROLLING EXECUTION LOOP
    // ============================================================

    while (!fatal) {
        const now =
            Date.now();

        // --------------------------------------------------------
        // CLEAN FINISHED PID SET
        // --------------------------------------------------------

        if (
            now -
                lastPidSweep >=
            1000
        ) {
            const running =
                new Set(
                    ns.ps("home").map(
                        (p) =>
                            p.pid
                    )
                );

            for (
                const pid
                of [...livePids]
            ) {
                if (
                    !running.has(pid)
                ) {
                    livePids.delete(pid);
                }
            }

            lastPidSweep =
                now;
        }

        // --------------------------------------------------------
        // VERIFY COMPLETED BATCHES
        // --------------------------------------------------------

        for (
            const batch
            of batches
        ) {
            if (
                batch.verified ||
                now <
                    batch.verifyStart
            ) {
                continue;
            }

            const state =
                targetState(
                    ns,
                    target
                );

            /*
            * READY found inside the clean window.
            */
            if (isReady(state)) {
                batch.verified =
                    true;

                totalVerified++;

                continue;
            }

            /*
            * W2 may be a few milliseconds late.
            *
            * Keep polling while we are still safely
            * BEFORE the earliest possible H of the
            * next batch.
            */
            if (
                now <
                batch.verifyDeadline
            ) {
                continue;
            }

            /*
            * We exhausted the clean verification window
            * and never observed READY.
            *
            * This is now actual drift, not a transient
            * state from the next batch.
            */
            fatal = true;

            fatalReason =
                `Batch B${batch.id} failed clean window: ` +
                `money=${(
                    state.money /
                    state.maxMoney *
                    100
                ).toFixed(3)}% ` +
                `sec=${state.sec.toFixed(3)}/` +
                `${state.minSec.toFixed(3)} | ` +
                `window=${(
                    batch.verifyDeadline -
                    batch.verifyStart
                ).toFixed(0)}ms`;

            break;
        }

            

        if (fatal) {
            break;
        }

        // --------------------------------------------------------
        // TELEMETRY
        // --------------------------------------------------------

        if (
            totalVerified > 0 &&
            totalVerified !==
                lastTelemetryVerified &&
            totalVerified %
                refill ===
                0
        ) {
            lastTelemetryVerified =
                totalVerified;

            const elapsed =
                Date.now() -
                startedAt;

            const income =
                hackingIncome(ns) -
                incomeAtStart;

            const rate =
                income /
                Math.max(
                    1,
                    elapsed /
                    1000
                );

            ns.print(
                `[ROLL] verified=${totalVerified} | ` +
                `planned=${totalPlanned} | ` +
                `future=${totalPlanned - totalVerified} | ` +
                `Hack=${ns.getHackingLevel()}`
            );

            ns.print(
                `[ROLL] income=${fmtMoney(income)} | ` +
                `REAL=${fmtMoney(rate)}/s | ` +
                `live=${livePids.size}`
            );
        }

        // --------------------------------------------------------
        // REFILL HORIZON
        // --------------------------------------------------------

        const remainingFuture =
            totalPlanned -
            totalVerified;

        const refillThreshold =
            horizon -
            refill;

        const canPlanMore =
            limit === 0 ||
            totalPlanned <
                limit;

        if (
            canPlanMore &&
            remainingFuture <=
                refillThreshold
        ) {
            let count =
                refill;

            if (
                limit > 0
            ) {
                count =
                    Math.min(
                        count,
                        limit -
                            totalPlanned
                    );
            }

            if (
                count > 0 &&
                !appendBatches(count)
            ) {
                break;
            }
        }

        // --------------------------------------------------------
        // FINITE TEST COMPLETE
        // --------------------------------------------------------

        if (
            limit > 0 &&
            totalVerified >=
                limit
        ) {
            break;
        }

        // --------------------------------------------------------
        // LAUNCH DUE JOBS
        // --------------------------------------------------------

        for (
            const job
            of jobs
        ) {
            if (
                job.launched
            ) {
                continue;
            }

            if (
                job.earliestLaunch >
                now
            ) {
                /*
                 * Sorted by earliestLaunch.
                 */
                break;
            }

            const sec =
                ns.getServerSecurityLevel(
                    target
                );

            const minSec =
                ns.getServerMinSecurityLevel(
                    target
                );

            const clean =
                sec <=
                minSec +
                    0.001;

            /*
             * We deliberately want HGW functions to be
             * CALLED while security is at minimum.
             *
             * Their execution time is determined at call time.
             */
            if (!clean) {
                if (
                    now >=
                    job.modelStart
                ) {
                    fatal = true;

                    fatalReason =
                        `${job.tag} reached nominal start ` +
                        `while security=${sec.toFixed(3)} ` +
                        `(min=${minSec.toFixed(3)})`;
                }

                break;
            }

            const duration =
                currentDuration(
                    ns,
                    target,
                    job.action
                );

            const extra =
                job.finishAt -
                Date.now() -
                duration -
                execFudge;

            if (
                extra < 0
            ) {
                fatal = true;

                fatalReason =
                    `${job.tag} missed finish deadline ` +
                    `by ${Math.abs(extra).toFixed(0)}ms`;

                break;
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
                /*
                 * RAM might free in a few milliseconds.
                 * Only abort if we're already at nominal start.
                 */
                if (
                    Date.now() >=
                    job.modelStart
                ) {
                    fatal = true;

                    fatalReason =
                        `${job.tag} RAM collision: ` +
                        `need=${fmtRam(job.ram)} ` +
                        `free=${fmtRam(freeRam)}`;

                    break;
                }

                break;
            }

            const pid =
                ns.exec(
                    job.script,
                    "home",
                    job.threads,

                    target,
                    Math.max(
                        0,
                        Math.floor(extra)
                    ),

                    job.tag
                );

            if (
                pid === 0
            ) {
                fatal = true;

                fatalReason =
                    `exec failed: ${job.tag}`;

                break;
            }

            job.launched =
                true;

            job.pid =
                pid;

            livePids.add(pid);
        }

        if (fatal) {
            break;
        }

        // --------------------------------------------------------
        // MEMORY PRUNE
        // --------------------------------------------------------

        if (
            totalVerified > 0
        ) {
            batches =
                batches.filter(
                    (batch) =>
                        !batch.verified ||
                        batch.verifyDeadline >
                            now -
                                5000
                );

            jobs =
                jobs.filter(
                    (job) =>
                        !job.launched ||
                        job.finishAt >
                            now -
                                5000
                );
        }

        await ns.sleep(10);
    }

    // ============================================================
    // FAILURE
    // ============================================================

    if (fatal) {
        ns.tprint("");

        ns.tprint(
            `JIT2 ABORT: ${fatalReason}`
        );

        for (
            const pid
            of livePids
        ) {
            try {
                ns.kill(pid);
            } catch {
                // gone
            }
        }

        ns.tprint(
            `Recover with: ` +
            `run harvest.ts ${target} --prep-only --tail`
        );

        return;
    }

    // ============================================================
    // FINITE TEST COMPLETE
    // ============================================================

    /*
     * Let PID bookkeeping settle.
     */
    await ns.sleep(500);

    const final =
        targetState(
            ns,
            target
        );

    const elapsed =
        Date.now() -
        startedAt;

    const income =
        hackingIncome(ns) -
        incomeAtStart;

    const rate =
        income /
        Math.max(
            1,
            elapsed /
                1000
        );

    ns.tprint("");

    ns.tprint(
        `JIT2 COMPLETE | ` +
        `verified=${totalVerified}/${totalPlanned} | ` +
        `runtime=${fmtDuration(elapsed)}`
    );

    ns.tprint(
        `Hack=${startingHack}->${ns.getHackingLevel()} | ` +
        `hacking-income=${fmtMoney(income)} | ` +
        `REAL=${fmtMoney(rate)}/s`
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
            `JIT2 PASS: rolling scheduler returned target READY.`
        );
    } else {
        ns.tprint(
            `JIT2 DRIFT.`
        );
    }
}


// =================================================================
// FRESH FORMULAS MODEL
// =================================================================

function makeModel(
    ns,
    target,
    pct,
    growSafety,
    cores,
    ram
) {
    const player =
        ns.getPlayer();

    const server =
        ns.getServer(target);

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
        !Number.isFinite(chance)
    ) {
        return null;
    }

    const h =
        Math.max(
            1,
            Math.floor(
                pct /
                hackPct
            )
        );

    const take =
        h *
        hackPct;

    if (
        take <= 0 ||
        take >= 0.90
    ) {
        return null;
    }

    const weakenEffect =
        ns.formulas.hacking.weakenEffect(
            1,
            cores
        );

    const hackSec =
        ns.hackAnalyzeSecurity(
            h,
            target
        );

    const w1 =
        Math.max(
            1,
            Math.ceil(
                hackSec /
                weakenEffect
            )
        );

    const afterHack = {
        ...server,

        moneyAvailable:
            Math.max(
                1,
                server.moneyMax *
                    (1 - take)
            ),

        hackDifficulty:
            server.minDifficulty,
    };

    let g =
        ns.formulas.hacking.growThreads(
            afterHack,
            player,
            server.moneyMax,
            cores
        );

    if (
        !Number.isFinite(g) ||
        g <= 0
    ) {
        return null;
    }

    g =
        Math.max(
            1,
            Math.ceil(
                g *
                growSafety
            )
        );

    /*
     * Do NOT pass target hostname here.
     *
     * If hostname is supplied while target is currently
     * at max money, growthAnalyzeSecurity can clamp against
     * current state. We want security for the planned grow.
     */
    const growSec =
        ns.growthAnalyzeSecurity(
            g,
            undefined,
            cores
        );

    const w2 =
        Math.max(
            1,
            Math.ceil(
                growSec /
                weakenEffect
            )
        );

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

    const actionRam = {
        h:
            h *
            ram.h,

        w1:
            w1 *
            ram.w,

        g:
            g *
            ram.g,

        w2:
            w2 *
            ram.w,
    };

    const batchRam =
        actionRam.h +
        actionRam.w1 +
        actionRam.g +
        actionRam.w2;

    const expectedBatch =
        server.moneyMax *
        take *
        chance;

    return {
        h,
        w1,
        g,
        w2,

        take,
        chance,

        times,
        actionRam,
        batchRam,
        expectedBatch,
    };
}


// =================================================================
// BUILD ONE BATCH
// =================================================================

function buildBatch(
    id,
    hFinish,
    model,
    gap,
    launchLead
) {
    const h =
        makeJob(
            id,
            "H",
            "lh.js",
            model.h,
            model.actionRam.h,

            hFinish,
            model.times.h,
            launchLead
        );

    const w1 =
        makeJob(
            id,
            "W1",
            "lw.js",
            model.w1,
            model.actionRam.w1,

            hFinish +
                gap,
            model.times.w,
            launchLead
        );

    const g =
        makeJob(
            id,
            "G",
            "lg.js",
            model.g,
            model.actionRam.g,

            hFinish +
                2 * gap,
            model.times.g,
            launchLead
        );

    const w2 =
        makeJob(
            id,
            "W2",
            "lw.js",
            model.w2,
            model.actionRam.w2,

            hFinish +
                3 * gap,
            model.times.w,
            launchLead
        );

    const jobs =
        [
            h,
            w1,
            g,
            w2,
        ];

    /*
     * Worst-case worker RAM occupancy.
     * Worker may launch launchLead early.
     */
    const intervals =
        jobs.map(
            (job) => ({
                start:
                    job.earliestLaunch,

                end:
                    job.finishAt +
                    100,

                ram:
                    job.ram,
            })
        );

    return {
        id,

        hFinish,

        w2Finish:
            w2.finishAt,

        verifyStart:
            w2.finishAt +
            Math.max(
                25,
                Math.floor(
                    gap * 0.20
                )
            ),

        verifyDeadline:
            hFinish +
            4 * gap -
            Math.max(
                25,
                Math.floor(
                    gap * 0.20
                )
            ),

        jobs,
        intervals,

        verified:
            false,
    };
}


function makeJob(
    batchId,
    action,
    script,
    threads,
    ram,
    finishAt,
    duration,
    launchLead
) {
    const modelStart =
        finishAt -
        duration;

    return {
        batchId,
        action,
        script,
        threads,
        ram,

        finishAt,
        modelStart,

        earliestLaunch:
            modelStart -
            launchLead,

        tag:
            `JIT2:B${batchId}:${action}`,

        launched:
            false,

        pid:
            0,
    };
}


// =================================================================
// RAM-AWARE PLACEMENT
// =================================================================

function findEarliestFit(
    initialFinish,
    existingBatches,
    model,
    budget,
    gap,
    launchLead,
    searchStep,
    now
) {
    let candidate =
        initialFinish;

    const existing =
        [];

    for (
        const batch
        of existingBatches
    ) {
        for (
            const interval
            of batch.intervals
        ) {
            if (
                interval.end >
                now
            ) {
                existing.push(interval);
            }
        }
    }

    /*
     * 5 minutes of search is more than enough.
     * If this fails, something is fundamentally wrong.
     */
    const maxFinish =
        initialFinish +
        5 * 60 * 1000;

    while (
        candidate <=
        maxFinish
    ) {
        const temp =
            buildBatch(
                -1,
                candidate,
                model,
                gap,
                launchLead
            );

        const peak =
            peakRam(
                existing,
                temp.intervals
            );

        if (
            peak <=
            budget +
                1e-6
        ) {
            return candidate;
        }

        candidate +=
            searchStep;
    }

    return Infinity;
}


function peakRam(
    existing,
    candidate
) {
    const events = [];

    for (
        const interval
        of [
            ...existing,
            ...candidate,
        ]
    ) {
        events.push({
            time:
                interval.start,

            delta:
                interval.ram,
        });

        events.push({
            time:
                interval.end,

            delta:
                -interval.ram,
        });
    }

    /*
     * When one interval ends exactly when another begins,
     * free memory first.
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


// =================================================================
// CURRENT DURATION
// =================================================================

function currentDuration(
    ns,
    target,
    action
) {
    if (
        action === "H"
    ) {
        return ns.getHackTime(
            target
        );
    }

    if (
        action === "G"
    ) {
        return ns.getGrowTime(
            target
        );
    }

    return ns.getWeakenTime(
        target
    );
}


// =================================================================
// TARGET
// =================================================================

function targetState(
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
// INCOME
// =================================================================

function hackingIncome(ns) {
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


function fmtRam(value) {
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


function fmtDuration(ms) {
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


function fmtMoney(value) {
    if (
        !Number.isFinite(value)
    ) {
        return "-";
    }

    const sign =
        value < 0
            ? "-"
            : "";

    const abs =
        Math.abs(value);

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

function printHelp(ns) {
    ns.tprint(
        "7n8 JIT v0.2 ROLLING"
    );

    ns.tprint("");

    ns.tprint(
        "Controlled rolling test:"
    );

    ns.tprint(
        "  run jit2.js phantasy --limit 120 --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Larger rolling test:"
    );

    ns.tprint(
        "  run jit2.js phantasy --limit 240 --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Continuous:"
    );

    ns.tprint(
        "  run jit2.js phantasy --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Defaults:"
    );

    ns.tprint(
        "  gap          = 200ms"
    );

    ns.tprint(
        "  reserve      = 20%"
    );

    ns.tprint(
        "  horizon      = 60 batches"
    );

    ns.tprint(
        "  refill       = 10 batches"
    );

    ns.tprint(
        "  launch-lead  = 1000ms"
    );
}