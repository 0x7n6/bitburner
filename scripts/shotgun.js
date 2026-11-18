/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["batches", 4],
        ["pct", 0.10],
        ["gap", 500],
        ["lead", 2000],
        ["reserve", 32],
        ["grow-safety", 1.05],

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

    const requestedBatches =
        Math.max(
            1,
            Math.floor(
                Number(flags.batches) || 4
            )
        );

    const takePct =
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

    /*
     * Extra common lead time.
     *
     * This gives the controller enough time
     * to exec all remote processes before
     * the first important landing window.
     */
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

    const growSafety =
        clamp(
            Number(flags["grow-safety"]) || 1.05,
            1.00,
            1.20
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
    // Help / validation
    // ------------------------------------------------------------

    if (
        flags.help ||
        !target
    ) {
        printHelp(ns);
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
            `ERROR ${target} has no root access.`
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
            `ERROR Current hacking level cannot hack ${target}.`
        );
        return;
    }

    const maxMoney =
        ns.getServerMaxMoney(
            target
        );

    if (!(maxMoney > 0)) {
        ns.tprint(
            `ERROR ${target} has no money.`
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
                `ERROR Missing ${file} on home.`
            );
            return;
        }
    }

    if (flags.tail) {
        ns.tail();
    }

    // ------------------------------------------------------------
    // Target MUST already be READY.
    // Shotgun is intentionally not a prep engine.
    // ------------------------------------------------------------

    const initial =
        getTargetState(
            ns,
            target
        );

    if (
        !isReady(initial)
    ) {
        ns.tprint(
            `ERROR ${target} is not READY.`
        );

        ns.tprint(
            `Money: ${fmtMoney(initial.money)}/` +
            `${fmtMoney(initial.maxMoney)} | ` +
            `sec=${initial.sec.toFixed(3)}/` +
            `${initial.minSec.toFixed(3)}`
        );

        ns.tprint(
            `Recover first: run harvest.ts ${target} --prep-only --tail`
        );

        return;
    }

    // ------------------------------------------------------------
    // Deploy workers
    // ------------------------------------------------------------

    const hosts =
        scanAll(ns);

    const deploy =
        deployWorkers(
            ns,
            hosts,
            workerFiles
        );

    if (
        deploy.failed.length > 0
    ) {
        ns.tprint(
            `WARN deployment failed on: ` +
            deploy.failed.join(", ")
        );
    }

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
            "ERROR No usable RAM workers."
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

    const totalUsableRam =
        workers.reduce(
            (sum, worker) =>
                sum +
                worker.freeRam,
            0
        );

    // ------------------------------------------------------------
    // Shared RAM pool.
    //
    // Important:
    // all batches coexist in RAM simultaneously,
    // therefore every planned batch consumes from
    // the SAME mutable pool.
    // ------------------------------------------------------------

    let pool =
        createPool(
            workers
        );

    const batches = [];

    for (
        let i = 0;
        i < requestedBatches;
        i++
    ) {
        const result =
            planBatch(
                ns,
                target,
                pool,
                ram,
                takePct,
                growSafety
            );

        if (!result) {
            ns.tprint(
                `ERROR Requested ${requestedBatches} batches, ` +
                `but only ${batches.length} complete batch(es) fit.`
            );

            ns.tprint(
                `Try: --batches ${Math.max(
                    1,
                    batches.length
                )}`
            );

            return;
        }

        batches.push(
            result.batch
        );

        /*
         * Commit RAM consumed by this batch.
         */
        pool =
            result.pool;
    }

    const totalBatchRam =
        batches.reduce(
            (sum, batch) =>
                sum +
                batch.batchRam,
            0
        );

    const expectedWaveMoney =
        batches.reduce(
            (sum, batch) =>
                sum +
                batch.expectedMoney,
            0
        );

    // ------------------------------------------------------------
    // Timing model
    // ------------------------------------------------------------

    const timing =
        getTiming(
            ns,
            target
        );

    /*
     * Each batch gets 4 landing slots:
     *
     * batch N:
     *
     * H  = offset + 0*gap
     * W1 = offset + 1*gap
     * G  = offset + 2*gap
     * W2 = offset + 3*gap
     *
     * next batch:
     *
     * H  = previous offset + 4*gap
     *
     * Therefore:
     *
     * B1 H W1 G W2
     *             B2 H W1 G W2
     *                         B3 ...
     *
     * while all underlying processes remain
     * simultaneously in-flight.
     */
    const batchSpacing =
        4 * gap;

    const jobs = [];

    for (
        let batchIndex = 0;
        batchIndex <
        batches.length;
        batchIndex++
    ) {
        const batch =
            batches[batchIndex];

        const batchOffset =
            batchIndex *
            batchSpacing;

        addJobs(
            jobs,
            batchIndex,
            "H",
            H,
            batch.hack.assignments,
            timing.hackTime,
            batchOffset,
            target
        );

        addJobs(
            jobs,
            batchIndex,
            "W1",
            W,
            batch.w1.assignments,
            timing.weakenTime,
            batchOffset + gap,
            target
        );

        addJobs(
            jobs,
            batchIndex,
            "G",
            G,
            batch.grow.assignments,
            timing.growTime,
            batchOffset + 2 * gap,
            target
        );

        addJobs(
            jobs,
            batchIndex,
            "W2",
            W,
            batch.w2.assignments,
            timing.weakenTime,
            batchOffset + 3 * gap,
            target
        );
    }

    /*
     * Launch in desired completion order.
     */
    jobs.sort(
        (a, b) =>
            a.finishOffset -
            b.finishOffset
    );

    // ------------------------------------------------------------
    // Display plan
    // ------------------------------------------------------------

    ns.tprint(
        `7n8 SHOTGUN | ` +
        `target=${target} | ` +
        `batches=${batches.length} | ` +
        `take≈${(takePct * 100).toFixed(0)}% | ` +
        `gap=${gap}ms | ` +
        `lead=${lead}ms`
    );

    ns.tprint(
        `Workers=${workers.length} | ` +
        `usable=${fmtRam(totalUsableRam)} | ` +
        `waveRAM≈${fmtRam(totalBatchRam)} | ` +
        `EV≈${fmtMoney(expectedWaveMoney)}`
    );

    ns.tprint(
        `Times: H=${fmtTime(timing.hackTime)} | ` +
        `G=${fmtTime(timing.growTime)} | ` +
        `W=${fmtTime(timing.weakenTime)}`
    );

    ns.tprint("");

    for (
        let i = 0;
        i < batches.length;
        i++
    ) {
        const batch =
            batches[i];

        ns.tprint(
            `B${i + 1}: ` +
            `H=${batch.hThreads} ` +
            `W1=${batch.w1.threads} ` +
            `G=${batch.grow.threads} ` +
            `W2=${batch.w2.threads} | ` +
            `take≈${(batch.actualTake * 100).toFixed(2)}% | ` +
            `RAM≈${fmtRam(batch.batchRam)}`
        );
    }

    ns.tprint("");

    if (dryRun) {
        ns.tprint(
            "DRY RUN PASS. No workers launched."
        );
        return;
    }

    // ------------------------------------------------------------
    // Launch whole wave
    // ------------------------------------------------------------

    /*
     * First desired H landing is:
     *
     * now + lead + weakenTime
     *
     * Everything else is derived from that.
     *
     * Using an absolute deadline lets us compensate
     * for controller exec() overhead while launching
     * dozens of processes.
     */
    const waveEpoch =
        Date.now();

    const commonFinishBase =
        waveEpoch +
        lead +
        timing.weakenTime;

    const processes = [];

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

        /*
         * Action begins around now.
         *
         * additionalMsec should make:
         *
         * now + baseDuration + delay
         *
         * approximately equal desiredFinish.
         */
        const rawDelay =
            desiredFinish -
            Date.now() -
            job.baseDuration;

        if (rawDelay < 0) {
            ns.tprint(
                `ERROR Missed timing window before launch: ` +
                `B${job.batchIndex + 1}:${job.action}`
            );

            killProcesses(
                ns,
                processes
            );

            return;
        }

        const delay =
            Math.max(
                0,
                Math.floor(rawDelay)
            );

        const pid =
            ns.exec(
                job.script,
                job.host,
                job.threads,

                target,
                delay,

                `shotgun:${ns.pid}:` +
                `B${job.batchIndex + 1}:` +
                `${job.action}:${i}`
            );

        if (
            pid === 0
        ) {
            ns.tprint(
                `ERROR exec failed: ` +
                `B${job.batchIndex + 1} ` +
                `${job.action} ` +
                `@ ${job.host} ` +
                `x${job.threads}`
            );

            /*
             * We are still at launch time,
             * before any planned landing.
             *
             * Kill everything already started.
             */
            killProcesses(
                ns,
                processes
            );

            ns.tprint(
                "ABORTED partial wave."
            );

            return;
        }

        processes.push({
            pid,
            host:
                job.host,
            batchIndex:
                job.batchIndex,
            action:
                job.action,
        });
    }

    ns.tprint(
        `LAUNCHED ${batches.length} batches / ` +
        `${processes.length} process(es).`
    );

    ns.tprint(
        "Do NOT manually stop the controller while this wave is in flight."
    );

    // ------------------------------------------------------------
    // Wait
    // ------------------------------------------------------------

    await waitForProcesses(
        ns,
        processes
    );

    // Small settle margin.
    await ns.sleep(
        Math.max(
            250,
            gap
        )
    );

    // ------------------------------------------------------------
    // Verify final target
    // ------------------------------------------------------------

    const final =
        getTargetState(
            ns,
            target
        );

    ns.tprint("");

    ns.tprint(
        `WAVE COMPLETE | ` +
        `money=${fmtMoney(final.money)}/` +
        `${fmtMoney(final.maxMoney)} ` +
        `(${(
            final.money /
            final.maxMoney *
            100
        ).toFixed(3)}%) | ` +
        `sec=${final.sec.toFixed(3)}/` +
        `${final.minSec.toFixed(3)}`
    );

    if (
        isReady(final)
    ) {
        ns.tprint(
            `SHOTGUN PASS: ${batches.length}/${batches.length} ` +
            `batches landed and target returned READY.`
        );
    } else {
        ns.tprint(
            "SHOTGUN DRIFT DETECTED."
        );

        ns.tprint(
            `Recover with: ` +
            `run harvest.ts ${target} --prep-only --tail`
        );
    }
}


// =================================================================
// ONE-BATCH PLANNER AGAINST SHARED RAM POOL
// =================================================================

function planBatch(
    ns,
    target,
    originalPool,
    ram,
    takePct,
    growSafety
) {
    const hackPct =
        ns.hackAnalyze(
            target
        );

    if (
        !Number.isFinite(hackPct) ||
        hackPct <= 0
    ) {
        return null;
    }

    /*
     * Floor intentionally.
     *
     * We prefer ~9.9% rather than accidentally
     * crossing above the requested 10%.
     */
    const desiredHackThreads =
        Math.max(
            1,
            Math.floor(
                takePct /
                hackPct
            )
        );

    /*
     * If a full requested batch no longer fits
     * because previous shotgun batches consumed RAM,
     * try progressively smaller hack sizes.
     */
    for (
        let hThreads =
            desiredHackThreads;

        hThreads >= 1;

        hThreads--
    ) {
        const pool =
            clonePool(
                originalPool
            );

        const actualTake =
            hThreads *
            hackPct;

        if (
            actualTake <= 0 ||
            actualTake >= 0.90
        ) {
            continue;
        }

        // --------------------------------------------------------
        // HACK
        // --------------------------------------------------------

        const hack =
            allocateHack(
                pool,
                hThreads,
                ram.h
            );

        if (!hack.complete) {
            continue;
        }

        const hackSecurity =
            ns.hackAnalyzeSecurity(
                hThreads
            );

        // --------------------------------------------------------
        // WEAKEN 1
        // --------------------------------------------------------

        const w1 =
            allocateWeaken(
                ns,
                pool,
                hackSecurity,
                ram.w
            );

        if (!w1.complete) {
            continue;
        }

        // --------------------------------------------------------
        // GROW
        // --------------------------------------------------------

        const growthFactor =
            1 /
            (
                1 -
                actualTake
            );

        const grow =
            allocateGrow(
                ns,
                target,
                pool,
                growthFactor,
                ram.g,
                growSafety
            );

        if (!grow.complete) {
            continue;
        }

        /*
         * Hypothetical post-hack grow.
         *
         * No hostname parameter here.
         */
        const growSecurity =
            ns.growthAnalyzeSecurity(
                grow.threads
            );

        // --------------------------------------------------------
        // WEAKEN 2
        // --------------------------------------------------------

        const w2 =
            allocateWeaken(
                ns,
                pool,
                growSecurity,
                ram.w
            );

        if (!w2.complete) {
            continue;
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
            ns.getServerMaxMoney(
                target
            ) *
            actualTake *
            ns.hackAnalyzeChance(
                target
            );

        return {
            pool,

            batch: {
                hThreads,

                actualTake,

                chance:
                    ns.hackAnalyzeChance(
                        target
                    ),

                expectedMoney,
                batchRam,

                hack,
                w1,
                grow,
                w2,
            },
        };
    }

    return null;
}


// =================================================================
// HACK ALLOCATOR
// =================================================================

function allocateHack(
    pool,
    wantedThreads,
    scriptRam
) {
    /*
     * Prefer a single low-core host.
     *
     * Hack does not benefit from CPU cores,
     * so preserve high-core machines for G/W.
     */
    const candidates =
        pool
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

    /*
     * Fallback split.
     */
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
            remaining <= 0,

        threads:
            wantedThreads -
            remaining,

        assignments,
    };
}


// =================================================================
// WEAKEN ALLOCATOR
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

    /*
     * Highest cores first.
     */
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
            ns.weakenAnalyze(
                1,
                worker.cores
            );

        if (
            !Number.isFinite(effect) ||
            effect <= 0
        ) {
            continue;
        }

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

        remainingSecurity:
            Math.max(
                0,
                remaining
            ),

        threads,
        assignments,
    };
}


// =================================================================
// GROW ALLOCATOR
// =================================================================

function allocateGrow(
    ns,
    target,
    pool,
    growthFactor,
    scriptRam,
    safety
) {
    let remainingLog =
        Math.log(
            Math.max(
                1,
                growthFactor
            )
        ) *
        safety;

    let threads = 0;

    const assignments = [];

    /*
     * Highest cores first.
     */
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
            remainingLog <=
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

        /*
         * Approximate per-thread multiplicative growth
         * for this worker's CPU-core count.
         *
         * This is the same core-aware method that
         * already survived the proto-HWGW tests.
         */
        const threadsFor2 =
            ns.growthAnalyze(
                target,
                2,
                worker.cores
            );

        if (
            !Number.isFinite(
                threadsFor2
            ) ||
            threadsFor2 <= 0
        ) {
            continue;
        }

        const logPerThread =
            Math.log(2) /
            threadsFor2;

        const needed =
            Math.ceil(
                remainingLog /
                logPerThread
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

        remainingLog -=
            use *
            logPerThread;
    }

    return {
        complete:
            remainingLog <=
            1e-9,

        remainingLog:
            Math.max(
                0,
                remainingLog
            ),

        threads,
        assignments,
    };
}


// =================================================================
// JOB BUILDER
// =================================================================

function addJobs(
    jobs,
    batchIndex,
    action,
    script,
    assignments,
    baseDuration,
    finishOffset,
    target
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
            target,
        });
    }
}


// =================================================================
// TIMING
// =================================================================

function getTiming(
    ns,
    target
) {
    return {
        hackTime:
            ns.getHackTime(
                target
            ),

        growTime:
            ns.getGrowTime(
                target
            ),

        weakenTime:
            ns.getWeakenTime(
                target
            ),
    };
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
// NETWORK
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


// =================================================================
// DEPLOY
// =================================================================

function deployWorkers(
    ns,
    hosts,
    files
) {
    const failed = [];

    let deployed = 0;

    for (
        const host
        of hosts
    ) {
        if (
            host === "home"
        ) {
            deployed++;
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
            const ok =
                ns.scp(
                    files,
                    host,
                    "home"
                );

            if (ok) {
                deployed++;
            } else {
                failed.push(host);
            }
        } catch {
            failed.push(host);
        }
    }

    return {
        deployed,
        failed,
    };
}


// =================================================================
// WORKERS
// =================================================================

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
            ns.getServerMaxRam(host);

        if (
            maxRam <= 0
        ) {
            continue;
        }

        const ready =
            files.every(
                (file) =>
                    ns.fileExists(
                        file,
                        host
                    )
            );

        if (!ready) {
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
                    Number(
                        ns.getServer(
                            host
                        ).cpuCores
                    ) || 1
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
            const running =
                ns.ps(
                    process.host
                ).some(
                    (p) =>
                        p.pid ===
                        process.pid
                );

            if (running) {
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
            // already gone
        }
    }
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
            ).toFixed(1) +
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


function fmtTime(ms) {
    if (
        !Number.isFinite(ms)
    ) {
        return "-";
    }

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


// =================================================================
// HELP
// =================================================================

function printHelp(ns) {
    ns.tprint(
        "7n8 SHOTGUN BATCHER"
    );

    ns.tprint("");

    ns.tprint(
        "Examples:"
    );

    ns.tprint(
        "  run shotgun.js phantasy --dry-run"
    );

    ns.tprint(
        "  run shotgun.js phantasy --batches 4 --tail"
    );

    ns.tprint(
        "  run shotgun.js phantasy --batches 8 --tail"
    );

    ns.tprint(
        "  run shotgun.js phantasy --batches 12 --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Default:"
    );

    ns.tprint(
        "  batches=4"
    );

    ns.tprint(
        "  pct=0.10"
    );

    ns.tprint(
        "  gap=500ms"
    );

    ns.tprint(
        "  lead=2000ms"
    );

    ns.tprint(
        "  reserve=32GB"
    );

    ns.tprint(
        "  grow-safety=1.05"
    );

    ns.tprint("");

    ns.tprint(
        "Target MUST already be READY."
    );
}