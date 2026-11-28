import type { NS } from "@ns";

const UNIVERSITIES = {
    "Aevum": "Summit University",
    "Sector-12": "Rothman University",
    "Volhaven": "ZB Institute of Technology",
} as const;
const WORK_OWNERS = new Set(["bt4-auto.ts", "bt4-action.ts", "mission-study.ts", "progression.ts", "findV2.ts"]);

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");
    const report = (line: string) => ns.tprint(`[MISSION STUDY] ${line}`);
    const reset = ns.getResetInfo();
    const game = ns.ui.getGameInfo();
    if (ns.getHostname() !== "home" || game.version !== "3.0.1" || !game.commit.startsWith("3162fd2") ||
        (reset.currentNode !== 4 && !(reset.ownedSF.get(4) ?? 0))) {
        report("Requires home and Singularity on Bitburner 3.0.1 (3162fd2).");
        return;
    }
    const emergency = ns.getScriptRam("stopfarm.ts", "home");
    const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
    if (ns.fileExists(".7n8-pause.txt", "home") || !(emergency > 0) || free < emergency ||
        ns.ps("home").some(p => p.pid !== ns.pid && WORK_OWNERS.has(p.filename))) {
        report("Paused, another work policy is active, or emergency RAM is unavailable.");
        return;
    }
    if (ns.singularity.getCurrentWork() !== null) {
        report("Player is already working. Existing activity continues.");
        return;
    }
    const city = ns.getPlayer().city;
    const university = UNIVERSITIES[city as keyof typeof UNIVERSITIES];
    if (!university) {
        report(`No supported university in ${city}. Choose work through the game UI.`);
        return;
    }
    const started = ns.singularity.universityCourse(university, "Computer Science", false);
    report(started ? `Started free Computer Science at ${university}. Study continues after this script exits.` :
        `The game declined Computer Science at ${university}.`);
}
