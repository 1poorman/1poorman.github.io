---
layout: post
title: 大模型加速技巧与机制
subtitle: kv cache、attention
cover-img: /assets/img/path.jpg
thumbnail-img: /assets/img/thumb.png
share-img: /assets/img/path.jpg
tags: [books, test]
author: HuaC
---

## KV Cache

标准注意力计算机制（单个头的输出）：
$$
\text{head}_i = \text{Attention}(Q_i, K_i, V_i) = \text{softmax}\left(\frac{Q_i K_i^\top}{\sqrt{d_k}} + M\right) V_i
$$
如公式所示，每输出一个token，需要获得此刻及之前的K、V矩阵，与当前的Q矩阵点积。在所有的token输出前，K、V矩阵不断累积且可复用，将之缓存可省却大量的计算。
Q则只有当前时刻有效，因此不必缓存。

## 一、 PagedAttention
vLLM 框架的核心创新技术，它彻底解决了大语言模型（LLM）推理中显存碎片化和KV Cache 管理低效的问题。

背景：

为了加速注意力机制计算，LLM通常采用的kv cache，这需需要动态分配显存。但请求长度未知，如果采用默认的提供最大长度的方式，会造成显存浪费以及产生大量无法利用的细小碎片，导致显存整体利用率很低（20%~30%）。

原理：
vLLM 将操作系统的分页思想引入到 GPU 显存管理中。

A. 非连续内存块 (Non-contiguous Blocks)，  化整为零
机制：KV Cache 不再需要连续的显存空间。它将 KV Cache 切分成固定大小的块（Blocks）（例如每个块包含 16 或 32 个 token 的 KV 数据）。
分配：当请求生成新 token 时，系统动态地分配一个空闲的物理块给该请求，而不是预先分配一大块。

B. 页表映射 (Page Table)
机制：维护一个页表（Block Table），记录每个请求的逻辑块（Logical Block）对应哪个物理显存块（Physical Block）。
查找：当 Attention 机制需要访问第 i 个 token 的 KV 值时，通过页表计算出它所在的物理块地址，然后去读取。
灵活性：同一个请求的逻辑块 1、2、3 可以分散在显存的任何位置，只要页表能索引到即可。

C. 共享与写时复制 (Copy-on-Write)
场景：在并行采样（Parallel Sampling，即同一个 Prompt 生成多个不同回答）或多轮对话中，多个请求可能共享相同的前缀。
机制：PagedAttention 允许不同的请求共享同一个物理块（只读）。只有当某个请求需要修改该块（写入新 token）时，系统才会复制一份新的物理块给它（写时复制）。
收益：极大地减少了重复数据的显存占用。

## 二、 Prefix Caching (RadixAttention)
SGLang 的灵魂。它将 LLM 推理从“每次都是全新的计算”转变为“增量计算”，特别适合上下文很长、重复内容很多的场景。如果输入的开头部分（Prefix）之前已经计算过，就直接复用之前的计算结果（KV Cache），跳过重复的矩阵运算，可视作KV Cache的场景拓展。

原理：
预填充（Prefill）：每次输出token的前置步骤，即之前的kv矩阵
在对话场景，System Prompt通常是必须的，每次推理时都会包括这一部分的tokens计算，追问时历史对话也必须包括，这部分计算往往是重复的，因此可以存储备用。

RadixAttention = PagedAttention (显存管理) + Radix Tree (智能缓存索引)：
前缀可以是任意长度，利用基数树（Radix Tree / Trie）数据结构来管理 KV Cache：
1. 插入（Insert）：当一个新的请求进来时，SGLang 会沿着树匹配最长的公共前缀。匹配到的部分直接从显存读取 KV，未匹配的部分（后缀）进行计算，并将新生成的 KV 作为新节点插入树中。
2. 复用（Reuse）：如果下一个请求的前缀与树上某条路径完全重合，直接定位到该节点，跳过所有计算。
3. 淘汰（Eviction）：当显存不足时，SGLang 会根据策略（如 LRU）修剪树的叶子节点，但会尽量保留根部的高频共享前缀（如 System Prompt）。

特点：
1. 任意前缀匹配：不仅能缓存 System Prompt，还能缓存多轮对话的历史、Few-shot 示例、甚至 RAG 检索到的长文档片段。
2. 动态适应：无论用户的输入顺序如何，只要前缀相同，就能命中缓存。
3. 显存高效：相同的前缀在显存中只存一份，多个对话共享同一块物理显存。
