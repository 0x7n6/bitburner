import type { NS } from "@ns";
import { BIT_NODES, bitNodeCatalog, factionCatalog, GAME_COMMIT } from "./bitburner-catalog.ts";

const SERVICES = {
    "jit6.ts": "JIT6", "bt4-auto.ts": "Player work", "mission-study.ts": "Free study",
    "jit6-home.ts": "Home investment", "share.ts": "Share", "trader.ts": "Trader",
    "share-worker.ts": "Share worker", "traderctl.ts": "Trader control",
    "netmon.ts": "Network monitor", "find.ts": "Manual Find", "findV2.ts": "Manual Find V2",
    "progression.ts": "Legacy navigation", "daemon.ts": "Legacy supervisor", "bootstrap.ts": "Legacy bootstrap",
    "jit5.ts": "Legacy JIT5", "early.ts": "Legacy Early", "harvest.ts": "Legacy Harvest",
} as const;

function daemonObservation(ns: NS, hacking: number): string {
    try {
        const server = ns.getServer("w0r1d_d43m0n");
        const needed = server.requiredHackingSkill;
        if (server.isOnline === false || needed === undefined) return "UNKNOWN: threshold not observed.";
        return `Hacking threshold ${hacking}/${needed}; ${hacking >= needed ? "met" : "unmet"}. Completion also depends on route and eligibility.`;
    } catch {
        return "UNKNOWN: World Daemon is not visible in this snapshot.";
    }
}

export async function main(ns: NS): Promise<void> {
    const flags = ns.flags([["nodes", false], ["factions", false]]);
    const game = ns.ui.getGameInfo();
    const reset = ns.getResetInfo();
    const player = ns.getPlayer();
    const card = BIT_NODES[reset.currentNode];
    const matched = game.version === "3.0.1" && GAME_COMMIT.startsWith(game.commit) && game.commit.length >= 7;
    const show = (line: string) => ns.tprint(line);

    if (flags.nodes === true) {
        bitNodeCatalog(reset).forEach(show);
        return;
    }
    if (flags.factions === true) {
        factionCatalog(player.factions).forEach(show);
        return;
    }

    const home = ns.getServer("home");
    const free = Math.max(0, home.maxRam - home.ramUsed);
    const emergency = ns.getScriptRam("stopfarm.ts", "home");
    const paused = ns.fileExists(".7n8-pause.txt", "home");
    const singularity = reset.currentNode === 4 || (reset.ownedSF.get(4) ?? 0) > 0;
    const stock = ns.stock.hasTixApiAccess() && ns.stock.has4SDataTixApi();
    const processes = ns.ps("home").filter(p => p.pid !== ns.pid);
    const visible = processes.filter(p => Object.hasOwn(SERVICES, p.filename));
    const normal = visible.map(p => `${SERVICES[p.filename as keyof typeof SERVICES]} PID ${p.pid}`).join(" | ");
    const session = processes.find(p => p.filename === "jit6.ts" && p.args.includes("--execute"));
    const darkscape = ns.fileExists("DarkscapeNavigator.exe", "home");

    show(`JIT6 dashboard | Bitburner ${game.version} | BN${reset.currentNode} — ${card?.name ?? "unknown"}`);
    if (!matched) show("Catalog is pinned to 3.0.1 (3162fd2); verify version-specific guidance in the current UI.");
    show(`Home: ${free.toFixed(2)}/${home.maxRam} GB free | Emergency: ${emergency > 0 ? `${emergency.toFixed(2)} GB` : "unavailable"} | OS: ${paused ? "PAUSED" : "unpaused"}`);
    show(`Home services: ${normal || "none of the tracked services"}`);
    if (session) {
        for (const line of ns.getScriptLogs(session.pid).filter(log => log.startsWith("[JIT6 SUPPORT]")).slice(-3)) show(line);
    }
    show(`Cash: $${Math.floor(player.money).toLocaleString()} | Skill: ${player.skills.hacking} | Factions joined: ${player.factions.join(", ") || "none"}`);
    show(`Active Source-Files: ${[...reset.ownedSF].map(([id, level]) => `SF${id}.${level}`).join(", ") || "none"}`);
    show(`Distinct installed augmentations: ${reset.ownedAugs.size} | Red Pill installed: ${reset.ownedAugs.has("The Red Pill") ? "yes" : "no"}`);
    show(`Singularity: ${singularity ? "available" : "locked"} | Trader data: ${stock ? "TIX + 4S ready" : "TIX or 4S missing"} | DarkscapeNavigator: ${darkscape ? "present" : "absent"}`);
    if (matched && (darkscape || reset.currentNode === 15)) {
        try {
            const instability = ns.dnet.getDarknetInstability();
            show(`Darknet instability: ${instability.authenticationDurationMultiplier.toFixed(2)}× duration, ${(100 * instability.authenticationTimeoutChance).toFixed(1)}% timeout.`);
        } catch {
            show("Darknet instability is unavailable in this save.");
        }
    }
    show(`Completion observation: ${daemonObservation(ns, player.skills.hacking)}`);
    if (matched && card) {
        show(`Node focus: ${card.focus}. ${card.next}`);
    } else {
        show("Consult the current BitVerse and faction UI for next steps in this version.");
    }
    if (paused) show("Next control step: resume JIT6 before choosing a work session.");
    else if (!singularity) show("Next control step: choose player work in the game UI until Singularity becomes available.");
    else if (reset.currentNode === 4) show("Next control step: inspect Daedalus in Faction details and run the progression plan with your preferred cash reserve.");
    if (!stock && reset.currentNode === 8) show("Next economy step: review missing market access in the stock UI before enabling Trader.");
    show("Invitations, installs and BitNode transitions are handled in the game UI.");
}
