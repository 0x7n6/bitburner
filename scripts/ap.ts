import type { NS } from "@ns";
import { BIT_NODES, FACTIONS, bitNodeCatalog, factionCatalog, factionOverview, findFaction } from "./bitburner-catalog.ts";

type ScriptArg = string | number | boolean;

const PAUSE_FILE = ".7n8-pause.txt";

const BT4_AUTO = "bt4-auto.ts";
const JIT6_SUPPORT = "jit6.ts";
const JIT6_DASHBOARD = "jit6-dashboard.ts";
const JIT6_FACTION = "jit6-faction.ts";

const ENGINES = [
    "early.ts",
    "jit5.ts",
    "harvest.ts",
];

const WORKERS = [
    "h.ts",
    "g.ts",
    "w.ts",
    "j5h.ts",
    "j5g.ts",
    "j5w.ts",
    "share-worker.ts",
];

const FARM = new Set([
    ...ENGINES,
    ...WORKERS,
    "share.ts",
]);
const AP_BLOCKED_STARTS = new Set([
    ...FARM, "daemon.ts", "bootstrap.ts", "progression.ts", "mission.ts",
    "mission-study.ts", "jit6-home.ts", BT4_AUTO, "trader.ts",
]);

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");

    while (true) {
        showStatus(ns);

        const menu = await ns.prompt(
            "7n8 JIT6 MISSION CONTROL",
            {
                type: "select",
                choices: [
                    "JIT6 dashboard",
                    "JIT6 sessions",
                    "Progression tools",
                    "OS lifecycle",
                    "Network intelligence",
                    "Capital management",
                    "System services",
                    "Universal script launcher",
                    "Process management",
                    "Exit",
                ],
            }
        );

        if (!menu || menu === "Exit") return;

        switch (menu) {
            case "OS lifecycle":
                await lifecycle(ns);
                break;

            case "JIT6 dashboard":
                await jit6Dashboard(ns);
                break;

            case "Network intelligence":
                await network(ns);
                break;

            case "JIT6 sessions":
                await jit6Support(ns);
                break;

            case "Progression tools":
                await mission(ns);
                break;

            case "Capital management":
                await capital(ns);
                break;

            case "System services":
                await services(ns);
                break;

            case "Universal script launcher":
                await universalLauncher(ns);
                break;

            case "Process management":
                await processes(ns);
                break;
        }

        await ns.sleep(100);
    }
}

function showStatus(ns: NS): void {
    const reset = ns.getResetInfo();
    const home = ns.getServer("home");
    const running = ns.ps("home");

    const sf1 = reset.ownedSF.get(1) ?? 0;
    const sf4 = reset.ownedSF.get(4) ?? 0;

    const singularity =
        reset.currentNode === 4 || sf4 > 0;

    const engine = running
        .filter(p => ENGINES.includes(p.filename))
        .map(p => p.filename)
        .join(", ");
    const session = running.find(p => p.filename === JIT6_SUPPORT && p.args.includes("--execute"));

    const openers = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ].filter(f => ns.fileExists(f, "home")).length;

    const status = (filename: string): string => {
        const p = running.find(
            x => x.filename === filename
        );

        return p ? `ONLINE (${p.pid})` : "OFFLINE";
    };

    ns.tprint("");
    ns.tprint("==========================================");
    ns.tprint("          7n8 JIT6 MISSION CONTROL");
    ns.tprint("==========================================");

    ns.tprint(`BitNode    : ${reset.currentNode} | ${BIT_NODES[reset.currentNode]?.name ?? "Unknown"}`);
    ns.tprint(`SF1        : ${sf1}/3`);
    ns.tprint(`SF4        : ${sf4}/3`);
    ns.tprint(`Singularity: ${singularity ? "YES" : "NO"}`);

    ns.tprint(
        `OS         : ${
            ns.fileExists(PAUSE_FILE, "home")
                ? "PAUSED"
                : "UNPAUSED"
        }`
    );

    ns.tprint(`Hack       : ${ns.getHackingLevel()}`);

    ns.tprint(
        `Money      : $${ns.format.number(
            ns.getServerMoneyAvailable("home")
        )}`
    );

    ns.tprint(
        `Home       : ${home.ramUsed.toFixed(2)} / ` +
        `${home.maxRam.toFixed(2)} GB`
    );

    ns.tprint(
        `Free RAM   : ${
            (home.maxRam - home.ramUsed).toFixed(2)
        } GB`
    );

    ns.tprint(`CPU        : ${home.cpuCores ?? 1}`);
    ns.tprint(`Openers    : ${openers}/5`);

    ns.tprint(
        `Formulas   : ${
            ns.fileExists("Formulas.exe", "home")
                ? "YES"
                : "NO"
        }`
    );

    ns.tprint(`JIT6       : ${session ? `ONLINE (${session.pid})` : "OFFLINE"}`);
    if (engine) ns.tprint(`Legacy engine: ${engine}`);
    if (running.some(p => p.filename === "daemon.ts" || p.filename === "bootstrap.ts")) {
        ns.tprint("Legacy supervisor detected. Use Shutdown OS before resuming JIT6.");
    }
    ns.tprint(`BT4 AUTO   : ${status(BT4_AUTO)}`);
    ns.tprint(`Share      : ${status("share.ts")}`);
    ns.tprint(`Trader     : ${status("trader.ts")}`);
    ns.tprint(`DarkscapeNavigator: ${ns.fileExists("DarkscapeNavigator.exe", "home") ? "PRESENT" : "MISSING"}`);
    ns.tprint("==========================================");
}

async function choose(
    ns: NS,
    title: string,
    choices: readonly string[]
): Promise<string> {
    const result = await ns.prompt(title, {
        type: "select",
        choices: [...choices, "Back"],
    });

    return typeof result === "string"
        ? result
        : "Back";
}

async function ask(
    ns: NS,
    title: string
): Promise<string | null> {
    const value = await ns.prompt(title, {
        type: "text",
    });

    return typeof value === "string"
        ? value.trim()
        : null;
}

async function lifecycle(ns: NS): Promise<void> {
    const choice = await choose(ns, "OS lifecycle", [
        "Pause OS",
        "Resume JIT6 work",
        "Unpause for manual session setup",
        "Shutdown OS",
    ]);

    switch (choice) {
        case "Pause OS":
            await launchAndWait(ns, "stopfarm.ts", []);
            return;
        case "Resume JIT6 work":
            await launchAndWait(ns, "stopfarm.ts", ["--resume"]);
            return;
        case "Unpause for manual session setup":
            await launchAndWait(ns, "stopfarm.ts", ["--resume", "--support-only"]);
            return;
        case "Shutdown OS":
            await launchAndWait(ns, "stopfarm.ts", ["--os"]);
    }
}

async function jit6Dashboard(ns: NS): Promise<void> {
    const choice = await choose(ns, "JIT6 dashboard", [
        "Current BitNode and readiness", "BitNode goal", "Augmentation reset readiness",
        "BitNode catalog", "BitNode multipliers", "Faction catalog", "Faction details",
    ]);
    switch (choice) {
        case "Current BitNode and readiness":
            await launchAndWait(ns, JIT6_DASHBOARD, []);
            return;
        case "BitNode goal":
            await launchAndWait(ns, "jit6-goal.ts", []);
            return;
        case "Augmentation reset readiness": {
            if (!await launchAndWait(ns, "bt4-detail.ts", ["--reset-summary"])) {
                ns.tprint("See the in-game Augmentations panel for the queued list and reset preview.");
            }
            return;
        }
        case "BitNode catalog":
            for (const line of bitNodeCatalog(ns.getResetInfo())) ns.tprint(line);
            return;
        case "BitNode multipliers": {
            const input = await ask(ns, "BitNode number (1–15, blank for current)");
            if (input === null) return;
            if (!input) {
                await launchAndWait(ns, "jit6-multipliers.ts", []);
                return;
            }
            const node = Number(input);
            if (!Object.hasOwn(BIT_NODES, node)) {
                ns.tprint("[JIT6] Choose a BitNode number from 1 to 15.");
                return;
            }
            const level = node === 12 ? await askNonnegative(ns, "BN12 level to inspect (1 or higher)") : 1;
            if (level === null) return;
            if (!Number.isSafeInteger(level) || level < 1) {
                ns.tprint("[JIT6] Enter a whole BN12 level of 1 or higher.");
                return;
            }
            await launchAndWait(ns, "jit6-multipliers.ts", [node, level]);
            return;
        }
        case "Faction catalog":
            for (const line of factionCatalog(ns.getPlayer().factions)) ns.tprint(line);
            return;
        case "Faction details": {
            const input = await ask(ns, "Faction name, e.g. Daedalus");
            if (!input) return;
            const faction = findFaction(input);
            if (!faction) {
                ns.tprint("[FACTION] Enter a name from the Faction catalog.");
                return;
            }
            const reset = ns.getResetInfo();
            if ((reset.currentNode === 4 || (reset.ownedSF.get(4) ?? 0) > 0) && await launchAndWait(ns, JIT6_FACTION, [faction])) return;
            for (const line of factionOverview(faction, ns.getPlayer().factions)) ns.tprint(line);
            ns.tprint("See the in-game faction panel for this save's offers and invitations.");
        }
    }
}

async function network(ns: NS): Promise<void> {
    const choice = await choose(
        ns,
        "Network intelligence",
        [
            "Find V1 - route",
            "Find V2 - dry-run",
            "Find V2 - connect",
            "Find V2 - connect and backdoor",
            "Target intelligence",
            "Network monitor",
            "Neofetch",
        ]
    );

    if (choice.startsWith("Find")) {
        const target = await ask(
            ns,
            "Server hostname"
        );

        if (!target) return;

        if (choice === "Find V1 - route") {
            await launchAndWait(
                ns,
                "find.ts",
                [target]
            );

            return;
        }

        const args: ScriptArg[] = [target];

        if (choice === "Find V2 - dry-run") {
            args.push("--dry");
        }

        if (choice === "Find V2 - connect and backdoor") {
            const confirmed = await ns.prompt(
                `Root/connect/backdoor ${target}?`,
                { type: "boolean" }
            );

            if (confirmed !== true) return;

            args.push("--bd");
        }

        await launchAndWait(ns, "findV2.ts", args);
        return;
    }

    if (choice === "Target intelligence") {
        await launchAndWait(
            ns,
            "target.ts",
            ["--top", 20]
        );
    }

    if (choice === "Network monitor") {
        launch(ns, "netmon.ts", []);
    }

    if (choice === "Neofetch") {
        await launchAndWait(ns, "neofetch.ts", []);
    }
}

async function jit6Support(ns: NS): Promise<void> {
    const choice = await choose(ns, "JIT6 sessions", [
        "Preview admission", "Start work session", "Start work with an augmentation budget",
        "Start work with one home upgrade", "Start work and Share", "Start work and Trader",
        "Start work with Share and Trader", "Stop JIT6 session",
    ]);
    if (choice === "Back") return;
    if (choice === "Preview admission") {
        await launchAndWait(ns, JIT6_SUPPORT, []);
        return;
    }
    if (choice === "Stop JIT6 session") {
        const pilot = ns.ps("home").find(p => p.filename === JIT6_SUPPORT && p.args.includes("--execute"));
        if (!pilot) {
            ns.tprint("[JIT6 SUPPORT] Offline.");
        } else if (await ns.prompt("Stop JIT6 and its services? Player activity continues and Trader positions are held.", { type: "boolean" }) === true) {
            ns.tprint(ns.kill(pilot.pid) ? "[JIT6 SUPPORT] Stopped." : "[JIT6 SUPPORT] Scheduler already exited.");
        }
        return;
    }

    const duration = await ask(ns, "Session length in minutes (1–120, default 15)");
    if (duration === null) return;
    const minutes = duration ? Number(duration) : 15;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
        ns.tprint("[JIT6] Enter a whole number from 1 to 120.");
        return;
    }
    const args: ScriptArg[] = ["--execute", "--minutes", minutes];
    let prompt = `Start ${minutes} min of player-work scheduling with no purchases?`;
    if (choice === "Start work with one home upgrade") {
        const cap = await askNonnegative(ns, "Maximum price for one home RAM upgrade (game dollars)");
        if (!cap) return;
        const reserve = await askNonnegative(ns, "Minimum cash to keep (game dollars)");
        if (reserve === null) return;
        const target = ns.getServerMaxRam("home") * 2;
        args.push("--home-target", target, "--home-cap", cap, "--reserve", reserve);
        prompt = `Start ${minutes} min of work and allow one RAM upgrade to ${target} GB, up to $${cap.toLocaleString()}, keeping $${reserve.toLocaleString()} cash?`;
    }
    if (choice === "Start work with an augmentation budget") {
        const cap = await askNonnegative(ns, "Total augmentation budget for this session (game dollars)");
        if (!cap) return;
        const reserve = await askNonnegative(ns, "Minimum cash to keep (game dollars)");
        if (reserve === null) return;
        args.push("--augment-cap", cap, "--reserve", reserve);
        prompt = `Start ${minutes} min of work and allow up to 8 purchases within $${cap.toLocaleString()} total, keeping $${reserve.toLocaleString()} cash?`;
    }
    const share = choice.includes("Share");
    if (share) {
        args.push("--share");
        prompt = `Start ${minutes} min of player work and Share when home RAM permits?`;
    }
    if (choice.includes("Trader")) {
        const reserve = await askNonnegative(ns, "Trader cash floor (game dollars)");
        if (reserve === null) return;
        if (reserve === 0) {
            ns.tprint("[JIT6] Enter a positive Trader cash floor.");
            return;
        }
        args.push("--trader", "--reserve", reserve);
        prompt = `Start ${minutes} min of work${share ? ", Share" : ""} and long-only Trader with a $${reserve.toLocaleString()} cash floor?`;
    }
    if (await ns.prompt(`${prompt} JIT6 may switch the current university course.`, { type: "boolean" }) === true) {
        launch(ns, JIT6_SUPPORT, args);
    }
}

async function mission(ns: NS): Promise<void> {
    const choice = await choose(ns, "Progression tools", [
        "Basic snapshot",
        "Plan progression",
        "Rank faction invitations",
        "Start faction work",
        "Buy one augmentation",
        "Upgrade home RAM",
    ]);

    switch (choice) {
        case "Basic snapshot":
            await launchAndWait(ns, "bt4.ts", ["--dry-run"]);
            return;
        case "Plan progression": {
            const floor = await askNonnegative(ns, "Cash reserve for planning (game dollars)");
            if (floor !== null) await launchAndWait(ns, "bt4-plan.ts", ["--reserve", floor, "--summary"]);
            return;
        }
        case "Rank faction invitations": {
            const floor = await askNonnegative(ns, "Cash reserve for ranking (game dollars)");
            if (floor !== null) await launchAndWait(ns, "jit6-invitations.ts", ["--reserve", floor]);
            return;
        }
        case "Start faction work": {
            const factions = ns.getPlayer().factions.filter(faction => FACTIONS[faction]?.work.length);
            if (factions.length === 0) {
                ns.tprint("[BT4] No joined faction offers standard work. See Faction details.");
                return;
            }
            const selected = await choose(ns, "Joined faction", factions);
            const faction = factions.find(name => name === selected);
            if (!faction) return;
            const work = await choose(ns, `${faction} work type`, FACTIONS[faction].work);
            if (work !== "Back") await launchAndWait(ns, "bt4-action.ts", ["work", faction, work]);
            return;
        }
        case "Buy one augmentation":
        case "Upgrade home RAM": {
            const args: ScriptArg[] = [];
            if (choice === "Buy one augmentation") {
                const faction = await choose(ns, "Seller faction", ns.getPlayer().factions);
                if (faction === "Back") return;
                const augmentation = await ask(ns, "Exact augmentation name from the progression plan");
                if (!augmentation) return;
                args.push("augmentation", faction, augmentation);
            } else {
                args.push("home-ram");
            }
            const budget = await askNonnegative(ns, "Maximum price for this purchase (game dollars)");
            if (budget === null) return;
            const floor = await askNonnegative(ns, "Cash to keep after this purchase (game dollars)");
            if (floor !== null) await launchAndWait(ns, "bt4-action.ts", [...args, budget, floor]);
        }
    }
}

async function askNonnegative(ns: NS, title: string): Promise<number | null> {
    const input = await ask(ns, title);
    if (input === null) return null;
    const value = Number(input);
    if (input === "" || !Number.isFinite(value) || value < 0) {
        ns.tprint("[CONTROL] Enter a finite, nonnegative number.");
        return null;
    }
    return value;
}

async function capital(ns: NS): Promise<void> {
    const choice = await choose(ns, "Capital management", [
        "Trader hold",
        "Trader drain and liquidate",
        "Trader status",
        "Fleet planning",
        "Fleet purchase",
    ]);

    const commands: Record<string, string> = {
        "Trader hold": "stop",
        "Trader drain and liquidate": "drain",
        "Trader status": "status",
    };

    if (commands[choice]) {
        await launchAndWait(
            ns,
            "traderctl.ts",
            choice === "Trader hold" ? ["stop", "--hold"] : choice === "Trader drain and liquidate" ? ["drain", "--no-start"] : [commands[choice]]
        );

        return;
    }

    if (choice === "Fleet planning") {
        await launchAndWait(ns, "fleet.ts", []);
    }

    if (choice === "Fleet purchase") {
        const value = await ask(
            ns,
            "Budget fraction: e.g. 0.25"
        );

        if (!value) return;

        const budget = Number(value);

        if (
            !Number.isFinite(budget) ||
            budget <= 0 ||
            budget > 1
        ) {
            ns.tprint("[FLEET] Invalid budget");
            return;
        }

        const confirm = await ns.prompt(
            `Spend up to ${(budget * 100).toFixed(1)}% of cash?`,
            { type: "boolean" }
        );

        if (confirm !== true) return;

        await launchAndWait(
            ns,
            "fleet.ts",
            ["--budget", budget, "--execute"]
        );
    }
}

async function services(ns: NS): Promise<void> {
    const choice = await choose(ns, "System services", [
        "Start network monitor",
        "Show home tools and RAM costs",
    ]);

    if (choice === "Start network monitor") {
        launch(ns, "netmon.ts", []);
    }

    if (choice === "Show home tools and RAM costs") {
        showTools(ns);
    }
}

async function universalLauncher(ns: NS): Promise<void> {
    const files = ns.ls("home")
        .filter(file => /\.[jt]s$/.test(file))
        .filter(file => !file.endsWith(".d.ts"))
        .filter(file => file !== "ap.ts" && !AP_BLOCKED_STARTS.has(file))
        .sort();

    const script = await choose(
        ns,
        "Select runtime script",
        files
    );

    if (script === "Back") return;

    const raw = await ask(
        ns,
        'Arguments as JSON array. Examples:\n' +
        '[]\n["n00dles","--dry"]\n["--budget",0.25]'
    );

    if (raw === null) return;

    let args: ScriptArg[];

    try {
        const parsed: unknown = JSON.parse(raw || "[]");

        if (
            !Array.isArray(parsed) ||
            !parsed.every(
                value =>
                    typeof value === "string" ||
                    typeof value === "boolean" ||
                    (
                        typeof value === "number" &&
                        Number.isFinite(value)
                    )
            )
        ) {
            throw new Error("Invalid argument array");
        }

        args = parsed as ScriptArg[];
    } catch (error) {
        ns.tprint(`[ARGS] ${String(error)}`);
        return;
    }

    const confirmed = await ns.prompt(
        `Run ${script} ${JSON.stringify(args)}?`,
        { type: "boolean" }
    );

    if (confirmed !== true) return;

    launch(ns, script, args);
}

async function processes(ns: NS): Promise<void> {
    const choice = await choose(ns, "Process management", [
        "List home processes",
        "Terminate home PID",
        "Show script RAM costs",
    ]);

    if (choice === "Show script RAM costs") {
        showTools(ns);
        return;
    }

    const running = ns.ps("home");

    if (choice === "List home processes") {
        for (const p of running) {
            ns.tprint(
                `PID ${p.pid} | ${p.filename}` +
                ` | threads=${p.threads}` +
                ` | args=${JSON.stringify(p.args)}`
            );
        }

        return;
    }

    if (choice !== "Terminate home PID") return;

    const selected = await choose(
        ns,
        "Select process",
        running
            .filter(p => p.pid !== ns.pid)
            .map(p => `${p.pid} | ${p.filename}`)
    );

    if (selected === "Back") return;

    const pid = Number(selected.split(" | ")[0]);

    const process = ns.ps("home").find(
        p => p.pid === pid
    );

    if (!process) return;

    if (
        FARM.has(process.filename) ||
        ["daemon.ts", "bootstrap.ts", "progression.ts"].includes(
            process.filename
        )
    ) {
        ns.tprint("[CONTROL] Use OS lifecycle shutdown.");
        return;
    }

    if (process.filename === "trader.ts") {
        ns.tprint("[CONTROL] Use Trader stop/drain.");
        return;
    }

    const confirmed = await ns.prompt(
        `Terminate ${process.filename} PID ${pid}?`,
        { type: "boolean" }
    );

    if (confirmed !== true) return;

    ns.tprint(
        ns.kill(pid)
            ? `[KILL] PID ${pid}`
            : `[KILL] Failed PID ${pid}`
    );
}

function launch(
    ns: NS,
    script: string,
    args: ScriptArg[]
): number {
    if (!ns.fileExists(script, "home")) {
        ns.tprint(`[ERROR] Missing ${script}`);
        return 0;
    }

    const running = ns.ps("home");

    const activeJit6 = running.some(p => p.filename === JIT6_SUPPORT && p.args.includes("--execute"));
    if (AP_BLOCKED_STARTS.has(script) || (script === "traderctl.ts" && String(args[0]).toLowerCase() === "start")) {
        ns.tprint("[CONTROL] Use JIT6 sessions to start managed services.");
        return 0;
    }
    if (activeJit6 && ((script === JIT6_SUPPORT && args.includes("--execute")) || script === "bt4-action.ts" ||
        (script === "fleet.ts" && args.includes("--execute")))) {
        ns.tprint("[CONTROL] Finish the active JIT6 session before starting overlapping work or purchases.");
        return 0;
    }
    if (script === "bt4-action.ts" && running.some(p => [BT4_AUTO, "bt4-action.ts", "mission.ts", "mission-study.ts"].includes(p.filename))) {
        ns.tprint("[CONTROL] Another player-work tool is active.");
        return 0;
    }

    if (
        ["netmon.ts", "findV2.ts"].includes(script) &&
        running.some(p => p.filename === script)
    ) {
        ns.tprint(`[CONTROL] ${script} already running`);
        return 0;
    }

    const required = ns.getScriptRam(script, "home");

    const free =
        ns.getServerMaxRam("home") -
        ns.getServerUsedRam("home");

    if (required <= 0 || required > free + 0.000001) {
        ns.tprint(
            `[RAM] ${script} requires ${required.toFixed(2)} GB` +
            ` | free=${free.toFixed(2)} GB`
        );

        ns.tprint(
            "[RAM] Exit AP or upgrade home RAM."
        );

        return 0;
    }

    if (script === "bt4-plan.ts" || script === "bt4-action.ts" || (script === "bt4-detail.ts" && !args.includes("--reset-summary"))) {
        const reset = ns.getResetInfo();
        if (reset.currentNode !== 4 && (reset.ownedSF.get(4) ?? 0) === 0) {
            ns.tprint("[BT4] Singularity unavailable. Select Basic snapshot.");
            return 0;
        }
    }
    if (script === "bt4-detail.ts" && !ns.fileExists("bt4.ts", "home")) {
        ns.tprint("[BT4] Missing dependency bt4.ts.");
        return 0;
    }
    if (script === "bt4-action.ts" || (script === JIT6_SUPPORT && args.includes("--execute"))) {
        const reserve = ns.getScriptRam("stopfarm.ts", "home");
        if (reserve <= 0 || free - required < reserve) {
            ns.tprint(`[JIT6] Admission refused. Required ${required.toFixed(2)} GB, free ${free.toFixed(2)} GB, emergency reserve ${reserve.toFixed(2)} GB. Check stopfarm.ts and home RAM.`);
            return 0;
        }
    }

    const pid = ns.exec(script, "home", 1, ...args);

    ns.tprint(
        pid
            ? `[LAUNCH] ${script} | PID ${pid}`
            : `[ERROR] Could not launch ${script}`
    );

    return pid;
}

async function launchAndWait(
    ns: NS,
    script: string,
    args: ScriptArg[]
): Promise<boolean> {
    const pid = launch(ns, script, args);

    if (!pid) return false;

    while (ns.isRunning(pid)) {
        await ns.sleep(200);
    }
    return true;
}

function showTools(ns: NS): void {
    const files = ns.ls("home")
        .filter(f => /\.[jt]s$/.test(f))
        .filter(f => !f.endsWith(".d.ts"))
        .sort();

    ns.tprint("");
    ns.tprint(`=== HOME TOOLS (${files.length}) ===`);

    for (const file of files) {
        const ram = ns.getScriptRam(file, "home");

        ns.tprint(
            `${file.padEnd(24)} ${ram.toFixed(2)} GB`
        );
    }
}
