# pi-model-bench 中文说明

`pi-model-bench` 是一个面向 Pi Coding Agent 的模型检测与性能测试工具，同时支持独立 CLI 和 Pi 插件两种使用方式。

英文说明见 [README.md](./README.md)。

## 1. 项目背景特点

当 Pi 中配置了多个 provider 或模型时，通常需要回答几个实际问题：模型现在能不能调用、首 token 要等多久、持续生成速度如何，以及不同网络环境下哪个模型更稳定。本项目直接复用 Pi 已配置的模型目录和认证信息，串行执行健康检查或流式测速，并可生成 Markdown、CSV 和 JSON 报表。

主要特点：

- **无需重复配置密钥**：模型、provider 和认证均由 Pi 解析。
- **两种测试模式**：`--health` 用少量 token 检查鉴权、权限、额度、限流、接口和网络；`--speed` 测量 TTFT、可见 TTFT、Decode TPS 和端到端耗时。
- **结果更便于比较**：请求串行执行，关闭客户端重试和缓存保留，并为每次请求使用独立 ID，减少相互争抢带宽和缓存命中造成的干扰。
- **按需保存结果**：默认只输出终端结果；添加 `-f` 后，每次请求结束都会增量写入 `.md`、`.csv`、`.json`。
- **默认保护凭据**：报表不写入 API Key、OAuth Token、认证请求头或工作目录绝对路径，错误摘要也会做密钥脱敏。

本工具衡量的是单用户、串行请求的实际体验，不是并发压测工具。

## 2. 安装

### 依赖

- Node.js 20 或更高版本
- Pi Coding Agent 0.83.0 或更高版本
- Pi 中至少配置了一个可用模型及其认证信息

建议先在 Pi 中确认目标模型可以正常对话。ChatGPT Plus/Pro 的 OAuth 模型使用 `openai-codex` provider，需要先在 Pi 中执行 `/login`。

### CLI 命令方式（推荐）

直接从 GitHub 全局安装：

```bash
npm install --global github:aweyonhub/pi-model-bench
```

确认安装成功：

```bash
pi-model-bench --version
pi-model-bench --list --zh
```

开发本项目时，也可以在仓库根目录注册本地命令：

```bash
npm link
pi-model-bench --list --zh
```

CLI 是 Pi 的非交互包装器：它不会打开 TUI，也不会创建会话文件。不带参数时会使用当前模型执行默认速度测试，默认不生成报表文件。

如果 `pi` 不在标准 `PATH` 中，可显式指定可执行文件：

```bash
PI_MODEL_BENCH_PI_BIN=/path/to/pi pi-model-bench --list --zh
```

### Pi 插件方式

安装到 Pi：

```bash
pi install https://github.com/aweyonhub/pi-model-bench
```

安装后重启 Pi，或在 Pi 中执行 `/reload`。之后可以在交互界面中运行：

```text
/model-bench --help --zh
/model-bench --health --all --label home-wifi --zh
```

`pi install` 只安装 Pi 交互插件，不会创建 shell 中的 `pi-model-bench` 命令；如需 CLI，请使用上一节的全局安装方式。

## 3. 使用

### 默认测试当前模型

```bash
pi-model-bench
```

不带任何参数等价于使用 `--current`：对当前模型执行默认速度测试（3 次、每次最多输出 128 token），结果只显示在终端。

### 先查看模型，不消耗额度

```bash
pi-model-bench --list --zh
```

等价的组合短参数写法：

```bash
pi-model-bench -lz
```

### 先做低消耗健康检查

```bash
pi-model-bench -zat --label home-wifi
```

健康检查默认对每个模型请求 1 次，最多输出 8 token。建议每次批量测速前先运行它，用来排除鉴权、订阅、额度或网络问题。

### 测试 Pi 限定的 scoped models

```bash
pi-model-bench -zs
```

`-zs` 是 `-z -s` 的组合写法，等价于 `--zh --scoped`。短参数可以组合使用。

### 比较日常使用的几个模型

先从 `--list` 的结果中复制完整的 `provider/model` 名称：

```bash
pi-model-bench --speed --models provider/model-a,provider/model-b --runs 5 --max-tokens 256 --label home-wifi -zf
```

这是最实用的对比方式：只测真正会使用的模型，运行 5 次可以让 p50/p95 比单次结果更有参考价值。`--models` 也支持 `*` 和 `?` 通配符，例如：

```bash
pi-model-bench --health --models "provider/*max" --zh
```

### 比较不同网络或代理

保持模型、提示词、运行次数、thinking 和 token 上限完全相同，只改变标签和实际网络环境：

```bash
pi-model-bench --speed --models provider/model-a,provider/model-b --runs 5 --max-tokens 256 --label direct -zf
pi-model-bench --speed --models provider/model-a,provider/model-b --runs 5 --max-tokens 256 --label office-vpn -zf
```

然后重点比较 Markdown 报表中的 TTFT p50/p95、Decode TPS、失败次数和错误类型。

### 测试真实推理配置

默认 `thinking=off`，适合尽量单独比较网络、排队和输出速度。如果日常使用高推理等级，应单独测试：

```bash
pi-model-bench --speed -a --runs 3 --thinking high --label thinking-high -zf
```

不要把不同 thinking 等级的结果直接混合排名；部分推理模型或 provider 也可能无法完全关闭 thinking。

### 输出文件

默认不生成文件。添加 `-f` 后，测试结果会保存在执行命令时的当前目录：

```bash
pi-model-bench -zaf
```

也可以用 `--output NAME` 指定文件名前缀；它会自动启用文件输出。

```text
pi-model-bench-20260805T150000Z-home-wifi.md
pi-model-bench-20260805T150000Z-home-wifi.csv
pi-model-bench-20260805T150000Z-home-wifi.json
```

- Markdown：直接查看汇总、指标和错误信息。
- CSV：每次请求一行，适合 Excel、Python 或 DuckDB 分析。
- JSON：保留完整结构化配置和结果，适合自动化处理或长期趋势分析。

每次请求只输出一行终端结果：

```text
[pi-model-bench] ✅[15s][⚡198.4TPS][1/51] opencode-go/deepseek-v4-flash: 成功 — 首 token 15490 ms，生成速度 198.4 token/s
```

TPS 标记分为四档：`🔴 0–50`、`🟡 51–100`、`🟢 101–149`、`⚡ 150+`；无法计算 TPS 时显示 `⚪—TPS`。

使用 `-s`、`-a` 等方式选中多个模型进行速度测试时，最后会完整输出模型排名。排名使用每个模型成功请求的 Decode TPS 中位数，从高到低排列；测速失败或无法计算 TPS 的模型仍会列在末尾：

```text
[pi-model-bench] 📊[1/2][⚡198.4TPS][3/3] provider/fast-model
[pi-model-bench] 📊[2/2][🟡82.1TPS][3/3] provider/slow-model
```

以上 CLI 示例都可以在 Pi 中使用，只需将 `pi-model-bench` 替换为 `/model-bench`。

## 4. 参数与指标

### 参数说明

模型选择参数只能使用一种；不指定时默认测试当前模型。

| 参数 | 说明 |
|---|---|
| `-c`, `--current` | 测试当前模型（默认） |
| `-a`, `--all` | 测试所有已配置且可用的模型 |
| `-s`, `--scoped` | 测试 Pi `--models` 或 `enabledModels` 限定的模型 |
| `--provider NAME` | 测试指定 provider 下的全部可用模型 |
| `--models LIST` | 测试逗号分隔的模型 ID 或通配模式 |
| `-t`, `--health` | 低消耗健康检查；默认运行 1 次、最多输出 8 token |
| `--speed` | 流式速度测试（默认）；默认运行 3 次、最多输出 128 token |
| `--runs N` | 每个模型的运行次数，范围 1–20 |
| `--max-tokens N` | 最大输出 token，范围 1–4096 |
| `--timeout DURATION` | 单次请求超时，默认 `30s`；支持 `ms`、`s`、`m` |
| `--delay DURATION` | 两次请求之间的间隔，默认 `250ms` |
| `--thinking LEVEL` | `off\|minimal\|low\|medium\|high\|xhigh\|max`，默认 `off` |
| `--label TEXT` | 写入报表的网络或场景标签 |
| `-f`, `--file` | 输出 Markdown、CSV 和 JSON 报表；默认不输出文件 |
| `--output NAME` | 使用自定义文件名前缀输出报表，同时启用文件输出 |
| `--prompt TEXT` | 覆盖内置固定测试提示词 |
| `-z`, `--zh`, `--lang zh` | 使用中文终端提示和中文 Markdown 报表；短参数可组合，如 `-zs` |
| `--yes` | 在 Pi 交互模式中跳过多请求确认；CLI 本身为非交互模式 |
| `-l`, `--list` | 只列出模型，不发送请求；`-lz` 等价于 `--list --zh` |
| `--help` | 显示帮助 |
| `--version` / `-v` | 显示 CLI 版本 |

请求总数为 `模型数 × --runs`。例如 18 个模型各运行 3 次，会产生 54 次付费或订阅请求。

CLI 退出码：成功、帮助或列模型为 `0`；请求失败或没有匹配模型为 `1`；参数错误为 `2`；无法启动 Pi 为 `127`；Pi 异常退出时透传其退出码。

### 指标含义

| 指标 | 含义 | 主要用途 |
|---|---|---|
| 响应头耗时 | 从发出请求到收到 HTTP 响应头；仅在 provider 支持响应回调时记录 | 观察连接、代理、排队和请求预处理耗时 |
| 首 token 时间（TTFT） | 从发出请求到第一个非空文本、thinking 或工具调用增量 | 衡量模型开始响应的速度 |
| 可见首 token 时间 | 从发出请求到第一个用户可见文本 | 衡量推理模型的实际等待感受 |
| 生成速度（Decode TPS） | 首次输出后，每秒生成的 output token 数 | 衡量持续输出速度 |
| 总耗时（E2E） | 从发出请求到流式响应结束 | 衡量完整响应的等待时间 |
| p50 | 多次运行的中位数 | 代表通常体验 |
| p95 | 多次运行的慢尾分位数 | 发现偶发排队和网络抖动 |

Decode TPS 的计算公式为：

```text
(output_tokens - 1) / (completion_time - first_output_time)
```

工具优先使用 provider 最终报告的 output token 数；缺失时才使用本地估算，并在报表中标记。SSE 或 WebSocket 的一个数据块不一定对应一个 token，因此不会用 chunk 数代替 token 数。

健康检查的响应很短，适合判断可用性，不适合比较 Decode TPS。只运行 1 次时，p50 和 p95 都只是该次样本；正式比较建议至少 3 次，较严谨的网络对比建议 5 次以上。

失败会归类为鉴权、权限或订阅、额度或计费、限流、模型或接口、无效请求、超时、网络、上游服务、空响应、请求中止或未知错误。报表会保留经过脱敏的原始错误摘要，方便排查。

## 5. 设计思路

1. **复用 Pi，而不是再造配置系统**：模型列表来自 Pi 的模型注册表；扩展在每次请求前向 Pi 获取已经解析好的认证信息，再交给对应 provider 适配器。CLI 只负责以非交互方式启动这一流程。
2. **优先保证横向比较的公平性**：所有请求串行执行，避免模型争抢本机带宽；关闭客户端重试和缓存保留，让错误与网络差异直接暴露；每次请求使用独立的 session/request ID，降低服务端缓存干扰。
3. **区分“能否使用”和“使用体验”**：健康检查使用极短响应降低成本；速度测试使用固定、可持续输出的提示词，分别记录开始响应、可见响应、持续生成和完整结束时间。
4. **不伪造 token 精度**：优先采用 provider 的最终 usage；provider 未返回时才估算，并明确记录 token 来源。
5. **按需、增量且安全地落盘**：默认不写文件；启用 `-f` 后，每次测试都会更新三种格式，只保存分析所需的模型元数据、指标、用量、费用和脱敏错误。

Pi 通常会组合 `~/.pi/agent/settings.json`、`models.json`、`models-store.json`、`auth.json` 以及 `OPENAI_API_KEY` 等 provider 环境变量。本工具不直接读取或复制这些密钥文件，而是使用 Pi 在内存中解析后的认证结果。

如果目标是服务端并发容量、固定 QPS、Poisson 流量或高并发负载测试，应使用专门的压测工具；`pi-model-bench` 专注于可复现的单用户模型体验对比。
