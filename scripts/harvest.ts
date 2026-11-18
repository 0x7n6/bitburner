import type { NS } from "@ns";

interface TargetState {
    money: number;
    maxMoney: number;
    sec: number;
    minSec: number;
    chance: number;
    hackPct: number;
}

interface Worker {
    host: string;
    cores: number;
    maxRam: number;
    usedRam: number;
    freeRam: number;
}

interface PoolWorker extends Worker {
    remainingRam: number;
}

interface WorkerOptions {
    useHome: boolean;
    homeReserve: number;
}

interface RamCosts {
    h: number;
    g: number;
    w: number;
}

interface Assignment {
    host: string;
    threads: number;
}

interface Allocation {
    assignments: Assignment[];
    threads: number;
    complete: boolean;
}

interface WeakenAllocation extends Allocation {
    remainingSecurity: number;
}

interface GrowAllocation extends Allocation {
    remainingLog: number;
}

interface BatchPlan {
    hThreads: number;
    actualTake: number;

    hack: Allocation;
    w1: WeakenAllocation;
    grow: GrowAllocation;
    w2: WeakenAllocation;

    batchRam: number;
    expectedMoney: number;
    chance: number;
}

interface Timing {
    hackTime: number;
    growTime: number;
    weakenTime: number;

    hDelay: number;
    w1Delay: number;
    gDelay: number;
    w2Delay: number;
}

interface WorkerScripts {
    H: string;
    G: string;
    W: string;
}

interface ProcessRef {
    pid: number;
    host: string;
    action?: string;
}

interface LaunchResult {
    ok: boolean;
    processes: ProcessRef[];
}

interface DeployResult {
    deployed: number;
    failed: string[];
}

export async function main(ns: NS): Promise<void> {
    const flags = ns.flags([
        ["pct", 0.10],
        ["reserve", 32],
        ["gap", 500],
        ["grow-safety", 1.02],

        ["prep-only", false],
        ["once", false],
        ["dry-run", false],
        ["no-home", false],
        ["tail", false],
        ["help", false],
    ]);

    ns.disableLog("ALL");

    const positional =
        Array.isArray(flags._)
            ? flags._
            : [];

    const target =
        positional[0]
            ? String(positional[0])
            : "";

    const takePct =
        clamp(
            Number(flags.pct) || 0.10,
            0.01,
            0.40
        );

    const homeReserve =
        Math.max(
            0,
            Number(flags.reserve) || 0
        );

    const gap =
        Math.max(
            100,
            Number(flags.gap) || 500
        );

    const growSafety =
        clamp(
            Number(flags["grow-safety"]) || 1.02,
            1.00,
            1.20
        );

    const prepOnly =
        Boolean(flags["prep-only"]);

    const once =
        Boolean(flags.once);

    const dryRun =
        Boolean(flags["dry-run"]);

    const useHome =
        !Boolean(flags["no-home"]);

    const H = "h.ts";
    const G = "g.ts";
    const W = "w.ts";

    const workerFiles = [
        H,
        G,
        W,
    ];

    const MONEY_READY = 0.999;
    const SEC_TOL = 0.05;

    // ------------------------------------------------------------
    // HELP / VALIDATION
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
            `ERROR Unknown server: ${target}`
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

    const maxMoney =
        ns.getServerMaxMoney(target);

    if (!(maxMoney > 0)) {
        ns.tprint(
            `ERROR ${target} is not a money server.`
        );

        return;
    }

    const requiredHack =
        ns.getServerRequiredHackingLevel(
            target
        );

    if (
        !prepOnly &&
        ns.getHackingLevel() <
        requiredHack
    ) {
        ns.tprint(
            `ERROR ${target} requires hacking ` +
            `${requiredHack}; current=${ns.getHackingLevel()}`
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
        ns.ui.openTail();
    }

    // ------------------------------------------------------------
    // NETWORK + DEPLOYMENT
    // ------------------------------------------------------------

    const allHosts =
        scanAll(ns);

    const deploy =
        deployWorkers(
            ns,
            allHosts,
            workerFiles
        );

    if (
        deploy.failed.length > 0
    ) {
        ns.tprint(
            `WARN worker deployment failed on: ` +
            deploy.failed.join(", ")
        );
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

    if (
        ram.h <= 0 ||
        ram.g <= 0 ||
        ram.w <= 0
    ) {
        ns.tprint(
            "ERROR Invalid worker RAM cost."
        );

        return;
    }

    let batchNumber = 0;

    ns.tprint(
        `7n8 HWGW FARM | ` +
        `target=${target} | ` +
        `take=${(takePct * 100).toFixed(0)}% | ` +
        `gap=${gap}ms | ` +
        `reserve=${homeReserve}GB | ` +
        `growSafety=${growSafety.toFixed(2)}`
    );

    // ============================================================
    // MAIN CONTROLLER
    // ============================================================

    while (true) {
        const workers =
            collectWorkers(
                ns,
                allHosts,
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
                "ERROR No usable worker servers."
            );

            return;
        }

        const state =
            getTargetState(
                ns,
                target
            );

        printStatus(
            ns,
            target,
            state,
            workers,
            batchNumber
        );

        // ========================================================
        // SELF-HEALING PREP: SECURITY
        // ========================================================

        if (
            state.sec >
            state.minSec +
            SEC_TOL
        ) {
            const securityNeeded =
                state.sec -
                state.minSec;

            const pool =
                createPool(
                    workers
                );

            const plan =
                allocateWeaken(
                    ns,
                    pool,
                    securityNeeded,
                    ram.w
                );

            if (
                plan.assignments.length === 0
            ) {
                ns.tprint(
                    "ERROR Unable to allocate prep weaken."
                );

                return;
            }

            ns.print(
                `[PREP-W] Δsec=${securityNeeded.toFixed(3)} ` +
                `threads=${plan.threads} ` +
                `hosts=${plan.assignments.length}`
            );

            const result =
                await launchSimpleAction(
                    ns,
                    W,
                    target,
                    plan.assignments,
                    0,
                    `prep-w-${Date.now()}`
                );

            if (!result) {
                ns.tprint(
                    "ERROR PREP-W launch failed."
                );

                return;
            }

            continue;
        }

        // ========================================================
        // SELF-HEALING PREP: MONEY
        // ========================================================

        if (
            state.money <
            state.maxMoney *
            MONEY_READY
        ) {
            const factor =
                state.maxMoney /
                Math.max(
                    1,
                    state.money
                );

            const pool =
                createPool(
                    workers
                );

            const plan =
                allocateGrow(
                    ns,
                    target,
                    pool,
                    factor,
                    ram.g,
                    1.05
                );

            if (
                plan.assignments.length === 0
            ) {
                ns.tprint(
                    "ERROR Unable to allocate prep grow."
                );

                return;
            }

            ns.print(
                `[PREP-G] ` +
                `${fmtMoney(state.money)} -> ` +
                `${fmtMoney(state.maxMoney)} | ` +
                `factor=${factor.toFixed(3)} | ` +
                `threads=${plan.threads} | ` +
                `hosts=${plan.assignments.length}`
            );

            const result =
                await launchSimpleAction(
                    ns,
                    G,
                    target,
                    plan.assignments,
                    0,
                    `prep-g-${Date.now()}`
                );

            if (!result) {
                ns.tprint(
                    "ERROR PREP-G launch failed."
                );

                return;
            }

            // Grow raises security.
            // Loop will automatically PREP-W next.
            continue;
        }

        // ========================================================
        // TARGET READY
        // ========================================================

        if (prepOnly) {
            ns.tprint(
                `READY ${target} | ` +
                `${fmtMoney(state.money)}/` +
                `${fmtMoney(state.maxMoney)} | ` +
                `sec=${state.sec.toFixed(3)}/` +
                `${state.minSec.toFixed(3)}`
            );

            return;
        }

        if (
            once &&
            batchNumber >= 1
        ) {
            ns.tprint(
                `DONE: 1 timed HWGW batch completed ` +
                `and ${target} is READY.`
            );

            return;
        }

        // ========================================================
        // BUILD ONE TIMED HWGW BATCH
        // ========================================================

        const batch =
            planBatch(
                ns,
                target,
                workers,
                ram,
                takePct,
                growSafety
            );

        if (!batch) {
            ns.tprint(
                `ERROR Could not fit even a minimal HWGW batch ` +
                `inside current free RAM.`
            );

            return;
        }

        printBatch(
            ns,
            target,
            batch,
            gap
        );

        if (dryRun) {
            ns.tprint(
                "DRY RUN complete. Nothing launched."
            );

            return;
        }

        // ========================================================
        // TIMING
        // ========================================================

        const timing =
            calculateTiming(
                ns,
                target,
                gap
            );

        const tag =
            `b${batchNumber + 1}-${Date.now()}`;

        const launch =
            await launchBatch(
                ns,
                target,
                batch,
                timing,
                tag,
                {
                    H,
                    G,
                    W,
                }
            );

        if (!launch.ok) {
            ns.tprint(
                `ERROR Batch launch failed. ` +
                `Started processes were killed.`
            );

            await ns.sleep(1000);

            continue;
        }

        await waitForProcesses(
            ns,
            launch.processes
        );

        batchNumber++;

        const after =
            getTargetState(
                ns,
                target
            );

        ns.tprint(
            `[BATCH ${batchNumber}] COMPLETE | ` +
            `money=${fmtMoney(after.money)}/` +
            `${fmtMoney(after.maxMoney)} ` +
            `(${(after.money / after.maxMoney * 100).toFixed(2)}%) | ` +
            `sec=${after.sec.toFixed(3)}/` +
            `${after.minSec.toFixed(3)}`
        );

        const stillReady =
            after.money >=
                after.maxMoney *
                MONEY_READY &&
            after.sec <=
                after.minSec +
                SEC_TOL;

        if (stillReady) {
            ns.tprint(
                `[BATCH ${batchNumber}] PASS: target returned READY.`
            );
        } else {
            ns.tprint(
                `[BATCH ${batchNumber}] DRIFT detected. ` +
                `Controller will self-repair before next batch.`
            );
        }

        await ns.sleep(50);
    }
}


// =================================================================
// TARGET STATE
// =================================================================

function getTargetState(
    ns: NS,
    target: string
): TargetState {
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

        chance:
            ns.hackAnalyzeChance(
                target
            ),

        hackPct:
            ns.hackAnalyze(
                target
            ),
    };
}


// =================================================================
// NETWORK
// =================================================================

function scanAll(ns: NS): string[] {
    const seen =
        new Set(["home"]);

    const queue =
        ["home"];

    while (
        queue.length > 0
    ) {
        const host =
            queue.shift();

        if (host === undefined) {
            break;
        }

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
// DEPLOY WORKERS
// =================================================================

function deployWorkers(
    ns: NS,
    hosts: string[],
    files: string[]
): DeployResult {
    const failed: string[] = [];
    let deployed = 0;

    for (const host of hosts) {
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
            ns.getServerMaxRam(host) <= 0
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
// WORKER POOL
// =================================================================

function collectWorkers(
    ns: NS,
    hosts: string[],
    files: string[],
    options: WorkerOptions
): Worker[] {
    const workers: Worker[] = [];

    for (const host of hosts) {
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

        const filesReady =
            files.every(
                (file) =>
                    ns.fileExists(
                        file,
                        host
                    )
            );

        if (!filesReady) {
            continue;
        }

        const usedRam =
            ns.getServerUsedRam(host);

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
        });
    }

    return workers;
}


function createPool(
    workers: Worker[]
): PoolWorker[] {
    return workers.map(
        (worker) => ({
            ...worker,

            remainingRam:
                worker.freeRam,
        })
    );
}


// =================================================================
// BATCH PLANNER
// =================================================================

function planBatch(
    ns: NS,
    target: string,
    workers: Worker[],
    ram: RamCosts,
    takePct: number,
    growSafety: number
): BatchPlan | null {
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

    const desiredHackThreads =
        Math.max(
            1,
            Math.floor(
                takePct /
                hackPct
            )
        );

    /*
     * If desired batch somehow doesn't fit,
     * automatically reduce hack size until
     * a complete HWGW batch fits.
     */
    for (
        let hThreads =
            desiredHackThreads;

        hThreads >= 1;

        hThreads--
    ) {
        const pool =
            createPool(
                workers
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

        // No hostname:
        // do not cap hypothetical threads.
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
         * Very important:
         * no hostname here.
         *
         * This security belongs to a hypothetical
         * post-hack grow operation.
         *
         * Passing host would cap threads according
         * to CURRENT target money.
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

        const maxMoney =
            ns.getServerMaxMoney(
                target
            );

        const chance =
            ns.hackAnalyzeChance(
                target
            );

        const expectedMoney =
            maxMoney *
            actualTake *
            chance;

        return {
            hThreads,
            actualTake,

            hack,
            w1,
            grow,
            w2,

            batchRam,
            expectedMoney,
            chance,
        };
    }

    return null;
}


// =================================================================
// HACK ALLOCATION
// =================================================================

function allocateHack(
    pool: PoolWorker[],
    wantedThreads: number,
    scriptRam: number
): Allocation {
    const assignments: Assignment[] = [];

    /*
     * Prefer ONE process for HACK.
     *
     * A single multi-thread hack uses one success roll.
     * Splitting hack across many processes creates
     * multiple independent rolls and makes the result
     * more variable than our planner assumes.
     *
     * Also preserve high-core hosts for G/W.
     */
    const single =
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
            )[0];

    if (single) {
        single.remainingRam -=
            wantedThreads *
            scriptRam;

        assignments.push({
            host:
                single.host,

            threads:
                wantedThreads,
        });

        return {
            assignments,
            threads:
                wantedThreads,
            complete:
                true,
        };
    }

    /*
     * Fallback:
     * split only if no host can fit H alone.
     */
    let remaining =
        wantedThreads;

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
                capacity,
                remaining
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
        assignments,

        threads:
            wantedThreads -
            remaining,

        complete:
            remaining <= 0,
    };
}


// =================================================================
// WEAKEN ALLOCATION
// =================================================================

function allocateWeaken(
    ns: NS,
    pool: PoolWorker[],
    securityNeeded: number,
    scriptRam: number
): WeakenAllocation {
    let remaining =
        Math.max(
            0,
            securityNeeded
        );

    const assignments: Assignment[] = [];

    let totalThreads = 0;

    /*
     * Strongest cores first because weaken effect
     * gets a CPU-core bonus.
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

        const effectPerThread =
            ns.weakenAnalyze(
                1,
                worker.cores
            );

        if (
            !Number.isFinite(
                effectPerThread
            ) ||
            effectPerThread <= 0
        ) {
            continue;
        }

        const needed =
            Math.ceil(
                remaining /
                effectPerThread
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

        totalThreads += use;

        remaining -=
            use *
            effectPerThread;
    }

    return {
        assignments,

        threads:
            totalThreads,

        complete:
            remaining <=
            1e-9,

        remainingSecurity:
            Math.max(
                0,
                remaining
            ),
    };
}


// =================================================================
// GROW ALLOCATION
// =================================================================

function allocateGrow(
    ns: NS,
    target: string,
    pool: PoolWorker[],
    growthFactor: number,
    scriptRam: number,
    safety: number
): GrowAllocation {
    let remainingLog =
        Math.log(
            Math.max(
                1,
                growthFactor
            )
        ) *
        safety;

    const assignments: Assignment[] = [];

    let totalThreads = 0;

    /*
     * Strongest cores first because cores improve grow.
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
         * Ask the game how many threads THIS worker's
         * core count needs for x2 growth.
         *
         * growth is logarithmic in the multiplicative
         * component, so ln(2)/threadsFor2 gives us
         * this worker's approximate per-thread log growth.
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

        totalThreads += use;

        remainingLog -=
            use *
            logPerThread;
    }

    return {
        assignments,

        threads:
            totalThreads,

        complete:
            remainingLog <=
            1e-9,

        remainingLog:
            Math.max(
                0,
                remainingLog
            ),
    };
}


// =================================================================
// TIMING
// =================================================================

function calculateTiming(
    ns: NS,
    target: string,
    gap: number
): Timing {
    const hackTime =
        ns.getHackTime(
            target
        );

    const growTime =
        ns.getGrowTime(
            target
        );

    const weakenTime =
        ns.getWeakenTime(
            target
        );

    /*
     * Desired FINISH order:
     *
     * H  -> T
     * W1 -> T + gap
     * G  -> T + 2gap
     * W2 -> T + 3gap
     *
     * All scripts begin almost together.
     * additionalMsec stretches the shorter ones.
     */

    const hDelay =
        Math.max(
            0,
            weakenTime -
                hackTime
        );

    const w1Delay =
        gap;

    const gDelay =
        Math.max(
            0,
            weakenTime +
                2 * gap -
                growTime
        );

    const w2Delay =
        3 *
        gap;

    return {
        hackTime,
        growTime,
        weakenTime,

        hDelay,
        w1Delay,
        gDelay,
        w2Delay,
    };
}


// =================================================================
// BATCH LAUNCHER
// =================================================================

async function launchBatch(
    ns: NS,
    target: string,
    batch: BatchPlan,
    timing: Timing,
    tag: string,
    scripts: WorkerScripts
): Promise<LaunchResult> {
    const processes: ProcessRef[] = [];

    const actions = [
        {
            name:
                "H",

            script:
                scripts.H,

            delay:
                timing.hDelay,

            assignments:
                batch.hack.assignments,
        },

        {
            name:
                "W1",

            script:
                scripts.W,

            delay:
                timing.w1Delay,

            assignments:
                batch.w1.assignments,
        },

        {
            name:
                "G",

            script:
                scripts.G,

            delay:
                timing.gDelay,

            assignments:
                batch.grow.assignments,
        },

        {
            name:
                "W2",

            script:
                scripts.W,

            delay:
                timing.w2Delay,

            assignments:
                batch.w2.assignments,
        },
    ];

    /*
     * Launch order follows finish order.
     * With a generous initial gap (500ms),
     * small exec jitter is harmless.
     */
    for (const action of actions) {
        for (
            let i = 0;
            i <
            action.assignments.length;
            i++
        ) {
            const assignment =
                action.assignments[i];

            const pid =
                ns.exec(
                    action.script,
                    assignment.host,
                    assignment.threads,

                    target,
                    action.delay,

                    `${tag}:${action.name}:${i}`
                );

            if (
                pid === 0
            ) {
                for (
                    const started
                    of processes
                ) {
                    ns.kill(
                        started.pid
                    );
                }

                return {
                    ok:
                        false,

                    processes:
                        [],
                };
            }

            processes.push({
                pid,

                host:
                    assignment.host,

                action:
                    action.name,
            });
        }
    }

    return {
        ok:
            true,

        processes,
    };
}


// =================================================================
// SIMPLE PREP ACTION
// =================================================================

async function launchSimpleAction(
    ns: NS,
    script: string,
    target: string,
    assignments: Assignment[],
    delay: number,
    tag: string
): Promise<boolean> {
    const processes: ProcessRef[] = [];

    for (
        let i = 0;
        i <
        assignments.length;
        i++
    ) {
        const assignment =
            assignments[i];

        const pid =
            ns.exec(
                script,
                assignment.host,
                assignment.threads,

                target,
                delay,

                `${tag}:${i}`
            );

        if (
            pid === 0
        ) {
            for (
                const started
                of processes
            ) {
                ns.kill(
                    started.pid
                );
            }

            return false;
        }

        processes.push({
            pid,

            host:
                assignment.host,
        });
    }

    await waitForProcesses(
        ns,
        processes
    );

    return true;
}


// =================================================================
// WAIT
// =================================================================

async function waitForProcesses(
    ns: NS,
    processes: ProcessRef[]
): Promise<void> {
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
                    (running) =>
                        running.pid ===
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


// =================================================================
// OUTPUT
// =================================================================

function printStatus(
    ns: NS,
    target: string,
    state: TargetState,
    workers: Worker[],
    batchNumber: number
): void {
    const freeRam =
        workers.reduce(
            (sum, worker) =>
                sum +
                worker.freeRam,
            0
        );

    const totalRam =
        workers.reduce(
            (sum, worker) =>
                sum +
                worker.maxRam,
            0
        );

    ns.print(
        `[STATE] ${target} | ` +
        `money=${fmtMoney(state.money)}/` +
        `${fmtMoney(state.maxMoney)} ` +
        `(${(state.money / state.maxMoney * 100).toFixed(2)}%) | ` +

        `sec=${state.sec.toFixed(3)}/` +
        `${state.minSec.toFixed(3)} | ` +

        `chance=${(state.chance * 100).toFixed(1)}% | ` +

        `workers=${workers.length} | ` +
        `RAM=${fmtRam(freeRam)}/` +
        `${fmtRam(totalRam)} free | ` +

        `batches=${batchNumber}`
    );
}


function printBatch(
    ns: NS,
    target: string,
    batch: BatchPlan,
    gap: number
): void {
    ns.print(
        `====================================================`
    );

    ns.print(
        `[HWGW] ${target}`
    );

    ns.print(
        `H=${batch.hThreads} ` +
        `W1=${batch.w1.threads} ` +
        `G=${batch.grow.threads} ` +
        `W2=${batch.w2.threads}`
    );

    ns.print(
        `take≈${(batch.actualTake * 100).toFixed(2)}% | ` +
        `chance=${(batch.chance * 100).toFixed(1)}% | ` +
        `EV≈${fmtMoney(batch.expectedMoney)}/batch`
    );

    ns.print(
        `RAM≈${fmtRam(batch.batchRam)} | ` +
        `gap=${gap}ms`
    );

    ns.print(
        `hosts: ` +
        `H=${batch.hack.assignments.length}, ` +
        `W1=${batch.w1.assignments.length}, ` +
        `G=${batch.grow.assignments.length}, ` +
        `W2=${batch.w2.assignments.length}`
    );

    ns.print(
        `====================================================`
    );
}


// =================================================================
// HELP
// =================================================================

function printHelp(ns: NS): void {
    ns.tprint(
        "7n8 TIMED HWGW FARM"
    );

    ns.tprint("");

    ns.tprint(
        "Usage:"
    );

    ns.tprint(
        "  run harvest.ts phantasy --once --tail"
    );

    ns.tprint(
        "  run harvest.ts phantasy --pct 0.10 --gap 500 --tail"
    );

    ns.tprint(
        "  run harvest.ts phantasy --prep-only --tail"
    );

    ns.tprint(
        "  run harvest.ts phantasy --dry-run"
    );

    ns.tprint(
        "  run harvest.ts phantasy --reserve 32"
    );

    ns.tprint(
        "  run harvest.ts phantasy --no-home"
    );

    ns.tprint("");

    ns.tprint(
        "Flow:"
    );

    ns.tprint(
        "  PREP if needed"
    );

    ns.tprint(
        "  READY"
    );

    ns.tprint(
        "  timed H -> W1 -> G -> W2"
    );

    ns.tprint(
        "  verify"
    );

    ns.tprint(
        "  self-repair if drifted"
    );

    ns.tprint(
        "  repeat"
    );
}


// =================================================================
// HELPERS
// =================================================================

function allocationRam(
    assignments: Assignment[],
    ram: number
): number {
    return assignments.reduce(
        (sum, assignment) =>
            sum +
            assignment.threads *
            ram,
        0
    );
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


function fmtRam(value: number): string {
    if (
        !Number.isFinite(
            value
        )
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


function fmtMoney(value: number): string {
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