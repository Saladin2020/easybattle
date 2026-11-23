export { get, post } from "./api.base";
type Name = { th: string; en: string; ms?: string };
export interface Summary {
  root: string;
  docs: string[];
  rules: { maxLevel: number; partySize: number; xp: { base: number; step: number; quad: number } };
  elements: Array<{ id: string; th: string; en: string; color: string }>;
  statuses: Array<{ id: string; th: string; en: string; kind: string; turns: number }>;
  heroes: Array<{ id: string; th: string; en: string; role: string | null; hp: number; skills: string[] }>;
  enemies: Array<{ id: string; th: string; en: string; level: number; hp: number; xp: number; coins: number; weak: string[]; boss: boolean }>;
  skills: Array<{ id: string; th: string; en: string; kind: string; target: string; power: number; mp: number; element: string }>;
  encounters: Array<{ id: string; regions: string[]; cultures: string[]; terrains: string[]; rate: number; groups: number; scripted: boolean }>;
  items: Array<{ item: string; hp?: number; mp?: number; cures?: string[] }>;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
  exportPresets: string[];
  ui: { layout: string; status: string; backdrop: string; timing?: string; atbMode?: string };
  enums?: { layouts: string[]; status: string[]; backdrops: string[]; terrains: string[] };
}
export interface Actor { side: 0 | 1; id: string; name: Name; level: number; hp: number; mp: number; max: { hp: number; mp: number } }
export interface SimResult { result: string; log: Array<Record<string, unknown> & { t: string }>; rewards: { xp: number; coins: number; drops: Array<{ item: string; n: number }>; levels: Array<{ id: string; from: number; to: number; learned: string[] }> }; actors: Actor[] }
