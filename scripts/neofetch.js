/** @param {NS} ns */
export async function main(ns) {
  // neofetch script made by DeVil
  // Check steam guide or github page for more information
  // use the following alias commands:
  // alias neofetch="home; run neofetch.js"
  // alias neofetch="home; clear; run neofetch.js"

  let tuser = "bitburner";
  let thost = "";

  if (ns.args.length > 0 && ns.serverExists(ns.args[0])) thost = ns.args[0];
  else thost = ns.getHostname();

  if (ns.hasRootAccess(thost)) tuser = "root";

  const title = tuser + "@" + thost;
  let line = "";

  for (let i = 0; i <= title.length; i++) line += "-";

  const hskill = ns.getHackingLevel();
  const rhskill = ns.getServerRequiredHackingLevel(thost);
  const hchance = ns.formatPercent(ns.hackAnalyzeChance(thost));
  const htime = ns.tFormat(ns.getHackTime(thost));

  const nukep = ns.getServerNumPortsRequired(thost);
  const seclvl = ns.getServerSecurityLevel(thost);
  const amoney = ns.formatNumber(ns.getServerMoneyAvailable(thost), 3);
  const mmoney = ns.getServerMaxMoney(thost);

  const ramv = ns.getServerMaxRam(thost);
  const ramu = ns.getServerUsedRam(thost);
  const rama = ramv - ramu;

  const runningscr = ns.ps(thost).length;

  ns.tprintRaw("\n                 aa                   " + title);
  ns.tprintRaw("          fi aa  bb  aa fi            " + line);
  ns.tprintRaw(
    "      pl  aa sa  if  an aa  ot        " + "Hack Lvl: " + hskill,
  );
  ns.tprintRaw(
    "   fa wa  ba  a0aaaaaa  aa  aw ab     " + "Req Hack Lvl: " + rhskill,
  );
  ns.tprintRaw(
    "   ba aa  ba  aa fa aa  aa  aa aa     " + "Hack Chance: " + hchance,
  );
  ns.tprintRaw(
    "   baaa   aaaca  db  aaaaa   aaaa     " + "Hack Time: " + htime,
  );
  ns.tprintRaw(
    "   ca   aag  pa  if  aq  aaa   ab     " + "Req Ports: " + nukep,
  );
  ns.tprintRaw("   ba ja    aaa  aa  aaa    ai aa     " + "Sec Lvl: " + seclvl);
  ns.tprintRaw(
    "   fa sallmaak  baaa  aaaaaaaw ac     " + "Available Money: " + amoney,
  );
  ns.tprintRaw(
    "   caamaaaaaa  aa  aa  ae   alaac     " + "Max Money: " + mmoney,
  );
  ns.tprintRaw(
    "    aa7a   ea  aa  aa  ab   a5aa      " + "Max Ram: " + ns.formatRam(ramv),
  );
  ns.tprintRaw(
    "      aa   ba  ai  aa  ab   aa        " +
      "Used Ram: " +
      ns.formatRam(ramu),
  );
  ns.tprintRaw(
    "       aaa ea    aa    ae aaa         " +
      "Available Ram: " +
      ns.formatRam(rama),
  );
  ns.tprintRaw(
    "        aa qz     z    vt aa          " +
      "Scripts Running: " +
      runningscr +
      "\n\n",
  );
}
