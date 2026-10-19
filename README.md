# moon_zod_lab

MoonZod 的独立验证实验室：JSON Schema 导出验证、跨语言验证吞吐量、命名 Schema 收集／排序／导出性能，以及 Zod / Pydantic JSON Schema 生成对比。

## 快速开始

本仓库独立运行，通过 Mooncakes 获取 `Betterlol/moon_zod` 的发布版本。需要 MoonBit 工具链、Node.js 22+ 和 Python 3.12+。

```powershell
cd moon_zod_lab
npm ci
moon add Betterlol/moon_zod@0.9.0
moon build --target js --release
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
npm run test:harness
npm run test:moon
npm test
npm run bench:validation:smoke
npm run bench:named:smoke
```

macOS / Linux 使用 `.venv/bin/python` 安装 Python 依赖；基准脚本自动优先选择本仓库的虚拟环境。`PYTHON` 可指定其它 Python 可执行文件。

模块依赖由 `moon add` 写入 `moon.mod`：

```text
import {
  "Betterlol/moon_zod@0.9.0",
}
```

各包在 `moon.pkg` 中用 `import` 引用需要的 API，例如：

```text
import {
  "Betterlol/moon_zod/core",
  "Betterlol/moon_zod/exporters",
}
```

复现结果时使用 `moon.mod` 声明的版本。升级时运行 `moon add --upgrade Betterlol/moon_zod@<version>`，然后重新执行功能验证和性能测试。

## 功能验证

`npm test` 直接构造 MoonZod Schema，把导出结果交给 Ajv draft 2020-12：

- 验证 meta-schema、引用解析和正反样例。
- 覆盖完整、named、skeleton 模式，以及命名引用、选择性导出、组合类型与字段约束。
- 固定官方 JSON Schema Test Suite 的提交及校验和；测试离线读取本地资源。
- 报告通过、失败、预期失败、不支持和语义差异，未声明的回归导致非零退出。

官方用例需要匹配 MoonZod 的能力，并用工厂直接构造。这里不声称完整实现 JSON Schema 规范，也不依赖导入器往返证明导出正确。

`Strip` 在运行时可以接受并删除多余字段，导出却使用 `additionalProperties: false`。因此输入接受行为并不完全相同。skeleton 会省略约束，transform / preprocess / refine 也不能一般性地转换为 JSON Schema；报告必须保留这些差异，不能把它们当作全面一致的证明。

官方资源由 `npm run fixtures:sync` 显式刷新；它只下载清单指定的固定提交。更新提交后须检查适配器、预期结果及许可证。

## 性能测试

```powershell
npm run bench:validation
npm run bench:named
```

验证基准包含本仓库的 `bench_cross_lang` 和 `cmd/validation` 入口。共享同一份输入数据，涵盖有效数据、错误数据和多余字段；手写验证器只作为近似性能参考。

命名基准默认测试 `100 / 200 / 500` 个命名 Schema，覆盖独立节点、链、树、共享依赖 DAG。命名节点总数和依赖顺序均检查，分阶段测量：

- `collect_named_schemas()`；
- `topological_sort_schemas()`（输入集合预先构造）；
- JSON Schema named 导出及 JSON 序列化；
- Prompt 和 MoonZod 源码生成；
- 等价图模型的 Zod / Pydantic JSON Schema 导出及序列化。

运行参数以各脚本的 `--help` 为准。默认使用 JS release，以方便与 Zod 同运行时比较；`MOON_TARGET=native` 可测本地编译目标，需要本地编译器。跨运行时比值始终包含运行时差异。

模型构造、编译和子进程启动位于操作计时之外；报告保存实际安装的 MoonZod 发布版本、工具链版本、样本统计和输出规模。当前 MoonBit `core/bench` 的 `mean` 已是每次操作的微秒数：`ns/op = mean * 1000`，`ops/s = 1e6 / mean`，不能再除以 `batch_size`。

首版用于建立基线。比较优化前后结果时使用同一机器、工具链、运行目标、依赖和工作负载；不要用共享 CI 的绝对耗时作为发布门槛。1000 / 2000 压力规模可以另行运行，长链的传递依赖遍历可能明显增加耗时。

## 报告与开发

运行报告写入 `reports/`，不提交生成结果；需要长期保存的基线可另存入文档或 CI artifacts。

```powershell
moon check --target js
moon test --target js
moon info -p Betterlol/moon_zod_lab
moon fmt cmd/export-fixtures cmd/validation cmd/named bench_named
```

查看生成的 `.mbti` 差异，再确认代码和外部验证通过。发现库问题时，记录依赖版本和最小复现用例。

GitHub CI 根据 `moon.mod` 下载发布依赖，运行功能测试和基准 smoke，将 JSON 报告保存为 artifacts。初始设置使用 `hustcer/setup-moonbit@v1` 的默认工具链，报告记录实际版本；复现严格历史基线时还需固定工具链版本。

## 参考

- [MoonBit 依赖管理](https://docs.moonbitlang.com/en/latest/toolchain/moon/module.html)
- [JSON Schema Test Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite)
- [JSON Schema 官方示例](https://json-schema.org/learn/miscellaneous-examples)
- [Ajv 规范版本](https://ajv.js.org/json-schema.html)
- [Zod JSON Schema 导出](https://zod.dev/json-schema)
- [Pydantic JSON Schema 导出](https://docs.pydantic.dev/latest/concepts/json_schema/)
