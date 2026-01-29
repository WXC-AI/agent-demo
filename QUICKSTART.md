# 快速开始指南

## 1. 安装依赖

```bash
npm install
```

## 2. 配置环境变量

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 DeepSeek API Key：

```
DEEPSEEK_API_KEY=your-api-key-here
```

## 3. 构建项目

```bash
npm run build
```

## 4. 运行示例

### 单次查询

```bash
npm start -- "现在几点了？"
```

```bash
npm start -- "帮我计算 123 + 456"
```

```bash
npm start -- "列出当前目录下的文件"
```

### 交互式模式

```bash
npm start -- --interactive
```

## 5. 开发模式

使用 `tsx` 直接运行 TypeScript（无需构建）：

```bash
npm run dev -- "你的查询"
```

## 常见问题

### Q: 如何添加新的 MCP 服务器？

A: 
1. 在 `src/buildinMcp/servers/` 创建新的服务器文件
2. 在 `config.yaml` 中添加服务器配置
3. 重新构建项目

### Q: 如何修改日志级别？

A: 在 `config.yaml` 中修改 `logging.level` 字段（DEBUG, INFO, WARN, ERROR）

### Q: 文件系统服务器的根目录在哪里？

A: 默认在 `./data` 目录，可以在 `config.yaml` 中通过 `--root` 参数修改
