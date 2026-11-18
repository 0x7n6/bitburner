import type { NS } from "@ns";

type Opener = readonly [
    file: string,
    run: (host: string) => boolean,
];

interface Worker {
    host: string;
    maxRam: number;
    usedRam: number;
    freeRam: number;
}

interface WorkerPool {
    workers: Worker[];
    count: number;
    totalRam: number;
    usedRam: number;
    freeRam: number;
}

interface TargetMetrics {
    host: string;

    rooted: boolean;
    canHack: boolean;
    ready: boolean;

    req: number;
    ports: number;
    growth: number;

    money: number;
    maxMoney: number;
    cashPct: number;

    sec: number;
    minSec: number;

    maxRam: number;
    freeRam: number;

    chancePrep: number;
    hackPctPrep: number;

    hackTimePrep: number;
    weakenTimePrep: number;

    hThreads: number;
    gThreads: number;
    w1Threads: number;
    w2Threads: number;

    actualTake: number;

    batchRam: number;
    expectedMoney: number;
    farmScore: number;
    idealIncome: number;

    prepThreads: number;
}

export async function main(ns: NS): Promise<void> {
    const flags = ns.flags([
        ["top", 15],
        ["all", false],
        ["hackable", false],
        ["root", false],
        ["no-root", false],
        ["pct", 0.10],
        ["workers", false],
        ["help", false],
    ]);

    ns.disableLog("ALL");

    const rawArgs = ns.args.map(String);
    const positional =
        Array.isArray(flags._)
            ? flags._
            : [];

    const filter =
        positional[0]
            ? String(positional[0])
            : "";
    const topN = Math.max(1, Math.floor(Number(flags.top) || 15));
    const takePct = clamp(Number(flags.pct) || 0.10, 0.01, 0.50);

    const topSpecified = rawArgs.some(
        (x) => x === "--top" || x.startsWith("--top=")
    );

    const doRoot =
        Boolean(flags.root) &&
        !Boolean(flags["no-root"]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    // ------------------------------------------------------------
    // Worker scripts used for RAM estimates.
    // target.ts still works even if these files do not exist yet.
    // ------------------------------------------------------------

    const H = "h.ts";
    const G = "g.ts";
    const W = "w.ts";

    const hRam =
        ns.getScriptRam(H, "home") || 1.70;

    const gRam =
        ns.getScriptRam(G, "home") || 1.75;

    const wRam =
        ns.getScriptRam(W, "home") || 1.75;

    // ------------------------------------------------------------
    // Network
    // ------------------------------------------------------------

    const hosts = scanAll(ns);
    const hackLevel = ns.getHackingLevel();

    const openerDefs: Opener[] = [
        ["BruteSSH.exe", (host: string) => ns.brutessh(host)],
        ["FTPCrack.exe", (host: string) => ns.ftpcrack(host)],
        ["relaySMTP.exe", (host: string) => ns.relaysmtp(host)],
        ["HTTPWorm.exe", (host: string) => ns.httpworm(host)],
        ["SQLInject.exe", (host: string) => ns.sqlinject(host)],
    ];

    const openers =
        openerDefs.filter(
            ([file]) =>
                ns.fileExists(file, "home")
        );

    // ------------------------------------------------------------
    // Optional auto-root
    // ------------------------------------------------------------

    let rootedNow = 0;

    if (doRoot) {
        for (const host of hosts) {
            if (
                host === "home" ||
                ns.hasRootAccess(host)
            ) {
                continue;
            }

            const portsNeeded =
                ns.getServerNumPortsRequired(host);

            if (portsNeeded > openers.length) {
                continue;
            }

            try {
                for (const [, opener] of openers) {
                    opener(host);
                }

                if (ns.nuke(host)) {
                    rootedNow++;
                }
            } catch {
                // Ignore special/unavailable servers.
            }
        }
    }

    const workerPool =
        collectWorkers(ns, hosts);

    // ------------------------------------------------------------
    // Formulas.exe
    // ------------------------------------------------------------

    const hasFormulas =
        ns.fileExists("Formulas.exe", "home");

    const player =
        hasFormulas
            ? ns.getPlayer()
            : null;

    // One weaken thread, one CPU core.
    const weakenPerThread =
        ns.weakenAnalyze(1, 1);

    const results: TargetMetrics[] = [];

    // ============================================================
    // ANALYSE TARGETS
    // ============================================================

    for (const host of hosts) {
        let maxMoney;

        try {
            maxMoney =
                ns.getServerMaxMoney(host);
        } catch {
            continue;
        }

        // Ignore home, faction hosts, purchased servers,
        // zero-money infrastructure, etc.
        if (!(maxMoney > 0)) {
            continue;
        }

        const rooted =
            ns.hasRootAccess(host);

        const req =
            ns.getServerRequiredHackingLevel(host);

        const ports =
            ns.getServerNumPortsRequired(host);

        const money =
            ns.getServerMoneyAvailable(host);

        const sec =
            ns.getServerSecurityLevel(host);

        const minSec =
            ns.getServerMinSecurityLevel(host);

        const growth =
            ns.getServerGrowth(host);

        const maxRam =
            ns.getServerMaxRam(host);

        const usedRam =
            ns.getServerUsedRam(host);

        const freeRam =
            Math.max(
                0,
                maxRam - usedRam
            );

        const canHack =
            rooted &&
            hackLevel >= req;

        const cashPct =
            money / maxMoney;

        const ready =
            sec <= minSec + 0.05 &&
            money >= maxMoney * 0.999;

        // --------------------------------------------------------
        // PREPPED metrics
        // --------------------------------------------------------

        let chancePrep = 0;
        let hackPctPrep = 0;

        let hackTimePrep = Infinity;
        let weakenTimePrep = Infinity;

        let hThreads = Infinity;
        let gThreads = Infinity;
        let w1Threads = Infinity;
        let w2Threads = Infinity;

        let actualTake = 0;

        let batchRam = Infinity;
        let expectedMoney = 0;
        let farmScore = 0;
        let idealIncome = 0;

        if (canHack) {
            // ====================================================
            // EXACT PATH
            // Formulas.exe
            // ====================================================

            if (hasFormulas && player) {
                const prepped =
                    ns.getServer(host);

                prepped.hackDifficulty =
                    minSec;

                prepped.moneyAvailable =
                    maxMoney;

                chancePrep =
                    ns.formulas.hacking.hackChance(
                        prepped,
                        player
                    );

                hackPctPrep =
                    ns.formulas.hacking.hackPercent(
                        prepped,
                        player
                    );

                hackTimePrep =
                    ns.formulas.hacking.hackTime(
                        prepped,
                        player
                    ) / 1000;

                weakenTimePrep =
                    ns.formulas.hacking.weakenTime(
                        prepped,
                        player
                    ) / 1000;

                if (
                    hackPctPrep > 0 &&
                    Number.isFinite(hackPctPrep)
                ) {
                    hThreads =
                        Math.max(
                            1,
                            Math.ceil(
                                takePct /
                                hackPctPrep
                            )
                        );

                    actualTake =
                        Math.min(
                            0.90,
                            hThreads *
                            hackPctPrep
                        );

                    // State when GROW finishes:
                    // hack already happened,
                    // W1 already restored security to minimum.
                    const afterHack =
                        ns.getServer(host);

                    afterHack.hackDifficulty =
                        minSec;

                    afterHack.moneyAvailable =
                        Math.max(
                            1,
                            maxMoney *
                            (1 - actualTake)
                        );

                    gThreads =
                        Math.ceil(
                            ns.formulas.hacking.growThreads(
                                afterHack,
                                player,
                                maxMoney,
                                1
                            )
                        );

                    // IMPORTANT:
                    // Do NOT pass `host` here.
                    //
                    // This is a HYPOTHETICAL post-hack state.
                    // Passing host would cause the API to cap thread
                    // effects against the server's CURRENT money.
                    //
                    // If current money == maxMoney, that can make
                    // grow security look like zero.
                    const hackSec =
                        ns.hackAnalyzeSecurity(
                            hThreads
                        );

                    const growSec =
                        ns.growthAnalyzeSecurity(
                            gThreads
                        );

                    w1Threads =
                        Math.ceil(
                            hackSec /
                            weakenPerThread
                        );

                    w2Threads =
                        Math.ceil(
                            growSec /
                            weakenPerThread
                        );

                    batchRam =
                        hThreads * hRam +
                        w1Threads * wRam +
                        gThreads * gRam +
                        w2Threads * wRam;

                    expectedMoney =
                        maxMoney *
                        actualTake *
                        chancePrep;

                    farmScore =
                        expectedMoney /
                        Math.max(
                            1,
                            batchRam *
                            weakenTimePrep
                        );

                    idealIncome =
                        farmScore *
                        workerPool.freeRam;
                }
            }

            // ====================================================
            // FALLBACK PATH
            // No Formulas.exe
            // ====================================================

            else {
                const chanceNow =
                    ns.hackAnalyzeChance(host);

                const hackPctNow =
                    ns.hackAnalyze(host);

                const hackTimeNow =
                    ns.getHackTime(host) /
                    1000;

                const weakenTimeNow =
                    ns.getWeakenTime(host) /
                    1000;

                // Hack chance and hack-percent both scale
                // linearly with (100 - security).
                const secScale =
                    (100 - minSec) /
                    Math.max(
                        0.000001,
                        100 -
                        Math.min(
                            sec,
                            99.999999
                        )
                    );

                chancePrep =
                    clamp(
                        chanceNow *
                        secScale,
                        0,
                        1
                    );

                hackPctPrep =
                    clamp(
                        hackPctNow *
                        secScale,
                        0,
                        1
                    );

                // Hacking execution time scales with:
                //
                // 2.5 * requiredHack * security + 500
                //
                // Player multiplier cancels when taking
                // current/prepped ratio.
                const currentTimeFactor =
                    2.5 * req * sec +
                    500;

                const prepTimeFactor =
                    2.5 * req * minSec +
                    500;

                const timeScale =
                    prepTimeFactor /
                    Math.max(
                        1,
                        currentTimeFactor
                    );

                hackTimePrep =
                    hackTimeNow *
                    timeScale;

                weakenTimePrep =
                    weakenTimeNow *
                    timeScale;

                if (
                    hackPctPrep > 0 &&
                    Number.isFinite(hackPctPrep)
                ) {
                    hThreads =
                        Math.max(
                            1,
                            Math.ceil(
                                takePct /
                                hackPctPrep
                            )
                        );

                    actualTake =
                        Math.min(
                            0.90,
                            hThreads *
                            hackPctPrep
                        );

                    const multiplier =
                        1 /
                        Math.max(
                            0.01,
                            1 - actualTake
                        );

                    /*
                     * growthAnalyze() uses CURRENT security.
                     *
                     * We project its result to min-security
                     * using the exact security-dependent
                     * logarithmic growth component used by
                     * Bitburner.
                     */
                    const rawGrow =
                        ns.growthAnalyze(
                            host,
                            multiplier,
                            1
                        );

                    const currentGrowthLog =
                        growthLog(sec);

                    const prepGrowthLog =
                        growthLog(minSec);

                    const growthScale =
                        currentGrowthLog /
                        Math.max(
                            1e-12,
                            prepGrowthLog
                        );

                    gThreads =
                        Math.max(
                            1,
                            Math.ceil(
                                rawGrow *
                                growthScale
                            )
                        );

                    /*
                     * THIS IS THE IMPORTANT FIX.
                     *
                     * No hostname parameter.
                     *
                     * We want security generated by the
                     * requested hypothetical thread count,
                     * NOT security capped against current
                     * server money.
                     */
                    const hackSec =
                        ns.hackAnalyzeSecurity(
                            hThreads
                        );

                    const growSec =
                        ns.growthAnalyzeSecurity(
                            gThreads
                        );

                    w1Threads =
                        Math.ceil(
                            hackSec /
                            weakenPerThread
                        );

                    w2Threads =
                        Math.ceil(
                            growSec /
                            weakenPerThread
                        );

                    batchRam =
                        hThreads * hRam +
                        w1Threads * wRam +
                        gThreads * gRam +
                        w2Threads * wRam;

                    expectedMoney =
                        maxMoney *
                        actualTake *
                        chancePrep;

                    farmScore =
                        expectedMoney /
                        Math.max(
                            1,
                            batchRam *
                            weakenTimePrep
                        );

                    idealIncome =
                        farmScore *
                        workerPool.freeRam;
                }
            }
        }

        // ========================================================
        // CURRENT PREP WORKLOAD
        // ========================================================

        const initialWeaken =
            Math.ceil(
                Math.max(
                    0,
                    sec - minSec
                ) /
                weakenPerThread
            );

        let prepGrow = 0;

        if (
            canHack &&
            money <
            maxMoney * 0.999
        ) {
            if (hasFormulas && player) {
                const growServer =
                    ns.getServer(host);

                growServer.hackDifficulty =
                    minSec;

                growServer.moneyAvailable =
                    Math.max(
                        0,
                        money
                    );

                prepGrow =
                    Math.ceil(
                        ns.formulas.hacking.growThreads(
                            growServer,
                            player,
                            maxMoney,
                            1
                        )
                    );
            } else {
                const multiplier =
                    maxMoney /
                    Math.max(
                        1,
                        money
                    );

                const rawGrow =
                    ns.growthAnalyze(
                        host,
                        multiplier,
                        1
                    );

                const growthScale =
                    growthLog(sec) /
                    Math.max(
                        1e-12,
                        growthLog(minSec)
                    );

                prepGrow =
                    Math.ceil(
                        rawGrow *
                        growthScale
                    );
            }
        }

        if (
            !Number.isFinite(prepGrow) ||
            prepGrow < 0
        ) {
            prepGrow = 0;
        }

        /*
         * Again: no hostname here.
         *
         * prepGrow represents a PLANNED thread count,
         * possibly under a hypothetical weakened state.
         */
        const prepGrowSecurity =
            prepGrow > 0
                ? ns.growthAnalyzeSecurity(
                    prepGrow
                )
                : 0;

        const prepGrowWeaken =
            Math.ceil(
                prepGrowSecurity /
                weakenPerThread
            );

        const prepThreads =
            initialWeaken +
            prepGrow +
            prepGrowWeaken;

        results.push({
            host,

            rooted,
            canHack,

            req,
            ports,
            growth,

            money,
            maxMoney,
            cashPct,

            sec,
            minSec,

            maxRam,
            freeRam,

            chancePrep,
            hackPctPrep,

            hackTimePrep,
            weakenTimePrep,

            hThreads,
            gThreads,
            w1Threads,
            w2Threads,

            actualTake,

            batchRam,
            expectedMoney,
            farmScore,
            idealIncome,

            prepThreads,
            ready,
        });
    }

    // ============================================================
    // SORT
    // ============================================================

    results.sort(
        (a, b) =>
            b.farmScore -
                a.farmScore ||
            b.idealIncome -
                a.idealIncome ||
            b.maxMoney -
                a.maxMoney
    );

    if (rootedNow > 0) {
        ns.tprint(
            `INFO Auto-rooted ${rootedNow} server(s).`
        );
    }

    // ============================================================
    // HEADER
    // ============================================================

    ns.tprint(
        `Hack ${hackLevel} | ` +
        `Openers ${openers.length}/5 | ` +
        `Servers ${hosts.length} | ` +
        `Workers ${workerPool.count} | ` +
        `Free ${fmtRam(workerPool.freeRam)}` +
        `/${fmtRam(workerPool.totalRam)} | ` +
        `Take ${(takePct * 100).toFixed(0)}% | ` +
        `Formulas ${hasFormulas ? "YES" : "NO"}`
    );

    if (!hasFormulas) {
        ns.tprint(
            "WARN Formulas.exe missing: PREPPED values are projected estimates."
        );
    }

    // ============================================================
    // WORKERS
    // ============================================================

    if (flags.workers) {
        printWorkers(
            ns,
            workerPool.workers
        );
    }

    // ============================================================
    // SINGLE TARGET
    // ============================================================

    if (filter) {
        const exact =
            results.find(
                (x) =>
                    x.host === filter
            ) ??
            results.find(
                (x) =>
                    x.host.includes(filter)
            );

        if (!exact) {
            ns.tprint(
                `ERROR No money server matching "${filter}".`
            );
            return;
        }

        printDetail(
            ns,
            exact,
            takePct,
            workerPool
        );

        return;
    }

    // ============================================================
    // TABLE
    // ============================================================

    let rows: TargetMetrics[];

    if (flags.all) {
        rows = results;
    } else {
        rows =
            results.filter(
                (x) =>
                    x.canHack
            );
    }

    const limit =
        flags.all &&
        !topSpecified
            ? rows.length
            : topN;

    ns.tprint("");

    ns.tprint(
        " # HOST                 " +
        "ST    " +
        "REQ    " +
        "CH%     " +
        "HACK      " +
        "MAX$      " +
        "G   " +
        "CASH    " +
        "SECΔ    " +
        "PREP      " +
        "HWGW          " +
        "RAM       " +
        "$/GB/s"
    );

    ns.tprint(
        "-".repeat(132)
    );

    rows
        .slice(0, limit)
        .forEach(
            (x, i) => {
                const state =
                    !x.rooted
                        ? "LOCK"
                        : !x.canHack
                          ? "HIGH"
                          : x.ready
                            ? "READY"
                            : "PREP";

                const hwgw =
                    Number.isFinite(
                        x.hThreads
                    )
                        ? `${x.hThreads}/${x.w1Threads}/${x.gThreads}/${x.w2Threads}`
                        : "-";

                ns.tprint(
                    `${pad(i + 1, 2)} ` +
                    `${left(x.host, 20)} ` +
                    `${left(state, 5)} ` +
                    `${pad(x.req, 4)} ` +
                    `${pad(pct(x.chancePrep), 6)} ` +
                    `${pad(fmtTime(x.hackTimePrep), 8)} ` +
                    `${pad(fmtMoney(x.maxMoney), 9)} ` +
                    `${pad(x.growth, 3)} ` +
                    `${pad(pct(x.cashPct), 6)} ` +
                    `${pad(
                        (
                            x.sec -
                            x.minSec
                        ).toFixed(1),
                        7
                    )} ` +
                    `${pad(
                        fmtInt(
                            x.prepThreads
                        ),
                        8
                    )} ` +
                    `${pad(hwgw, 13)} ` +
                    `${pad(
                        fmtRam(
                            x.batchRam
                        ),
                        9
                    )} ` +
                    `${pad(
                        fmtNumber(
                            x.farmScore
                        ),
                        11
                    )}`
                );
            }
        );

    ns.tprint("");

    ns.tprint(
        "HWGW = hack / weaken1 / grow / weaken2"
    );

    ns.tprint(
        "Score = expected money / (HWGW RAM × prepped weaken time)"
    );

    ns.tprint(
        "Use: t HOST | t --top 25 | t --all | " +
        "t --all --top 25 | t --workers | t --root | t --no-root"
    );
}


// ================================================================
// NETWORK DISCOVERY
// ================================================================

function scanAll(ns: NS): string[] {
    const seen =
        new Set(["home"]);

    const queue =
        ["home"];

    while (queue.length > 0) {
        const host =
            queue.shift();

        if (host === undefined) {
            break;
        }

        for (
            const next
            of ns.scan(host)
        ) {
            if (seen.has(next)) {
                continue;
            }

            seen.add(next);
            queue.push(next);
        }
    }

    return [...seen];
}


// ================================================================
// WORKER POOL
// ================================================================

function collectWorkers(
    ns: NS,
    hosts: string[]
): WorkerPool {
    const workers = [];

    for (const host of hosts) {
        try {
            if (
                !ns.hasRootAccess(host)
            ) {
                continue;
            }

            const maxRam =
                ns.getServerMaxRam(host);

            if (!(maxRam > 0)) {
                continue;
            }

            const usedRam =
                ns.getServerUsedRam(host);

            const freeRam =
                Math.max(
                    0,
                    maxRam - usedRam
                );

            workers.push({
                host,
                maxRam,
                usedRam,
                freeRam,
            });
        } catch {
            // Skip weird/special hosts.
        }
    }

    workers.sort(
        (a, b) =>
            b.freeRam -
                a.freeRam ||
            b.maxRam -
                a.maxRam
    );

    return {
        workers,

        count:
            workers.length,

        totalRam:
            workers.reduce(
                (sum, x) =>
                    sum +
                    x.maxRam,
                0
            ),

        usedRam:
            workers.reduce(
                (sum, x) =>
                    sum +
                    x.usedRam,
                0
            ),

        freeRam:
            workers.reduce(
                (sum, x) =>
                    sum +
                    x.freeRam,
                0
            ),
    };
}


// ================================================================
// SERVER GROWTH SECURITY PROJECTION
// ================================================================
//
// Bitburner v3.x growth security dependency.
//
// ServerBaseGrowthIncr = 0.03
// ServerMaxGrowthLog  = 0.00349388925425578
//
// Other multipliers cancel when calculating the ratio between
// current-security growth and minimum-security growth.
// ================================================================

function growthLog(sec: number): number {
    const BASE =
        0.03;

    const MAX_LOG =
        0.00349388925425578;

    const value =
        Math.log1p(
            BASE /
            Math.max(
                0.000001,
                sec
            )
        );

    return Math.min(
        value,
        MAX_LOG
    );
}


// ================================================================
// SINGLE TARGET DETAIL
// ================================================================

function printDetail(
    ns: NS,
    x: TargetMetrics,
    takePct: number,
    workerPool: WorkerPool
): void {
    ns.tprint("");

    ns.tprint(
        `=== ${x.host} ===`
    );

    ns.tprint(
        `Root: ${x.rooted ? "YES" : "NO"} | ` +
        `Hackable: ${x.canHack ? "YES" : "NO"} | ` +
        `Req: ${x.req} | ` +
        `Ports: ${x.ports} | ` +
        `Growth: ${x.growth}`
    );

    ns.tprint(
        `Money: ${fmtMoney(x.money)} / ` +
        `${fmtMoney(x.maxMoney)} ` +
        `(${pct(x.cashPct)})`
    );

    ns.tprint(
        `Security: ${x.sec.toFixed(2)} / ` +
        `${x.minSec.toFixed(2)} ` +
        `(Δ ${(x.sec - x.minSec).toFixed(2)})`
    );

    ns.tprint(
        `Target RAM: ${fmtRam(x.freeRam)} / ` +
        `${fmtRam(x.maxRam)} free`
    );

    ns.tprint(
        `Worker pool: ${fmtRam(workerPool.freeRam)} / ` +
        `${fmtRam(workerPool.totalRam)} free across ` +
        `${workerPool.count} rooted RAM hosts`
    );

    ns.tprint("");

    ns.tprint(
        `PREPPED chance : ${pct(x.chancePrep)}`
    );

    ns.tprint(
        `PREPPED hack   : ${fmtTime(x.hackTimePrep)}`
    );

    ns.tprint(
        `Prep workload  : ~${fmtInt(x.prepThreads)} threads`
    );

    ns.tprint(
        `State          : ${x.ready ? "READY" : "NEEDS PREP"}`
    );

    if (
        Number.isFinite(
            x.hThreads
        )
    ) {
        ns.tprint("");

        ns.tprint(
            `${(takePct * 100).toFixed(0)}% HWGW plan:`
        );

        ns.tprint(
            `  H=${x.hThreads} ` +
            `W1=${x.w1Threads} ` +
            `G=${x.gThreads} ` +
            `W2=${x.w2Threads}`
        );

        ns.tprint(
            `  Actual take  : ${pct(x.actualTake)}`
        );

        ns.tprint(
            `  Batch RAM    : ${fmtRam(x.batchRam)}`
        );

        ns.tprint(
            `  Expected     : ${fmtMoney(x.expectedMoney)} / batch`
        );

        ns.tprint(
            `  Farm score   : ${fmtNumber(x.farmScore)} $/GB/s`
        );

        ns.tprint(
            `  Ideal pool   : ~${fmtMoney(x.idealIncome)}/s`
        );
    }
}


// ================================================================
// WORKER TABLE
// ================================================================

function printWorkers(
    ns: NS,
    workers: Worker[]
): void {
    ns.tprint("");

    ns.tprint(
        "WORKER POOL"
    );

    ns.tprint(
        "HOST                   " +
        "FREE       " +
        "USED       " +
        "TOTAL"
    );

    ns.tprint(
        "-".repeat(54)
    );

    for (const x of workers) {
        ns.tprint(
            `${left(x.host, 22)} ` +
            `${pad(fmtRam(x.freeRam), 9)} ` +
            `${pad(fmtRam(x.usedRam), 9)} ` +
            `${pad(fmtRam(x.maxRam), 9)}`
        );
    }
}


// ================================================================
// HELP
// ================================================================

function printHelp(ns: NS): void {
    ns.tprint(
        "7n8 TARGET INTELLIGENCE"
    );

    ns.tprint("");

    ns.tprint(
        "Usage:"
    );

    ns.tprint(
        "  run target.ts"
    );

    ns.tprint(
        "  run target.ts phantasy"
    );

    ns.tprint(
        "  run target.ts --top 25"
    );

    ns.tprint(
        "  run target.ts --all"
    );

    ns.tprint(
        "  run target.ts --all --top 25"
    );

    ns.tprint(
        "  run target.ts --workers"
    );

    ns.tprint(
        "  run target.ts --root"
    );

    ns.tprint(
        "  run target.ts --no-root"
    );

    ns.tprint(
        "  run target.ts --pct 0.15"
    );
}


// ================================================================
// FORMATTERS
// ================================================================

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


function pct(value: number): string {
    if (!Number.isFinite(value)) {
        return "-";
    }

    return (
        (value * 100)
            .toFixed(1) +
        "%"
    );
}


function fmtInt(value: number): string {
    if (!Number.isFinite(value)) {
        return "-";
    }

    if (value >= 1e9) {
        return (
            value / 1e9
        ).toFixed(1) + "b";
    }

    if (value >= 1e6) {
        return (
            value / 1e6
        ).toFixed(1) + "m";
    }

    if (value >= 1e3) {
        return (
            value / 1e3
        ).toFixed(1) + "k";
    }

    return String(
        Math.round(value)
    );
}


function fmtMoney(value: number): string {
    if (!Number.isFinite(value)) {
        return "-";
    }

    const abs =
        Math.abs(value);

    if (abs >= 1e15) {
        return (
            "$" +
            (
                value /
                1e15
            ).toFixed(1) +
            "q"
        );
    }

    if (abs >= 1e12) {
        return (
            "$" +
            (
                value /
                1e12
            ).toFixed(1) +
            "t"
        );
    }

    if (abs >= 1e9) {
        return (
            "$" +
            (
                value /
                1e9
            ).toFixed(1) +
            "b"
        );
    }

    if (abs >= 1e6) {
        return (
            "$" +
            (
                value /
                1e6
            ).toFixed(1) +
            "m"
        );
    }

    if (abs >= 1e3) {
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


function fmtRam(value: number): string {
    if (!Number.isFinite(value)) {
        return "-";
    }

    if (value >= 1024 * 1024) {
        return (
            value /
            (1024 * 1024)
        ).toFixed(2) + "P";
    }

    if (value >= 1024) {
        return (
            value /
            1024
        ).toFixed(2) + "T";
    }

    return (
        value.toFixed(0) +
        "G"
    );
}


function fmtTime(seconds: number): string {
    if (!Number.isFinite(seconds)) {
        return "-";
    }

    if (seconds < 60) {
        return (
            seconds.toFixed(1) +
            "s"
        );
    }

    if (seconds < 3600) {
        return (
            (
                seconds /
                60
            ).toFixed(1) +
            "m"
        );
    }

    return (
        (
            seconds /
            3600
        ).toFixed(1) +
        "h"
    );
}


function fmtNumber(value: number): string {
    if (!Number.isFinite(value)) {
        return "-";
    }

    const abs =
        Math.abs(value);

    if (abs >= 1e9) {
        return (
            value /
            1e9
        ).toFixed(2) + "b";
    }

    if (abs >= 1e6) {
        return (
            value /
            1e6
        ).toFixed(2) + "m";
    }

    if (abs >= 1e3) {
        return (
            value /
            1e3
        ).toFixed(2) + "k";
    }

    return value.toFixed(2);
}


function pad(
    value: string | number,
    width: number
): string {
    return String(value)
        .padStart(
            width,
            " "
        );
}


function left(
    value: string | number,
    width: number
): string {
    const s =
        String(value);

    if (s.length > width) {
        return s.slice(
            0,
            width
        );
    }

    return s.padEnd(
        width,
        " "
    );
}