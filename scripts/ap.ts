import type { NS } from "@ns";

type ScriptArg = string | number | boolean;

const MODE_FILE = ".7n8-engine-mode.txt";
const PAUSE_FILE = ".7n8-pause.txt";

const BT4_AUTO = "bt4-auto.ts";
const JIT6_SUPPORT = "jit6.ts";

const MISSION_TOOLS = new Set([
    "bt4.ts", "bt4-detail.ts", "bt4-plan.ts", "bt4-action.ts", "mission.ts", "mission-study.ts", BT4_AUTO, JIT6_SUPPORT,
]);

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

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");

    while (true) {
        showStatus(ns);

        const menu = await ns.prompt(
            "7n8 CONTROL PLANE V2",
            {
                type: "select",
                choices: [
                    "OS lifecycle",
                    "Economic engines",
                    "Network intelligence",
                    "BN4 mission",
                    "Mission coordination",
                    "JIT6 support scheduler",
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

            case "Economic engines":
                await economics(ns);
                break;

            case "Network intelligence":
                await network(ns);
                break;

            case "JIT6 support scheduler":
                await jit6Support(ns);
                break;

            case "Mission coordination":
                await missionCoordination(ns);
                break;

            case "BN4 mission":
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

function engineMode(ns: NS): string {
    const mode = ns.read(MODE_FILE).trim();

    return ["auto", "early", "manual"].includes(mode)
        ? mode
        : "auto";
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
    ns.tprint("       7n8 ADAPTIVE CONTROL PLANE V2");
    ns.tprint("==========================================");

    ns.tprint(`BitNode    : ${reset.currentNode}`);
    ns.tprint(`SF1        : ${sf1}/3`);
    ns.tprint(`SF4        : ${sf4}/3`);
    ns.tprint(`Singularity: ${singularity ? "YES" : "NO"}`);
    ns.tprint(`Policy     : ${engineMode(ns).toUpperCase()}`);

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

    ns.tprint(`Engine     : ${engine || "IDLE"}`);
    ns.tprint(`Daemon     : ${status("daemon.ts")}`);
    ns.tprint(`BT4 AUTO   : ${status(BT4_AUTO)}`);
    ns.tprint(`JIT6 Support: ${status(JIT6_SUPPORT)}`);
    ns.tprint(`Progression: ${status("progression.ts")}`);
    ns.tprint(`Share      : ${status("share.ts")}`);
    ns.tprint(`Trader     : ${status("trader.ts")}`);
    ns.tprint("==========================================");
}

async function choose(
    ns: NS,
    title: string,
    choices: string[]
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
        "Pause farming",
        "Resume / bootstrap",
        "Shutdown OS",
        "Change engine policy",
    ]);

    if (choice === "Pause farming") {
        await launchAndWait(ns, "stopfarm.ts", []);
    }

    if (choice === "Resume / bootstrap") {
        await launchAndWait(
            ns,
            "stopfarm.ts",
            ["--resume"]
        );
    }

    if (choice === "Shutdown OS") {
        await launchAndWait(
            ns,
            "stopfarm.ts",
            ["--os"]
        );
    }

    if (choice === "Change engine policy") {
        const mode = await choose(
            ns,
            "Engine policy",
            ["auto", "early", "manual"]
        );

        if (mode === "Back") return;

        if (ns.ps("home").some(
            p => FARM.has(p.filename)
        )) {
            ns.tprint(
                "[POLICY] Pause farming before switching mode."
            );
            return;
        }

        await ns.write(MODE_FILE, mode, "w");

        ns.tprint(
            `[POLICY] ${mode.toUpperCase()} selected.`
        );

        ns.tprint(
            "[POLICY] Resume OS to apply the policy."
        );
    }
}

async function economics(ns: NS): Promise<void> {
    const choice = await choose(ns, "Economic engines", [
        "Early recovery",
        "Early XP mode",
        "JIT5 closed-loop AUTO",
        "JIT5 planner dry-run",
        "JIT5 bounded benchmark",
        "Harvest target",
        "Prep / repair target",
    ]);

    switch (choice) {
        case "Early recovery":
            launch(ns, "early.ts", ["--tail"]);
            break;

        case "Early XP mode":
            launch(ns, "early.ts", ["--xp", "--tail"]);
            break;

        case "JIT5 closed-loop AUTO":
            launch(ns, "jit5.ts", ["--tail"]);
            break;

        case "JIT5 planner dry-run":
            await launchAndWait(
                ns,
                "jit5.ts",
                ["--dry-run", "--tail"]
            );
            break;

        case "JIT5 bounded benchmark":
            launch(
                ns,
                "jit5.ts",
                ["--limit", 40, "--tail"]
            );
            break;

        case "Harvest target":
        case "Prep / repair target": {
            const target = await ask(
                ns,
                "Target hostname"
            );

            if (!target) return;

            const args: ScriptArg[] = [target, "--tail"];

            if (choice === "Prep / repair target") {
                args.push("--prep-only");
            }

            launch(ns, "harvest.ts", args);
            break;
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
    const choice = await choose(ns, "JIT6 support scheduler", [
        "Preview admission", "Resume support only", "Start work session",
        "Start work with one home upgrade", "Stop JIT6 support",
    ]);
    if (choice === "Back") return;
    if (choice === "Preview admission") {
        await launchAndWait(ns, JIT6_SUPPORT, []);
        return;
    }
    if (choice === "Resume support only") {
        await launchAndWait(ns, "stopfarm.ts", ["--resume", "--support-only"]);
        return;
    }
    if (choice === "Stop JIT6 support") {
        const pilot = ns.ps("home").find(p => p.filename === JIT6_SUPPORT && p.args.includes("--execute"));
        if (!pilot) {
            ns.tprint("[JIT6 SUPPORT] Offline.");
        } else if (await ns.prompt("Stop this scheduler session? Existing player activity continues.", { type: "boolean" }) === true) {
            ns.tprint(ns.kill(pilot.pid) ? "[JIT6 SUPPORT] Stopped." : "[JIT6 SUPPORT] Scheduler already exited.");
        }
        return;
    }

    const args: ScriptArg[] = ["--execute"];
    let prompt = "Start up to 15 minutes of player-work scheduling with no purchases?";
    if (choice === "Start work with one home upgrade") {
        const cap = await askNonnegative(ns, "Maximum price for one home RAM upgrade (game dollars)");
        if (!cap) return;
        const reserve = await askNonnegative(ns, "Minimum cash to keep (game dollars)");
        if (reserve === null) return;
        const target = ns.getServerMaxRam("home") * 2;
        args.push("--home-target", target, "--home-cap", cap, "--reserve", reserve);
        prompt = `Allow one upgrade toward ${target} GB, at most $${cap.toLocaleString()}, keeping $${reserve.toLocaleString()} cash?`;
    }
    if (await ns.prompt(prompt, { type: "boolean" }) === true) launch(ns, JIT6_SUPPORT, args);
}

async function missionCoordination(ns: NS): Promise<void> {
    const choice = await choose(ns, "Mission coordination", [
        "Show capability and RAM status", "Start work-only mission", "Start work and Share", "Start work and Trader",
    ]);
    if (choice === "Back") return;
    if (choice === "Show capability and RAM status") {
        await launchAndWait(ns, "mission.ts", []);
        return;
    }
    const args: ScriptArg[] = ["--start", "--remember-work"];
    let summary = "Start 15 minutes of player-work policy? stp-rs can resume work until this session expires.";
    if (choice === "Start work and Share") {
        args.push("--share");
        summary = "Start 15 minutes of work and enable Share if RAM permits? Share runs until stopped.";
    }
    if (choice === "Start work and Trader") {
        const reserve = await askNonnegative(ns, "Trader cash floor (game dollars)");
        if (reserve === null) return;
        if (reserve === 0) {
            ns.tprint("[MISSION] A positive cash floor is required to start Trader.");
            return;
        }
        args.push("--trader", "--reserve", reserve);
        summary = `Start work and long-only Trader with a $${reserve.toLocaleString()} cash floor? stp halts trading and holds positions.`;
    }
    if (await ns.prompt(summary, { type: "boolean" }) !== true) return;
    await launchAndWait(ns, "mission.ts", args);
}

async function mission(ns: NS): Promise<void> {
    const choice = await choose(ns, "BN4 mission", [
        "Basic snapshot",
        "Singularity detail",
        "Plan progression",
        "Start faction work",
        "Preview autopilot",
        "Start autopilot",
        "Stop autopilot",
        "Buy one augmentation",
        "Upgrade home RAM",
    ]);

    switch (choice) {
        case "Preview autopilot":
        case "Start autopilot": {
            const floor = await askNonnegative(ns, "Cash floor to protect (game dollars)");
            if (floor === null) return;
            const budget = await askNonnegative(ns, "Maximum total augmentation spend for this session (0 disables purchases)");
            if (budget === null) return;
            const args: ScriptArg[] = ["--reserve", floor, "--budget", budget];
            if (choice === "Preview autopilot") {
                await launchAndWait(ns, BT4_AUTO, args);
                return;
            }
            const minutes = await askNonnegative(ns, "Session length in whole minutes (1–120)");
            if (minutes === null) return;
            if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
                ns.tprint("[BT4] Enter a whole number from 1 to 120.");
                return;
            }
            const confirmed = await ns.prompt(
                `Start BN4 autopilot for ${minutes} min? It will manage its own faction work or free study and may queue up to 8 augmentations within $${budget.toLocaleString()} total, keeping $${floor.toLocaleString()} cash.`,
                { type: "boolean" },
            );
            if (confirmed === true) launch(ns, BT4_AUTO, [...args, "--minutes", minutes, "--execute"]);
            return;
        }
        case "Stop autopilot": {
            const pilot = ns.ps("home").find(process => process.filename === BT4_AUTO);
            if (!pilot) {
                ns.tprint("[BT4] Autopilot is offline.");
                return;
            }
            if (await ns.prompt("Stop BT4 autopilot? Current player work will continue.", { type: "boolean" }) === true) {
                ns.tprint(ns.kill(pilot.pid) ? "[BT4] Autopilot stopped." : "[BT4] Autopilot already exited.");
            }
            return;
        }
        case "Basic snapshot":
            await launchAndWait(ns, "bt4.ts", ["--dry-run"]);
            return;
        case "Singularity detail":
            await launchAndWait(ns, "bt4-detail.ts", ["--dry-run"]);
            return;
        case "Plan progression": {
            const floor = await askNonnegative(ns, "Cash reserve for planning (game dollars)");
            if (floor !== null) await launchAndWait(ns, "bt4-plan.ts", ["--reserve", floor]);
            return;
        }
        case "Start faction work": {
            const faction = await choose(ns, "Joined faction", ns.getPlayer().factions);
            if (faction === "Back") return;
            const work = await choose(ns, "Work type (see plan for available types)", ["hacking", "field", "security"]);
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
        ns.tprint("[BT4] Enter a finite, nonnegative number.");
        return null;
    }
    return value;
}

async function capital(ns: NS): Promise<void> {
    const choice = await choose(ns, "Capital management", [
        "Trader start",
        "Trader stop",
        "Trader drain",
        "Trader status",
        "Fleet planning",
        "Fleet purchase",
    ]);

    const commands: Record<string, string> = {
        "Trader start": "start",
        "Trader stop": "stop",
        "Trader drain": "drain",
        "Trader status": "status",
    };

    if (commands[choice]) {
        await launchAndWait(
            ns,
            "traderctl.ts",
            [commands[choice]]
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
        "Start progression",
        "Start share manager",
        "Start network monitor",
        "Show home tools and RAM costs",
    ]);

    if (choice === "Start progression") {
        launch(ns, "progression.ts", []);
    }

    if (choice === "Start share manager") {
        launch(ns, "share.ts", []);
    }

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
        .filter(file => file !== "ap.ts")
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
        ["daemon.ts", "bootstrap.ts"].includes(
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

    if (
        process.filename === "progression.ts" &&
        engineMode(ns) !== "manual" &&
        ns.ps("home").some(p => p.filename === "daemon.ts")
    ) {
        ns.tprint("[CONTROL] Use Shutdown OS.");
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

    const daemonOnline = running.some(
        p => p.filename === "daemon.ts"
    );

    const manual = engineMode(ns) === "manual";

    if (script === "trader.ts") {
        ns.tprint("[CONTROL] Use traderctl.ts start.");
        return 0;
    }

    if (FARM.has(script)) {
        if (ns.fileExists(PAUSE_FILE, "home")) {
            ns.tprint(
                "[CONTROL] OS paused. Select MANUAL and resume."
            );
            return 0;
        }

        if (daemonOnline && !manual) {
            ns.tprint(
                "[CONTROL] AUTO/EARLY policy owns production. " +
                "Pause, select MANUAL, then resume."
            );
            return 0;
        }

        const active = running.some(
            p => ENGINES.includes(p.filename)
        );

        if (active) {
            ns.tprint(
                "[CONTROL] A production engine is already active."
            );
            return 0;
        }

        if (
            ENGINES.includes(script) &&
            running.some(p => FARM.has(p.filename))
        ) {
            ns.tprint(
                "[CONTROL] Stop existing workers/services first."
            );
            return 0;
        }
    }

    if (script === "progression.ts") {
        const reset = ns.getResetInfo();

        if (
            reset.currentNode !== 4 &&
            (reset.ownedSF.get(4) ?? 0) === 0
        ) {
            ns.tprint("[CONTROL] Singularity is locked.");
            return 0;
        }

        if (
            daemonOnline && !manual ||
            running.some(p => p.filename === "findV2.ts")
        ) {
            ns.tprint(
                "[CONTROL] Use MANUAL policy; finish FindV2 first."
            );
            return 0;
        }
    }

    const singleton = [
        ...ENGINES,
        "bootstrap.ts",
        "daemon.ts",
        "progression.ts",
        "share.ts",
        "netmon.ts",
        "findV2.ts",
    ];

    if (
        singleton.includes(script) &&
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

    if (MISSION_TOOLS.has(script)) {
        if (script !== "bt4.ts" && script !== "mission.ts" && script !== JIT6_SUPPORT) {
            const reset = ns.getResetInfo();
            if (reset.currentNode !== 4 && (reset.ownedSF.get(4) ?? 0) === 0) {
                ns.tprint("[BT4] Singularity unavailable; select Basic snapshot.");
                return 0;
            }
            if (script === "bt4-detail.ts" && !ns.fileExists("bt4.ts", "home")) {
                ns.tprint("[BT4] Missing dependency bt4.ts.");
                return 0;
            }
        }
        if (script === BT4_AUTO && !ns.fileExists("bt4-plan.ts", "home")) {
            ns.tprint("[BT4] Autopilot needs bt4-plan.ts.");
            return 0;
        }
        const reserve = ns.getScriptRam("stopfarm.ts", "home");
        if (reserve <= 0 || free - required < reserve) {
            ns.tprint(`[BT4] Admission refused: required=${required.toFixed(2)} GB, free=${free.toFixed(2)} GB, emergency=${reserve.toFixed(2)} GB. Missing/invalid stopfarm.ts also blocks admission.`);
            return 0;
        }
        if (script !== JIT6_SUPPORT && running.some(p => MISSION_TOOLS.has(p.filename) &&
            (p.filename !== BT4_AUTO || script === BT4_AUTO || script === "bt4-action.ts") &&
            (p.filename !== JIT6_SUPPORT || script === BT4_AUTO || script === "bt4-action.ts"))) {
            ns.tprint("[BT4] A mission tool is already running.");
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
): Promise<void> {
    const pid = launch(ns, script, args);

    if (!pid) return;

    while (ns.isRunning(pid)) {
        await ns.sleep(200);
    }
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
