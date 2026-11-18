/** @param {NS} ns */
export async function main(ns) {
    const f = ns.flags([
        ["pct", 0.10],
        ["gap", 200],
        ["reserve-pct", 0.20],
        ["grow-safety", 1.05],

        // Spawn worker slightly before nominal action start.
        ["launch-lead", 1000],

        // Small compensation for controller -> exec -> worker startup.
        ["exec-fudge", 50],

        // Extra schedule maintained AFTER one full weaken duration.
        ["lookahead", 30],

        // Extra runway when creating the first / emergency batch.
        ["plan-lead", 2000],

        // Do not run cadence exactly on theoretical RAM limit.
        ["period-safety", 1.03],

        // 0 = continuous.
        ["limit", 0],

        ["tail", false],
        ["help", false],
    ]);

    ns.disableLog("ALL");

    const target = f._[0] ? String(f._[0]) : "";

    if (f.help || !target) {
        help(ns);
        return;
    }

    const pct = clamp(Number(f.pct) || 0.10, 0.01, 0.40);
    const gap = Math.max(100, Number(f.gap) || 200);

    const reservePct = clamp(
        Number(f["reserve-pct"]) || 0.20,
        0.05,
        0.50
    );

    const growSafety = clamp(
        Number(f["grow-safety"]) || 1.05,
        1.00,
        1.20
    );

    const launchLead = Math.max(
        250,
        Number(f["launch-lead"]) || 1000
    );

    const execFudge = Math.max(
        0,
        Number(f["exec-fudge"]) || 50
    );

    const lookaheadMs =
        Math.max(10, Number(f.lookahead) || 30) *
        1000;

    const planLead =
        Math.max(500, Number(f["plan-lead"]) || 2000);

    const periodSafety = clamp(
        Number(f["period-safety"]) || 1.03,
        1.00,
        1.25
    );

    const limit = Math.max(
        0,
        Math.floor(Number(f.limit) || 0)
    );

    // ============================================================
    // VALIDATION
    // ============================================================

    if (!ns.fileExists("Formulas.exe", "home")) {
        ns.tprint("ERROR jit3.js requires Formulas.exe.");
        return;
    }

    for (const file of ["lh.js", "lg.js", "lw.js"]) {
        if (!ns.fileExists(file, "home")) {
            ns.tprint(`ERROR Missing ${file}.`);
            return;
        }
    }

    if (
        !ns.serverExists(target) ||
        !ns.hasRootAccess(target)
    ) {
        ns.tprint(`ERROR invalid/unrooted target: ${target}`);
        return;
    }

    if (
        ns.getHackingLevel() <
        ns.getServerRequiredHackingLevel(target)
    ) {
        ns.tprint(`ERROR hacking level too low for ${target}.`);
        return;
    }

    const startState = state(ns, target);

    if (!ready(startState)) {
        ns.tprint(`ERROR ${target} is not READY.`);
        ns.tprint(
            `money=${money(startState.money)}/${money(startState.maxMoney)} | ` +
            `sec=${startState.sec.toFixed(3)}/${startState.minSec.toFixed(3)}`
        );
        return;
    }

    const duplicate = ns.ps("home").find(
        p =>
            p.filename === "jit3.js" &&
            p.pid !== ns.pid
    );

    if (duplicate) {
        ns.tprint(
            `ERROR jit3.js already running: pid=${duplicate.pid}`
        );
        return;
    }

    if (f.tail) ns.tail();

    // ============================================================
    // HARDWARE
    // ============================================================

    const home = ns.getServer("home");
    const cores = Math.max(1, home.cpuCores || 1);

    const homeRam = ns.getServerMaxRam("home");
    const baseUsed = ns.getServerUsedRam("home");

    const hardLimit =
        homeRam *
        (1 - reservePct);

    const workerBudget =
        hardLimit -
        baseUsed;

    if (workerBudget <= 0) {
        ns.tprint("ERROR no worker RAM budget.");
        return;
    }

    const ram = {
        h: ns.getScriptRam("lh.js", "home"),
        g: ns.getScriptRam("lg.js", "home"),
        w: ns.getScriptRam("lw.js", "home"),
    };

    // ============================================================
    // INITIAL MODEL + CADENCE
    // ============================================================

    let model = makeModel(
        ns,
        target,
        pct,
        growSafety,
        cores,
        ram
    );

    if (!model) {
        ns.tprint("ERROR cannot calculate batch model.");
        return;
    }

    let period = safePeriod(
        workerBudget,
        model,
        gap,
        launchLead
    );

    if (!Number.isFinite(period)) {
        ns.tprint("ERROR cannot find safe JIT cadence.");
        return;
    }

    period = roundPeriod(
        period *
        periodSafety
    );

    // ============================================================
    // STATE
    // ============================================================

    let batches = [];
    let jobs = [];

    const livePids = new Set();

    let nextBatchId = 1;
    let totalPlanned = 0;
    let totalVerified = 0;

    let lastHFinish = 0;

    let fatal = false;
    let fatalReason = "";

    let lastPlanning = 0;
    let lastPidSweep = 0;
    let lastTelemetry = 0;

    const started = Date.now();
    const hackStart = ns.getHackingLevel();
    const incomeStart = hackIncome(ns);

    ns.atExit(() => {
        for (const pid of livePids) {
            try {
                ns.kill(pid);
            } catch {}
        }
    }, "jit3-cleanup");

    // ============================================================
    // TIME-BASED ROLLING PLANNER
    // ============================================================

    function refillSchedule() {
        const now = Date.now();

        const fresh = makeModel(
            ns,
            target,
            pct,
            growSafety,
            cores,
            ram
        );

        if (!fresh) {
            fatal = true;
            fatalReason = "fresh Formulas model failed";
            return;
        }

        const required = safePeriod(
            workerBudget,
            fresh,
            gap,
            launchLead
        );

        if (!Number.isFinite(required)) {
            fatal = true;
            fatalReason = "fresh model no longer fits RAM";
            return;
        }

        /*
         * Never abruptly speed up an already-running stream.
         *
         * If a newer model needs MORE spacing, slow down safely.
         * If it could run faster, retain current cadence until
         * the next clean restart.
         */
        const safeRequired = roundPeriod(
            required *
            periodSafety
        );

        if (safeRequired > period) {
            ns.print(
                `[CADENCE] ${period}ms -> ${safeRequired}ms ` +
                `(new model needs more RAM-time)`
            );

            period = safeRequired;
        }

        model = fresh;

        /*
         * Critical change from jit2:
         *
         * Always keep H-finish tail at least:
         *
         * NOW + weakenTime + launchLead + lookahead
         *
         * into the future.
         *
         * This guarantees future W jobs can still be launched
         * without waiting another whole weaken cycle.
         */
        const desiredTail =
            now +
            model.times.w +
            launchLead +
            lookaheadMs;

        let added = 0;

        while (
            lastHFinish < desiredTail &&
            (limit === 0 || totalPlanned < limit)
        ) {
            let hFinish;

            if (lastHFinish === 0) {
                hFinish =
                    now +
                    model.times.w +
                    launchLead +
                    planLead;
            } else {
                hFinish =
                    lastHFinish +
                    period;
            }

            /*
             * Emergency runway guard.
             *
             * In a healthy rolling stream this should almost
             * never change hFinish after startup.
             */
            const minimumFinish =
                now +
                model.times.w +
                launchLead +
                planLead;

            if (hFinish < minimumFinish) {
                hFinish = minimumFinish;
            }

            const batch = buildBatch(
                nextBatchId,
                hFinish,
                model,
                gap,
                period,
                launchLead
            );

            batches.push(batch);

            for (const job of batch.jobs) {
                jobs.push(job);
            }

            lastHFinish = hFinish;

            totalPlanned++;
            nextBatchId++;
            added++;
        }

        if (added > 0) {
            jobs.sort(
                (a, b) =>
                    a.earliestLaunch -
                        b.earliestLaunch ||
                    a.finishAt -
                        b.finishAt
            );

            ns.print(
                `[PLAN] Hack=${ns.getHackingLevel()} | ` +
                `+${added} | planned=${totalPlanned} | ` +
                `verified=${totalVerified}`
            );

            ns.print(
                `[PLAN] H=${model.h} W1=${model.w1} ` +
                `G=${model.g} W2=${model.w2} | ` +
                `take=${(model.take * 100).toFixed(2)}% | ` +
                `chance=${(model.chance * 100).toFixed(1)}%`
            );

            ns.print(
                `[PLAN] period=${period}ms | ` +
                `tail=${duration(lastHFinish - now)} | ` +
                `EV=${money(model.expectedBatch)}/batch`
            );
        }

        lastPlanning = now;
    }

    refillSchedule();

    if (fatal) {
        ns.tprint(`ERROR ${fatalReason}`);
        return;
    }

    ns.tprint(
        `7n8 JIT v0.3 SMOOTH | target=${target}`
    );

    ns.tprint(
        `HOME=${ramFmt(homeRam)} | cores=${cores} | ` +
        `budget=${ramFmt(workerBudget)} | ` +
        `reserve=${(reservePct * 100).toFixed(0)}%`
    );

    ns.tprint(
        `gap=${gap}ms | period=${period}ms | ` +
        `lookahead=weaken+${(lookaheadMs / 1000).toFixed(0)}s | ` +
        `limit=${limit === 0 ? "∞" : limit}`
    );

    ns.tprint(
        `H=${model.h} W1=${model.w1} ` +
        `G=${model.g} W2=${model.w2} | ` +
        `batchRAM=${ramFmt(model.batchRam)}`
    );

    ns.tprint(
        `steady-EV≈${money(
            model.expectedBatch /
            (period / 1000)
        )}/s`
    );

    // ============================================================
    // EXECUTION LOOP
    // ============================================================

    while (!fatal) {
        const now = Date.now();

        // --------------------------------------------------------
        // PID CLEANUP
        // --------------------------------------------------------

        if (now - lastPidSweep >= 500) {
            const running = new Set(
                ns.ps("home").map(p => p.pid)
            );

            for (const pid of [...livePids]) {
                if (!running.has(pid)) {
                    livePids.delete(pid);
                }
            }

            lastPidSweep = now;
        }

        // --------------------------------------------------------
        // VERIFY BATCHES INSIDE CLEAN WINDOW
        // --------------------------------------------------------

        for (const batch of batches) {
            if (
                batch.verified ||
                now < batch.verifyStart
            ) {
                continue;
            }

            const s = state(ns, target);

            if (ready(s)) {
                batch.verified = true;
                totalVerified++;
                continue;
            }

            if (now < batch.verifyDeadline) {
                continue;
            }

            fatal = true;

            fatalReason =
                `B${batch.id} drift | ` +
                `money=${(
                    s.money /
                    s.maxMoney *
                    100
                ).toFixed(3)}% | ` +
                `sec=${s.sec.toFixed(3)}/${s.minSec.toFixed(3)}`;

            break;
        }

        if (fatal) break;

        // --------------------------------------------------------
        // FINITE TEST FINISHED
        // --------------------------------------------------------

        if (
            limit > 0 &&
            totalVerified >= limit
        ) {
            break;
        }

        // --------------------------------------------------------
        // KEEP TIME HORIZON FULL
        // --------------------------------------------------------

        if (
            now -
                lastPlanning >=
            250
        ) {
            refillSchedule();

            if (fatal) break;
        }

        // --------------------------------------------------------
        // LAUNCH JOBS
        // --------------------------------------------------------

        for (const job of jobs) {
            if (job.launched) {
                continue;
            }

            if (
                job.earliestLaunch >
                Date.now()
            ) {
                break;
            }

            const sec =
                ns.getServerSecurityLevel(target);

            const minSec =
                ns.getServerMinSecurityLevel(target);

            /*
             * HGW duration is determined at CALL time.
             * Only call the lean worker while target is clean.
             */
            if (
                sec >
                minSec +
                0.001
            ) {
                if (
                    Date.now() >=
                    job.modelStart
                ) {
                    fatal = true;

                    fatalReason =
                        `${job.tag} missed clean launch window | ` +
                        `sec=${sec.toFixed(3)}/${minSec.toFixed(3)}`;
                }

                break;
            }

            const d = currentDuration(
                ns,
                target,
                job.action
            );

            const extra =
                job.finishAt -
                Date.now() -
                d -
                execFudge;

            if (extra < 0) {
                fatal = true;

                fatalReason =
                    `${job.tag} missed deadline by ` +
                    `${Math.abs(extra).toFixed(0)}ms`;

                break;
            }

            const free =
                ns.getServerMaxRam("home") -
                ns.getServerUsedRam("home");

            if (
                free +
                1e-6 <
                job.ram
            ) {
                if (
                    Date.now() >=
                    job.modelStart
                ) {
                    fatal = true;

                    fatalReason =
                        `${job.tag} RAM collision | ` +
                        `need=${ramFmt(job.ram)} ` +
                        `free=${ramFmt(free)}`;
                }

                break;
            }

            /*
             * Third argument after "extra" is ignored by the lean
             * worker but intentionally makes process args unique.
             */
            const pid = ns.exec(
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

            if (pid === 0) {
                fatal = true;
                fatalReason = `exec failed: ${job.tag}`;
                break;
            }

            job.launched = true;
            job.pid = pid;

            livePids.add(pid);
        }

        if (fatal) break;

        // --------------------------------------------------------
        // TELEMETRY
        // --------------------------------------------------------

        if (
            totalVerified >=
            lastTelemetry + 10
        ) {
            lastTelemetry =
                Math.floor(
                    totalVerified /
                    10
                ) *
                10;

            const elapsed =
                Date.now() -
                started;

            const earned =
                hackIncome(ns) -
                incomeStart;

            const rate =
                earned /
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
                `[ROLL] income=${money(earned)} | ` +
                `REAL=${money(rate)}/s | ` +
                `live=${livePids.size} | ` +
                `tail=${duration(lastHFinish - Date.now())}`
            );
        }

        // --------------------------------------------------------
        // PRUNE OLD RECORDS
        // --------------------------------------------------------

        batches = batches.filter(
            b =>
                !b.verified ||
                b.verifyDeadline >
                    now -
                    5000
        );

        jobs = jobs.filter(
            j =>
                !j.launched ||
                j.finishAt >
                    now -
                    5000
        );

        await ns.sleep(10);
    }

    // ============================================================
    // ABORT
    // ============================================================

    if (fatal) {
        ns.tprint("");
        ns.tprint(`JIT3 ABORT: ${fatalReason}`);

        for (const pid of livePids) {
            try {
                ns.kill(pid);
            } catch {}
        }

        ns.tprint(
            `Recover: run harvest.ts ${target} --prep-only --tail`
        );

        return;
    }

    await ns.sleep(500);

    const final = state(ns, target);

    const elapsed =
        Date.now() -
        started;

    const earned =
        hackIncome(ns) -
        incomeStart;

    const rate =
        earned /
        Math.max(
            1,
            elapsed /
            1000
        );

    ns.tprint("");

    ns.tprint(
        `JIT3 COMPLETE | verified=${totalVerified}/${totalPlanned} | ` +
        `runtime=${duration(elapsed)}`
    );

    ns.tprint(
        `Hack=${hackStart}->${ns.getHackingLevel()} | ` +
        `hacking-income=${money(earned)} | ` +
        `REAL=${money(rate)}/s`
    );

    ns.tprint(
        `target=${money(final.money)}/${money(final.maxMoney)} ` +
        `(${(
            final.money /
            final.maxMoney *
            100
        ).toFixed(3)}%) | ` +
        `sec=${final.sec.toFixed(3)}/${final.minSec.toFixed(3)}`
    );

    if (ready(final)) {
        ns.tprint(
            "JIT3 PASS: smooth rolling pipeline returned target READY."
        );
    } else {
        ns.tprint(
            "JIT3 DRIFT: final target is not READY."
        );
    }
}


// ================================================================
// FORMULAS MODEL
// ================================================================

function makeModel(
    ns,
    target,
    pct,
    growSafety,
    cores,
    ram
) {
    const player = ns.getPlayer();
    const server = ns.getServer(target);

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
        return null;
    }

    const h = Math.max(
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

    const weakenOne =
        ns.formulas.hacking.weakenEffect(
            1,
            cores
        );

    const hackSec =
        ns.hackAnalyzeSecurity(
            h,
            target
        );

    const w1 = Math.max(
        1,
        Math.ceil(
            hackSec /
            weakenOne
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

    g = Math.max(
        1,
        Math.ceil(
            g *
            growSafety
        )
    );

    const growSec =
        ns.growthAnalyzeSecurity(
            g,
            undefined,
            cores
        );

    const w2 = Math.max(
        1,
        Math.ceil(
            growSec /
            weakenOne
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


// ================================================================
// SUSTAINABLE SMOOTH PERIOD
// ================================================================

function safePeriod(
    budget,
    model,
    gap,
    launchLead
) {
    /*
     * Ensure a real READY window exists between:
     *
     * current W2 = H + 3*gap
     * next H     = H + period
     */
    let lo =
        Math.ceil(
            4 *
            gap +
            100
        );

    let hi =
        Math.ceil(
            model.times.w +
            4 *
            gap +
            launchLead
        );

    if (
        peakForPeriod(
            hi,
            model,
            gap,
            launchLead
        ) >
        budget
    ) {
        return Infinity;
    }

    while (lo < hi) {
        const mid =
            Math.floor(
                (lo + hi) /
                2
            );

        const peak =
            peakForPeriod(
                mid,
                model,
                gap,
                launchLead
            );

        if (peak <= budget) {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }

    return lo;
}


function peakForPeriod(
    period,
    model,
    gap,
    launchLead
) {
    const events = [];

    /*
     * Enough batches to reach steady state.
     */
    const count = 300;

    for (
        let b = 0;
        b < count;
        b++
    ) {
        const hFinish =
            b *
            period;

        interval(
            events,

            hFinish -
                model.times.h -
                launchLead,

            hFinish +
                100,

            model.actionRam.h
        );

        interval(
            events,

            hFinish +
                gap -
                model.times.w -
                launchLead,

            hFinish +
                gap +
                100,

            model.actionRam.w1
        );

        interval(
            events,

            hFinish +
                2 *
                gap -
                model.times.g -
                launchLead,

            hFinish +
                2 *
                gap +
                100,

            model.actionRam.g
        );

        interval(
            events,

            hFinish +
                3 *
                gap -
                model.times.w -
                launchLead,

            hFinish +
                3 *
                gap +
                100,

            model.actionRam.w2
        );
    }

    events.sort(
        (a, b) =>
            a.time -
                b.time ||
            a.delta -
                b.delta
    );

    let current = 0;
    let peak = 0;

    for (const e of events) {
        current += e.delta;

        peak =
            Math.max(
                peak,
                current
            );
    }

    return peak;
}


function interval(
    events,
    start,
    end,
    ram
) {
    events.push({
        time: start,
        delta: ram,
    });

    events.push({
        time: end,
        delta: -ram,
    });
}


// ================================================================
// BATCH
// ================================================================

function buildBatch(
    id,
    hFinish,
    m,
    gap,
    period,
    launchLead
) {
    const jobs = [
        job(
            id,
            "H",
            "lh.js",
            m.h,
            m.actionRam.h,
            hFinish,
            m.times.h,
            launchLead
        ),

        job(
            id,
            "W1",
            "lw.js",
            m.w1,
            m.actionRam.w1,
            hFinish + gap,
            m.times.w,
            launchLead
        ),

        job(
            id,
            "G",
            "lg.js",
            m.g,
            m.actionRam.g,
            hFinish + 2 * gap,
            m.times.g,
            launchLead
        ),

        job(
            id,
            "W2",
            "lw.js",
            m.w2,
            m.actionRam.w2,
            hFinish + 3 * gap,
            m.times.w,
            launchLead
        ),
    ];

    const w2Finish =
        hFinish +
        3 *
        gap;

    return {
        id,
        jobs,

        verifyStart:
            w2Finish +
            50,

        verifyDeadline:
            hFinish +
            period -
            100,

        verified:
            false,
    };
}


function job(
    batchId,
    action,
    script,
    threads,
    ram,
    finishAt,
    runtime,
    launchLead
) {
    const modelStart =
        finishAt -
        runtime;

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
            `JIT3:B${batchId}:${action}`,

        launched:
            false,

        pid:
            0,
    };
}


// ================================================================
// CURRENT ACTION DURATION
// ================================================================

function currentDuration(
    ns,
    target,
    action
) {
    if (action === "H") {
        return ns.getHackTime(target);
    }

    if (action === "G") {
        return ns.getGrowTime(target);
    }

    return ns.getWeakenTime(target);
}


// ================================================================
// TARGET
// ================================================================

function state(ns, target) {
    return {
        money:
            ns.getServerMoneyAvailable(target),

        maxMoney:
            ns.getServerMaxMoney(target),

        sec:
            ns.getServerSecurityLevel(target),

        minSec:
            ns.getServerMinSecurityLevel(target),
    };
}


function ready(s) {
    return (
        s.maxMoney > 0 &&
        s.money >=
            s.maxMoney *
            0.999 &&
        s.sec <=
            s.minSec +
            0.05
    );
}


// ================================================================
// MONEY SOURCE
// ================================================================

function hackIncome(ns) {
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


// ================================================================
// HELPERS
// ================================================================

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


function roundPeriod(ms) {
    return Math.ceil(
        ms /
        10
    ) *
        10;
}


function ramFmt(v) {
    if (v >= 1024) {
        return (
            v /
            1024
        ).toFixed(2) +
            "T";
    }

    return v.toFixed(1) + "G";
}


function duration(ms) {
    if (ms >= 3600000) {
        return (
            ms /
            3600000
        ).toFixed(2) +
            "h";
    }

    if (ms >= 60000) {
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


function money(v) {
    if (!Number.isFinite(v)) {
        return "-";
    }

    const sign =
        v < 0
            ? "-"
            : "";

    const a =
        Math.abs(v);

    if (a >= 1e15) {
        return (
            sign +
            "$" +
            (
                a /
                1e15
            ).toFixed(2) +
            "q"
        );
    }

    if (a >= 1e12) {
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

    if (a >= 1e9) {
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

    if (a >= 1e6) {
        return (
            sign +
            "$" +
            (
                a /
                1e6
            ).toFixed(1) +
            "m"
        );
    }

    if (a >= 1e3) {
        return (
            sign +
            "$" +
            (
                a /
                1e3
            ).toFixed(1) +
            "k"
        );
    }

    return sign + "$" + a.toFixed(0);
}


function help(ns) {
    ns.tprint("7n8 JIT v0.3 SMOOTH");
    ns.tprint("");

    ns.tprint(
        "Test:"
    );

    ns.tprint(
        "  run jit3.js phantasy --limit 120 --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Long test:"
    );

    ns.tprint(
        "  run jit3.js phantasy --limit 240 --tail"
    );

    ns.tprint("");

    ns.tprint(
        "Continuous:"
    );

    ns.tprint(
        "  run jit3.js phantasy --tail"
    );
}