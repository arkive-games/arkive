import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Edit3,
  Gem,
  PawPrint,
  Save,
  Shield,
  Sparkles,
  Swords,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { resourceUrl } from "./lib/urls";
import {
  loadEquipmentWikiData,
  loadProfessionWikiData,
  loadSoulWikiData,
  loadTalentWikiData,
  loadWikiData,
  loadSkillLevels,
  type EquipmentAttrsDocument,
  type EquipmentRecord,
  type SoulRecord,
  type SoulResonanceRecord,
  type SkillIndexEntry,
} from "./wikiData";
import { loadPetWikiData } from "./creatureData";
import { localizedText, type WikiCard } from "./cardCatalog";
import {
  PROFESSION_LINES,
  buildProfessionStages,
  type ProfessionLine,
  type ProfessionRoute,
} from "./professionCatalog";
import content from "./locales/zh-CN.json";

type BuildMode = "view" | "edit";
export interface EquipmentBuildConfig {
  slotKey: string;
  equipmentId: number;
  quality: number;
  normalEntryIds: number[];
  specialEffectIds: number[];
  cardIds: number[];
}
export interface SoulBuildConfig {
  slotIndex: number;
  soulId: number;
  subAttributeIds: number[];
  markEffectIds: number[];
  resonanceId?: number;
}
interface BuildDraft {
  id: string;
  title: string;
  profession: string;
  professionLineId: string;
  professionRouteId: string;
  summary: string;
  attributes: Record<string, number>;
  skillIds: number[];
  equipment: EquipmentBuildConfig[];
  petCombatIds: number[];
  petAssistIds: number[];
  talentIds: number[];
  souls: SoulBuildConfig[];
}
type BuildData = Awaited<ReturnType<typeof loadWikiData>> & {
  profession: Awaited<ReturnType<typeof loadProfessionWikiData>>;
  equipment: Awaited<ReturnType<typeof loadEquipmentWikiData>>;
  souls: Awaited<ReturnType<typeof loadSoulWikiData>>;
  pets: Awaited<ReturnType<typeof loadPetWikiData>>;
  talents: Awaited<ReturnType<typeof loadTalentWikiData>>;
};
interface EquipmentFamily {
  key: string;
  name: string;
  slot: string;
  icon?: string;
  variants: EquipmentRecord[];
}

const STORAGE_KEY = "ro3-build-planner";
const ATTRIBUTE_KEYS = ["力量", "敏捷", "体质", "智力", "灵巧", "幸运"];
const LINE_LABELS: Record<string, string> = {
  swordman: "剑士",
  magician: "魔法师",
  archer: "弓箭手",
  acolyte: "服事",
  thief: "盗贼",
  merchant: "商人",
};
const ROUTE_LABELS: Record<string, string> = {
  blade: "剑士 · 骑士",
  spear: "剑士 · 长枪",
  judgment: "剑士 · 审判",
  guardian: "剑士 · 守护",
  fireEarth: "魔法师 · 火土",
  iceLightning: "魔法师 · 冰雷",
  psychic: "魔法师 · 念力",
  marksman: "弓箭手 · 神射",
  wolf: "弓箭手 · 训狼",
  support: "服事 · 赞美",
  exorcism: "服事 · 驱魔",
  cross: "盗贼 · 十字",
  shadow: "盗贼 · 影舞",
  artillery: "商人 · 炮械",
  axe: "商人 · 斧锤",
};
const SLOT_LABELS: Record<string, string> = {
  weapon: "武器",
  offhand: "副手",
  armor: "盾牌",
  cloak: "衣服",
  shoes: "鞋子",
  accessory: "饰品",
  headwear: "头饰",
  facewear: "脸饰",
  mouthwear: "嘴饰",
};
const EQUIPMENT_SLOTS = [
  { key: "weapon", label: "武器", part: 1 },
  { key: "offhand", label: "副手", part: 2 },
  { key: "shield", label: "盾牌", part: 3 },
  { key: "cloak", label: "衣服", part: 4 },
  { key: "shoes", label: "鞋子", part: 5 },
  { key: "accessory-1", label: "饰品 1", part: 6 },
  { key: "accessory-2", label: "饰品 2", part: 7 },
];
function equipmentSlotsForLine(lineId: string) {
  if (lineId === "archer") {
    return EQUIPMENT_SLOTS.filter(
      (slot) => slot.key !== "offhand" && slot.key !== "shield",
    ).map((slot) =>
      slot.key === "weapon" ? { ...slot, label: "主手武器" } : slot,
    );
  }
  return EQUIPMENT_SLOTS;
}
const EMPTY_BUILD: BuildDraft = {
  id: "local-default",
  title: "未命名流派",
  profession: "剑士",
  professionLineId: "swordman",
  professionRouteId: "blade",
  summary: "",
  attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, 1])),
  skillIds: [],
  equipment: EQUIPMENT_SLOTS.map(({ key }) => ({
    slotKey: key,
    equipmentId: 0,
    quality: 0,
    normalEntryIds: [],
    specialEffectIds: [],
    cardIds: [],
  })),
  petCombatIds: [],
  petAssistIds: [],
  talentIds: [],
  souls: [],
};
function displayName(
  value: { "zh-CN"?: string } | undefined,
  fallback: string,
) {
  return value?.["zh-CN"] || fallback;
}
function lineForBuild(build: BuildDraft) {
  return (
    PROFESSION_LINES.find((line) => line.id === build.professionLineId) ??
    PROFESSION_LINES[0]
  );
}
function routeForBuild(build: BuildDraft) {
  const line = lineForBuild(build);
  return (
    line.routes.find((route) => route.id === build.professionRouteId) ??
    line.routes[0]
  );
}
function normalizeBuild(
  input: Partial<BuildDraft> & Record<string, unknown>,
): BuildDraft {
  const oldProfession =
    typeof input.profession === "string" ? input.profession : "";
  const line =
    PROFESSION_LINES.find(
      (candidate) => LINE_LABELS[candidate.id] === oldProfession,
    ) ??
    PROFESSION_LINES.find(
      (candidate) => candidate.id === input.professionLineId,
    ) ??
    PROFESSION_LINES[0];
  const route =
    line.routes.find((candidate) => candidate.id === input.professionRouteId) ??
    line.routes[0];
  const oldEquipment = Array.isArray(input.equipment)
    ? (input.equipment as EquipmentBuildConfig[])
    : Array.isArray(input.equipmentIds)
      ? input.equipmentIds.map((id, index) => ({
          slotKey: EQUIPMENT_SLOTS[index]?.key ?? `legacy-${index}`,
          equipmentId: Number(id),
          quality: 0,
          normalEntryIds: [],
          specialEffectIds: [],
          cardIds: [],
        }))
      : [];
  const equipmentByKey = new Map<string, Partial<EquipmentBuildConfig>>();
  oldEquipment.forEach((value, index) => {
    const key =
      typeof value?.slotKey === "string"
        ? value.slotKey
        : EQUIPMENT_SLOTS[index]?.key;
    if (key) equipmentByKey.set(key, value);
  });
  const equipment = EQUIPMENT_SLOTS.map(({ key }) => {
    const value = equipmentByKey.get(key);
    return {
      slotKey: key,
      equipmentId: Number(value?.equipmentId ?? 0),
      quality: Number(value?.quality ?? 0),
      normalEntryIds: value?.normalEntryIds ?? [],
      specialEffectIds: value?.specialEffectIds ?? [],
      cardIds: value?.cardIds ?? [],
    };
  });
  const oldPetIds = Array.isArray(input.petIds) ? input.petIds.map(Number) : [];
  const souls = Array.isArray(input.souls)
    ? (input.souls as SoulBuildConfig[])
    : Array.isArray(input.soulIds)
      ? input.soulIds.map((id, index) => ({
          slotIndex: index,
          soulId: Number(id),
          subAttributeIds: [],
          markEffectIds: [],
        }))
      : [];
  return {
    ...EMPTY_BUILD,
    ...input,
    profession: LINE_LABELS[line.id],
    professionLineId: line.id,
    professionRouteId: route.id,
    attributes: { ...EMPTY_BUILD.attributes, ...(input.attributes ?? {}) },
    skillIds: Array.isArray(input.skillIds) ? input.skillIds.map(Number) : [],
    equipment,
    petCombatIds: Array.isArray(input.petCombatIds)
      ? input.petCombatIds.map(Number)
      : oldPetIds.slice(0, 4),
    petAssistIds: Array.isArray(input.petAssistIds)
      ? input.petAssistIds.map(Number)
      : [],
    talentIds: Array.isArray(input.talentIds)
      ? input.talentIds.map(Number)
      : [],
    souls,
  };
}
function readBuilds(): BuildDraft[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as Array<Partial<BuildDraft> & Record<string, unknown>>;
    return Array.isArray(parsed) && parsed.length
      ? parsed.map(normalizeBuild)
      : [EMPTY_BUILD];
  } catch {
    return [EMPTY_BUILD];
  }
}
function allowedForLine(record: EquipmentRecord, line: ProfessionLine) {
  const needs = record.item?.kJobNeed ?? [];
  if (!needs.length || needs.includes(0)) return true;
  const prefix = (
    {
      swordman: 1,
      magician: 2,
      archer: 3,
      acolyte: 4,
      thief: 5,
      merchant: 6,
    } as Record<string, number>
  )[line.id];
  return needs.some((job) => Math.trunc(job / 1000) === prefix);
}
function uniqueFamilies(records: EquipmentRecord[], part: number) {
  const groups = new Map<string, EquipmentFamily>();
  records
    .filter(
      (record) =>
        record.item?.iEquipPart === part &&
        record.name?.["zh-CN"] !== "待定" &&
        record.item.kIcon !== "item_null.png",
    )
    .forEach((record) => {
      // Novice records reuse the same visual but omit iEntries; group by
      // visual/subtype so they inherit the real entry pool.
      const key = `${record.slot ?? ""}|${record.icon ?? ""}|${record.item?.iSubType ?? ""}`;
      const family = groups.get(key) ?? {
        key,
        name: displayName(record.name, `装备 ${record.iID}`),
        slot: SLOT_LABELS[record.slot ?? ""] ?? record.slot ?? "装备",
        icon: record.icon,
        variants: [],
      };
      family.variants.push(record);
      groups.set(key, family);
    });
  return [...groups.values()].map((family) => ({
    ...family,
    variants: family.variants.sort(
      (a, b) => (a.item?.iQuality ?? 0) - (b.item?.iQuality ?? 0),
    ),
  }));
}
function socketCount(
  attrs: EquipmentAttrsDocument,
  item: EquipmentRecord | undefined,
) {
  const slot = item?.item?.iEquipPart
    ? attrs.slots?.find((candidate) => candidate.iID === item.item?.iEquipPart)
    : undefined;
  return slot
    ? [1, 2, 3, 4].filter((index) => Boolean(slot[`kSocketOpen${index}`]))
        .length
    : 0;
}
function entryLabel(attrs: EquipmentAttrsDocument, id: number) {
  const entry = attrs.entryGroups.find((candidate) => candidate.iID === id);
  const attribute = entry?.iAttriID
    ? attrs.attributes.find((candidate) => candidate.iID === entry.iAttriID)
    : undefined;
  return displayName(entry?.name ?? attribute?.name, `词条 ${id}`);
}
function specialOptions(
  attrs: EquipmentAttrsDocument,
  item: EquipmentRecord | undefined,
) {
  const ids = new Set<number>();
  item?.kSpecial?.forEach(([group]) =>
    attrs.specialGroups
      .filter(
        (candidate) => candidate.iGroup === group || candidate.iID === group,
      )
      .forEach(
        (candidate) => candidate.iSpecialID && ids.add(candidate.iSpecialID),
      ),
  );
  return attrs.specialEffects.filter((effect) => ids.has(effect.iID));
}

export function BuildPlanner({ onUnavailable }: { onUnavailable: () => void }) {
  const [mode, setMode] = useState<BuildMode>("view");
  const [builds, setBuilds] = useState<BuildDraft[]>(() => readBuilds());
  const [selectedId, setSelectedId] = useState(
    () => readBuilds()[0]?.id ?? EMPTY_BUILD.id,
  );
  const [draft, setDraft] = useState<BuildDraft>(
    () => readBuilds()[0] ?? EMPTY_BUILD,
  );
  const [data, setData] = useState<BuildData | null>(null);
  const [dataError, setDataError] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      loadWikiData(),
      loadProfessionWikiData(),
      loadEquipmentWikiData(),
      loadSoulWikiData(),
      loadPetWikiData(),
      loadTalentWikiData(),
    ])
      .then(([wiki, profession, equipment, souls, pets, talents]) => {
        if (active)
          setData({ ...wiki, profession, equipment, souls, pets, talents });
      })
      .catch(() => {
        if (active) setDataError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const line = lineForBuild(draft);
  const route = routeForBuild(draft);
  const selectedBuild =
    builds.find((build) => build.id === selectedId) ?? draft;
  const routeStages = useMemo(
    () =>
      data
        ? buildProfessionStages(
            route,
            data.profession.jobSkills.jobSkills,
            new Map(
              data.profession.skills.skills.map((skill) => [
                skill.iSkillID,
                skill,
              ]),
            ),
          )
        : [],
    [data, route],
  );
  const routeSkillIds = new Set(
    routeStages.flatMap((stage) =>
      stage.skills.map((choice) => choice.skillId),
    ),
  );
  const skills = (data?.skills.skills ?? []).filter((skill) =>
    routeSkillIds.has(skill.iSkillID),
  );
  const equipmentRecords = data?.equipment.equipment.equipment ?? [];
  const updateDraft = (patch: Partial<BuildDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const selectProfession = (lineId: string, routeId: string) => {
    const nextLine =
      PROFESSION_LINES.find((candidate) => candidate.id === lineId) ??
      PROFESSION_LINES[0];
    const nextRoute =
      nextLine.routes.find((candidate) => candidate.id === routeId) ??
      nextLine.routes[0];
    const valid = new Set(
      buildProfessionStages(
        nextRoute,
        data?.profession.jobSkills.jobSkills ?? [],
        new Map(
          data?.profession.skills.skills.map((skill) => [
            skill.iSkillID,
            skill,
          ]) ?? [],
        ),
      ).flatMap((stage) => stage.skills.map((choice) => choice.skillId)),
    );
    setDraft((current) => ({
      ...current,
      profession: LINE_LABELS[nextLine.id],
      professionLineId: nextLine.id,
      professionRouteId: nextRoute.id,
      skillIds: current.skillIds.filter((id) => valid.has(id)),
      equipment: EMPTY_BUILD.equipment.map((item) => ({ ...item })),
    }));
  };
  const saveDraft = () => {
    const next = builds.some((build) => build.id === draft.id)
      ? builds.map((build) => (build.id === draft.id ? draft : build))
      : [...builds, draft];
    setBuilds(next);
    setSelectedId(draft.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setMode("view");
  };
  const createBuild = () => {
    const next = { ...EMPTY_BUILD, id: `local-${Date.now()}` };
    setDraft(next);
    setSelectedId(next.id);
    setMode("edit");
  };
  if (dataError)
    return (
      <section className="build-planner">
        <div className="build-empty">{content.wiki.dataError}</div>
      </section>
    );
  if (!data)
    return (
      <section className="build-planner">
        <div className="build-empty">{content.wiki.loading}</div>
      </section>
    );
  return (
    <section className="build-planner" aria-label="流派手册">
      <header className="build-planner-header">
        <div>
          <span className="database-eyebrow">
            <Swords aria-hidden="true" />
            玩家流派手册
          </span>
          <h2>职业 BD</h2>
          <p>
            先选职业路线，再配置该路线可用的技能、固定装备部位、宠物和灵魂残响。
          </p>
        </div>
        <div className="build-planner-actions">
          <div className="build-mode-tabs">
            <button
              type="button"
              className={mode === "view" ? "is-active" : undefined}
              onClick={() => setMode("view")}
            >
              <BookOpen aria-hidden="true" />
              查看 BD
            </button>
            <button
              type="button"
              className={mode === "edit" ? "is-active" : undefined}
              onClick={() => setMode("edit")}
            >
              <Edit3 aria-hidden="true" />
              编辑 BD
            </button>
          </div>
          <button
            type="button"
            className="build-new-button"
            onClick={createBuild}
          >
            <Sparkles aria-hidden="true" />
            新建
          </button>
        </div>
      </header>
      {mode === "view" ? (
        <BuildViewer
          build={selectedBuild}
          builds={builds}
          data={data}
          onSelect={(id) => {
            setSelectedId(id);
            setDraft(builds.find((build) => build.id === id) ?? EMPTY_BUILD);
          }}
          onEdit={() => setMode("edit")}
          onUnavailable={onUnavailable}
        />
      ) : (
        <BuildEditor
          draft={draft}
          data={data}
          line={line}
          route={route}
          skills={skills}
          routeStages={routeStages}
          equipmentRecords={equipmentRecords}
          onProfessionChange={selectProfession}
          updateDraft={updateDraft}
          onSave={saveDraft}
          onUnavailable={onUnavailable}
        />
      )}
    </section>
  );
}

function BuildViewer({
  build,
  builds,
  data,
  onSelect,
  onEdit,
  onUnavailable,
}: {
  build: BuildDraft;
  builds: BuildDraft[];
  data: BuildData;
  onSelect: (id: string) => void;
  onEdit: () => void;
  onUnavailable: () => void;
}) {
  const skillMap = new Map(
    data.skills.skills.map((skill) => [skill.iSkillID, skill]),
  );
  const [skillDetails, setSkillDetails] = useState<Map<number, string>>(
    () => new Map(),
  );
  useEffect(() => {
    let active = true;
    const selected = build.skillIds.slice(0, 6)
      .map((id) => data.skills.skills.find((skill) => skill.iSkillID === id))
      .filter((skill): skill is SkillIndexEntry => Boolean(skill));
    Promise.all(
      selected.map(async (skill) => {
        const rows = await loadSkillLevels(skill, data.skills.shards);
        return [skill.iSkillID, rows[0]?.desc?.["zh-CN"] ?? ""] as const;
      }),
    )
      .then((entries) => {
        if (active) setSkillDetails(new Map(entries.filter((entry): entry is readonly [number, string] => Boolean(entry))));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [build.skillIds, data.skills.shards, data.skills.skills]);
  const equipmentMap = new Map(
    data.equipment.equipment.equipment.map((item) => [item.iID, item]),
  );
  const cardMap = new Map(data.cards.cards.map((card) => [card.id, card]));
  const petMap = new Map(data.pets.catalog.pets.map((pet) => [pet.id, pet]));
  const soulMap = new Map(
    data.souls.souls.souls.map((soul) => [soul.iID, soul]),
  );
  const resonanceMap = new Map(
    data.souls.souls.resonance.map((item) => [
      item.resonanceId ?? item.iID,
      item,
    ]),
  );
  const talentMap = new Map(
    data.talents.talents.seasonTalents.nodes.map((talent) => [talent.iId, talent]),
  );
  const petSkillMap = new Map(
    data.pets.skills.skills.map((skill) => [skill.id, skill]),
  );
  const cardEffectMap = new Map(
    data.cards.specialEffects.map((effect) => [effect.id, localizedText(effect.description)]),
  );
  const equipmentSlots = equipmentSlotsForLine(build.professionLineId);
  const petChips = (ids: number[]) => (
    <div className="build-chip-grid">
      {ids.map((id) => {
        const pet = petMap.get(id);
        const star = data.pets.stars.stars.find((item) => item.petId === id);
        const petSkillLines = [
          ...(star?.activeSkills ?? []),
          ...(star?.passiveMain ? [star.passiveMain] : []),
        ]
          .map((skillId) => petSkillMap.get(skillId)?.description)
          .map((description) => localizedText(description))
          .filter(Boolean)
          .slice(0, 3);
        return (
          <BuildChip
            key={id}
            icon={pet?.art.encyclopedia}
            label={localizedText(pet?.name) || `宠物 ${id}`}
            meta={`品质 ${pet?.quality ?? "-"}`}
            details={[`品质 ${pet?.quality ?? "-"}`, ...petSkillLines]}
          />
        );
      })}
      {ids.length === 0 ? (
        <span className="build-section-empty">暂无配置</span>
      ) : null}
    </div>
  );
  return (
    <div className="build-view-layout">
      <aside className="build-library">
        <div className="build-library-head">
          <strong>我的流派</strong>
          <span>{builds.length}</span>
        </div>
        {builds.map((item) => (
          <button
            type="button"
            key={item.id}
            className={item.id === build.id ? "is-active" : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span>{item.title}</span>
            <small>
              {ROUTE_LABELS[item.professionRouteId] ?? item.profession}
            </small>
          </button>
        ))}
        <button
          type="button"
          className="build-publish-button"
          onClick={onUnavailable}
          disabled
        >
          <Upload aria-hidden="true" />
          发布流派<span>暂无功能</span>
        </button>
      </aside>
      <div className="build-view-main">
        <div className="build-view-title">
          <div>
            <span>
              {ROUTE_LABELS[build.professionRouteId] ?? build.profession}
            </span>
            <h3>{build.title}</h3>
            <p>{build.summary || "作者尚未添加流派说明。"}</p>
          </div>
          <button type="button" onClick={onEdit}>
            <Edit3 aria-hidden="true" />
            编辑方案
          </button>
        </div>
        <BuildSection
          icon={Swords}
          title="技能选择"
          action={
            <button
              type="button"
              className="build-section-action"
              aria-label="进入技能编辑"
              title="进入技能编辑"
              onClick={onEdit}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          }
        >
          <div className="build-chip-grid">
            {build.skillIds.slice(0, 6).map((id) => {
              const skill = skillMap.get(id);
              return (
                <BuildChip
                  key={id}
                  icon={skill?.icon}
                  label={displayName(skill?.name, `技能 ${id}`)}
                  meta={`最高等级 ${skill?.iMaxLevel ?? "-"}`}
                  details={[skillDetails.get(id) || "暂无技能描述", `技能编号 ${id}`, `最高等级 ${skill?.iMaxLevel ?? "-"}`, "点击右上角箭头进入技能编辑"]}
                />
              );
            })}
            {build.skillIds.length > 6 ? (
              <span className="build-chip-more">+{build.skillIds.length - 6} 个技能</span>
            ) : null}
            {build.skillIds.length === 0 ? (
              <span className="build-section-empty">暂无技能配置</span>
            ) : null}
          </div>
        </BuildSection>
        <BuildSection icon={Zap} title="属性加点">
          <div className="build-attribute-grid">
            {Object.entries(build.attributes).map(([key, value]) => (
              <div key={key}>
                <span>{key}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </BuildSection>
        <BuildSection icon={Shield} title="固定装备部位">
          <div className="build-config-grid">
            {equipmentSlots.map((slot) => {
              const config =
                build.equipment.find((item) => item.slotKey === slot.key) ??
                EMPTY_BUILD.equipment.find((item) => item.slotKey === slot.key) ??
                EMPTY_BUILD.equipment[0];
              const item = equipmentMap.get(config.equipmentId);
              return (
                <article className="build-config-card build-hover-target" key={config.slotKey}>
                  <div className="build-config-head">
                    {item?.icon ? (
                      <img src={resourceUrl(item.icon)} alt="" />
                    ) : (
                      <Shield aria-hidden="true" />
                    )}
                    <div>
                      <strong>{slot?.label ?? config.slotKey}</strong>
                      <small>{displayName(item?.name, "未选择装备")} · 品质 {config.quality || item?.item?.iQuality || "-"}</small>
                    </div>
                  </div>
                  <BuildHoverCard
                    title={displayName(item?.name, "未选择装备")}
                    lines={[
                      item?.desc?.["zh-CN"] || "暂无装备说明",
                      ...config.normalEntryIds.map((id) => `词条：${entryLabel(data.equipment.attrs, id)}`),
                      ...config.specialEffectIds.map((id) => `特殊：${displayName(data.equipment.attrs.specialEffects.find((effect) => effect.iID === id)?.name, `特殊效果 ${id}`)}`),
                    ]}
                  />
                  <div className="build-config-lines">
                    {config.normalEntryIds.length ? (
                      <span>
                        普通词条：
                        {config.normalEntryIds
                          .map((id) => entryLabel(data.equipment.attrs, id))
                          .join("、")}
                      </span>
                    ) : null}
                    {config.specialEffectIds.length ? (
                      <span>
                        特殊词条：{config.specialEffectIds.join("、")}
                      </span>
                    ) : null}
                    <span>
                      镶嵌卡片：{config.cardIds.length ? "" : "未镶嵌"}
                      <span className="build-card-chip-row">
                        {config.cardIds.map((id) => {
                          const card = cardMap.get(id);
                          const cardLines = [
                            localizedText(card?.description),
                            ...(card?.tiers[0]?.specialEffects ?? [])
                              .map((effectId) => cardEffectMap.get(effectId))
                              .filter(Boolean),
                          ].filter(Boolean) as string[];
                          return (
                            <BuildChip
                              key={id}
                              icon={card?.icon}
                              label={localizedText(card?.name) || `卡片 ${id}`}
                              meta={`品质 ${card?.quality ?? "-"}`}
                              details={cardLines.length ? cardLines : ["暂无卡片效果"]}
                            />
                          );
                        })}
                      </span>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </BuildSection>
        <BuildSection icon={PawPrint} title="出战宠物（4）">
          {petChips(build.petCombatIds)}
        </BuildSection>
        <BuildSection icon={PawPrint} title="助战宠物（5）">
          {petChips(build.petAssistIds)}
        </BuildSection>
        <BuildSection icon={Sparkles} title="天赋">
          <div className="build-chip-grid">
            {build.talentIds.map((id) => (
              <BuildChip
                key={id}
                icon={talentMap.get(id)?.levels?.[0] ? undefined : undefined}
                label={displayName(talentMap.get(id)?.name, `天赋节点 ${id}`)}
                meta="全职业共用"
                details={[`节点编号 ${id}`, "全职业共用"]}
              />
            ))}
            {build.talentIds.length === 0 ? (
              <span className="build-section-empty">暂无天赋配置</span>
            ) : null}
          </div>
        </BuildSection>
        <BuildSection icon={Gem} title="灵魂残响与共振">
          <div className="build-config-grid">
            {build.souls
              .filter((config) => config.soulId)
              .map((config) => {
                const soul = soulMap.get(config.soulId);
                const resonance = config.resonanceId
                  ? resonanceMap.get(config.resonanceId)
                  : undefined;
                return (
                  <article className="build-config-card build-hover-target" key={config.slotIndex}>
                    <div className="build-config-head">
                      {soul?.icon ? (
                        <img src={resourceUrl(soul.icon)} alt="" />
                      ) : (
                        <Gem aria-hidden="true" />
                      )}
                      <div>
                        <strong>
                          {displayName(soul?.name, `残响 ${config.soulId}`)}
                        </strong>
                        <small>
                          残响槽 {config.slotIndex + 1} · 品质{" "}
                          {soul?.quality ?? "-"}
                        </small>
                      </div>
                    </div>
                    <BuildHoverCard
                      title={displayName(soul?.name, `残响 ${config.soulId}`)}
                      lines={[
                        soul?.desc?.["zh-CN"] || "暂无残响说明",
                        resonance ? `共振：${displayName(resonance.name, `共振 ${resonance.iID}`)}` : "未指定共振",
                      ]}
                    />
                    <div className="build-config-lines">
                      <span>
                        副属性：{config.subAttributeIds.join("、") || "未选择"}
                      </span>
                      <span>
                        印记效果：{config.markEffectIds.join("、") || "未选择"}
                      </span>
                      {resonance ? (
                        <span>
                          共振：
                          {displayName(resonance.name, `共振 ${resonance.iID}`)}
                        </span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            {build.souls.filter((config) => config.soulId).length === 0 ? (
              <span className="build-section-empty">暂无残响配置</span>
            ) : null}
          </div>
        </BuildSection>
      </div>
    </div>
  );
}

function BuildEditor({
  draft,
  data,
  line,
  route,
  skills,
  routeStages,
  equipmentRecords,
  onProfessionChange,
  updateDraft,
  onSave,
  onUnavailable,
}: {
  draft: BuildDraft;
  data: BuildData;
  line: ProfessionLine;
  route: ProfessionRoute;
  skills: SkillIndexEntry[];
  routeStages: ReturnType<typeof buildProfessionStages>;
  equipmentRecords: EquipmentRecord[];
  onProfessionChange: (lineId: string, routeId: string) => void;
  updateDraft: (patch: Partial<BuildDraft>) => void;
  onSave: () => void;
  onUnavailable: () => void;
}) {
  const equipmentSlots = equipmentSlotsForLine(line.id);
  const [activeEquipmentSlot, setActiveEquipmentSlot] = useState<string | null>(
    null,
  );
  const talents = data.talents.talents.seasonTalents.nodes
    .filter((node) => node.iType !== 0)
    .slice(0, 120);
  const prefix =
    (
      {
        swordman: 1,
        magician: 2,
        archer: 3,
        acolyte: 4,
        thief: 5,
        merchant: 6,
      } as Record<string, number>
    )[line.id] ?? 0;
  const resonanceIds = [
    ...new Set(
      data.souls.souls.resonanceActivation
        .filter((item) => !item.iJob || Math.trunc(item.iJob / 1000) === prefix)
        .map((item) => item.iJobResonanceId)
        .filter((id): id is number => Boolean(id)),
    ),
  ];
  const cardsForPart = (part: number) =>
    data.cards.cards.filter((card) => card.part === part);
  const updateEquipment = (
    index: number,
    patch: Partial<EquipmentBuildConfig>,
  ) =>
    updateDraft({
      equipment: draft.equipment.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  const updatePets = (
    field: "petCombatIds" | "petAssistIds",
    id: number,
    limit: number,
  ) => {
    const values = draft[field];
    updateDraft({
      [field]: values.includes(id)
        ? values.filter((value) => value !== id)
        : values.length < limit
          ? [...values, id]
          : values,
    } as Partial<BuildDraft>);
  };
  const updateSoul = (index: number, patch: Partial<SoulBuildConfig>) =>
    updateDraft({
      souls: draft.souls.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  const addSoul = () =>
    draft.souls.length < 5 &&
    updateDraft({
      souls: [
        ...draft.souls,
        {
          slotIndex: draft.souls.length,
          soulId: 0,
          subAttributeIds: [],
          markEffectIds: [],
        },
      ],
    });
  return (
    <div className="build-editor">
      <div className="build-editor-form">
        <label>
          流派名称
          <input
            value={draft.title}
            onChange={(event) => updateDraft({ title: event.target.value })}
            placeholder="例如：敏捷暴击游侠"
          />
        </label>
        <label>
          职业系
          <select
            value={line.id}
            onChange={(event) =>
              onProfessionChange(event.target.value, line.routes[0].id)
            }
          >
            {PROFESSION_LINES.map((option) => (
              <option key={option.id} value={option.id}>
                {LINE_LABELS[option.id]}
              </option>
            ))}
          </select>
        </label>
        <label>
          转职路线
          <select
            value={route.id}
            onChange={(event) =>
              onProfessionChange(line.id, event.target.value)
            }
          >
            {line.routes.map((option) => (
              <option key={option.id} value={option.id}>
                {ROUTE_LABELS[option.id] ?? option.id}
              </option>
            ))}
          </select>
        </label>
        <label className="build-summary-field">
          流派说明
          <textarea
            value={draft.summary}
            onChange={(event) => updateDraft({ summary: event.target.value })}
            rows={2}
            placeholder="描述玩法定位、适用场景和操作思路"
          />
        </label>
      </div>
      <EditorSection icon={Zap} title="属性加点" hint="可分配的属性方案">
        <div className="editor-attribute-grid">
          {ATTRIBUTE_KEYS.map((key) => (
            <label key={key}>
              <span>{key}</span>
              <input
                type="number"
                min={1}
                max={999}
                value={draft.attributes[key] ?? 1}
                onChange={(event) =>
                  updateDraft({
                    attributes: {
                      ...draft.attributes,
                      [key]: Math.max(1, Number(event.target.value) || 1),
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </EditorSection>
      <EditorSection
        icon={Swords}
        title="技能选择"
        hint={`${routeStages.length} 个转职阶段 · ${skills.length} 项可用技能`}
      >
        <div className="build-stage-strip">
          {routeStages.map((stage) => (
            <span key={`${stage.professionId}-${stage.rank}`}>
              第 {stage.rank - 1} 阶 · 新增 {stage.newSkillCount}
            </span>
          ))}
        </div>
        <PickerGrid
          selected={draft.skillIds}
          items={skills.map((skill) => ({
            id: skill.iSkillID,
            name: displayName(skill.name, `技能 ${skill.iSkillID}`),
            icon: skill.icon,
          }))}
          limit={12}
          onToggle={(id) =>
            updateDraft({
              skillIds: draft.skillIds.includes(id)
                ? draft.skillIds.filter((value) => value !== id)
                : draft.skillIds.length < 12
                  ? [...draft.skillIds, id]
                  : draft.skillIds,
            })
          }
        />
      </EditorSection>
      <EditorSection
        icon={Shield}
        title="固定装备部位"
        hint="每个部位独立选择装备、品质、词条与卡片"
      >
        <div className="build-equipment-slot-grid">
          {equipmentSlots.map((slot) => {
            const index = draft.equipment.findIndex(
              (item) => item.slotKey === slot.key,
            );
            const config =
              (index >= 0 ? draft.equipment[index] : undefined) ??
              EMPTY_BUILD.equipment.find((item) => item.slotKey === slot.key) ??
              EMPTY_BUILD.equipment[0];
            const current = equipmentRecords.find(
              (item) => item.iID === config.equipmentId,
            );
            return (
              <div key={slot.key}>
                <button
                  type="button"
                  className="build-equipment-slot-card"
                  onClick={() => setActiveEquipmentSlot(slot.key)}
                >
                  <span className="build-equipment-slot-art">
                    {current?.icon ? (
                      <img src={resourceUrl(current.icon)} alt="" />
                    ) : (
                      <Shield aria-hidden="true" />
                    )}
                  </span>
                  <span className="build-equipment-slot-copy">
                    <strong>{slot.label}</strong>
                    <span>
                      {current
                        ? displayName(current.name, "已选择装备")
                        : "点击选择装备"}
                    </span>
                    <small>
                      {current
                        ? `品质 ${config.quality || current.item?.iQuality || "-"}`
                        : "未配置"}
                    </small>
                  </span>
                  <span className="build-equipment-slot-action">配置</span>
                </button>
                {activeEquipmentSlot === slot.key ? (
                  <EquipmentSlotEditor
                    slot={slot}
                    index={index >= 0 ? index : 0}
                    config={config}
                    records={equipmentRecords.filter((item) =>
                      allowedForLine(item, line),
                    )}
                    attrs={data.equipment.attrs}
                    cards={cardsForPart(slot.part)}
                    update={updateEquipment}
                    onClose={() => setActiveEquipmentSlot(null)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </EditorSection>
      <EditorSection icon={PawPrint} title="出战宠物" hint="最多选择 4 个">
        <PickerGrid
          selected={draft.petCombatIds}
          items={data.pets.catalog.pets
            .filter((pet) => pet.show)
            .map((pet) => ({
              id: pet.id,
              name: localizedText(pet.name) || `宠物 ${pet.id}`,
              icon: pet.art.encyclopedia,
            }))}
          limit={4}
          onToggle={(id) => updatePets("petCombatIds", id, 4)}
        />
      </EditorSection>
      <EditorSection icon={PawPrint} title="助战宠物" hint="最多选择 5 个">
        <PickerGrid
          selected={draft.petAssistIds}
          items={data.pets.catalog.pets
            .filter((pet) => pet.show)
            .map((pet) => ({
              id: pet.id,
              name: localizedText(pet.name) || `宠物 ${pet.id}`,
              icon: pet.art.encyclopedia,
            }))}
          limit={5}
          onToggle={(id) => updatePets("petAssistIds", id, 5)}
        />
      </EditorSection>
      <EditorSection
        icon={Sparkles}
        title="天赋"
        hint="客户端未提供职业专属字段，按全职业共用展示"
      >
        <PickerGrid
          selected={draft.talentIds}
          items={talents.map((talent) => ({
            id: talent.iId,
            name: displayName(talent.name, `天赋节点 ${talent.iId}`),
          }))}
          limit={12}
          onToggle={(id) =>
            updateDraft({
              talentIds: draft.talentIds.includes(id)
                ? draft.talentIds.filter((value) => value !== id)
                : draft.talentIds.length < 12
                  ? [...draft.talentIds, id]
                  : draft.talentIds,
            })
          }
        />
      </EditorSection>
      <EditorSection
        icon={Gem}
        title="灵魂残响与共振"
        hint="最多配置 5 个残响槽位"
      >
        <div className="build-config-editor-list">
          {draft.souls.map((config, index) => (
            <SoulConfigEditor
              key={config.slotIndex}
              index={index}
              config={config}
              souls={data.souls.souls.souls}
              resonance={data.souls.souls.resonance}
              resonanceIds={resonanceIds}
              update={updateSoul}
            />
          ))}
          <button
            type="button"
            className="build-add-row"
            onClick={addSoul}
            disabled={draft.souls.length >= 5}
          >
            添加残响槽
          </button>
        </div>
      </EditorSection>
      <div className="build-editor-footer">
        <button type="button" className="build-save-button" onClick={onSave}>
          <Save aria-hidden="true" />
          保存到我的流派
        </button>
        <button
          type="button"
          className="build-publish-button"
          onClick={onUnavailable}
          disabled
        >
          <Upload aria-hidden="true" />
          发布流派<span>暂无功能</span>
        </button>
      </div>
    </div>
  );
}

function EquipmentSlotEditor({
  slot,
  index,
  config,
  records,
  attrs,
  cards,
  update,
  onClose,
}: {
  slot: { key: string; label: string; part: number };
  index: number;
  config: EquipmentBuildConfig;
  records: EquipmentRecord[];
  attrs: EquipmentAttrsDocument;
  cards: WikiCard[];
  update: (index: number, patch: Partial<EquipmentBuildConfig>) => void;
  onClose: () => void;
}) {
  const families = useMemo(
    () => uniqueFamilies(records, slot.part),
    [records, slot.part],
  );
  const [query, setQuery] = useState("");
  const family = families.find((candidate) =>
    candidate.variants.some((variant) => variant.iID === config.equipmentId),
  );
  const current = records.find((record) => record.iID === config.equipmentId);
  const variants = family?.variants ?? [];
  // Novice quality variants omit iEntries in the client table but inherit the
  // same roll pool as the matching named equipment. Keep the selected image
  // while resolving editable entries from the first variant with a real pool.
  const entrySource = current?.iEntries ? current : variants.find((variant) => variant.iEntries);
  const count = socketCount(attrs, current);
  const normalEntries = attrs.entryGroups.filter(
    (entry) => entry.iGroup === entrySource?.iEntries,
  );
  const specials = specialOptions(attrs, entrySource);
  const visible = families.filter(
    (item) =>
      !query.trim() ||
      `${item.name} ${item.key}`
        .toLocaleLowerCase("zh-CN")
        .includes(query.trim().toLocaleLowerCase("zh-CN")),
  );
  return (
    <div
      className="build-equipment-modal-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <article
        className="build-equip-editor build-equipment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`equipment-dialog-${slot.key}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
      <div className="build-config-editor-head">
        <strong id={`equipment-dialog-${slot.key}`}>{slot.label}配置</strong>
        <small>
          {current ? displayName(current.name, "已选择装备") : "请选择装备"}
        </small>
        <button
          type="button"
          className="build-equipment-modal-close"
          aria-label="关闭装备配置"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <label className="editor-picker-search">
        <span className="sr-only">搜索{slot.label}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`搜索${slot.label}名称`}
        />
      </label>
      <div className="equipment-choice-grid">
        {visible.map((item) => (
          <button
            type="button"
            key={item.key}
            className={family?.key === item.key ? "is-selected" : undefined}
            onClick={() => {
              const variant = item.variants[0];
              update(index, {
                slotKey: slot.key,
                equipmentId: variant?.iID ?? 0,
                quality: variant?.item?.iQuality ?? 0,
                normalEntryIds: [],
                specialEffectIds: [],
                cardIds: [],
              });
            }}
          >
            <span className="equipment-choice-art">
              {item.icon ? (
                <img src={resourceUrl(item.icon)} alt="" loading="lazy" />
              ) : (
                <Shield aria-hidden="true" />
              )}
            </span>
            <span>{item.name}</span>
            <small>{item.slot}</small>
          </button>
        ))}
      </div>
      {current ? (
        <>
          <div className="build-editor-grid">
            <label>
              品质
              <select
                value={config.quality || current.item?.iQuality || ""}
                onChange={(event) => {
                  const quality = Number(event.target.value);
                  const variant =
                    variants.find((item) => item.item?.iQuality === quality) ??
                    variants[0];
                  update(index, { equipmentId: variant?.iID ?? 0, quality });
                }}
              >
                {[
                  ...new Set(
                    variants
                      .map((item) => item.item?.iQuality)
                      .filter((value): value is number => Boolean(value)),
                  ),
                ].map((quality) => (
                  <option key={quality} value={quality}>
                    品质 {quality}
                  </option>
                ))}
              </select>
            </label>
            <div className="equipment-selected-preview">
              <img src={resourceUrl(current.icon ?? "")} alt="" />
              <span>{displayName(current.name, "未命名装备")}</span>
            </div>
          </div>
          <div className="build-entry-group">
            <span>普通词条 · 可选 {normalEntries.length}</span>
            <div>
              {normalEntries.length ? (
                normalEntries.slice(0, 12).map((entry) => (
                  <button
                    type="button"
                    key={entry.iID}
                    className={
                      config.normalEntryIds.includes(entry.iID)
                        ? "is-selected"
                        : undefined
                    }
                    onClick={() =>
                      update(index, {
                        normalEntryIds: config.normalEntryIds.includes(
                          entry.iID,
                        )
                          ? config.normalEntryIds.filter(
                              (id) => id !== entry.iID,
                            )
                          : [...config.normalEntryIds, entry.iID],
                      })
                    }
                  >
                    {entryLabel(attrs, entry.iID)}
                  </button>
                ))
              ) : (
                <small>该装备暂无可编辑普通词条</small>
              )}
            </div>
          </div>
          <div className="build-entry-group">
            <span>特殊词条</span>
            <div>
              {specials.length ? (
                specials.map((effect) => (
                  <button
                    type="button"
                    key={effect.iID}
                    className={
                      config.specialEffectIds.includes(effect.iID)
                        ? "is-selected"
                        : undefined
                    }
                    onClick={() =>
                      update(index, {
                        specialEffectIds: config.specialEffectIds.includes(
                          effect.iID,
                        )
                          ? config.specialEffectIds.filter(
                              (id) => id !== effect.iID,
                            )
                          : [...config.specialEffectIds, effect.iID],
                      })
                    }
                  >
                    {displayName(effect.name, `特殊效果 ${effect.iID}`)}
                  </button>
                ))
              ) : (
                <small>该装备暂无可编辑特殊词条</small>
              )}
            </div>
          </div>
          <div className="build-entry-group">
            <span>
              镶嵌卡片 · {count ? `${count} 个卡槽` : "卡槽规则暂无数据"}
            </span>
            <div className="build-socket-row">
              {Array.from({ length: count }).map((_, socketIndex) => (
                <select
                  key={socketIndex}
                  value={config.cardIds[socketIndex] ?? ""}
                  onChange={(event) => {
                    const next = [...config.cardIds];
                    const value = Number(event.target.value);
                    if (value) next[socketIndex] = value;
                    else next.splice(socketIndex, 1);
                    update(index, { cardIds: next });
                  }}
                >
                  <option value="">空卡槽</option>
                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {localizedText(card.name) || `卡片 ${card.id}`}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </div>
        </>
      ) : null}
      </article>
    </div>
  );
}

function SoulConfigEditor({
  index,
  config,
  souls,
  resonance,
  resonanceIds,
  update,
}: {
  index: number;
  config: SoulBuildConfig;
  souls: SoulRecord[];
  resonance: SoulResonanceRecord[];
  resonanceIds: number[];
  update: (index: number, patch: Partial<SoulBuildConfig>) => void;
}) {
  const soul = souls.find((item) => item.iID === config.soulId);
  const available = resonance.filter((item) =>
    resonanceIds.includes(item.resonanceId ?? item.iID),
  );
  return (
    <article className="build-soul-editor">
      <strong>残响槽 {index + 1}</strong>
      <div className="build-editor-grid">
        <label>
          残响装备
          <select
            value={config.soulId || ""}
            onChange={(event) =>
              update(index, {
                soulId: Number(event.target.value),
                subAttributeIds: [],
                markEffectIds: [],
              })
            }
          >
            <option value="">选择残响</option>
            {souls.map((item) => (
              <option key={item.iID} value={item.iID}>
                {displayName(item.name, `残响 ${item.iID}`)} · 品质{" "}
                {item.quality ?? "-"}
              </option>
            ))}
          </select>
        </label>
        <label>
          共振效果
          <select
            value={config.resonanceId ?? ""}
            onChange={(event) =>
              update(index, {
                resonanceId: Number(event.target.value) || undefined,
              })
            }
          >
            <option value="">不指定共振</option>
            {available.map((item) => (
              <option key={item.iID} value={item.resonanceId ?? item.iID}>
                {displayName(item.name, `共振 ${item.iID}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {soul ? (
        <div className="build-soul-options">
          <span>副属性</span>
          <div>
            {(soul.subAttributes ?? []).slice(0, 10).map((attribute) => {
              const id = attribute.iID ?? attribute.attributeId ?? 0;
              return (
                <button
                  type="button"
                  key={id}
                  className={
                    config.subAttributeIds.includes(id)
                      ? "is-selected"
                      : undefined
                  }
                  onClick={() =>
                    update(index, {
                      subAttributeIds: config.subAttributeIds.includes(id)
                        ? config.subAttributeIds.filter((value) => value !== id)
                        : [...config.subAttributeIds, id],
                    })
                  }
                >
                  {displayName(attribute.name, `属性 ${id}`)}
                </button>
              );
            })}
          </div>
          <span>印记效果</span>
          <div>
            {(soul.marks ?? []).map((mark) => {
              const id = mark.effectId ?? mark.markId ?? 0;
              return (
                <button
                  type="button"
                  key={`${id}-${mark.stage}`}
                  className={
                    config.markEffectIds.includes(id)
                      ? "is-selected"
                      : undefined
                  }
                  onClick={() =>
                    update(index, {
                      markEffectIds: config.markEffectIds.includes(id)
                        ? config.markEffectIds.filter((value) => value !== id)
                        : [...config.markEffectIds, id],
                    })
                  }
                >
                  阶段 {mark.stage ?? "-"} · 印记 {mark.markId ?? "-"}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function BuildSection({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof Swords;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="build-section">
      <header>
        <span>
          <Icon aria-hidden="true" />
          {title}
        </span>
        {action}
      </header>
      {children}
    </section>
  );
}
function EditorSection({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Swords;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="build-editor-section">
      <header>
        <span>
          <Icon aria-hidden="true" />
          {title}
        </span>
        <small>{hint}</small>
      </header>
      {children}
    </section>
  );
}
function BuildChip({
  icon,
  label,
  meta,
  details,
}: {
  icon?: string;
  label: string;
  meta: string;
  details?: string[];
}) {
  return (
    <span className={`build-chip${details?.length ? " build-hover-target" : ""}`}>
      {icon ? (
        <img src={resourceUrl(icon)} alt="" />
      ) : (
        <span className="build-chip-placeholder">
          <Sparkles aria-hidden="true" />
        </span>
      )}
      <span>
        <strong>{label}</strong>
        <small>{meta}</small>
      </span>
      {details?.length ? <BuildHoverCard title={label} lines={details} /> : null}
    </span>
  );
}
function BuildHoverCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <span className="build-hover-card" role="tooltip">
      <strong>{title}</strong>
      {lines.filter(Boolean).map((line, index) => (
        <span key={`${line}-${index}`}>{line}</span>
      ))}
    </span>
  );
}
function PickerGrid({
  selected,
  limit,
  items,
  onToggle,
}: {
  selected: number[];
  limit: number;
  items: Array<{ id: number; name: string; icon?: string }>;
  onToggle: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = items.filter(
    (item) =>
      !query.trim() ||
      `${item.id} ${item.name}`
        .toLocaleLowerCase("zh-CN")
        .includes(query.trim().toLocaleLowerCase("zh-CN")),
  );
  return (
    <>
      <label className="editor-picker-search">
        <span className="sr-only">搜索</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索名称或编号"
        />
      </label>
      <div className="editor-picker-grid">
        {visible.map((item) => (
          <button
            type="button"
            key={item.id}
            className={selected.includes(item.id) ? "is-selected" : undefined}
            onClick={() => onToggle(item.id)}
          >
            <span className="editor-picker-art">
              {item.icon ? (
                <img src={resourceUrl(item.icon)} alt="" loading="lazy" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
            </span>
            <span>{item.name}</span>
            {selected.includes(item.id) ? <Check aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
      <small className="editor-picker-count">
        已选 {selected.length} / {limit}
      </small>
    </>
  );
}
