---
name: example-skill
description: 示例技能，用于演示 Agent Skills。当用户提到「示例」「example」「技能演示」或需要运行示例脚本时使用。
---

# Example Skill

## 用途

本技能用于演示符合 Anthropic 规范的 Agent Skills 结构，包含说明与可执行脚本。

## 使用方式

- 运行脚本，传入：
  - `skill_id`: `example`
  - `script_path`: `scripts/hello.js`
  - `args`: 可选，如 `["world"]`

## 脚本说明

- `scripts/hello.js`: 打印问候语，可接受一个可选参数作为称呼。
