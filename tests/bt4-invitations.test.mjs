import test from "node:test";
import assert from "node:assert/strict";
import { main, rankInvitations } from "../scripts/jit6-invitations.ts";

const RECEPTOR = "Neuroreceptor Management Implant";
const RED_PILL = "The Red Pill";

function fixture() {
    const state = { invitationChecks: 0, logs: [], reserve: 1_000 };
    const offers = {
        "Slum Snakes": ["Shared"],
        "Sector-12": [],
        "Aevum": ["Shared", "Queued", "Expensive", "Locked", "Reflexes"],
        "Chongqing": ["Local Offer"],
        "CyberSec": ["Fast Unlock"],
        "Daedalus": [RED_PILL],
        "Tian Di Hui": [RECEPTOR],
        "Shadows of Anarchy": ["Infiltration Reward"],
    };
    const ns = {
        disableLog: () => {},
        flags: () => ({ reserve: state.reserve }),
        getPlayer: () => ({ money: 2_000, factions: ["Slum Snakes", "Sector-12"] }),
        getResetInfo: () => ({ currentNode: 4, ownedSF: new Map() }),
        ui: { getGameInfo: () => ({ version: "3.0.1", commit: "3162fd2" }) },
        format: { number: String },
        tprint: line => state.logs.push(line),
        singularity: {
            checkFactionInvitations: () => {
                state.invitationChecks++;
                return ["Aevum", "Chongqing", "CyberSec", "Daedalus", "Tian Di Hui", "Shadows of Anarchy", "Sector-12", "Aevum"];
            },
            getOwnedAugmentations: () => ["Queued"],
            getFactionEnemies: faction => faction === "Chongqing" ? ["Sector-12"] :
                faction === "Aevum" ? ["Chongqing", "Volhaven"] : [],
            getFactionRep: faction => faction === "CyberSec" ? 95 : 0,
            getFactionWorkTypes: faction => faction === "Shadows of Anarchy" ? [] : ["hacking"],
            getAugmentationsFromFaction: faction => offers[faction],
            getAugmentationStats: name => [RED_PILL, RECEPTOR, "Reflexes"].includes(name) ? {} : { hacking: 1.1 },
            getAugmentationPrice: name => name === "Expensive" ? 1_001 : 100,
            getAugmentationRepReq: name => name === RED_PILL ? 100_000 : 100,
            getAugmentationPrereq: name => name === "Locked" ? ["Missing"] :
                name === "Fast Unlock" ? ["Queued"] : [],
        },
    };
    return { ns, state };
}

test("invitations rank milestone first, then reputation gap, with city conflicts and live quotes", () => {
    const { ns, state } = fixture();
    const rows = rankInvitations(ns, 4, 1_000);
    assert.equal(state.invitationChecks, 1);
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.slice(0, 3).map(row => row.faction), ["Daedalus", "CyberSec", "Tian Di Hui"]);
    assert.equal(rows[0].targets[0].mission, true);
    assert.equal(rows[1].targets[0].repMissing, 5);
    assert.equal(rows[1].targets[0].price, 100);
    assert.equal(rows[2].targets[0].name, RECEPTOR);
    assert.deepEqual(rows.find(row => row.faction === "Chongqing").blockedBy, ["Sector-12"]);
    assert.ok(rows.find(row => row.faction === "Aevum").excluded.includes("already owned, queued, or offered by a joined faction"));
    assert.ok(rows.find(row => row.faction === "Shadows of Anarchy").excluded.includes("reputation required without standard work"));
    assert.ok(rows.every(row => row.targets.every(target => target.name !== "Shared")));
});

test("BN15 follows its own Red Pill route and a lower reserve can admit more offers", () => {
    const { ns } = fixture();
    const rows = rankInvitations(ns, 15, 900);
    assert.equal(rows[0].faction, "CyberSec");
    assert.deepEqual(rows.find(row => row.faction === "Aevum").targets.map(target => target.name), ["Expensive"]);
    assert.deepEqual(rows.find(row => row.faction === "Daedalus").targets, []);
});

test("the terminal command reports opportunities and explains empty or incompatible invitations", async () => {
    const { ns, state } = fixture();
    await main(ns);
    const output = state.logs.join("\n");
    assert.match(output, /Daedalus \| 1 new progression target/);
    assert.match(output, /Fast Unlock \| \$100 \| 5 rep remaining/);
    assert.match(output, /Aevum \| no eligible new target.*price exceeds spendable cash.*missing prerequisites/);
    assert.match(output, /Joining excludes Chongqing, Volhaven for this cycle/);
    assert.match(output, /Chongqing \| incompatible with joined Sector-12/);
});

test("invalid reserve and locked Singularity leave invitation checks alone", async () => {
    const { ns, state } = fixture();
    state.reserve = -1;
    await main(ns);
    assert.match(state.logs.at(-1), /nonnegative --reserve/);
    ns.getResetInfo = () => ({ currentNode: 1, ownedSF: new Map() });
    await main(ns);
    assert.match(state.logs.at(-1), /Singularity access/);
    assert.equal(state.invitationChecks, 0);
});
