import type { NS } from "@ns";

/** BT4 alpha1: one-shot observation. No ports, files, or player state are written. */
export function observe<T>(read: () => T): { status: "KNOWN"; value: T } | { status: "UNKNOWN"; reason: string } {
    try { return { status: "KNOWN", value: read() }; }
    catch (error) { return { status: "UNKNOWN", reason: String(error) }; }
}

export function collectBase(ns: NS) {
    const reset = ns.getResetInfo();
    const player = ns.getPlayer();
    const home = ns.getServer("home");
    const hosts = ["home"];
    const seen = new Set(hosts);
    const gaps: string[] = [];
    for (let i = 0; i < hosts.length; i++) {
        const adjacent = observe(() => ns.scan(hosts[i]));
        if (adjacent.status === "UNKNOWN") { gaps.push(`${hosts[i]}: ${adjacent.reason}`); continue; }
        for (const host of adjacent.value) if (!seen.has(host)) { seen.add(host); hosts.push(host); }
    }
    const servers = hosts.map(host => ({ host, observation: observe(() => ns.getServer(host)) }));
    const inventory = hosts.map(host => ({ host, processes: observe(() => ns.ps(host)) }));
    const engines = inventory.flatMap(entry => entry.processes.status === "KNOWN"
        ? entry.processes.value.filter(p => ["jit5.ts", "early.ts", "harvest.ts"].includes(p.filename))
            .map(p => ({ host: entry.host, ...p, health: "UNKNOWN: PID presence does not prove useful production" })) : []);
    const homeProcesses = inventory.find(entry => entry.host === "home")!.processes;
    const reserve = ns.getScriptRam("stopfarm.ts", "home");
    const knownServers = servers.flatMap(entry => entry.observation.status === "KNOWN" ? [entry.observation.value] : []);
    const remote = knownServers.filter(s => s.hostname !== "home" && s.hasAdminRights && s.maxRam > 0);
    const world = servers.find(entry => entry.host === "w0r1d_d43m0n")?.observation;
    return {
        schema: "7n8-bt4-alpha1", capturedAt: new Date().toISOString(), game: observe(() => ns.ui.getGameInfo()),
        mission: reset.currentNode === 4 ? "OPERATION SINGULARITY: complete current BN4 cycle" : "UNKNOWN: mission policy for this BitNode is not configured",
        reset: { currentNode: reset.currentNode, lastNodeReset: reset.lastNodeReset,
            lastAugReset: reset.lastAugReset, sourceFiles: [...reset.ownedSF], installedAugmentations: [...reset.ownedAugs] },
        player, singularityAvailable: reset.currentNode === 4 || (reset.ownedSF.get(4) ?? 0) > 0,
        home: { maxRam: home.maxRam, usedRam: home.ramUsed, freeRam: Math.max(0, home.maxRam - home.ramUsed), cores: home.cpuCores,
            emergencyReserveGb: reserve > 0 ? reserve : null, reserveStatus: reserve > 0 ? "MEASURED stopfarm.ts" : "UNKNOWN: stopfarm.ts missing or invalid",
            reservePreserved: reserve > 0 ? home.maxRam - home.ramUsed >= reserve : null },
        capabilities: { openers: ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"].filter(f => ns.fileExists(f, "home")),
            formulas: ns.fileExists("Formulas.exe", "home"), darknetNavigator: ns.fileExists("DarkscapeNavigator.exe", "home") },
        control: { paused: ns.fileExists(".7n8-pause.txt", "home"),
            enginePolicy: ns.getHostname() === "home" ? ns.read(".7n8-engine-mode.txt").trim() || "auto (default)" : "UNKNOWN: run on home to read policy",
            daemon: homeProcesses.status === "KNOWN" ? (homeProcesses.value.some(p => p.filename === "daemon.ts") ? "ONLINE" : "OFFLINE") : "UNKNOWN" },
        engines, processes: inventory,
        network: { discovered: hosts.length, rooted: knownServers.filter(s => s.hasAdminRights).length,
            remoteMaxRam: remote.reduce((sum, s) => sum + s.maxRam, 0), remoteFreeRam: remote.reduce((sum, s) => sum + Math.max(0, s.maxRam - s.ramUsed), 0),
            note: "Observed RAM only; not schedulable capacity or a reservation. Hidden servers are not inferred.",
            complete: gaps.length === 0 && servers.every(e => e.observation.status === "KNOWN"), gaps, servers },
        worldDaemon: world?.status === "KNOWN" ? { status: "OBSERVED", requiredHacking: world.value.requiredHackingSkill,
            hackingThresholdMet: player.skills.hacking >= (world.value.requiredHackingSkill ?? Infinity),
            rootAccess: world.value.hasAdminRights, note: "Threshold only; no completion action or full readiness claim." }
            : { status: "UNKNOWN", reason: "World Daemon not visible or readable; no hardcoded requirement substituted." },
        unknowns: ["Production throughput/health (ports intentionally untouched)", "Protected capital and pending automation policy", "Faction invitations (official query triggers game counters)", "Queued augmentations/current work require bt4-detail.ts"],
    };
}

export async function main(ns: NS): Promise<void> {
    const flags = ns.flags([["dry-run", false], ["json", false], ["help", false]]);
    if (flags.help) { ns.tprint("BT4 alpha1: run bt4.ts [--dry-run] [--json]. All paths observe only; --dry-run is an explicit synonym."); return; }
    const snapshot = collectBase(ns);
    ns.tprint(JSON.stringify(snapshot, null, flags.json ? 0 : 2));
    ns.tprint("[BT4] Observation complete. Use AP Mission observation for reserve-checked detail. No player action requested.");
}
