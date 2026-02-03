# @uniedit/agent-cli

> UniEdit AI Agent 命令行工具 - 独立运行 AI Agent

## Context Summary

- 项目：UniEdit - VSCode 视频编辑器
- 定位：提供命令行方式运行 AI Agent，无需 VSCode 环境
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：CLI 入口，配置管理，Agent 执行
- **入口**：`nekoagent` 命令
- **依赖**：`@uniedit/agent`, `@uniedit/shared`

## 安装

```bash
# 从 monorepo 安装
npm install

# 或全局安装（发布后）
npm install -g @uniedit/agent-cli
```

## 使用

### 运行 Agent

```bash
# 基本用法
nekoagent run "分析这段代码并提出改进建议"

# 指定 provider 和 model
nekoagent run "生成一个 React 组件" -p anthropic -m claude-sonnet-4-20250514

# 从文件读取 prompt
nekoagent run -i prompt.txt -o result.md

# JSON 输出
nekoagent run "列出项目结构" -f json

# 详细输出
nekoagent run "重构这个函数" -v
```

### 交互模式

```bash
nekoagent interactive
# 或简写
nekoagent i
```

交互模式支持 slash 命令：

```bash
> /help              # 显示帮助
> /status            # 显示当前状态
> /config            # 管理配置
> /skills            # 管理技能
> /tools             # 查看工具
> /commands          # 查看命令
> /exit              # 退出
```

### 配置管理

```bash
# 查看当前配置
nekoagent config show

# 设置 provider
nekoagent config set provider anthropic

# 设置 model
nekoagent config set model claude-sonnet-4-20250514

# 查看可用 providers
nekoagent config providers
```

## 配置

### 配置文件位置

| 类型 | 路径 | 说明 |
|------|------|------|
| 用户配置 | `~/.neko/config.json` | 全局配置，所有项目共享 |
| 工作区配置 | `.neko/config.json` | 项目级配置，优先级更高 |

### 配置优先级

从高到低：
1. 命令行参数 (`--provider`, `--api-key` 等)
2. 环境变量 (`ANTHROPIC_API_KEY` 等)
3. 工作区配置 (`.neko/config.json`)
4. 用户配置 (`~/.neko/config.json`)
5. 默认值

### 环境变量

```bash
# Anthropic
export ANTHROPIC_API_KEY=sk-ant-xxx

# OpenAI
export OPENAI_API_KEY=sk-xxx

# DeepSeek
export DEEPSEEK_API_KEY=sk-xxx

# 通用 API Key（fallback）
export NEKO_API_KEY=xxx
```

### 配置文件格式

用户配置 `~/.neko/config.json`：

```json
{
  "defaultProvider": "anthropic",
  "maxTokens": 8192,
  "temperature": 0.7,
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-xxx",
      "defaultModel": "claude-sonnet-4-20250514",
      "models": [
        "claude-sonnet-4-20250514",
        "claude-opus-4-20250514",
        { "id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet" }
      ]
    },
    "openai": {
      "apiKey": "sk-xxx",
      "defaultModel": "gpt-4o",
      "models": ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"]
    },
    "deepseek": {
      "apiKey": "sk-xxx",
      "baseUrl": "https://api.deepseek.com",
      "defaultModel": "deepseek-chat",
      "models": ["deepseek-chat", "deepseek-reasoner"]
    },
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "defaultModel": "llama3",
      "models": ["llama3", "codellama", "mistral"]
    }
  },
  "mcpServers": [
    {
      "id": "filesystem",
      "name": "File System",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    }
  ],
  "skillsDir": "~/.neko/skills"
}
```

### Provider 配置结构

每个 provider 支持以下配置：

| 字段 | 类型 | 说明 |
|------|------|------|
| `apiKey` | string | API 密钥 |
| `baseUrl` | string | 自定义 API 端点 |
| `defaultModel` | string | 默认模型 |
| `models` | array | 可用模型列表（1:N 关系） |

模型可以是简单字符串或详细配置：

```json
{
  "models": [
    "gpt-4o",
    { "id": "gpt-4o-mini", "name": "GPT-4o Mini", "maxTokens": 4096 }
  ]
}
```

工作区配置 `.neko/config.json`（可覆盖用户配置）：

```json
{
  "defaultProvider": "openai",
  "providers": {
    "openai": {
      "baseUrl": "https://custom-api.example.com",
      "defaultModel": "gpt-4o-mini"
    }
  }
}
```

### 多 Provider 配置

支持同时配置多个 provider，切换时自动使用对应的配置：

```json
{
  "defaultProvider": "anthropic",
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-xxx",
      "defaultModel": "claude-sonnet-4-20250514"
    },
    "openai": {
      "apiKey": "sk-xxx",
      "defaultModel": "gpt-4o"
    },
    "deepseek": {
      "apiKey": "sk-xxx",
      "defaultModel": "deepseek-chat"
    }
  }
}
```

切换 provider 时自动使用对应的 apiKey、baseUrl 和 defaultModel：

```bash
nekoagent run "hello" -p openai  # 使用 openai 的配置
nekoagent run "hello" -p deepseek -m deepseek-reasoner  # 指定模型
```

## 支持的 Providers

| Provider | 环境变量 | 默认模型 |
|----------|----------|----------|
| anthropic | ANTHROPIC_API_KEY | claude-sonnet-4-20250514 |
| openai | OPENAI_API_KEY | gpt-4o |
| deepseek | DEEPSEEK_API_KEY | deepseek-chat |

## 命令参考

### run

```
nekoagent run <prompt> [options]

Options:
  -p, --provider <provider>    LLM provider
  -m, --model <model>          Model ID
  -k, --api-key <key>          API key
  -u, --base-url <url>         API base URL
  -t, --temperature <temp>     Temperature (0-1)
  --max-tokens <tokens>        Max tokens
  --max-iterations <n>         Max agent iterations (default: 10)
  --timeout <ms>               Timeout in milliseconds
  -i, --input <file>           Read prompt from file
  -o, --output <file>          Write result to file
  -f, --format <format>        Output format (text, json, markdown)
  -v, --verbose                Verbose output
  -s, --stream                 Stream output
```

### interactive

```
nekoagent interactive [options]

Options:
  -p, --provider <provider>    LLM provider
  -m, --model <model>          Model ID
  -k, --api-key <key>          API key
  -v, --verbose                Verbose output
```

### config

```
nekoagent config show              Show current configuration
nekoagent config set <key> <value> Set a configuration value
nekoagent config providers         List available providers
```

## Slash 命令参考

交互模式下支持以下 slash 命令：

### 通用命令

| 命令 | 别名 | 说明 |
|------|------|------|
| `/help` | `/h`, `/?` | 显示帮助信息 |
| `/status` | `/s` | 显示当前状态（配置、模型等） |
| `/clear` | `/cls` | 清屏 |
| `/exit` | `/quit`, `/q` | 退出交互模式 |

### 配置命令

| 命令 | 说明 |
|------|------|
| `/config` | 显示当前配置 |
| `/config set <key> <value>` | 设置配置项 |
| `/config providers` | 列出可用 providers |
| `/config models` | 列出当前 provider 的模型 |

### 技能命令

| 命令 | 说明 |
|------|------|
| `/skills` | 列出所有技能 |
| `/skills info <name>` | 显示技能详情 |
| `/skills active` | 显示当前激活的技能 |
| `/skills clear` | 清除激活的技能 |

### 工具命令

| 命令 | 说明 |
|------|------|
| `/tools` | 列出所有工具 |
| `/tools info <name>` | 显示工具详情 |
| `/tools search <query>` | 搜索工具 |

### 命令命令

| 命令 | 说明 |
|------|------|
| `/commands` | 列出所有注册的命令 |

## Architecture

```
agent-cli/
├── src/
│   ├── cli.ts            # CLI 入口和命令定义
│   ├── config.ts         # 配置加载和管理
│   ├── runner.ts         # Agent 执行逻辑
│   ├── llm-client.ts     # LLM 客户端抽象
│   ├── slash-commands.ts # Slash 命令处理
│   ├── formatter.ts      # 输出格式化
│   ├── types.ts          # 类型定义
│   └── index.ts          # 模块导出
```

## 依赖关系

```
agent-cli
    ├── @uniedit/agent    # Agent 核心
    └── @uniedit/shared   # 共享类型
```

## 开发

```bash
# 开发模式运行
npm -w @uniedit/agent-cli run dev -- run "test prompt"

# 构建
npm -w @uniedit/agent-cli run build

# 测试
npm -w @uniedit/agent-cli run test
```
