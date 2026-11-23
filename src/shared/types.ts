/** easybattle/1 — turn-based JRPG battle database (heroes, enemies, skills, elements, statuses, encounter tables). */
export const FORMAT = "easybattle/1";
export const STATS = ["hp", "mp", "atk", "def", "mag", "res", "spd"] as const;
export type Stat = (typeof STATS)[number];
export type Stats = Record<Stat, number>;
export const SKILL_KINDS = ["physical", "magic", "heal", "buff", "debuff", "cure"] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];
export const TARGETS = ["enemy", "all_enemies", "self", "ally", "all_allies"] as const;
export type Target = (typeof TARGETS)[number];
export const STATUS_KINDS = ["poison", "regen", "sleep", "stun", "atk", "def", "mag", "spd"] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];
export const TERRAINS = ["any", "grass", "forest", "mountain", "field", "road", "beach", "water", "town", "cave"] as const;
export type Terrain = (typeof TERRAINS)[number];
export const CULTURES = ["thai", "malay", "chinese", "rural", "city", "any"] as const;
export const EXPORT_PRESETS = ["godot", "pixi", "png", "json", "all"] as const;
export type ExportPreset = (typeof EXPORT_PRESETS)[number];
export const ENEMY_ART = ["monkey", "crab", "mosquito", "monitor", "cobra", "bat", "boar", "rooster", "scorpion", "bandit", "mud", "crocodile", "tiger", "kite", "snail", "rat", "scarecrow"] as const;
export type EnemyArt = (typeof ENEMY_ART)[number];
/** Battle screen layouts: classic side view (default) or a 16-bit style back view of the party. */
export const UI_LAYOUTS = ["classic", "backview"] as const;
export type UiLayout = (typeof UI_LAYOUTS)[number];
/** Party status: HP / MP rows (classic only), portrait status cards, or nothing. */
export const UI_STATUS = ["rows", "cards", "none"] as const;
export type UiStatus = (typeof UI_STATUS)[number];
/** Back-view battlefield: auto (from the terrain), paddy field or forest edge. */
export const UI_BACKDROPS = ["auto", "paddy", "forest"] as const;
export type UiBackdrop = (typeof UI_BACKDROPS)[number];
/** Turn order: rounds in SPD order, or active time battle (speed-filled gauges, time bars on the status cards). */
export const UI_TIMING = ["turn", "atb"] as const;
export type UiTiming = (typeof UI_TIMING)[number];
/** ATB: wait = time stops while a command menu is open; active = it keeps running. */
export const UI_ATB_MODES = ["wait", "active"] as const;
export type UiAtbMode = (typeof UI_ATB_MODES)[number];

export interface Name {
  th: string;
  en: string;
  ms?: string;
}

export interface Element {
  id: string;
  name: Name;
  color: string;
}

export interface StatusDef {
  id: string;
  name: Name;
  kind: StatusKind;
  /** poison / regen: % of max HP per tick; atk/def/mag/spd: multiplier in % (150 = ×1.5, 70 = ×0.7). */
  amount?: number;
  turns: number;
  color?: string;
}

export interface SkillDef {
  id: string;
  name: Name;
  desc?: Name;
  kind: SkillKind;
  target: Target;
  /** Damage / heal power (10 = one plain attack). */
  power?: number;
  mp?: number;
  element?: string;
  /** Hit chance 0..100 (default 95 for physical / magic, always hits otherwise). */
  accuracy?: number;
  status?: { id: string; chance?: number };
  /** cure: statuses removed (empty = all negative). */
  cures?: string[];
  /** Easy FX preset / workspace effect id played on each target. */
  fx?: string;
  /** Easy SFX sound id. */
  sfx?: string;
}

export interface Learn {
  level: number;
  skill: string;
}

export interface HeroDef {
  id: string;
  name: Name;
  role?: Name;
  base: Stats;
  /** Added per level (fractions allowed; floor(base + growth × (level − 1))). */
  growth: Partial<Stats>;
  skills: Learn[];
  weak?: string[];
  resist?: string[];
  /** Easy Sprite sheet id / path (engine side) and Easy Portrait / Easy Dialogue portrait set. */
  sprite?: string;
  /** Easy Sprite top-down sheet whose "back" row draws the hero from behind in the backview layout (default <id>_back). */
  back?: string;
  portrait?: string;
  color?: string;
}

export interface Drop {
  item: string;
  /** % chance 0..100. */
  chance: number;
  n?: number;
}

export interface EnemyDef {
  id: string;
  name: Name;
  level: number;
  stats: Stats;
  skills: Array<{ skill: string; weight: number }>;
  weak?: string[];
  resist?: string[];
  immune?: string[];
  xp: number;
  coins: number;
  drops?: Drop[];
  /** Easy Items loot table rolled by the game on victory (Items.loot). */
  loot?: string;
  art: EnemyArt;
  palette?: string[];
  boss?: boolean;
}

export interface EncounterGroup {
  enemies: string[];
  weight: number;
  /** Levels added to every enemy in the group. */
  levelBonus?: number;
}

export interface EncounterTable {
  id: string;
  name?: Name;
  /** Overworld region id (Easy Tilemap `overworld.regions[].id`) — most specific match. */
  regions?: string[];
  /** Region culture (thai | malay | chinese | rural | city) when no region id matches. */
  cultures?: string[];
  terrains: Terrain[];
  /** Average steps between battles. */
  rate: number;
  groups: EncounterGroup[];
  music?: string;
  background?: string;
  /** Boss / story fights: never picked by random encounters (start them with their id). */
  scripted?: boolean;
}

export interface BattleItem {
  /** Easy Items item id. */
  item: string;
  hp?: number;
  mp?: number;
  cures?: string[];
  target?: "ally" | "all_allies";
}

export interface XpCurve {
  /** xpToNext(L) = base + step × (L − 1) + quad × (L − 1)². */
  base: number;
  step: number;
  quad: number;
}

export interface Rules {
  maxLevel: number;
  partySize: number;
  xp: XpCurve;
  /** Crit chance % for physical skills; crits deal ×1.5. */
  crit: number;
  /** Base flee chance % (± 2 per point of average speed difference, clamped 10..95). */
  flee: number;
  /** % extra enemy stats per level above its base level. */
  enemyScale: number;
  startCoins?: number;
  /** Overworld ground code → terrain (Easy Tilemap codes). */
  terrainCodes: Record<string, Terrain>;
}

/** Battle screen options (later documents override earlier ones; runtime opts override these). */
export interface UiSettings {
  layout?: UiLayout;
  /** Default: rows for classic, cards for backview (backview has no rows). */
  status?: UiStatus;
  backdrop?: UiBackdrop;
  /** Default turn. */
  timing?: UiTiming;
  /** ATB only; default wait. */
  atbMode?: UiAtbMode;
}

export interface BattleDoc {
  format: typeof FORMAT;
  id?: string;
  name?: Name;
  rules?: Partial<Rules>;
  elements?: Element[];
  statuses?: StatusDef[];
  skills?: SkillDef[];
  heroes?: HeroDef[];
  enemies?: EnemyDef[];
  encounters?: EncounterTable[];
  items?: BattleItem[];
  ui?: UiSettings;
}

export interface Diagnostic {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface BattleDb {
  rules: Rules;
  elements: Element[];
  statuses: StatusDef[];
  skills: SkillDef[];
  heroes: HeroDef[];
  enemies: EnemyDef[];
  encounters: EncounterTable[];
  items: BattleItem[];
  ui: UiSettings;
  sources: Record<string, string>;
}

export const DEFAULT_RULES: Rules = {
  maxLevel: 30,
  partySize: 3,
  xp: { base: 20, step: 12, quad: 3 },
  crit: 6,
  flee: 50,
  enemyScale: 8,
  startCoins: 0,
  terrainCodes: { g: "grass", F: "forest", M: "mountain", C: "field", p: "field", d: "road", a: "road", b: "beach", w: "water", T: "road", U: "cave" },
};
