
import type { NS } from "@ns";

const WORKERS = [
    "h.ts",
    "g.ts",
    "w.ts",
] as const;

const PAUSE_FILE = ".7n8-pause.txt";

type WorkerScript = typeof WORKERS[number];

interface HostCapacity {
    host: string;
    threads: number;
}

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");

    const flags = ns.flags([
        ["target", ""],
        ["take", 0.10],
        ["xp", false],
        ["tail", false],
    ]);

    if (flags.tail) {
        ns.ui.openTail();
    }

    const requestedTake = Number(flags.take);

    const take = Number.isFinite(requestedTake)
        ? Math.max(0.01, Math.min(0.25, requestedTake))
        : 0.10;

    const fixedTarget = String(flags.target);
    const node = ns.getResetInfo().currentNode;

    // BN8 grants no player income from script hacking.
    const xpMode = Boolean(flags.xp) || node === 8;

    ns.tprint(
        `[EARLY] BN${node} | mode=${xpMode ? "XP" : "MONEY"}`
    );

    let previousTarget = "";

    ns.tprint("[EARLY] 7n8 recovery engine online");

    for (const worker of WORKERS) {
        if (!ns.fileExists(worker, "home")) {
            ns.tprint(`[EARLY] Missing worker: ${worker}`);
            return;
        }
    }

    while (!ns.fileExists(PAUSE_FILE, "home")) {
        const hack = ns.getHackingLevel();

        const target = fixedTarget ||
            (xpMode || hack < 10
                ? "n00dles"
                : selectTarget(ns, previousTarget));

        if (!target) {
            ns.print("[WAIT] No eligible target");
            await ns.sleep(2000);
            continue;
        }

        if (!ns.serverExists(target)) {
            ns.tprint(`[EARLY] Unknown target: ${target}`);
            return;
        }

        if (
            !ns.hasRootAccess(target) ||
            hack < ns.getServerRequiredHackingLevel(target)
        ) {
            ns.print(`[WAIT] Target unavailable: ${target}`);
            await ns.sleep(2000);
            continue;
        }

        if (previousTarget !== target) {
            previousTarget = target;

            ns.tprint(
                `[EARLY] target=${target} | hack=${hack}`
            );
        }

        const money = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);

        const security = ns.getServerSecurityLevel(target);
        const minSecurity = ns.getServerMinSecurityLevel(target);

        if (maxMoney <= 0) {
            ns.tprint(`[EARLY] Target has no money: ${target}`);
            return;
        }

        let worker: WorkerScript;
        let wanted: number;

        // XP mode uses all available remote threads.
        if (xpMode) {
            worker = "w.ts";
            wanted = Infinity;
        }

        // Priority 1: repair security.
        else if (security > minSecurity + 0.05) {
            worker = "w.ts";

            wanted = Math.ceil(
                (security - minSecurity) /
                ns.weakenAnalyze(1)
            );
        }

        // Priority 2: restore target money.
        else if (money < maxMoney * 0.90) {
            worker = "g.ts";

            wanted = money > 0
                ? Math.ceil(
                    ns.growthAnalyze(
                        target,
                        maxMoney / money
                    )
                )
                : Infinity;
        }

        // Priority 3: generate revenue.
        else {
            const hackPct = ns.hackAnalyze(target);

            if (
                hackPct <= 0 ||
                ns.hackAnalyzeChance(target) <= 0
            ) {
                // Gain experience until hacking becomes viable.
                worker = "w.ts";
                wanted = Infinity;
            } else {
                worker = "h.ts";

                wanted = Math.max(
                    1,
                    Math.floor(take / hackPct)
                );
            }
        }

        const workerRam = ns.getScriptRam(worker, "home");

        if (workerRam <= 0) {
            ns.tprint(`[EARLY] Invalid worker RAM: ${worker}`);
            return;
        }

        const pool = getPool(ns, worker, workerRam);

        const capacity = pool.reduce(
            (sum, host) => sum + host.threads,
            0
        );

        if (capacity <= 0) {
            ns.print("[WAIT] No available remote RAM");
            await ns.sleep(2000);
            continue;
        }

        let remaining = Number.isFinite(wanted)
            ? Math.min(capacity, Math.max(1, wanted))
            : capacity;

        const pids: number[] = [];
        let launched = 0;

        for (const entry of pool) {
            if (remaining <= 0) break;

            const threads = Math.min(
                entry.threads,
                remaining
            );

            const pid = ns.exec(
                worker,
                entry.host,
                threads,
                target,
                0
            );

            if (pid === 0) {
                ns.print(`[WARN] Launch failed: ${entry.host}`);
                continue;
            }

            pids.push(pid);
            remaining -= threads;
            launched += threads;
        }

        ns.print(
            `[WAVE] ${worker} | target=${target}` +
            ` | threads=${launched}/${capacity}` +
            ` | money=${ns.format.number(money)}` +
            ` | sec=${security.toFixed(2)}`
        );

        if (pids.length === 0) {
            await ns.sleep(2000);
            continue;
        }

        // No overlapping waves. Re-evaluate after completion.
        while (pids.some(pid => ns.isRunning(pid))) {
            await ns.sleep(250);
        }

        await ns.sleep(100);
    }

    ns.tprint("[EARLY] Paused");
}

function selectTarget(
    ns: NS,
    current: string
): string {
    const hacking = ns.getHackingLevel();

    let best = "";
    let bestScore = 0;
    let currentScore = 0;

    for (const host of scanAll(ns)) {
        if (host === "home") continue;
        if (host === "w0r1d_d43m0n") continue;

        if (!ns.hasRootAccess(host)) continue;

        if (
            ns.getServerRequiredHackingLevel(host) >
            hacking
        ) continue;

        const maxMoney =
            ns.getServerMaxMoney(host);

        if (maxMoney <= 0) continue;

        const money =
            ns.getServerMoneyAvailable(host);

        const chance =
            ns.hackAnalyzeChance(host);

        const fraction =
            ns.hackAnalyze(host);

        const seconds =
            ns.getHackTime(host) / 1000;

        if (
            chance <= 0 ||
            fraction <= 0 ||
            !Number.isFinite(seconds) ||
            seconds <= 0
        ) continue;

        // Penalize unprepared targets.
        const readiness =
            0.5 + 0.5 *
            Math.max(
                0,
                Math.min(1, money / maxMoney)
            );

        const score =
            maxMoney *
            chance *
            fraction *
            readiness /
            seconds;

        if (host === current) {
            currentScore = score;
        }

        if (score > bestScore) {
            bestScore = score;
            best = host;
        }
    }

    // Hysteresis prevents constant target switching.
    if (
        currentScore > 0 &&
        bestScore < currentScore * 1.5
    ) {
        return current;
    }

    return best || "n00dles";
}

function getPool(
    ns: NS,
    worker: WorkerScript,
    workerRam: number
): HostCapacity[] {
    const pool: HostCapacity[] = [];

    for (const host of scanAll(ns)) {
        // Preserve home RAM for the operating system.
        if (host === "home") continue;
        if (!ns.hasRootAccess(host)) continue;

        const free =
            ns.getServerMaxRam(host) -
            ns.getServerUsedRam(host);

        const threads = Math.floor(free / workerRam);

        if (threads <= 0) continue;

        if (!ns.fileExists(worker, host)) {
            if (!ns.scp(worker, host, "home")) {
                continue;
            }
        }

        pool.push({
            host,
            threads,
        });
    }

    return pool.sort(
        (a, b) => b.threads - a.threads
    );
}

function scanAll(ns: NS): string[] {
    const seen = new Set<string>(["home"]);
    const queue = ["home"];

    while (queue.length > 0) {
        const host = queue.shift()!;

        for (const next of ns.scan(host)) {
            if (seen.has(next)) continue;

            seen.add(next);
            queue.push(next);
        }
    }

    return [...seen];
}
