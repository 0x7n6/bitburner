import assert from "node:assert/strict";
import { test } from "node:test";
import { main } from "../scripts/jit6-goal.ts";

const RED_PILL = "The Red Pill";

function fixture(node = 4) {
    const state = {
        reset: { currentNode: node, ownedSF: new Map([[4, 1]]), ownedAugs: new Map([["NeuroFlux Governor", 3]]) },
        game: { version: "3.0.1", commit: "3162fd2" },
        player: { money: 33e9, skills: { hacking: 351, strength: 120, defense: 120, dexterity: 123, agility: 123 }, factions: [] },
        installed: ["NeuroFlux Governor", "Previous augmentation"],
        queued: ["Another augmentation"],
        offers: {},
        logs: [],
        requirements: [
            { type: "numAugmentations", numAugmentations: 35 },
            { type: "money", money: 100e9 },
            { type: "someCondition", conditions: [
                { type: "skills", skills: { hacking: 2500 } },
                { type: "skills", skills: { strength: 1500, defense: 1500, dexterity: 1500, agility: 1500 } },
            ] },
        ],
    };
    const ns = {
        ui: { getGameInfo: () => state.game },
        getResetInfo: () => state.reset,
        getPlayer: () => state.player,
        format: { number: amount => String(amount) },
        tprint: line => state.logs.push(line),
        singularity: {
            getOwnedAugmentations: includeQueued => includeQueued ? [...state.installed, ...state.queued] : state.installed,
            getAugmentationsFromFaction: faction => state.offers[faction] ?? [],
            getFactionInviteRequirements: faction => {
                assert.equal(faction, "Daedalus");
                return state.requirements;
            },
            getAugmentationPrice: () => 0,
            getAugmentationRepReq: () => 2_500_000,
            getFactionRep: () => 2_000_000,
        },
    };
    return { ns, state };
}

test("reports live Daedalus gates with separate installed and queued counts and alternative skills", async () => {
    const { ns, state } = fixture();
    await main(ns);
    const output = state.logs.join("\n");
    assert.match(output, /Installed augmentations: 2 \/ 35 \| 33 to go/);
    assert.match(output, /Cash: \$33000000000 \/ \$100000000000 \| \$67000000000 to go/);
    assert.match(output, /Any skill path \| UNMET/);
    assert.match(output, /Hacking: 351 \/ 2,500 \| 2,149 to go/);
    assert.match(output, /Agility: 123 \/ 1,500 \| 1,377 to go/);

    state.player.skills.hacking = 2500;
    await main(ns);
    assert.ok(state.logs.includes("[JIT6 GOAL] Any skill path | MET"));
});

test("uses a joined live Red Pill seller instead of treating Daedalus as required", async () => {
    const { ns, state } = fixture(2);
    state.player.factions = ["Slum Snakes"];
    state.offers["Slum Snakes"] = [RED_PILL];
    delete ns.singularity.getFactionInviteRequirements;
    await main(ns);
    const output = state.logs.join("\n");
    assert.match(output, /Current quote: \$0/);
    assert.match(output, /Slum Snakes: 2,000,000 \/ 2,500,000 rep \| 500,000 to go/);
});

test("reports queue and installation as separate stages without unrelated quotes", async () => {
    const { ns, state } = fixture();
    state.queued.push(RED_PILL);
    delete ns.singularity.getAugmentationPrice;
    delete ns.singularity.getFactionInviteRequirements;
    await main(ns);
    assert.match(state.logs.at(-1), /queued/);

    state.reset.ownedAugs.set(RED_PILL, 1);
    delete ns.singularity;
    await main(ns);
    assert.match(state.logs.at(-1), /installed/);
});

test("handles BN8 economy and skips Daedalus entirely on BN15", async () => {
    const bn8 = fixture(8);
    await main(bn8.ns);
    assert.match(bn8.state.logs.join("\n"), /Stock-market economy[\s\S]*Daedalus invitation milestones/);

    const bn15 = fixture(15);
    delete bn15.ns.singularity.getFactionInviteRequirements;
    await main(bn15.ns);
    const output = bn15.state.logs.join("\n");
    assert.match(output, /Alternate Red Pill source/);
    assert.doesNotMatch(output, /Daedalus/);
});

test("uses no gated calls on a mismatched build or before unlocking Singularity", async () => {
    const mismatch = fixture();
    mismatch.state.game.commit = "abcdefa";
    delete mismatch.ns.singularity;
    await main(mismatch.ns);
    assert.match(mismatch.state.logs.at(-1), /require Bitburner 3\.0\.1/);

    const locked = fixture(1);
    locked.state.reset.ownedSF.clear();
    delete locked.ns.singularity;
    await main(locked.ns);
    assert.match(locked.state.logs.at(-1), /require Singularity/);
});
