import type { NS } from "@ns";
import { isUniversityStudy, LOCAL_UNIVERSITIES } from "./jit6-study-policy.ts";

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
    const current = ns.singularity.getCurrentWork();
    const replacingStudy = ns.args.includes("--replace-study") && isUniversityStudy(current);
    if (current && !replacingStudy) {
        report("Player is already working. Existing activity continues.");
        return;
    }
    const city = ns.getPlayer().city;
    const university = LOCAL_UNIVERSITIES[city as keyof typeof LOCAL_UNIVERSITIES];
    if (!university) {
        report(`No supported university in ${city}. Choose work through the game UI.`);
        return;
    }
    if (replacingStudy && current.classType === "Computer Science" && current.location === university) {
        report(`Free Computer Science is already active at ${university}.`);
        return;
    }
    const started = ns.singularity.universityCourse(university, "Computer Science", false);
    const action = replacingStudy ? "Replaced university study with" : "Started";
    report(started ? `${action} free Computer Science at ${university}. Study continues after this script exits.` :
        `The game declined Computer Science at ${university}.`);
}
