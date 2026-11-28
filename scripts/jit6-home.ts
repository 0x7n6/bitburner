import type { NS } from "@ns";

const CONFLICTS = new Set(["bt4-auto.ts", "bt4-action.ts", "trader.ts", "traderctl.ts", "fleet.ts", "mission.ts", "jit6-home.ts"]);

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");
    const [cap, reserve, target, deadline, node, nodeReset, augReset] = ns.args;
    const report = (message: string) => ns.tprint(`[JIT6 HOME] ${message}`);
    if (ns.args.length !== 7 || typeof cap !== "number" || !Number.isFinite(cap) || cap <= 0 ||
        typeof reserve !== "number" || !Number.isFinite(reserve) || reserve < 0 ||
        typeof target !== "number" || !Number.isSafeInteger(target) || target <= 0 ||
        typeof deadline !== "number" || !Number.isFinite(deadline) || Date.now() >= deadline ||
        ns.getHostname() !== "home") {
        report("Missing or expired upgrade authorization. Use the JIT6 support menu.");
        return;
    }
    const live = ns.getResetInfo();
    const game = ns.ui.getGameInfo();
    if (live.currentNode !== node || live.lastNodeReset !== nodeReset || live.lastAugReset !== augReset ||
        (node !== 4 && !(live.ownedSF.get(4) ?? 0)) ||
        game.version !== "3.0.1" || !game.commit.startsWith("3162fd2")) {
        report("Upgrade authorization no longer matches the game or reset.");
        return;
    }

    const ram = ns.getServerMaxRam("home");
    const emergency = ns.getScriptRam("stopfarm.ts", "home");
    if (ram * 2 > target || (live.bitNodeOptions.restrictHomePCUpgrade && ram >= 128) ||
        ns.fileExists(".7n8-pause.txt", "home") ||
        !(emergency > 0) || ram - ns.getServerUsedRam("home") < emergency ||
        ns.ps("home").some(p => p.pid !== ns.pid && CONFLICTS.has(p.filename))) {
        report("Upgrade blocked by capacity, pause, emergency RAM, or a competing capital policy.");
        return;
    }
    const price = ns.singularity.getUpgradeHomeRamCost();
    const cash = ns.getPlayer().money;
    if (!Number.isFinite(price) || price < 0 || price > cap || cash - price < reserve) {
        report(`Live quote $${price} exceeds the cap or would breach the cash floor.`);
        return;
    }
    // Quote and spend synchronously. Each scheduler session authorizes at most one upgrade attempt.
    if (ns.singularity.upgradeHomeRam()) {
        report(`Upgraded home RAM for $${price} (now ${ns.getServerMaxRam("home")} GB).`);
    } else {
        report("The game refused the upgrade.");
    }
}
