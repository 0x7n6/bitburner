import type { NS } from "@ns";
import { BIT_NODES } from "./bitburner-catalog.ts";

export async function main(ns: NS): Promise<void> {
    const [nodeArg, levelArg] = ns.args;
    const node = Number(nodeArg ?? 0);
    const level = Number(levelArg ?? 1);
    const current = node === 0;
    if (!current && (!Object.hasOwn(BIT_NODES, node) || !Number.isSafeInteger(level) || level < 1)) {
        ns.tprint("Use jit6-multipliers.ts [BitNode 1–15] [level]. Leave both blank for the current node.");
        return;
    }
    const reset = ns.getResetInfo();
    if (reset.currentNode !== 5 && !(reset.ownedSF.get(5) ?? 0)) {
        ns.tprint("Multiplier data requires BN5 or active SF5. The BitNode catalog is available now.");
        return;
    }
    try {
        const stats = current ? ns.getBitNodeMultipliers() : ns.getBitNodeMultipliers(node, level);
        ns.tprint(current ? `Live multipliers for the current BN${reset.currentNode}` : `Game multipliers for BN${node}, level ${level}`);
        ns.tprint(JSON.stringify(stats, null, 2));
    } catch (error) {
        ns.tprint(`Multiplier data unavailable: ${String(error)}`);
    }
}
