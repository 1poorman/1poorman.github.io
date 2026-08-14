---
layout: post
title: Some Open Vocabulary Models
subtitle: 简要说明几个经典的开放词汇检测模型
tags: [OWM, clip]
category: 开放词汇检测
comments: true
mathjax: true
author: HuaC
---

## 一、 YOLOE-26

yolo26和yoloe的结合，将实时目标检测与开放词汇，在推理阶段可以通过文本、视觉或无提示，动态检测训练时未见过的对象。

### 1.1 结构与创新

**NMS-Free端到端设计：**无需对多余的候选框进行NMS，直接输出置信度最高的候选框，消除了传统后处理的延迟和启发式复杂性，确保了推理的确定性和实时性。
**对象嵌入头：**取消传统的固定类别分类头，转而每个检测锚点生成一个连续的语义嵌入向量，通过嵌入向量与文本嵌入的余弦相似度，实现开放词汇的识别。
**开放词汇核心模块：**

1. **可重参数化区域-文本对齐（RepRTA）:**在训练时使用轻量级辅助网络优化文本嵌入以对齐视觉特征；在推理时，该网络会被重参数化并直接折叠到主模型中，实现零额外推理开销的文本提示检测。
2. **语义激活视觉提示编码器 (SAVPE)：**一个轻量级的编码分支，允许用户通过提供参考图像的边界框或掩码，让模型快速学习并检测视觉上相似的对象（即 One-shot 检测能力） 。
3. **惰性区域-提示对比 (LRPC)：**在无提示（Prompt-Free）模式下，模型利用内置的大型词汇表（如包含数千个类别的 RAM++ 标签集），先通过对象性嵌入筛选出候选区域，再懒加载匹配类别名称，大幅降低了开放词汇检索的计算成本。

### 1.2 使用示例

无提示分割:

~~~
yolo predict model='yoloe-261-seg-pf.pt' source='test.png'
~~~

有提示：
~~~
yolo predict model='yoloe-261-seg.pt' prompt='文本或视觉坐标' source='test.png' --class= 'cat, dog'
~~~

## 2. YOLO-World

开放词汇目标检测（OVD） 的先驱。它成功证明了可以将 CLIP 等视觉语言模型的开放词汇能力“蒸馏”并加速到 YOLOv8 中，实现实时的**文本驱动检测**。

## 3. RAM（recognite anything model）系列

[代码](https://github.com/xinyu1205/recognize-anything)


## 4. RAM-Grounding-SAM

[代码](https://github.com/IDEA-Research/Grounded-Segment-Anything)
