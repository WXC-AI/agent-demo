# Agent Skills 使用说明

本项目的 Agent Skills 实现遵循 [Anthropic Agent Skills](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/overview) 的目录与 `SKILL.md` 规范，在本地完成加载与按需注入，并支持在技能目录下执行脚本。

## 目录与配置

- **默认技能目录**：`./src/buildinSkills`（可在 `config.yaml` 中通过 `skills.directory` 修改）
- 每个子目录视为一个技能，必须包含根目录下的 `SKILL.md`，否则该目录会被跳过

## SKILL.md 格式（符合 Anthropic 规范）

- **YAML frontmatter**（必选）：用 `---` 包裹，至少包含：
  - `name`：技能名称，小写字母、数字、连字符，最多 64 字符
  - `description`：简短描述，说明技能做什么、何时使用（建议包含触发关键词），最多 1024 字符
- **正文**：Markdown，写使用说明、步骤、示例等，会在匹配到该技能时注入到系统提示中

示例：

```markdown
---
name: pdf-processing
description: 处理 PDF 文件：提取文本、填表、合并。当用户提到 PDF、表单或文档提取时使用。
---

# PDF 处理

## 快速开始
使用 pdfplumber 提取文本...
```

## 加载层级

1. **Level 1（启动时）**：扫描技能目录，解析每个 `SKILL.md` 的 frontmatter，将 `name` 与 `description` 拼成「可用技能」列表写入系统提示，模型据此发现技能。
2. **Level 2（按需）**：使用 **LLM 发现**与用户消息相关的技能——将用户消息与所有技能的 `id`、`name`、`description` 发给 LLM，由 LLM 返回相关 skill_id 列表；再为这些技能加载 `SKILL.md` 正文并追加到系统提示中。若 LLM 调用失败则回退到关键词匹配。
3. **脚本执行**：通过 **MCP 服务 skills** 执行脚本。模型调用该服务提供的工具 `skills__execute_script`，在对应技能根目录下执行脚本（工作目录为技能目录），仅支持 `.py`、`.sh`、`.js`、`.mjs`，默认超时 30 秒。技能说明中应写成「使用 / 通过 MCP 服务 skills 执行脚本」。

## 工具 skills__execute_script（MCP 服务 skills）

- 由 `config.yaml` 中的 MCP 服务器 `skills`（skill-runner-server）提供，与 time、calculator、filesystem 同级。
- 在 SKILL.md 中描述脚本执行时，建议写成「通过 MCP 服务 skills 执行」或「调用 MCP 服务 skills 的 execute_script 工具」。
- 服务器通过 `--skills-dir` 指定技能根目录（需与 `skills.directory` 一致，默认 `./src/buildinSkills`）。

- **skill_id**：技能目录名（即技能 ID）
- **script_path**：脚本相对路径，如 `scripts/run.py`、`fill_form.js`
- **args**（可选）：字符串数组，作为命令行参数传给脚本

返回：`{ stdout, stderr, code }` 或 `{ error, stdout?, stderr? }`。

## 安全与限制

- 脚本路径会被解析并限制在技能目录内，不能访问技能目录外的文件。
- 仅允许上述扩展名；执行环境与 Agent 进程相同（Node 环境），无沙箱隔离，请只放置可信脚本。

## 示例技能

项目自带示例：`src/buildinSkills/example/`，包含 `SKILL.md` 与 `scripts/hello.js`。可运行 Agent 并输入「运行 example 技能的 hello 脚本」或「执行示例脚本」进行验证。
