---
layout: post
title: L2 多模型基准评测：时序异常检测全流程
subtitle: 预测轨 + 检测轨后端对比与工程选型
cover-img: /assets/img/Chronos-2-struct.png
thumbnail-img: /assets/img/thumb.png
share-img: /assets/img/Chronos-2-struct.png
tags: [ts anomaly]
category: Time Series 
comments: true
mathjax: true
author: HuaC
---



## 评测概览

> 生成日期：2026-09-23 ｜ 复现工具：`tools/bench_l2_models.py` ｜ 原始数据：`logs/bench_l2.json`
>
> 范围：L2 预测轨 4 个后端（GRU / PatchTST / TimesFM-2.5 / Chronos-2）+ 检测轨 2 个后端
> （VAE+孤立森林 / Anomaly-Transformer），覆盖准确性、模型大小、推理显存、推理速度四个维度。

## 一、硬件与系统环境

| 项 | 配置 |
|---|---|
| GPU | NVIDIA GeForce RTX 3090 ×4（24GB GDDR6X，本次测试固定使用 cuda:1） |
| GPU 驱动 | 580.126.09 |
| CPU | Intel Montage Jintide(R) C4215R，32 逻辑核（x86_64） |
| 内存 | 125 GB |
| 操作系统 | Linux 5.4.0-190-generic（Ubuntu 系） |
| Python | 3.10.20（conda env: mff_agent） |
| PyTorch | 2.9.0+cu130（CUDA 13.0，cuDNN 9.13.00） |
| transformers | 5.15.1 |
| 关键依赖 | accelerate 1.x（Chronos）、einops、scikit-learn、statsmodels、pandas/numpy |

说明：显存指标通过 `torch.cuda.memory_allocated / max_memory_allocated` 差值测量
（`torch.cuda.synchronize` 同步后读数），反映模型加载驻留与单次推理的**净增量**，
不含其他进程占用；速度指标含 GPU 同步耗时，warmup 后取均值。

## 二、数据集详情

全部来自 `simulator/` 物理机理仿真器（1Hz 采样，非随机数，严格满足热平衡/管网特性/
电气公式约束），经 `perception/quality.py` 三段式质量管控（时间戳对齐→异常剔除→加权插补）
后使用。15 列契约：12 个数值传感器 + timestamp + operating_condition（工况）+ fault_label（故障标注）。

| 数据文件 | 时长 | 行数 | 用途 |
|---|---|---|---|
| `data/simulated/train_48h.csv` | 48h | 172,800 | 预测准确性评估（训练分布段）+ AT/VAE 检测器训练集（仅正常工况前 86,400 条） |
| `data/simulated/normal_24h.csv` | 24h | 86,400 | 跨文件泛化评估 + 检测误报率（含 4 次工况切换，用于稳定段误报统计） |
| `data/simulated/mixed_faults_8h.csv` | 8h | 28,800 | 检测检出率（none 14,401 / filter_clog 3,600 / filter_clog+pump_cavitation 3,600 / 三重叠加 7,199） |
| `data/simulated/scale_12h.csv` | 12h | 43,200 | 预测缓变故障段评估（线圈结垢，出水温度缓升越限型） |

物理量纲：出水温度 ℃、压力 kPa、流量 L/s、电导率 µS/cm、湿度 %RH 等，单位与 L1 规则阈值
（`config/settings.yaml rules` 段）一致。故障注入类型 4 类：过滤器堵塞 / 水泵气蚀 / 管道泄漏 / 线圈结垢。

## 三、模型细节

### 3.1 预测轨（输入：出水温度单变量历史序列 → 未来 600s 预测）

| 后端 | 架构 | 参数量 | 权重文件 | 来源 | 关键配置 |
|---|---|---|---|---|---|
| `gru`（默认） | STL 分解 + GRU+attention 残差学习（预测相对末值持续基线的偏差）；**自动选型**：多变量权重存在则优先加载 `FastTrackMultivarForecaster`（`detection/fast_track_mv.py`，目标通道残差学习 + 5 个物理关联辅助通道 z-score 输入） | 24.2K（0.024M） | `models/fast_outlet_temp.pt`（单变量）/ `models/fast_outlet_temp_mv.pt`（多变量，`tools/train_fast_mv.py` 生成） | 项目自研 | window=16800s（4.6h，覆盖 8400s 工况周期），downsample=30，hidden=32 |
| `patchtst` | 通道独立 PatchTST（多参数联合预测，取 outlet_temp 列）；通道数消融变体见 6.1.1（`models/precise_uni.pt` 1 通道 / `models/precise_mv6.pt` 6 通道，`tools/train_patchtst_variants.py` 生成） | 7.02M | `models/precise.pt`（28MB） | 项目自研，同上训练 | window=7200s，horizon=1800s，4 参数联合（PREDICT_COLS：outlet_temp/inlet_temp/pressure/flow_rate，承担路由多参数服务角色） |
| `timesfm` | TimesFM-2.5 decoder-only 基础模型（transformers 移植版）。**单变量限制**：移植版 past_values 仅接受 (batch, seq_len)，不支持跨通道信息共享 | 231M | `timesfm/weights/`（925MB safetensors） | Google 官方预训练 | context=1024，固定输出 128 步（超出部分末值外推） |
| `chronos` | Chronos-2（T5 架构 encoder-decoder，patch 16，d_model 768，12 层 12 头）。**原生多变量**：(1, C, L) 张量跨变体信息共享，输出 (C, 21, pred_len) | 119M | `models/chronos-2/`（478MB safetensors） | Amazon 官方预训练 | context=1024（模型支持至 8192），一次输出 600 步，21 分位概率预测 |

**多变量输入契约**（`detection/forecaster.py::MV_FEATURES`，共 6 通道，物理依据——simulator 机理方程，覆盖「热源→换热→水力」链路）：

| 通道 | 物理关联 |
|---|---|
| `outlet_temp` | 目标变量 |
| `inlet_temp` | 热平衡边界 `T_out = T_in + Q/(c·ṁ)` |
| `flow_rate` | 冷却能力 ṁ（流量下降→温升增大，堵塞/泄漏直接特征） |
| `electric_power` | 热输入 P（`P=√3·U·I·cosφ`，加热功率比例调节） |
| `furnace_temp` | 炉体蓄热状态（炉体-水换热的温度梯度来源） |
| `pressure` | 管网阻抗 `P=P_s+R·Q²`（与流量强耦合，堵塞/气蚀判别依据） |

**全量变量清单与入选依据**（数据契约共 12 个数值传感器，`perception/ingest.py::NUMERIC_COLUMNS`）：

| 变量 | 含义 | 入选情况 | 理由 |
|---|---|---|---|
| `outlet_temp` | 出水温度（℃） | ✅ 全部模型（预测目标） | 预测/越限预警目标列 |
| `inlet_temp` | 进水温度（℃） | ✅ MV 6 通道 / PatchTST 4 通道 | 热平衡边界项，进出水温差直接决定冷却能力 |
| `flow_rate` | 流量（L/s） | ✅ MV 6 通道 / PatchTST 4 通道 | 冷却能力 ṁ，堵塞/泄漏的一阶特征 |
| `pressure` | 管网压力（kPa） | ✅ MV 6 通道 / PatchTST 4 通道 | 管网阻抗特性 `P=P_s+RQ²`，与流量强耦合 |
| `electric_power` | 电功率（kW） | ✅ MV 6 通道 | 热输入 `P=√3·U·I·cosφ`，炉温/水温的驱动力 |
| `furnace_temp` | 炉体温度（℃） | ✅ MV 6 通道 | 炉体蓄热状态，炉体-水换热的热源侧 |
| `electric_current` | 电流（A） | ❌ 未入选 | 由电功率确定性派生：`I=P/(√3·U·cosφ)`，U/cosφ 恒定，信息完全冗余 |
| `flow_velocity` | 流速（m/s） | ❌ 未入选 | 由流量确定性派生：`v=Q/A`（DN65 管面积 A=0.003318m² 常数），信息完全冗余 |
| `tank_level` | 水箱液位（cm） | ❌ 未入选 | 补水阀位式控制（1.9~2.1m 锯齿波动），与出水温度无直接物理耦合 |
| `conductivity` | 电导率（µS/cm） | ❌ 未入选 | 水质缓变量（漂移 ~0.5µS/cm/h），时间尺度远大于 600s 预测窗口 |
| `cabinet_temp` | 电气柜温度（℃） | ❌ 未入选 | 电气柜环境量，与水冷回路无耦合（凝露风险由独立模块预警） |
| `cabinet_humidity` | 电气柜湿度（%RH） | ❌ 未入选 | 同上（泄漏判据中作 L3 统计硬校验特征，非预测输入） |

选取原则：保留「与目标存在因果物理关联且时间尺度匹配」的通道，剔除确定性派生量
（信息冗余只会引入共线噪声）；被剔除变量在异常检测轨（VAE/AT 的 FEATURE_COLS 含
全部 10 通道）与 L1/L3 规则推理中仍各司其职。

引擎输入契约升级：`ForecastEngine.forecast()` 接受 `pd.Series`（单变量，向后兼容）
或 `pd.DataFrame`（多变量），各后端按能力取用；`stream_step` 已改为传完整 DataFrame。

训练信息：GRU/PatchTST 在 train_48h 前 36h/24h 正常工况上训练（残差学习是 GRU 精度关键：
直接预测原始序列 MAPE 10%，残差学习后 1%）；TimesFM/Chronos 零样本，不做任何微调。

### 3.2 检测轨（输入：10 通道传感器滑动窗口 → 0~1 异常分，>0.6 判异常）

| 后端 | 架构 | 参数量 | 权重文件 | 训练数据 |
|---|---|---|---|---|
| `vae` | VAE（enc 600→32→16，latent 8）+ 孤立森林（残差特征空间），融合分 0.5·VAE+0.5·IF | 82K（0.082M） | `models/fast_anomaly.pkl`（1.3MB） | train_48h 前 24h 正常工况，10 epochs |
| `anomaly_transformer`（默认） | Anomaly-Transformer（enc_in=10，d_model=512，8 头，3 层；重构误差 + 关联差异双维 max 融合） | 4.77M | `models/at_anomaly.pt`（29.5MB） | 同上数据，3 epochs（184s，minimax 策略对齐官方 solver） |

Anomaly-Transformer 两个关键工程裁定（与官方 repo 的差异，详见 `detection/anomaly_transformer.py` 头注）：
1. **全局 z-score 归一**替代官方逐窗口 min-max：本项目故障为缓变漂移型，逐窗口归一会把幅值漂移在窗内抹平；
2. **max 融合**替代加权均值：加权均值在单维饱和时融合分上限只有 0.5，永远够不到 0.6 阈值。
`Anomaly-Transformer/checkpoints/MSL_checkpoint.pth` 为 MSL 数据集（55 通道）基准权重，与本项目 10 通道不兼容，仅作复现参考。

## 四、代码改造记录

| 文件 | 改动 |
|---|---|
| `detection/forecaster.py` | 新增 `ChronosBackend`（本地源码 sys.path 注入 + 张量接口 + 0.5 分位输出）；注册进 `ForecastEngine.BACKENDS`；`_load()`/`backend_window()` 支持 chronos。**多变量改造**：新增 `MV_FEATURES` 契约与 `_as_series()`；`forecast()` 接受 Series/DataFrame；`GRUBackend` 自动识别单变量/多变量模型（`_load_fast_model`）；`PatchTSTBackend` DataFrame 输入直接取真实多参数列（替代零填充）；`ChronosBackend` 多变量 (1,C,L) 输入；新增 `backend_features()` |
| `detection/fast_track_mv.py` | （新增）`FastTrackMultivarForecaster`：目标通道残差学习 + 辅助通道 z-score，GRUAttention input_size=1+5 |
| `Anomaly-Transformer/model/attn.py` | 去除硬编码 `.cuda()`：距离矩阵改 `register_buffer`、prior 跟随 sigma 设备（CPU 推理可用、多卡 device 对齐） |
| `detection/anomaly_transformer.py` | （上轮新增）AT 检测器封装；本轮无改动 |
| `config/settings.yaml` + `config/settings.py` | detection 段新增 `chronos_weights`/`chronos_context`/`fast_mv_model`；`forecast_model` 注释更新为四选一 |
| `server/service.py` | `ForecastEngine` 构造透传 chronos/fast_mv 参数（`cfg.paths.resolve` 解析相对路径）；`stream_step` 预测传完整 DataFrame |
| `server/api.py` | `GET /api/v1/forecast-model` 可用列表加 chronos；`POST /api/v1/upload` 表单与 WS `StreamRequest` 描述更新；WS 切换校验列表加 chronos |
| `tools/bench_l2_models.py` | （新增）双任务基准工具；预测轨支持 uni/MV 对比（gru_mv / chronos_uni / chronos 六组），详见第六节 |
| `tools/train_fast_mv.py` | （新增）多变量快轨训练工具（对齐 MS3 协议：window 16800、downsample 30、36h 数据） |
| `tools/train_patchtst_variants.py` | （新增）PatchTST 通道数消融训练工具（1/6 通道，协议对齐 MS3） |
| `requirements.txt` | 新增 `accelerate>=1.1.0,<2`、`einops>=0.7`（Chronos 依赖） |
| `README.md` | L2 预测模型表、多变量说明、配置示例、目录结构、基准对比章节 |

统一输出契约不变：`{horizon_s, end_value, max_value, min_value, series, method}`；
切换方式不变：Demo 下拉框 / WS `forecast_model` 参数 / `POST /api/v1/upload?model=chronos`，
加载失败自动降级 GRU。

## 五、评测方法学

**预测轨**（目标列 outlet_temp，步长 horizon=600s）：
- 准确性 MAPE = mean(|pred−actual|/|actual|)，末端 3 个评估窗口（间隔 1200 条）均值；
  三个数据集分别报告（训练分布段 / 跨文件正常段 / 缓变故障段）；
- 速度：warmup 1 次 + 5 次均值（毫秒，含 CUDA 同步）；
- 显存：加载增量（from_pretrained/权重载入净增驻留）+ 单次推理峰值（reset_peak 后推理的净增峰值）。

**检测轨**（窗口输入，阈值 0.6）：
- 检出率 = 混合故障数据 fault_label≠none 段中异常分>阈值比例；
- FAR = normal_24h 全量误报率；稳定段 FAR = 剔除工况切换 600s 邻域后的误报率；
- 速度：单窗口（120 条，对应 `stream_step` 实时流口径）20 次均值 + 批量 2000 条单次。

## 六、完整结果

### 6.1 预测轨（device=cuda:1，含单变量 vs 多变量对比）

多变量输入 = 6 通道物理关联参数（见 3.1 节 MV_FEATURES：outlet_temp 目标 +
inlet_temp / flow_rate / electric_power / furnace_temp / pressure 辅助通道）。

| 模型 | 输入 | 输入窗口(条) | 参数量(M) | 磁盘(MB) | 加载显存(MB) | 推理峰值显存(MB) | 延迟(ms) | MAPE 训练分布(%) | MAPE 跨文件正常(%) | MAPE 缓变故障(%) |
|---|---|---|---|---|---|---|---|---|---|---|
| gru 单变量 | 单变量 | 16800 | 0.024 | 0.10 | 0.10 | 9.6 | **1.06** | 1.14 | 8.64 | 10.54 |
| gru_mv 多变量快轨 | 6 通道 | 16800 | 0.024 | 0.10 | 0.10 | 9.6 | 1.90 | 1.45 | **4.44** | 10.97 |
| patchtst | 4 通道 | 7200 | 7.02 | 28.10 | 28.1 | 0.61 | 3.07 | 3.05 | 4.50 | **8.44** |
| timesfm | 单变量 | 1024 | 231.29 | 925.19 | 925.2 | 6.09 | 86.30 | 1.02 | 8.74 | 10.65 |
| chronos 单变量 | 单变量 | 1024 | 119.48 | 477.94 | 478.2 | 5.41 | 29.66 | 0.99 | 8.73 | 11.25 |
| chronos 多变量 | 6 通道 | 1024 | 119.48 | 477.94 | 478.2 | 26.0 | 30.80 | **0.91** | 8.54 | 10.81 |

单变量 vs 多变量对比结论：
- **快轨 GRU**：多变量辅助通道把跨文件泛化 MAPE 从 8.64% → **4.44%**（-49%），
  训练分布内 1.14% → 1.45%（轻微让步，训练分布内单变量残差学习已近最优）；
  参数量/显存/延迟几乎不变（输入通道 1→6，hidden 不变），仍是边缘最优。
- **Chronos-2**：多变量全面小幅优于单变量（训练分布 0.99%→**0.91%**，跨文件
  8.73%→8.54%，故障段 11.25%→10.81%），推理峰值显存 5.4MB→26MB（6 通道联合），
  延迟基本不变。
- 机理与结果一致：辅助通道携带「热源→换热→水力」联动状态（如功率升+流量降），
  在训练分布外的工况漂移段（跨文件评估）贡献最大；分布内单变量自回归信息已充足。

### 6.1.1 PatchTST 通道数消融（1/4/6 通道）

4 通道为历史选型（`PREDICT_COLS` 定义于精轨设计期，取 L1 规则覆盖的 4 个关键参数，
早于多变量分析），此前未做通道数消融。补充实验（训练协议与 MS3 精轨完全一致：
window=7200、horizon=1800、epochs=3、train_48h 前 24h，仅通道组合不同，
`tools/train_patchtst_variants.py`）：

| 变体 | 通道 | 参数量 | 延迟(ms) | MAPE 训练分布(%) | MAPE 跨文件正常(%) | MAPE 缓变故障(%) |
|---|---|---|---|---|---|---|
| patchtst_uni | 1（outlet_temp） | 7.02M | 2.5 | 3.23 | **4.08** | **7.13** |
| patchtst（现有基线） | 4 | 7.02M | 2.7 | 3.05 | 4.50 | 8.44 |
| patchtst_mv6 | 6 | 7.02M | 2.9 | 3.38 | 4.09 | 11.02 |

**结果与机理（重要架构发现）**：
- PatchTST 为**通道独立（channel-independent）**架构：各通道作为独立样本流经
  共享编码器（`x.reshape(B*C, ...)`），推理时辅助通道**不会向目标通道注入信息**，
  仅在训练期增加共享容量的样本数（类正则化/稀释效应）；
- 因此加通道不带来协变量收益，反而在分布漂移下伤害目标通道：缓变故障段
  7.13%（1ch）→ 8.44%（4ch）→ 11.02%（6ch），通道越多稀释越重；
- 对照组印证：GRU 为**联合输入**架构（辅助通道直接进 GRU 输入维）→ 多变量
  收益巨大（8.64%→4.44%）；Chronos-2 用**跨变量注意力**共享 → 收益温和但全面为正。
  「多变量是否有用」取决于架构是否存在真实的跨通道信息注入，不能一概而论。

**工程结论**：
1. `precise.pt` 保留 4 通道的理由不是 outlet_temp 精度，而是其**多参数服务角色**——
   模型路由用精轨同时产出 inlet_temp/pressure/flow_rate 的 30min 预测（MS3 验收
   要求各通道 <5%），单通道变体无法承担该职责；
2. 对 outlet_temp 单目标预测，patchtst_uni（1 通道）在三个评估段均为 PatchTST
   系最优（缓变故障 7.13% 为全部 8 组配置最优），可作为单目标精轨后端备选；
3. 不要为 PatchTST 增加 6 通道版本（无收益且漂移段显著退化）。

### 6.2 检测轨（device=cuda:1）

| 模型 | 窗口(条) | 参数量(M) | 磁盘(MB) | 加载显存(MB) | 批量推理峰值显存(MB) | 检出率 | FAR 全量 | FAR 稳定段 | 单窗口评分(ms) | 批量2000条(ms) | 故障峰值分 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| vae | 60 | 0.082 | 1.33 | 0.33 | 18.7 | **99.90%** | 0.62% | 0.03% | 8.8 | **34** | 0.92 |
| anomaly_transformer（默认） | 100 | 4.77 | 29.47 | 29.4 | 2822.1 | 99.77% | **0.36%** | **0.00%** | 8.5 | 305 | 1.00 |

注：AT 故障段检出分布更极端（超阈即饱和到 1.0，三类故障峰值分均为 1.00），
全量检出率 99.77% 的差距来自混合故障段首尾各 1~2 个窗口的边界效应，非判别力差异。

## 七、结论与选型建议

1. **多变量输入收益明确**：快轨 GRU 加入 5 个物理关联辅助通道后，跨文件泛化
   MAPE 8.64%→4.44%（-49%），参数量/显存/延迟几乎不变；Chronos-2 多变量在三个
   评估段全面小幅占优。机理一致：辅助通道携带「热源→换热→水力」联动状态，
   分布外漂移段收益最大。
2. **预测**：基础大模型（TimesFM/Chronos）训练分布内精度与自研 GRU 持平（~1%），
   但权重/显存大 2~4 个量级、延迟高 30~90 倍——**多变量快轨 GRU 是边缘常驻的
   最优工程权衡**（泛化 4.44% 已接近 PatchTST 的 4.50%，且延迟仅 2ms）；
   **PatchTST 缓变故障段最佳**（8.44%）。
3. **Chronos-2 的差异化价值**：训练分布内精度最佳（多变量 0.91%）+ 21 分位概率
   区间（可做不确定性预警：分位带宽扩大可作为置信度信号）、延迟 31ms 仅为
   TimesFM 的 1/3。
4. **检测**：Anomaly-Transformer 误报更低（0.36% vs 0.62%，稳定工况段零误报）、
   单窗口评分更快（8.5ms），作为默认异常轨成立；批量评分显存较重（2000 窗 2.8GB），
   但实时流单窗口（120 条）仅 8.5ms/低显存，不受影响。
5. **实时流预算**：所有模型延迟（≤86ms）均满足实时流 60s 节流（`stream_l2_interval`），
   四个预测后端（GRU 自动多变量）+ 两个检测后端均支持运行时即切即用。

## 八、复现

```bash
conda activate mff_agent
python -u tools/train_fast_mv.py                     # 训练多变量快轨（如未训练）
python -u tools/bench_l2_models.py                   # 全部（预测轨 + 检测轨）
python -u tools/bench_l2_models.py --task forecast   # 仅预测轨
python -u tools/bench_l2_models.py --task detect --models vae   # 仅检测轨子集
# 结果写 logs/bench_l2.json（本报告数值来源）与 logs/bench_l2.log
```

依赖前提：`models/fast_outlet_temp.pt`、`models/fast_outlet_temp_mv.pt`
（`tools/train_fast_mv.py` 生成）、`models/precise.pt`、`models/fast_anomaly.pkl`、
`models/at_anomaly.pt`（`tools/train_anomaly_transformer.py` 生成）、`timesfm/weights/`、
`models/chronos-2/`。
