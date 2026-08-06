# pi-model-bench 中文说明

`pi-model-bench` 是一个 Pi Coding Agent 扩展和命令行工具。它直接复用 Pi 已配置的 provider、模型目录和认证信息，批量执行模型接口健康检查与流式性能测试，并把结果保存到执行命令时的当前目录。

插件不会把 API Key、OAuth Token 或认证请求头写入报表。报表只包含模型元数据、性能指标、token 用量、费用以及经过脱敏的错误摘要。

英文说明见 [README.md](./README.md)。

## 常用命令

在仓库根目录直接运行：

```bash
# 列出 Pi 当前可用模型：不发送请求、不消耗额度
./bin/pi-model-bench.js --zh --list

# 测试当前模型的速度：默认运行 3 次、最多输出 128 token
./bin/pi-model-bench.js --zh

# 测试全部可用模型的速度：每个模型默认运行 3 次
./bin/pi-model-bench.js --zh --all

# 低消耗检查全部可用模型：每个模型运行 1 次、最多输出 8 token
./bin/pi-model-bench.js --zh --all --health
```

建议先运行第三条健康检查，确认模型认证和接口正常，再进行全部模型的速度测试。执行过 `npm link` 后，可将 `./bin/pi-model-bench.js` 简写为 `pi-model-bench`。

速度测试和健康检查的单次请求默认都最多等待 30 秒。终端使用 `⏳` 表示正在请求、`⚡` 表示已收到首 token、`✅` 表示成功、`❌` 表示失败、`⚠️` 表示部分失败。

## 当前功能

- 在 shell 中使用 `pi-model-bench`，无需启动 Pi 交互界面
- 在 Pi 交互界面中使用 `/model-bench`
- 测试当前模型、指定模型、指定 provider、scoped models 或全部可用模型
- `--health` 低消耗检查鉴权、订阅权限、额度、限流、接口和网络状态
- `--speed` 测量首 token、可见首 token、生成速度和总耗时
- 优先使用 provider 最终报告的 output token；缺失时使用本地估算并明确标记
- 串行发送请求，防止模型之间争抢当前网络带宽
- 关闭客户端重试和缓存保留，让错误和网络差异更容易暴露
- 每次请求使用不同的 session/request ID，降低服务端缓存对结果的影响
- 每完成一次测试就增量保存，途中退出也能保留已经完成的结果
- 支持 `--lang zh` 输出中文终端提示和中文 Markdown 报表

## 环境要求

- Node.js 20 或更高版本
- Pi Coding Agent 0.83.0 或更高版本
- 已经在 Pi 中配置至少一个可用模型及其认证

## 命令行使用

在仓库目录中直接试用，不需要安装全局命令：

```bash
node ./bin/pi-model-bench.js --list --lang zh
```

开发时可用 `npm link` 注册全局命令：

```bash
npm link
pi-model-bench --list --lang zh
```

健康检查示例：

```bash
pi-model-bench --health --all --label home-wifi --lang zh
```

这个命令是 Pi 的非交互包装器：它在后台启动 Pi runtime、显式加载本扩展并执行 `/model-bench`，但不会打开 Pi 的 TUI，也不会创建会话文件。API Key 和 OAuth Token 仍然由 Pi 解析，包装器不会自行读取密钥文件。

不传参数时只显示帮助，不会自动发送模型请求：

```bash
pi-model-bench
```

如果 Pi 不在标准 `PATH` 中，可以指定其可执行文件：

```bash
PI_MODEL_BENCH_PI_BIN=/path/to/pi pi-model-bench --list --lang zh
```

CLI 退出码便于脚本判断结果：全部请求成功、帮助或列模型返回 `0`；任何模型请求失败或没有匹配模型返回 `1`；参数错误返回 `2`；无法启动 Pi 返回 `127`。如果 Pi 本身异常退出，则透传 Pi 的退出码。

## 安装为 Pi 交互扩展

如果希望在 Pi TUI 中使用 `/model-bench`，在仓库目录运行：

```bash
pi install .
```

安装后重启 Pi，或者在 Pi 中执行：

```text
/reload
```

查看中文帮助：

```text
/model-bench --help --lang zh
```

也可以使用快捷参数：

```text
/model-bench --help --zh
```

`pi install` 负责安装交互扩展，但不会在 shell 中创建 `pi-model-bench` 命令。shell 命令需要单独执行 `npm link` 或全局安装。

## 从 GitHub 安装

仓库发布后，将下面的占位符替换为真实 GitHub 用户名：

```bash
# 安装 shell 命令
npm install --global github:YOUR_GITHUB_NAME/pi-model-bench

# 可选：同时安装到 Pi TUI
pi install https://github.com/YOUR_GITHUB_NAME/pi-model-bench
```

当前 `package.json` 保留了 `private: true`，用于防止误发布到 npm；它不影响从 GitHub 安装。若以后需要发布 npm 包，再补充许可证、repository 信息并移除该字段。

## 配置和认证原理

命令行包装器最终仍然调用 Pi。模型列表来自 Pi 的模型注册表；每次请求前，扩展向 Pi 请求该模型已经解析好的认证信息，然后交给对应 provider 适配器发送请求。

Pi 通常从以下位置组合配置：

- `~/.pi/agent/settings.json`：默认模型和模型范围
- `~/.pi/agent/models.json`：自定义模型或 OpenAI-compatible 接口
- `~/.pi/agent/models-store.json`：模型目录缓存，不保存密钥
- `~/.pi/agent/auth.json`：Pi 管理的 API Key 或 OAuth 登录信息
- 环境变量，例如 `OPENAI_API_KEY`

标准 OpenAI API Key 使用 `openai` provider；ChatGPT Plus/Pro 的 OAuth 使用 `openai-codex` provider，并需要先在 Pi 中执行一次 `/login`。本工具不会自动读取 Codex CLI 的认证文件。

## 推荐用法

### 1. 列出 Pi 当前可用的模型

不会发送模型请求，也不会消耗订阅额度：

```bash
pi-model-bench --list --lang zh
```

### 2. 检查当前模型

```bash
pi-model-bench --health --current --label home-wifi --lang zh
```

### 3. 检查全部已配置模型

健康检查默认每个模型只请求一次、最多输出 8 个 token：

```bash
pi-model-bench --health --all --label home-wifi --lang zh
```

如果 Pi 配置了 18 个可用模型，该命令会产生 18 次模型请求。命令行模式会立即开始；Pi 交互模式会先显示请求数量并要求确认。

### 4. 正式比较全部模型速度

```bash
pi-model-bench --speed --all --runs 3 --max-tokens 128 --label home-wifi --lang zh
```

例如，18 个模型运行 3 次会产生 `18 × 3 = 54` 次请求。建议先执行健康检查，再决定是否全量测速。

### 5. 只比较几个模型

```bash
pi-model-bench \
  --speed \
  --models provider/model-a,provider/model-b \
  --runs 5 \
  --max-tokens 128 \
  --label office-vpn \
  --lang zh
```

模型选择支持 `*` 和 `?` 通配符，例如：

```bash
pi-model-bench --health --models "provider/*max" --lang zh
```

### 6. 比较不同网络环境

保持模型列表、运行次数、提示词、thinking 和 max token 完全相同，只修改网络标签：

```bash
pi-model-bench --speed --all --runs 3 --max-tokens 128 --label home-wifi --lang zh
pi-model-bench --speed --all --runs 3 --max-tokens 128 --label office-vpn --lang zh
pi-model-bench --speed --all --runs 3 --max-tokens 128 --label mobile-5g --lang zh
```

每次运行会生成独立报表，可以对比首 token 的 p50/p95、生成速度和失败类型。

上述 shell 命令也可以在 Pi 交互界面中使用，只需把 `pi-model-bench` 换成 `/model-bench`。

## 参数说明

| 参数 | 说明 |
|---|---|
| `--current` | 测试当前模型；这是默认选择 |
| `--all` | 测试所有已配置且可用的模型 |
| `--scoped` | 测试 Pi `--models` 或 `enabledModels` 限定的模型 |
| `--provider NAME` | 测试指定 provider 下的全部可用模型 |
| `--models LIST` | 逗号分隔的模型 ID 或通配模式 |
| `--health` | 低消耗接口健康检查 |
| `--speed` | 流式速度测试；这是默认模式 |
| `--runs N` | 每个模型运行次数；健康检查默认 1，速度测试默认 3 |
| `--max-tokens N` | 最大输出 token；健康检查默认 8，速度测试默认 128 |
| `--timeout 30s` | 单次请求超时，默认 30 秒；支持 `ms`、`s`、`m` |
| `--delay 250ms` | 两次请求之间的等待时间 |
| `--thinking LEVEL` | `off|minimal|low|medium|high|xhigh|max` |
| `--label TEXT` | 网络环境标签，例如 `home-wifi` |
| `--output NAME` | 自定义报表文件名前缀；仍然只写当前目录 |
| `--prompt TEXT` | 覆盖内置固定测试提示词 |
| `--lang zh` | 中文终端提示和中文 Markdown 报表 |
| `--zh` | `--lang zh` 的快捷写法 |
| `--yes` | 在 Pi 交互模式中跳过多模型请求确认；shell 命令本身是非交互模式 |
| `--list` | 只列模型，不发送请求 |
| `--help` | 显示帮助 |

## 输出文件

一次测试会在当前目录生成三个同名文件：

```text
pi-model-bench-20260805T150000Z-home-wifi.md
pi-model-bench-20260805T150000Z-home-wifi.csv
pi-model-bench-20260805T150000Z-home-wifi.json
```

- Markdown：面向人工阅读；使用 `--lang zh` 时标题、表头、状态和指标说明均为中文
- CSV：每次请求一行，字段名保持英文，方便 Excel、Python、DuckDB 等工具处理
- JSON：包含完整结构化配置与结果，字段名保持英文，方便后续做趋势分析

## 指标含义

### 响应头耗时

从开始请求到收到 HTTP 响应头。该值主要反映连接、代理、服务端排队和请求预处理的一部分耗时。只有 provider 适配器提供响应回调时才能记录。

### 首 token 时间（TTFT）

从开始请求到收到第一个非空 `text_delta`、`thinking_delta` 或 `toolcall_delta`。空的 `text_start` 等生命周期事件不会被误算成首 token。

### 可见首 token 时间

从开始请求到第一个用户可见文本。对于先生成隐藏思考内容的推理模型，它可能明显高于普通 TTFT。

### 生成速度（Decode TPS）

计算公式：

```text
(output_tokens - 1) / (completion_time - first_output_time)
```

插件优先使用接口在流结束时报告的 output token 数。SSE 或 WebSocket 的一个网络分块不一定等于一个 token，因此不会简单地把 chunk 数当 token 数。

### 总耗时（E2E）

从开始请求到收到流式终止事件，代表用户等待整个响应完成的时间。

### p50 和 p95

- p50：中位数，适合表示通常体验
- p95：较慢尾部情况，适合发现偶发排队或网络抖动

只运行 1 次时，p50 和 p95 都只是该次样本。建议最少运行 3 次，认真比较网络时建议 5 次以上。

## 健康检查错误分类

中文 Markdown 会把错误归纳为：

- 鉴权失败
- 权限或订阅问题
- 额度或计费问题
- 请求限流
- 模型或接口不存在
- 无效请求
- 请求超时
- 网络错误
- 上游服务错误
- 空响应
- 请求中止
- 未知错误

provider 返回的原始错误摘要会经过密钥脱敏后保留，以便进一步排查。

## thinking 的注意事项

默认请求 `thinking=off`，目的是尽量单独比较网络、排队和 token 生成性能。但是部分推理模型或 provider 无法彻底关闭 thinking。报表会记录请求的 thinking 级别，不能保证所有模型都以完全相同的内部推理方式运行。

如果要比较实际 Agent 使用体验，可以额外运行：

```bash
pi-model-bench --speed --all --runs 3 --thinking high --label home-wifi-thinking-high --lang zh
```

不要把 thinking off 和 thinking high 的结果直接混在一起排名。

## 与 pi-token-speed 的关系

`pi-token-speed` 适合在日常聊天中实时显示当前回复的 TPS 和 TTFT。本插件侧重批量模型测试、订阅接口诊断、重复采样和报表落盘。两者用途不同，可以同时安装。

## 安全设计

- 直接调用 Pi 的模型注册表和认证解析，不要求复制 API Key
- API Key、Bearer Token 和认证请求头不会写入输出文件
- 错误消息在保存前会尝试移除常见密钥格式
- 报表不记录执行命令时的绝对工作目录
- 命令完成提示只显示相对文件名，不回显绝对工作目录
- `--output` 只接受文件名，最终文件始终保存在当前工作目录
- 多模型或大量请求在 Pi 交互模式下会要求确认
- shell 命令是非交互模式，会立即执行所选请求；全量测试前建议先运行 `--list` 和 `--health`
- 默认串行请求，不进行并发压力测试

如需服务端并发容量、恒定 QPS、Poisson 流量或高并发负载测试，应改用 GuideLLM 等专门工具，而不是本插件的单用户体验测试模式。
