// Same directory, same override — but two of these imports are still banned.
//
// This is the file that settles 0010's overrides-merge question: the `mqtt`
// import SHOULD pass here (the override grants it) while the generated-client
// import SHOULD still fail (the base rule bans it everywhere). Under the naive
// override the second ban silently disappears.
import mqtt from "mqtt";
import { listPlants } from "../../app/api/generated/plants.js";
import { renderPanel } from "../features/plant-panel.clean.js";

export const client = mqtt;
export const leak = listPlants;
export const layering = renderPanel;
