/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["pct", 0.10],
        ["gap", 500],
        ["lead", 2000],

        // RAM that farm may NOT consume.
        ["reserve", 32],
        ["reserve-pct", 0.10],

        ["grow-safety", 1.03],
        ["max-batches", 128],

        ["no-home", false],
        ["dry-run", false],
        ["tail", false],
        ["help", false],
    ]);

    ns.disableLog("ALL");

    const target =
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

    const useHome =
        !Boolean(flags["no-home"]);

    const dryRun =
        Boolean(flags["dry-run"]);

    const H = "h.js";
    const G = "g.js";
    const W = "w.js";

    const workerFiles = [
        H,
        G,
        W,
    ];

    // ------------------------------------------------------------
    // HELP
    // ------------------------------------------------------------

    if (
        flags.help ||
        !target
    ) {
        printHelp(ns);
        return;
    }

    // ------------------------------------------------------------
    // VALIDATION
    // ------------------------------------------------------------

    if (
        !ns.fileExists(
            "Formulas.exe",
            "home"
        )
    ) {
        ns.tprint(
            "ERROR shotgun-auto.js requires Formulas.exe."
        );

        ns.tprint(
            "Use shotgun.js as fallback."
        );

        return;
    }

    if (
        !ns.serverExists(target)
    ) {
        ns.tprint(
            `ERROR Unknown target: ${target}`
        );
        return;
    }

    if (
        !ns.hasRootAccess(target)
    ) {
        ns.tprint(
            `ERROR No root on ${target}.`
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
            `ERROR Hacking level too low for ${target}.`
        );
        return;
    }

    if (
        ns.getServerMaxMoney(target) <= 0
    ) {
        ns.tprint(
            `ERROR ${target} is not a money server.`
        );
        return;
    }

    for (const file of workerFiles) {
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

    if (flags.tail) {
        ns.tail();
    }

    // ------------------------------------------------------------
    // TARGET MUST BE READY
    // ------------------------------------------------------------

    const initial =
        getTargetState(
            ns,
            target
        );

    if (!isReady(initial)) {
        ns.tprint(
            `ERROR ${target} is not READY.`
        );

        ns.tprint(
            `money=${fmtMoney(initial.money)}/` +
            `${fmtMoney(initial.maxMoney)} | ` +
            `sec=${initial.sec.toFixed(3)}/` +
            `${initial.minSec.toFixed(3)}`
        );

        ns.tprint(
            `Run: harvest.ts ${target} --prep-only`
        );

        return;
    }

    // ------------------------------------------------------------
    // NETWORK / DEPLOYMENT
    // ------------------------------------------------------------

    const hosts =
        scanAll(ns);

    deployWorkers(
        ns,
        hosts,
        workerFiles
    );

    const workers =
        collectWorkers(
            ns,
            hosts,
            workerFiles,
            {
                useHome,
                homeReserve,
            }
        );

    if (
        workers.length === 0
    ) {
        ns.tprint(
            "ERROR No usable workers."
        );
        return;
    }

    const ram = {
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

    // ------------------------------------------------------------
    // EXACT PREPPED FORMULAS
    // ------------------------------------------------------------

    const player =
        ns.getPlayer();

    const prepped =
        ns.getServer(target);

    prepped.moneyAvailable =
        prepped.moneyMax;

    prepped.hackDifficulty =
        prepped.minDifficulty;

    const hackPct =
        ns.formulas.hacking.hackPercent(
            prepped,
            player
        );

    const chance =
        ns.formulas.hacking.hackChance(
            prepped,
            player
        );

    const desiredHackThreads =
        Math.max(
            1,
            Math.floor(
                pct /
                hackPct
            )
        );

    const actualTake =
        desiredHackThreads *
        hackPct;

    if (
        actualTake <= 0 ||
        actualTake >= 0.90
    ) {
        ns.tprint(
            "ERROR Invalid hack percentage."
        );
        return;
    }

    // ------------------------------------------------------------
    // RAM BUDGET
    // ------------------------------------------------------------

    const totalFree =
        workers.reduce(
            (sum, worker) =>
                sum +
                worker.freeRam,
            0
        );

    /*
     * Example:
     *
     * totalFree     6.88 TB
     * reservePct    10%
     *
     * farmBudget ~ 6.19 TB
     */
    const farmBudget =
        totalFree *
        (1 - reservePct);

    let pool =
        createPool(
            workers
        );

    const batches = [];

    let committedRam = 0;

    let stopReason =
        "max-batches limit";

    // ============================================================
    // AUTO CAPACITY SEARCH
    // ============================================================

    for (
        let i = 0;
        i < maxBatches;
        i++
    ) {
        const result =
            planFullBatch(
                ns,
                target,
                player,
                pool,
                ram,
                desiredHackThreads,
                hackPct,
                chance,
                growSafety
            );

        /*
         * STRICT MODE:
         *
         * If another FULL 10% batch does not fit,
         * STOP.
         *
         * We DO NOT reduce H threads.
         */
        if (!result) {
            stopReason =
                "next full batch does not fit";

            break;
        }

        if (
            committedRam +
            result.batch.batchRam >
            farmBudget
        ) {
            stopReason =
                `RAM safety reserve reached`;

            break;
        }

        committedRam +=
            result.batch.batchRam;

        batches.push(
            result.batch
        );

        pool =
            result.pool;
    }

    if (
        batches.length === 0
    ) {
        ns.tprint(
            "ERROR Not enough RAM for one full batch."
        );
        return;
    }

    // ------------------------------------------------------------
    // TIMING
    // ------------------------------------------------------------

    const timing = {
        hackTime:
            ns.formulas.hacking.hackTime(
                prepped,
                player
            ),

        growTime:
            ns.formulas.hacking.growTime(
                prepped,
                player
            ),

        weakenTime:
            ns.formulas.hacking.weakenTime(
                prepped,
                player
            ),
    };

    const batchSpacing =
        4 *
        gap;

    const jobs = [];

    for (
        let batchIndex = 0;
        batchIndex <
        batches.length;
        batchIndex++
    ) {
        const batch =
            batches[batchIndex];

        const offset =
            batchIndex *
            batchSpacing;

        addJobs(
            jobs,
            batchIndex,
            "H",
            H,
            batch.hack.assignments,
            timing.hackTime,
            offset
        );

        addJobs(
            jobs,
            batchIndex,
            "W1",
            W,
            batch.w1.assignments,
            timing.weakenTime,
            offset + gap
        );

        addJobs(
            jobs,
            batchIndex,
            "G",
            G,
            batch.grow.assignments,
            timing.growTime,
            offset + 2 * gap
        );

        addJobs(
            jobs,
            batchIndex,
            "W2",
            W,
            batch.w2.assignments,
            timing.weakenTime,
            offset + 3 * gap
        );
    }

    jobs.sort(
        (a, b) =>
            a.finishOffset -
            b.finishOffset
    );

    const expectedWave =
        batches.reduce(
            (sum, batch) =>
                sum +
                batch.expectedMoney,
            0
        );

    // ------------------------------------------------------------
    // PLAN OUTPUT
    // ------------------------------------------------------------

    ns.tprint(
        `7n8 SHOTGUN AUTO v2.1`
    );

    ns.tprint(
        `target=${target} | ` +
        `Hack=${ns.getHackingLevel()} | ` +
        `Formulas=YES`
    );

    ns.tprint(
        `full batches=${batches.length} | ` +
        `H=${desiredHackThreads} | ` +
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
        `free=${fmtRam(totalFree)} | ` +
        `budget=${fmtRam(farmBudget)} | ` +
        `waveRAM≈${fmtRam(committedRam)} | ` +
        `reserve=${(
            reservePct *
            100
        ).toFixed(0)}%`
    );

    ns.tprint(
        `EV≈${fmtMoney(expectedWave)} / wave`
    );

    ns.tprint(
        `times H=${fmtTime(
            timing.hackTime
        )} | ` +
        `G=${fmtTime(
            timing.growTime
        )} | ` +
        `W=${fmtTime(
            timing.weakenTime
        )}`
    );

    ns.tprint(
        `capacity stop: ${stopReason}`
    );

    ns.tprint("");

    // First few batches.
    const preview =
        Math.min(
            5,
            batches.length
        );

    for (
        let i = 0;
        i < preview;
        i++
    ) {
        printBatchLine(
            ns,
            i,
            batches[i]
        );
    }

    if (
        batches.length >
        10
    ) {
        ns.tprint(
            "..."
        );
    }

    // Last few batches.
    const lastStart =
        Math.max(
            preview,
            batches.length - 5
        );

    for (
        let i = lastStart;
        i < batches.length;
        i++
    ) {
        printBatchLine(
            ns,
            i,
            batches[i]
        );
    }

    if (dryRun) {
        ns.tprint("");

        ns.tprint(
            `DRY RUN PASS: ` +
            `${batches.length} FULL batch(es) fit safely.`
        );

        return;
    }

    // ============================================================
    // PROCESS CLEANUP GUARD
    // ============================================================

    const processes = [];

    ns.atExit(
        () => {
            for (
                const process
                of processes
            ) {
                try {
                    ns.kill(
                        process.pid
                    );
                } catch {
                    // Already finished.
                }
            }
        },
        "shotgun-auto-cleanup"
    );

    // ============================================================
    // LAUNCH
    // ============================================================

    const waveEpoch =
        Date.now();

    const commonFinishBase =
        waveEpoch +
        lead +
        timing.weakenTime;

    for (
        let i = 0;
        i < jobs.length;
        i++
    ) {
        const job =
            jobs[i];

        const desiredFinish =
            commonFinishBase +
            job.finishOffset;

        const delay =
            Math.floor(
                desiredFinish -
                Date.now() -
                job.baseDuration
            );

        if (
            delay < 0
        ) {
            ns.tprint(
                `ERROR Timing deadline missed: ` +
                `B${job.batchIndex + 1}:${job.action}`
            );

            killProcesses(
                ns,
                processes
            );

            return;
        }

        const pid =
            ns.exec(
                job.script,
                job.host,
                job.threads,

                target,
                delay,

                `auto:${ns.pid}:` +
                `B${job.batchIndex + 1}:` +
                `${job.action}:${i}`
            );

        if (
            pid === 0
        ) {
            ns.tprint(
                `ERROR exec failed: ` +
                `B${job.batchIndex + 1}:${job.action} ` +
                `@${job.host} x${job.threads}`
            );

            killProcesses(
                ns,
                processes
            );

            return;
        }

        processes.push({
            pid,
            host:
                job.host,
        });
    }

    ns.tprint("");

    ns.tprint(
        `LAUNCHED ${batches.length} FULL batches / ` +
        `${processes.length} processes.`
    );

    // ------------------------------------------------------------
    // WAIT
    // ------------------------------------------------------------

    await waitForProcesses(
        ns,
        processes
    );

    await ns.sleep(
        Math.max(
            250,
            gap
        )
    );

    // ------------------------------------------------------------
    // VERIFY
    // ------------------------------------------------------------

    const final =
        getTargetState(
            ns,
            target
        );

    ns.tprint(
        `WAVE COMPLETE | ` +
        `money=${fmtMoney(
            final.money
        )}/${fmtMoney(
            final.maxMoney
        )} ` +
        `(${(
            final.money /
            final.maxMoney *
            100
        ).toFixed(3)}%) | ` +
        `sec=${final.sec.toFixed(
            3
        )}/${final.minSec.toFixed(
            3
        )}`
    );

    if (isReady(final)) {
        ns.tprint(
            `AUTO SHOTGUN PASS: ` +
            `${batches.length}/${batches.length} ` +
            `FULL batches landed.`
        );
    } else {
        ns.tprint(
            `AUTO SHOTGUN DRIFT.`
        );

        ns.tprint(
            `Recover: run harvest.ts ${target} --prep-only`
        );
    }
}


// =================================================================
// STRICT FULL BATCH
// =================================================================

function planFullBatch(
    ns,
    target,
    player,
    originalPool,
    ram,
    hThreads,
    hackPct,
    chance,
    growSafety
) {
    const pool =
        clonePool(
            originalPool
        );

    const actualTake =
        hThreads *
        hackPct;

    // ------------------------------------------------------------
    // HACK
    // ------------------------------------------------------------

    const hack =
        allocateHack(
            pool,
            hThreads,
            ram.h
        );

    if (!hack.complete) {
        return null;
    }

    const hackSecurity =
        ns.hackAnalyzeSecurity(
            hThreads
        );

    // ------------------------------------------------------------
    // W1
    // ------------------------------------------------------------

    const w1 =
        allocateWeaken(
            ns,
            pool,
            hackSecurity,
            ram.w
        );

    if (!w1.complete) {
        return null;
    }

    // ------------------------------------------------------------
    // GROW
    // ------------------------------------------------------------

    const afterHack =
        ns.getServer(
            target
        );

    afterHack.hackDifficulty =
        afterHack.minDifficulty;

    afterHack.moneyAvailable =
        Math.max(
            1,
            afterHack.moneyMax *
            (1 - actualTake)
        );

    const grow =
        allocateGrowExact(
            ns,
            player,
            afterHack,
            pool,
            ram.g,
            growSafety
        );

    if (!grow.complete) {
        return null;
    }

    // ------------------------------------------------------------
    // W2
    // ------------------------------------------------------------

    const growSecurity =
        ns.growthAnalyzeSecurity(
            grow.threads
        );

    const w2 =
        allocateWeaken(
            ns,
            pool,
            growSecurity,
            ram.w
        );

    if (!w2.complete) {
        return null;
    }

    const batchRam =
        allocationRam(
            hack.assignments,
            ram.h
        ) +
        allocationRam(
            w1.assignments,
            ram.w
        ) +
        allocationRam(
            grow.assignments,
            ram.g
        ) +
        allocationRam(
            w2.assignments,
            ram.w
        );

    const expectedMoney =
        afterHack.moneyMax *
        actualTake *
        chance;

    return {
        pool,

        batch: {
            hThreads,
            actualTake,
            chance,

            hack,
            w1,
            grow,
            w2,

            batchRam,
            expectedMoney,
        },
    };
}


// =================================================================
// HACK ALLOCATION
// =================================================================

function allocateHack(
    pool,
    wantedThreads,
    scriptRam
) {
    // Prefer low-core host.
    const candidates =
        [...pool]
            .filter(
                (worker) =>
                    Math.floor(
                        worker.remainingRam /
                        scriptRam
                    ) >=
                    wantedThreads
            )
            .sort(
                (a, b) =>
                    a.cores -
                        b.cores ||
                    b.remainingRam -
                        a.remainingRam
            );

    if (
        candidates.length > 0
    ) {
        const worker =
            candidates[0];

        worker.remainingRam -=
            wantedThreads *
            scriptRam;

        return {
            complete:
                true,

            threads:
                wantedThreads,

            assignments: [
                {
                    host:
                        worker.host,

                    threads:
                        wantedThreads,
                },
            ],
        };
    }

    // Fallback split, but NEVER lower H count.
    let remaining =
        wantedThreads;

    const assignments = [];

    const sorted =
        [...pool].sort(
            (a, b) =>
                a.cores -
                    b.cores ||
                b.remainingRam -
                    a.remainingRam
        );

    for (
        const worker
        of sorted
    ) {
        if (
            remaining <= 0
        ) {
            break;
        }

        const capacity =
            Math.floor(
                worker.remainingRam /
                scriptRam
            );

        if (
            capacity <= 0
        ) {
            continue;
        }

        const use =
            Math.min(
                remaining,
                capacity
            );

        worker.remainingRam -=
            use *
            scriptRam;

        assignments.push({
            host:
                worker.host,

            threads:
                use,
        });

        remaining -= use;
    }

    return {
        complete:
            remaining === 0,

        threads:
            wantedThreads -
            remaining,

        assignments,
    };
}


// =================================================================
// EXACT / CORE-AWARE GROW
// =================================================================

function allocateGrowExact(
    ns,
    player,
    serverAfterHack,
    pool,
    scriptRam,
    safety
) {
    const sim = {
        ...serverAfterHack,
    };

    const targetMoney =
        sim.moneyMax;

    let threads = 0;

    const assignments = [];

    const sorted =
        [...pool].sort(
            (a, b) =>
                b.cores -
                    a.cores ||
                b.remainingRam -
                    a.remainingRam
        );

    for (
        const worker
        of sorted
    ) {
        if (
            sim.moneyAvailable >=
            targetMoney *
            0.999999
        ) {
            break;
        }

        const capacity =
            Math.floor(
                worker.remainingRam /
                scriptRam
            );

        if (
            capacity <= 0
        ) {
            continue;
        }

        let needed =
            ns.formulas.hacking.growThreads(
                sim,
                player,
                targetMoney,
                worker.cores
            );

        if (
            !Number.isFinite(
                needed
            ) ||
            needed <= 0
        ) {
            continue;
        }

        needed =
            Math.max(
                1,
                Math.ceil(
                    needed *
                    safety
                )
            );

        const use =
            Math.min(
                capacity,
                needed
            );

        worker.remainingRam -=
            use *
            scriptRam;

        assignments.push({
            host:
                worker.host,

            threads:
                use,
        });

        threads += use;

        /*
         * Simulate this chunk finishing.
         *
         * Formulas growAmount uses:
         * - current simulated money
         * - player
         * - thread count
         * - CPU cores
         */
        sim.moneyAvailable =
            Math.min(
                targetMoney,
                ns.formulas.hacking.growAmount(
                    sim,
                    player,
                    use,
                    worker.cores
                )
            );

        /*
         * Conservative:
         * later split-G chunks are simulated
         * after security generated by earlier chunks.
         */
        sim.hackDifficulty +=
            ns.growthAnalyzeSecurity(
                use
            );
    }

    return {
        complete:
            sim.moneyAvailable >=
            targetMoney *
            0.999,

        threads,
        assignments,

        finalMoney:
            sim.moneyAvailable,
    };
}


// =================================================================
// WEAKEN
// =================================================================

function allocateWeaken(
    ns,
    pool,
    securityNeeded,
    scriptRam
) {
    let remaining =
        Math.max(
            0,
            securityNeeded
        );

    let threads = 0;

    const assignments = [];

    const sorted =
        [...pool].sort(
            (a, b) =>
                b.cores -
                    a.cores ||
                b.remainingRam -
                    a.remainingRam
        );

    for (
        const worker
        of sorted
    ) {
        if (
            remaining <=
            1e-9
        ) {
            break;
        }

        const capacity =
            Math.floor(
                worker.remainingRam /
                scriptRam
            );

        if (
            capacity <= 0
        ) {
            continue;
        }

        const effect =
            ns.formulas.hacking.weakenEffect(
                1,
                worker.cores
            );

        const needed =
            Math.ceil(
                remaining /
                effect
            );

        const use =
            Math.min(
                capacity,
                needed
            );

        worker.remainingRam -=
            use *
            scriptRam;

        assignments.push({
            host:
                worker.host,

            threads:
                use,
        });

        threads += use;

        remaining -=
            use *
            effect;
    }

    return {
        complete:
            remaining <=
            1e-9,

        threads,
        assignments,
    };
}


// =================================================================
// JOBS
// =================================================================

function addJobs(
    jobs,
    batchIndex,
    action,
    script,
    assignments,
    baseDuration,
    finishOffset
) {
    for (
        const assignment
        of assignments
    ) {
        jobs.push({
            batchIndex,
            action,
            script,

            host:
                assignment.host,

            threads:
                assignment.threads,

            baseDuration,
            finishOffset,
        });
    }
}


// =================================================================
// PROCESS CONTROL
// =================================================================

async function waitForProcesses(
    ns,
    processes
) {
    while (true) {
        let alive = false;

        for (
            const process
            of processes
        ) {
            const exists =
                ns.ps(
                    process.host
                ).some(
                    (p) =>
                        p.pid ===
                        process.pid
                );

            if (exists) {
                alive = true;
                break;
            }
        }

        if (!alive) {
            return;
        }

        await ns.sleep(100);
    }
}


function killProcesses(
    ns,
    processes
) {
    for (
        const process
        of processes
    ) {
        try {
            ns.kill(
                process.pid
            );
        } catch {
            // already dead
        }
    }
}


// =================================================================
// NETWORK / WORKERS
// =================================================================

function scanAll(ns) {
    const seen =
        new Set(["home"]);

    const queue =
        ["home"];

    while (
        queue.length > 0
    ) {
        const host =
            queue.shift();

        for (
            const next
            of ns.scan(host)
        ) {
            if (
                seen.has(next)
            ) {
                continue;
            }

            seen.add(next);
            queue.push(next);
        }
    }

    return [...seen];
}


function deployWorkers(
    ns,
    hosts,
    files
) {
    for (
        const host
        of hosts
    ) {
        if (
            host === "home"
        ) {
            continue;
        }

        if (
            !ns.hasRootAccess(host)
        ) {
            continue;
        }

        if (
            ns.getServerMaxRam(host) <=
            0
        ) {
            continue;
        }

        try {
            ns.scp(
                files,
                host,
                "home"
            );
        } catch {
            // ignore unusable server
        }
    }
}


function collectWorkers(
    ns,
    hosts,
    files,
    options
) {
    const workers = [];

    for (
        const host
        of hosts
    ) {
        if (
            host === "home" &&
            !options.useHome
        ) {
            continue;
        }

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

        if (
            !files.every(
                (file) =>
                    ns.fileExists(
                        file,
                        host
                    )
            )
        ) {
            continue;
        }

        const usedRam =
            ns.getServerUsedRam(
                host
            );

        const reserve =
            host === "home"
                ? options.homeReserve
                : 0;

        const freeRam =
            Math.max(
                0,
                maxRam -
                usedRam -
                reserve
            );

        if (
            freeRam <= 0
        ) {
            continue;
        }

        let cores = 1;

        try {
            cores =
                Math.max(
                    1,
                    ns.getServer(
                        host
                    ).cpuCores ||
                    1
                );
        } catch {
            cores = 1;
        }

        workers.push({
            host,
            cores,
            maxRam,
            usedRam,
            freeRam,

            remainingRam:
                freeRam,
        });
    }

    return workers;
}


function createPool(
    workers
) {
    return workers.map(
        (worker) => ({
            ...worker,

            remainingRam:
                worker.freeRam,
        })
    );
}


function clonePool(
    pool
) {
    return pool.map(
        (worker) => ({
            ...worker,
        })
    );
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


function isReady(state) {
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
// OUTPUT
// =================================================================

function printBatchLine(
    ns,
    index,
    batch
) {
    ns.tprint(
        `B${index + 1}: ` +
        `H=${batch.hThreads} ` +
        `W1=${batch.w1.threads} ` +
        `G=${batch.grow.threads} ` +
        `W2=${batch.w2.threads} | ` +
        `take≈${(
            batch.actualTake *
            100
        ).toFixed(2)}% | ` +
        `RAM≈${fmtRam(
            batch.batchRam
        )}`
    );
}


// =================================================================
// HELPERS
// =================================================================

function allocationRam(
    assignments,
    ram
) {
    return assignments.reduce(
        (sum, assignment) =>
            sum +
            assignment.threads *
            ram,
        0
    );
}


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
        !Number.isFinite(value)
    ) {
        return "-";
    }

    if (
        value >= 1024
    ) {
        return (
            value /
            1024
        ).toFixed(2) + "T";
    }

    return (
        value.toFixed(1) +
        "G"
    );
}


function fmtMoney(value) {
    if (
        !Number.isFinite(value)
    ) {
        return "-";
    }

    const abs =
        Math.abs(value);

    if (
        abs >= 1e12
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
        abs >= 1e9
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
        abs >= 1e6
    ) {
        return (
            "$" +
            (
                value /
                1e6
            ).toFixed(1) +
            "m"
        );
    }

    return (
        "$" +
        value.toFixed(0)
    );
}


function fmtTime(ms) {
    if (
        ms >= 60000
    ) {
        return (
            ms /
            60000
        ).toFixed(2) + "m";
    }

    return (
        ms /
        1000
    ).toFixed(2) + "s";
}


function printHelp(ns) {
    ns.tprint(
        "7n8 SHOTGUN AUTO v2.1"
    );

    ns.tprint("");

    ns.tprint(
        "Dry run:"
    );

    ns.tprint(
        "  run shotgun-auto.js phantasy --dry-run --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Execute:"
    );

    ns.tprint(
        "  run shotgun-auto.js phantasy --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Defaults:"
    );

    ns.tprint(
        "  pct          = 10%"
    );

    ns.tprint(
        "  reserve-pct  = 10%"
    );

    ns.tprint(
        "  gap          = 500ms"
    );

    ns.tprint(
        "  grow-safety  = 1.03"
    );
}