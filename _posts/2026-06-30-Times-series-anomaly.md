---
layout: post
title: Time Series Anomaly Detection 
subtitle: 时序异常检测杂录
cover-img: /assets/img/Chronos-2-struct.png
thumbnail-img: /assets/img/thumb.png
share-img: /assets/img/Chronos-2-struct.png
tags: [ts anomaly]
category: agent
comments: true
mathjax: true
author: HuaC
---

## 一、vae+diffusion
架构原理
~~~
                    ┌──────────────┐
  时序窗口 x ──────►│   VAE Encoder │──► 潜变量 z (正常数据分布)
  (B,1,W)           └──────────────┘         │
                    ┌──────────────┐         ▼
  重构 x̂  ◄──────── │  VAE Decoder  │   ┌──────────────┐
                    └──────────────┘   │  DDPM 扩散   │
                                       │  (在 z 空间) │
                                       └──────┬───────┘
                                              ▼
                                   扩散去噪分数 score(z)
  异常分数 = α × VAE重构误差 + (1-α) × 扩散分数                              
~~~


核心思路：

1. VAE 将时序窗口压缩到低维潜空间 z，同时提供重构误差（异常样本重构差）
2. DDPM 扩散模型 在潜空间 z 上训练，学习正常数据的潜分布密度
3. 推理时：正常样本的 z 处于扩散模型学到的密集区域，去噪分数低；异常样本的 z 偏离正常流形，扩散分数高
   
两个信号融合，比单一 VAE 更鲁棒


## 二、 VAE + Isolation Forest + residual

| 模型/方法	| 核心优势 | 核心劣势 |	互补方式 |
| :------: |:---: | :---:  | :---: |
|VAE |	捕获非线性时序依赖、动态基线建模	| 对未在训练集中出现的突变模式敏感，易误报	| 提供动态重构基线，输出重构残差 |
| Isolation Forest |	无需假设数据分布、对多维空间点异常极度敏感 |	不考虑时序上下文（把时序打乱结果一样） |	在VAE提取的残差或特征空间上进行空间孤立 |
| 残差检测	| 计算极快、可解释性强（如 3-sigma） |	无法处理复杂非线性、易受噪声干扰	 | 作为最底层的基础防线，快速过滤明显异常 |


流程：原始时序 -> VAE重构 -> 计算残差序列 -> 将残差序列输入 Isolation Forest。
原理：VAE 负责把“正常的周期和趋势”过滤掉，Isolation Forest 负责在“纯净的残差空间”中寻找空间上的离群点。这比直接对原始数据跑 iForest 效果好得多。

