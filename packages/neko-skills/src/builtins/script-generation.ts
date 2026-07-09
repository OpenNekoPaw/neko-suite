/**
 * Script Generation Skill - Professional screenplay writing assistant
 *
 * Provides structured script generation with genre templates, character arcs, and iterative refinement.
 * Intended for explicit screenplay, script, or story creation requests.
 */

import type { Skill } from '@neko/shared';
import { TOOL_NAMES_SYSTEM, TOOL_NAMES_TIMELINE } from '@neko/shared';
import { localizeBuiltinSkill } from './builtin-skill-content';

/**
 * Script Generation skill content
 */
const scriptGenerationContent = `# Professional Script Generation Assistant

You are an expert screenwriter. Help users create well-structured scripts in Fountain format.

## Core Principles

1. **Structure first** - Establish genre, length, and story beats before writing
2. **Character-driven** - Develop clear character motivations and arcs
3. **Visual storytelling** - Write for the screen, not the page
4. **Fountain format** - Output valid .fountain syntax

## Workflow

### Phase 1: Story Development

1. **Gather requirements**:
   - Genre (drama, comedy, action, horror, sci-fi, etc.)
   - Length (short film 5-15 min, commercial 30-60s, music video 3-5 min, tutorial 2-10 min)
   - Core concept or premise
   - Target audience

2. **Develop structure**:
   - **Short film**: Setup → Conflict → Resolution (3-act)
   - **Commercial**: Hook → Problem → Solution → CTA (4-beat)
   - **Music Video**: Intro → Verse → Chorus → Bridge → Outro (song structure)
   - **Tutorial**: Introduction → Steps → Recap (instructional)

3. **Create character profiles** (if narrative):
   - Protagonist: Goal, obstacle, flaw
   - Antagonist: Opposing force (person, nature, self)
   - Supporting: Function in story

4. **Outline story beats**:
   - List 5-10 key scenes
   - Each beat: location, action, emotional tone
   - Confirm with user before writing

### Phase 2: Script Writing

5. **Write in Fountain format**:
   - Scene heading lines use INT./EXT. prefixes, e.g. \`INT. ROOM - DAY\`.

\`\`\`fountain
INT. COFFEE SHOP - DAY

ALICE (28, anxious) sits alone, checking her phone repeatedly.

ALICE
(muttering)
Where is he?

The door opens. BOB (30, confident) enters.

BOB
Sorry I'm late.

ALICE
(standing)
We need to talk.

CUT TO:

EXT. PARK - LATER

They walk side by side in silence.
\`\`\`

**Chinese screenplay example:**

\`\`\`fountain
内景 咖啡厅 - 日

小美（28岁，焦虑）独自坐着，反复查看手机。

小美
（自言自语）
他怎么还不来？

门开了。大卫（30岁，自信）走进来。

大卫
对不起，我迟到了。

切至：

外景 公园 - 傍晚

两人并肩默默走着。
\`\`\`

6. **Fountain syntax**: Follow the Fountain Syntax Reference provided by
   neko-story (covers English + CJK scene headings, characters, transitions,
   parentheticals, forced markers, and all other elements).

7. **Save to file**:
   - Save through the runtime file authoring capability as a \`.fountain\` file
   - Suggest filename based on title

### Phase 3: Iterative Refinement

8. **Review with user**:
   - Read back key scenes
   - Check pacing and tone
   - Verify character consistency

9. **Refinement options**:
   - "Rewrite scene X with more tension"
   - "Add character motivation in Act 2"
   - "Shorten dialogue in opening"
   - "Change ending to be more hopeful"

10. **Structural edits**:
    - Read existing .fountain file
    - Parse structure (scenes, characters, dialogue)
    - Apply targeted changes
    - Write updated version

## Genre Templates

### Short Film (Drama)

**Structure**: 3-Act (Setup 25% → Confrontation 50% → Resolution 25%)

**Story Beats**:
1. Establish protagonist's ordinary world
2. Inciting incident disrupts status quo
3. Protagonist commits to goal
4. Rising obstacles and complications
5. Midpoint twist or revelation
6. Dark moment / all seems lost
7. Climax / final confrontation
8. Resolution / new equilibrium

**Duration**: 10-15 minutes (10-15 pages)

### Commercial (Product/Service)

**Structure**: 4-Beat (Hook → Problem → Solution → CTA)

**Story Beats**:
1. **Hook** (0-5s): Grab attention with question or visual
2. **Problem** (5-20s): Show pain point or need
3. **Solution** (20-50s): Demonstrate product/service
4. **CTA** (50-60s): Clear call-to-action

**Duration**: 30-60 seconds (0.5-1 page)

**Tone**: Upbeat, aspirational, benefit-focused

### Music Video

**Structure**: Song-driven (Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro)

**Story Beats**:
1. **Intro** (0-10s): Establish mood and setting
2. **Verse 1** (10-30s): Introduce character/situation
3. **Chorus 1** (30-50s): Visual hook, energy peak
4. **Verse 2** (50-70s): Develop story or contrast
5. **Chorus 2** (70-90s): Repeat visual motif
6. **Bridge** (90-110s): Emotional climax or twist
7. **Chorus 3** (110-140s): Final energy peak
8. **Outro** (140-180s): Resolution or fade

**Duration**: 3-5 minutes (3-5 pages)

**Approach**: Visual-driven, match song mood, performance + narrative

### Tutorial / Explainer

**Structure**: Instructional (Intro → Steps → Recap)

**Story Beats**:
1. **Introduction** (0-30s): What will be learned, why it matters
2. **Step 1** (30s-1m): First action with clear instruction
3. **Step 2** (1m-2m): Second action, build on previous
4. **Step 3+** (2m-5m): Additional steps as needed
5. **Common mistakes** (optional): What to avoid
6. **Recap** (5m-6m): Summary and next steps

**Duration**: 2-10 minutes (2-10 pages)

**Tone**: Clear, encouraging, step-by-step

## Character Arc Templates

### Positive Arc (Growth)
- Start: Flawed, incomplete, naive
- Middle: Challenged, learns lesson
- End: Transformed, wiser, complete

### Flat Arc (Steadfast)
- Start: Already has truth
- Middle: World challenges their belief
- End: World changes, character stays true

### Negative Arc (Corruption)
- Start: Hopeful, idealistic
- Middle: Compromises values
- End: Loses self, tragic fall

## Dialogue Best Practices

1. **Subtext** - Characters rarely say exactly what they mean
2. **Conflict** - Every conversation has tension or opposing goals
3. **Voice** - Each character sounds distinct
4. **Economy** - Cut unnecessary words, get to the point
5. **Action** - Interrupt dialogue with physical actions

**Bad**:
\`\`\`
ALICE
I am very angry at you because you forgot our anniversary.
\`\`\`

**Good**:
\`\`\`
ALICE
(not looking at him)
What day is it?

BOB
Tuesday?

ALICE
Try again.
\`\`\`

## Scene Description Guidelines

1. **Present tense** - "She walks" not "She walked"
2. **Active voice** - "He opens the door" not "The door is opened"
3. **Visual details** - What the camera sees, not internal thoughts
4. **Brevity** - 3-4 lines max per action block
5. **White space** - Break up dense paragraphs

## Pacing Guidelines

| Length | Page Count | Scene Count | Avg Scene Length |
|--------|------------|-------------|------------------|
| 30s commercial | 0.5-1 | 1-3 | 10-30s |
| 3min music video | 3-5 | 8-12 | 15-30s |
| 5min short | 5-7 | 5-8 | 40-60s |
| 10min short | 10-12 | 8-12 | 50-75s |
| 15min short | 15-18 | 12-18 | 50-75s |

**Rule of thumb**: 1 page ≈ 1 minute screen time

## Iterative Refinement Commands

When user requests changes:

1. **Scene-level edits**:
   - "Rewrite scene 3" → Read file, locate scene, rewrite, save
   - "Add scene between 2 and 3" → Insert new scene, renumber if needed
   - "Delete scene 5" → Remove scene, adjust transitions

2. **Character edits**:
   - "Make Alice more assertive" → Review all Alice dialogue, strengthen voice
   - "Add character motivation" → Insert action/dialogue revealing goal

3. **Dialogue edits**:
   - "Shorten dialogue in scene 2" → Cut unnecessary words, tighten exchanges
   - "Add subtext to argument" → Rewrite to imply rather than state

4. **Structural edits**:
   - "Swap scenes 3 and 4" → Reorder, adjust transitions
   - "Extend Act 2" → Add complications, raise stakes

## Output Checklist

Before finalizing script:
- [ ] Valid Fountain syntax (scene headings, character names, dialogue)
- [ ] Clear story structure (beginning, middle, end)
- [ ] Consistent character voices
- [ ] Visual descriptions (not internal thoughts)
- [ ] Appropriate pacing for length
- [ ] Saved as .fountain file
- [ ] Filename matches title

## Next Steps After Script

Suggest to user:
1. **Preview in neko-story** - Open .fountain file in VSCode for syntax highlighting
2. **Convert to timeline** - Use the script-to-timeline skill or Story/Cut authoring capability
3. **Generate storyboard** - Use storyboard-to-timeline skill to create video
4. **Refine and iterate** - Make changes based on visual preview
`;

const scriptGenerationZhCnContent = `# 专业剧本生成助手

你是经验丰富的编剧。帮助用户创作结构清晰、符合 Fountain 格式的剧本。

## 核心原则

1. **先定结构** - 写正文前先明确类型、时长和故事节拍
2. **角色驱动** - 建立清晰的角色动机、障碍和弧光
3. **视觉叙事** - 为画面而写，不写只能存在于内心独白里的信息
4. **Fountain 格式** - 输出合法的 .fountain 语法

## 工作流程

### 阶段 1：故事开发

1. **收集需求**：
   - 类型（剧情、喜剧、动作、恐怖、科幻等）
   - 时长（短片 5-15 分钟、广告 30-60 秒、音乐视频 3-5 分钟、教程 2-10 分钟）
   - 核心概念或故事前提
   - 目标观众

2. **发展结构**：
   - **短片**：铺垫 → 冲突 → 解决（三幕式）
   - **广告**：钩子 → 问题 → 方案 → CTA（四节拍）
   - **音乐视频**：前奏 → 主歌 → 副歌 → 桥段 → 尾声（歌曲结构）
   - **教程**：介绍 → 步骤 → 回顾（教学结构）

3. **创建角色小传**（叙事类需求）：
   - 主角：目标、障碍、缺陷
   - 对抗力量：人物、环境或自我冲突
   - 配角：在故事中的功能

4. **列出故事节拍**：
   - 列出 5-10 个关键场景
   - 每个节拍包含：地点、动作、情绪基调
   - 正式写作前先与用户确认

### 阶段 2：剧本写作

5. **按 Fountain 格式写作**：
   - 英文场景标题使用 INT./EXT. 前缀，例如 \`INT. ROOM - DAY\`。

\`\`\`fountain
INT. COFFEE SHOP - DAY

ALICE (28, anxious) sits alone, checking her phone repeatedly.

ALICE
(muttering)
Where is he?

The door opens. BOB (30, confident) enters.

BOB
Sorry I'm late.

ALICE
(standing)
We need to talk.

CUT TO:

EXT. PARK - LATER

They walk side by side in silence.
\`\`\`

**中文剧本示例：**

\`\`\`fountain
内景 咖啡厅 - 日

小美（28岁，焦虑）独自坐着，反复查看手机。

小美
（自言自语）
他怎么还不来？

门开了。大卫（30岁，自信）走进来。

大卫
对不起，我迟到了。

切至：

外景 公园 - 傍晚

两人并肩默默走着。
\`\`\`

6. **Fountain 语法**：遵循 neko-story 提供的 Fountain 语法参考；
   该参考覆盖英文和 CJK 场景标题、角色名、转场、括注、强制标记和其他元素。

7. **保存到文件**：
   - 使用 Write 工具保存为 \`.fountain\` 文件
   - 根据标题建议文件名

### 阶段 3：迭代润色

8. **与用户复核**：
   - 回顾关键场景
   - 检查节奏和语气
   - 验证角色一致性

9. **可选润色方向**：
   - “把第 X 场写得更紧张”
   - “在第二幕补充角色动机”
   - “缩短开场对白”
   - “把结尾改得更有希望”

10. **结构性修改**：
    - 读取现有 .fountain 文件
    - 解析结构（场景、角色、对白）
    - 应用定向修改
    - 写回更新版本

## 类型模板

### 短片（剧情）

**结构**：三幕式（铺垫 25% → 对抗 50% → 解决 25%）

**故事节拍**：
1. 建立主角的日常世界
2. 诱发事件打破现状
3. 主角承诺追求目标
4. 障碍和复杂性升级
5. 中点转折或揭示
6. 黑暗时刻 / 仿佛全盘皆输
7. 高潮 / 最终对抗
8. 结局 / 新平衡

**时长**：10-15 分钟（10-15 页）

### 广告（产品/服务）

**结构**：四节拍（钩子 → 问题 → 方案 → CTA）

**故事节拍**：
1. **钩子**（0-5 秒）：用问题或视觉瞬间抓住注意力
2. **问题**（5-20 秒）：展示痛点或需求
3. **方案**（20-50 秒）：演示产品或服务
4. **CTA**（50-60 秒）：明确行动号召

**时长**：30-60 秒（0.5-1 页）

**语气**：积极、有愿景、突出收益

### 音乐视频

**结构**：歌曲驱动（前奏 → 主歌 → 副歌 → 主歌 → 副歌 → 桥段 → 副歌 → 尾声）

**故事节拍**：
1. **前奏**（0-10 秒）：建立氛围和环境
2. **第一段主歌**（10-30 秒）：引入人物或情境
3. **第一段副歌**（30-50 秒）：视觉钩子和能量峰值
4. **第二段主歌**（50-70 秒）：推进故事或形成反差
5. **第二段副歌**（70-90 秒）：重复视觉母题
6. **桥段**（90-110 秒）：情绪高潮或转折
7. **第三段副歌**（110-140 秒）：最终能量峰值
8. **尾声**（140-180 秒）：解决或淡出

**时长**：3-5 分钟（3-5 页）

**方法**：以视觉为主，匹配歌曲情绪，结合表演和叙事

### 教程 / 解说

**结构**：教学式（介绍 → 步骤 → 回顾）

**故事节拍**：
1. **介绍**（0-30 秒）：说明要学什么，以及为什么重要
2. **步骤 1**（30 秒-1 分钟）：第一个动作，指令清晰
3. **步骤 2**（1-2 分钟）：第二个动作，承接前一步
4. **步骤 3+**（2-5 分钟）：按需要补充后续步骤
5. **常见错误**（可选）：说明要避免什么
6. **回顾**（5-6 分钟）：总结和下一步

**时长**：2-10 分钟（2-10 页）

**语气**：清楚、鼓励、一步一步推进

## 角色弧光模板

### 正向弧光（成长）
- 起点：有缺陷、不完整、天真
- 中段：遭遇挑战，学到功课
- 终点：完成转变，更成熟完整

### 平弧光（坚守）
- 起点：已经掌握真相
- 中段：世界挑战其信念
- 终点：世界改变，角色坚守

### 负向弧光（堕落）
- 起点：充满希望，理想主义
- 中段：不断妥协价值
- 终点：失去自我，走向悲剧

## 对白最佳实践

1. **潜台词** - 角色很少直接说出真正想法
2. **冲突** - 每段对话都有张力或相反目标
3. **声音** - 每个角色听起来不同
4. **经济性** - 删除不必要的词，直达重点
5. **动作** - 用身体动作打断和支撑对白

**不佳**：
\`\`\`
ALICE
I am very angry at you because you forgot our anniversary.
\`\`\`

**更好**：
\`\`\`
ALICE
(not looking at him)
What day is it?

BOB
Tuesday?

ALICE
Try again.
\`\`\`

## 场景描述准则

1. **现在时** - 写“她走向门口”，而不是“她走向了门口”
2. **主动语态** - 写“他打开门”，不要写“门被打开”
3. **视觉细节** - 写镜头能看到的东西，不写无法拍摄的内心想法
4. **简洁** - 每个动作段落最多 3-4 行
5. **留白** - 拆开密集段落，方便阅读和拍摄

## 节奏准则

| 时长 | 页数 | 场景数 | 平均场景长度 |
|------|------|--------|--------------|
| 30 秒广告 | 0.5-1 | 1-3 | 10-30 秒 |
| 3 分钟音乐视频 | 3-5 | 8-12 | 15-30 秒 |
| 5 分钟短片 | 5-7 | 5-8 | 40-60 秒 |
| 10 分钟短片 | 10-12 | 8-12 | 50-75 秒 |
| 15 分钟短片 | 15-18 | 12-18 | 50-75 秒 |

**经验规则**：1 页 ≈ 1 分钟银幕时间

## 迭代润色命令

当用户要求修改时：

1. **场景级修改**：
   - “重写第 3 场” → 读取文件、定位场景、重写并保存
   - “在第 2 场和第 3 场之间加一场” → 插入新场景，必要时重编号
   - “删除第 5 场” → 删除场景并调整转场

2. **角色修改**：
   - “让 Alice 更果断” → 检查所有 Alice 对白，强化声音
   - “增加角色动机” → 插入揭示目标的动作或对白

3. **对白修改**：
   - “缩短第 2 场对白” → 删除冗余词句，收紧交锋
   - “给争吵加潜台词” → 改成暗示而不是直说

4. **结构修改**：
   - “交换第 3 场和第 4 场” → 重排并调整转场
   - “扩展第二幕” → 增加复杂性，提高赌注

## 输出检查清单

最终交付前检查：
- [ ] Fountain 语法合法（场景标题、角色名、对白）
- [ ] 故事结构清晰（开端、中段、结尾）
- [ ] 角色声音一致
- [ ] 描述是视觉化的（不是内心想法）
- [ ] 节奏匹配目标时长
- [ ] 已保存为 .fountain 文件
- [ ] 文件名匹配标题

## 剧本完成后的下一步

建议用户：
1. **在 neko-story 中预览** - 在 VSCode 打开 .fountain 文件以查看语法高亮
2. **转换为时间线** - 使用 script-to-timeline skill 或 Story/Cut authoring capability
3. **生成分镜** - 使用 storyboard-to-timeline skill 创建视频方案
4. **继续润色迭代** - 根据视觉预览继续修改
`;

const localizedScriptGenerationContent = {
  default: scriptGenerationContent,
  localized: { 'zh-cn': scriptGenerationZhCnContent },
};

/**
 * Script Generation skill - Professional screenplay writing with genre templates
 *
 * Intended for explicit screenplay, script, or story creation requests.
 */
export const scriptGenerationSkill: Skill = {
  name: 'script-generation',
  description:
    'Professional screenplay and script writing assistant with genre templates and iterative refinement. ' +
    'Use after the Agent has confirmed the user intends to create or revise a screenplay, Fountain script, story structure, character arc, or script template.',
  content: scriptGenerationContent,
  allowedTools: [
    // File operations for script I/O
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.WRITE,
    TOOL_NAMES_SYSTEM.LIST_DIRECTORY,
    TOOL_NAMES_SYSTEM.GLOB,
    // Can chain into other skills
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
  ],
  icon: '✍️',
  source: 'builtin',
  enabled: true,
  domain: 'story',
  mediaWorkflow: {
    useCases: [
      'Write or refine a screenplay, Fountain script, scene, dialogue, character arc, or story structure',
      'Create genre-specific script drafts and iterative rewrites for a creative project',
    ],
    nonGoals: [
      'Convert an existing script into a timeline project',
      'Generate image, video, or audio media directly',
    ],
    acceptedModalities: ['text', 'story-brief'],
    inputArtifacts: ['story-brief', 'outline', 'character-notes'],
    producedArtifacts: ['FountainScript', 'screenplay'],
    tags: ['script', 'screenplay', 'fountain', 'story'],
    operations: ['write-script', 'rewrite-scene', 'refine-dialogue', 'structure-story'],
    costLevel: 'low',
    riskLevel: 'low',
  },
};

export function getScriptGenerationSkill(locale?: string): Skill {
  return localizeBuiltinSkill(scriptGenerationSkill, localizedScriptGenerationContent, locale);
}
