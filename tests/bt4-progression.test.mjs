import assert from "node:assert/strict";
import test from "node:test";

import { main as action } from "../scripts/bt4-action.ts";
import { main as plan } from "../scripts/bt4-plan.ts";

function fixture(args) {
    const state = {
        cash: 1_000, price: 250, ram: 128, spare: 22, reserve: 5, work: null,
        paused: false, node: 4, lastAugReset: 10, rep: 200, processes: [],
        bought: ["Foundation"], calls: [], logs: [], approve: async () => true,
    };
    const ns = {
        args, pid: 21,
        getHostname: () => "home",
        getResetInfo: () => ({
            currentNode: state.node, ownedSF: new Map(), lastNodeReset: 1,
            lastAugReset: state.lastAugReset, bitNodeOptions: {},
        }),
        getPlayer: () => ({ money: state.cash, factions: ["CyberSec"] }),
        fileExists: () => state.paused,
        getScriptRam: () => state.reserve,
        getServerMaxRam: () => state.ram,
        getServerUsedRam: () => state.ram - state.spare,
        ps: () => state.processes,
        flags: () => ({ reserve: 600 }),
        prompt: () => state.approve(),
        tprint: message => state.logs.push(message),
        singularity: {
            getCurrentWork: () => state.work,
            getFactionWorkTypes: () => ["hacking"],
            getOwnedAugmentations: purchased => purchased ? state.bought : [],
            getAugmentationsFromFaction: () => ["Foundation", "Power", "Blocked", "NeuroFlux Governor"],
            getAugmentationPrereq: name => name === "Power" ? ["Foundation"] : name === "Blocked" ? ["Missing"] : [],
            getAugmentationRepReq: () => 100,
            getAugmentationPrice: () => state.price,
            getAugmentationStats: () => ({ hacking_exp: 1.2 }),
            getFactionRep: () => state.rep,
            getUpgradeHomeRamCost: () => state.price,
            workForFaction: (...values) => (state.calls.push(["work", ...values]), true),
            purchaseAugmentation: (...values) => (state.calls.push(["purchase", ...values]), true),
            upgradeHomeRam: () => (state.calls.push(["home-ram"]), true),
        },
    };
    return { ns, state };
}

const purchase = ["augmentation", "CyberSec", "Power", 300, 600];

test("planner recognizes queued prerequisites and filters repeatable augmentations", async () => {
    const { ns, state } = fixture([]);
    await plan(ns);
    const result = JSON.parse(state.logs[0]);
    assert.deepEqual(result.readyToBuy.map(aug => aug.name), ["Power"]);
    assert.equal(result.queuedCount, 1);
    assert.equal(result.prerequisiteBlocked[0].name, "Blocked");
    assert.deepEqual(state.calls, []);
});

test("approved purchase and RAM upgrade execute one transaction each", async () => {
    const buy = fixture(purchase);
    await action(buy.ns);
    assert.deepEqual(buy.state.calls, [["purchase", "CyberSec", "Power"]]);
    const upgrade = fixture(["home-ram", 300, 600]);
    await action(upgrade.ns);
    assert.deepEqual(upgrade.state.calls, [["home-ram"]]);
});

test("approval starts background faction work only on idle player", async () => {
    const { ns, state } = fixture(["work", "CyberSec", "hacking"]);
    state.approve = async () => { state.work = { type: "CRIME" }; return true; };
    await action(ns);
    assert.deepEqual(state.calls, []);
    assert.match(state.logs[0], /already has work/);
    state.work = null;
    state.approve = async () => true;
    await action(ns);
    assert.deepEqual(state.calls, [["work", "CyberSec", "hacking", false]]);
});

for (const [name, change, error] of [
    ["buying consumes cash while the prompt is open", s => { s.cash = 800; }, /cash floor/],
    ["a new quote needs fresh approval", s => { s.price = 260; }, /quote changed/],
    ["a reset invalidates approval", s => { s.lastAugReset++; }, /generation changed/],
    ["a spending service starts during approval", s => { s.processes = [{ filename: "trader.ts" }]; }, /capital service/],
    ["emergency headroom shrinks during approval", s => { s.spare = 4; }, /Emergency RAM/],
    ["another BT4 action becomes active", s => { s.processes = [{ filename: "bt4-action.ts", pid: 22 }]; }, /Another BT4 action/],
    ["OS pauses during approval", s => { s.paused = true; }, /paused/],
]) {
    test(name, async () => {
        const { ns, state } = fixture(purchase);
        state.approve = async () => { change(state); return true; };
        await action(ns);
        assert.deepEqual(state.calls, []);
        assert.match(state.logs[0], error);
    });
}

test("cancel and missing prerequisite do not execute", async () => {
    const cancelled = fixture(purchase);
    cancelled.state.approve = async () => false;
    await action(cancelled.ns);
    assert.deepEqual(cancelled.state.calls, []);
    const blocked = fixture(purchase);
    blocked.state.bought = [];
    await action(blocked.ns);
    assert.deepEqual(blocked.state.calls, []);
    assert.match(blocked.state.logs[0], /Missing prerequisites/);
});
