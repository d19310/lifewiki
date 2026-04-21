/**
 * Inference Rules Prompt
 * 实体类型推断规则 - 作为 AI 提示词使用
 */

export const INFERENCE_RULES_PROMPT = `## 实体类型推断规则

对于未能在已归档实体中匹配的名称，根据以下规则推断类型：

### 判断优先级

| 优先级 | 检测规则 | 推断类型 | 小类 | autoConfirmed |
|--------|---------|---------|------|---------------|
| 1 | 中文姓名（2-4字，常见姓氏如张/李/王等） | people | 人 | true (85%) |
| 2 | 包含"项目"关键词，或上下文提到"规划/推进/阶段性" | project | 项目 | true (90%) |
| 3 | 包含"任务"关键词，或上下文提到"执行/完成/拆分/待办" | project | 任务 | true (85%) |
| 4 | 包含 thing 关键词：手机/电脑/Mac/Pro/Phone/设备/设施/工具/产品/方案 | thing | 产品/设备 | false (75%) |
| 5 | 包含 idea 关键词：想法/灵感/概念/思路/创意/建议/思考 | idea | 想法 | false (75%) |
| 6 | 包含 knowledge 关键词：文章/论文/书籍/报告/文档/新闻/媒体/播客/视频/课程 | knowledge | 文章/文档 | false (80%) |
| 7 | 英文大写开头单词（符合人名格式） | people | 人(英文) | false (60%) |
| 8 | 无法判断 | knowledge | 未分类 | false (30%) |

### 大类说明

| 大类 | 小类 | 判断标准 |
|------|------|---------|
| people | 人 | 人名检测（2-4字中文名、英文名） |
| project | 项目 | 系统性工作、长期规划、多步骤、需要持续推进、可拆分子事项 |
| project | 任务 | 单次行动、立刻能做、做完就结束、简单执行项 |
| thing | 产品/设备/设施/方案 | 物品、产品、设备、设施、方案 |
| idea | 想法/灵感/新概念 | 想法、灵感、新概念 |
| knowledge | 文章/论文/书籍/媒体/新闻/文档 | 知识载体 |

### 输出格式

对于每个需要推断的实体，返回：
- name: 实体名称
- inferredType: 推断类型（people/project/thing/idea/knowledge）
- subType: 子类型（人/项目/任务/产品-设备/想法/文章-文档/未分类）
- confidence: 置信度分数（0-1）
- autoConfirmed: 是否自动确认（置信度>=0.85时为true）
- reason: 推断原因的简要说明`;

export const INFERENCE_RULES_CONTEXT = `【实体类型推断规则】
1. 中文姓名（2-4字，常见姓氏）→ people/人，confidence=0.85，autoConfirmed=true
2. 包含"项目"关键词，或上下文有"规划/推进/阶段性" → project/项目，confidence=0.9，autoConfirmed=true
3. 包含"任务"关键词，或上下文有"执行/完成/拆分/待办" → project/任务，confidence=0.85，autoConfirmed=true
4. 包含 thing 关键词（手机/电脑/Mac/设备/设施/工具/产品/方案） → thing/产品/设备，confidence=0.75，autoConfirmed=false
5. 包含 idea 关键词（想法/灵感/概念/思路/创意/建议/思考） → idea/想法，confidence=0.75，autoConfirmed=false
6. 包含 knowledge 关键词（文章/论文/书籍/报告/文档/新闻/媒体/视频/课程） → knowledge/文章/文档，confidence=0.8，autoConfirmed=false
7. 英文大写开头单词（符合人名格式）→ people/人(英文)，confidence=0.6，autoConfirmed=false
8. 无法判断 → knowledge/未分类，confidence=0.3，autoConfirmed=false`;
