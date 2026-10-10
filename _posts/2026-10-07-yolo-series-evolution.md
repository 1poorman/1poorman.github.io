---
layout: post
title: "YOLO 系列演进：从网格回归到端到端检测"
subtitle: 梳理 YOLOv1–v13、YOLOX 与 YOLO26 的版本变化、结构创新和训练机制
category: 模型与视觉
tags: ["YOLO", "目标检测", "多尺度特征", "样本分配", "NMS"]
author: HuaC
kind: analysis
topics: [models-vision]
summary: 按技术路线梳理 YOLO 各代变化，详细解释多尺度融合、Anchor-free、标签分配、DFL、重参数化、PGI 与端到端去 NMS。
mathjax: true
---

YOLO 的演进可以沿着三个问题理解：**特征能否看清目标，训练能否把正确的监督交给预测位置，推理能否以较低成本输出不重复的检测结果。** 单看 Backbone 名称，往往会漏掉真正影响精度与部署的变化。

本文以公开论文、作者仓库和官方配置为依据，资料核对日期为 **2026-10-07**。覆盖已经公开的代表性版本与分支；不把预告中的型号作为已发布模型。文中的公式用于解释机制，实际损失权重、分配规则和模块数量应以指定仓库与配置为准。本文是原理综述，没有进行跨版本统一实测。

## 1. 先分清谱系：YOLO 不是一个团队连续发布的十三代产品

YOLOv1、v2、v3 来自 Joseph Redmon 等人的工作；YOLOv4 来自 Alexey Bochkovskiy、Chien-Yao Wang、Hong-Yuan Mark Liao 等人；YOLOv5、v8、YOLO11、YOLO26 是 Ultralytics 路线。YOLOX 来自旷视，YOLOv6 来自美团，YOLOv7/v9 来自 Wang 等人的研究，YOLOv10 来自清华团队，YOLOv12/v13 又是独立研究分支。

因此，编号变大不代表直接继承前一编号，也不意味着所有任务、硬件和数据集上的效果都更好。Ultralytics 能加载一个模型，也不等于该模型由 Ultralytics 原创。

| 版本／分支 | 时间 | 相比既有方法的主要变化 | 应重点理解的机制 |
| --- | --- | --- | --- |
| YOLOv1 | 2015，CVPR 2016 | 将检测统一为一次前向的网格回归 | 网格责任分配、联合分类与定位 |
| YOLOv2 / YOLO9000 | 2016，CVPR 2017 | 引入聚类 Anchor、直接位置预测、高分辨率与多尺度训练 | 几何先验、稳定的框参数化；WordTree 联合训练 |
| YOLOv3 | 2018 | Darknet-53、残差结构、三个尺度预测 | 跨尺度语义融合、独立类别预测 |
| YOLOv4 | 2020 | CSPDarknet53、SPP、PAN 及系统化训练组合 | 减少冗余梯度、扩大感受野、训练收益与推理成本的区分 |
| YOLOv5 | 2020 起持续迭代 | PyTorch 工程体系、AutoAnchor、C3、SPPF、部署工具链 | 结构和训练配方的协同优化 |
| YOLOX | 2021 | Anchor-free、解耦头、SimOTA | 分类／定位分工、动态正样本分配 |
| YOLOv6 | 2022–2023 | 面向工业部署的 EfficientRep、Rep-PAN、解耦头 | 重参数化、硬件友好计算；后续加入锚框辅助训练与蒸馏 |
| YOLOv7 | 2022 | E-ELAN、模型缩放、可训练的免费优化策略 | 梯度路径设计、辅助头监督、计划式重参数化 |
| YOLOv8 | 2023 | C2f、Anchor-free 解耦头、任务对齐分配和分布式框回归 | TAL、IoU 损失、DFL |
| YOLOv9 | 2024 | GELAN 与可编程梯度信息 PGI | 在训练中缓解信息丢失，改善梯度质量 |
| YOLOv10 | 2024 | 一对多／一对一一致双分配，面向去 NMS 的结构设计 | 训练监督密度与推理输出唯一性的解耦 |
| YOLO11 | 2024 | C3k2、C2PSA 等结构调整，继续完善多任务体系 | 局部卷积与部分注意力的组合 |
| YOLOv12 | 2025 | Area Attention、R-ELAN | 限制注意力范围以控制成本，稳定深层训练 |
| YOLOv13 | 2025 | HyperACE、FullPAD、深度可分离模块 | 多尺度高阶关系建模与全流程特征分发 |
| YOLO26 | 2026 | DFL-free、可选端到端头、Progressive Loss、STAL、MuSGD | 减少检测头与后处理成本，调整双头训练重点 |

YOLOv5、YOLO11、YOLO26 等项目会持续修改默认行为。阅读“某版本机制”时，最好同时记录软件版本、权重名称、训练配置和导出参数，而不只记录模型大版本。

## 2. 一个现代 YOLO 检测器到底在计算什么

![现代 YOLO 的特征提取、多尺度融合、预测头与两类后处理路线]({{ '/assets/img/yolo-evolution-pipeline.svg' | relative_url }})

*图为机制示意。不同版本的网络层数、预测头和训练分支并不完全相同。*

### 2.1 Backbone、Neck 和 Head 的分工

Backbone 从图像提取由浅到深的特征。浅层分辨率高，保留边缘、纹理和位置；深层感受野大，语义更强，但小物体可能只剩几个特征点。

Neck 融合不同层级的特征。典型 FPN 从深层向浅层传递语义，PAN 风格路径又把浅层定位信息向深层传递。Head 在这些特征位置上输出类别分数和边界框，有些版本还单独输出 Objectness。

以输入 640×640、输出步长 8/16/32 为例，三个尺度共有：

$$
80^2+40^2+20^2=8400
$$

个预测位置。Anchor-based 模型每个位置还可能展开多个 Anchor；Anchor-free 模型也仍有网格点或参考点，**去掉 Anchor 尺寸模板不等于去掉空间坐标体系**。

高分辨率预测层更适合保留小目标线索，但会增加激活、候选数量和计算量。增加 P2 检测层、提高输入尺寸、切片推理都可能改善小目标召回，收益与代价需要分别测量。

### 2.2 检测训练最容易被忽略的环节：谁负责哪个目标

一张图中可能只有十几个真实物体，却有数千个预测位置。训练前必须决定：

1. 哪些预测位置是某个真实框的正样本；
2. 多个真实框争用同一位置时怎样消解冲突；
3. 哪些位置作为背景，哪些位置忽略；
4. 分类分数是否要反映框的定位质量。

这些问题共同构成标签分配。它会改变网络实际接收到的监督，因此“结构不变、只改分配策略”也能显著改变检测效果。

## 3. YOLOv1 → v3：从统一回归到多尺度检测

[![YOLOv1 的网格回归、YOLOv2 的 Anchor 与 Passthrough、YOLOv3 的多尺度检测架构]({{ '/assets/img/yolo-v1-v3-architecture.svg' | relative_url }})]({{ '/assets/img/yolo-v1-v3-architecture.svg' | relative_url }})

*按 [v1][v1]、[v2][v2]、[v3][v3] 原论文重绘的主要结构，省略重复卷积层。本文架构图均可点击查看原尺寸。*

### 3.1 YOLOv1：一次看整张图，联合预测位置和类别

[YOLOv1 原论文][v1]将图像划成 $S\times S$ 网格。目标中心落在哪个网格，该网格就负责预测该目标。每个网格预测 $B$ 个框及其置信度，并共享一组类别概率，输出规模为：

$$
S\times S\times(5B+C)
$$

其中五个框相关量为位置、宽高和置信度。经典设置 $S=7,B=2,C=20$ 对应 7×7×30 的输出。

框置信度被定义为：

$$
\Pr(\text{Object})\cdot \operatorname{IoU}(b,\hat b)
$$

类别条件概率再与框置信度组合得到类别相关分数。模型同时处理定位、前景／背景和分类，把原来分散的检测步骤变成统一学习问题。

早期损失主要使用平方误差。宽高采用平方根形式，意图减轻大框尺寸对损失的支配，并提高小框尺寸误差的重要性；坐标项和无目标项使用不同权重，缓解背景位置数量远大于前景的失衡。

局限也来自这种表示：一个网格共享类别预测、只提供有限框，密集小目标和相邻目标容易冲突；平方误差也不直接等价于检测所关心的 IoU。这里的贡献是统一回归范式，并不是从此解决了所有定位问题。

### 3.2 YOLOv2：用数据决定几何先验

[YOLOv2][v2]引入宽高聚类得到 Anchor。聚类距离采用 $1-\operatorname{IoU}$，目的是找出对训练集真实框更合适的形状模板，而不是按像素欧氏距离偏向大框。

相对于网格左上角 $(c_x,c_y)$ 和 Anchor 尺寸 $(p_w,p_h)$，典型解码方式为：

$$
b_x=\sigma(t_x)+c_x,\quad b_y=\sigma(t_y)+c_y
$$

$$
b_w=p_w e^{t_w},\quad b_h=p_h e^{t_h}
$$

这里坐标位于特征网格坐标系，换到输入图像坐标还需要乘以步长。中心偏移经过 sigmoid，被限制在网格附近；宽高以 Anchor 为基准做乘性调整。合理的先验减少了回归难度，也让训练初期更稳定。

配合 Batch Normalization、高分辨率分类预训练、Passthrough 特征融合和多尺度训练，YOLOv2 同时改善了精度与适应性。多尺度训练指训练时改变输入尺寸，让同一网络学会应对不同分辨率；它与同时输出多个预测尺度并不是同一个概念。

YOLO9000 的额外贡献是 WordTree：将类别组织为层次树，利用检测数据学习定位、利用分类数据扩展语义类别。其联合训练依赖类别层级和数据组织，不能简单理解成后来基于文本提示的开放词汇检测。

### 3.3 YOLOv3：让浅层定位和深层语义在多个尺度相遇

[YOLOv3][v3]以 Darknet-53 和残差连接增强特征提取，在三个尺度进行预测。深层特征上采样，与较浅层特征拼接，再进行检测，使较高分辨率特征也能使用较强语义。

分类部分改用独立 logistic 分类器，而非强制类别互斥的 Softmax。Objectness 仍负责表达该候选是否包含目标。独立类别预测能够表达类别之间的非互斥关系，但数据标注和训练目标仍决定模型实际会学到什么。

这一阶段形成了长期影响 YOLO 的基础结构：**多尺度卷积特征＋跨层融合＋密集预测**。后续许多改进都建立在这个框架上。

## 4. YOLOv4 / v5：从单个模块创新到整套系统优化

[![YOLOv4 与后期 YOLOv5 的 Backbone、SPP 或 SPPF、多尺度 Neck 和 CSP 分流架构]({{ '/assets/img/yolo-v4-v5-architecture.svg' | relative_url }})]({{ '/assets/img/yolo-v4-v5-architecture.svg' | relative_url }})

*依据 [YOLOv4][v4] 与 [YOLOv5 发布记录][v5]整理。v5 展示采用 C3／SPPF 的代表配置；下方 CSP 图是分流与聚合原理，不是所有 CSP 变体的逐层定义。*

### 4.1 CSP 为什么能减少重复计算

[YOLOv4][v4]采用 CSPDarknet53。CSP 将输入通道分成两条路径：一部分经过较重的变换，另一部分保留较短路径，最后融合。

用简化形式表示：

$$
Y=G\bigl(\operatorname{Concat}(F(X_1),X_2)\bigr)
$$

重点在于让不同特征经过不同计算和梯度路径，减少所有通道反复进入同一重模块的冗余。它也保留了较直接的信息通道，有助于兼顾优化难度与推理成本；不能把它解释成“通道切半，所以精度不变、计算恰好减半”。

### 4.2 SPP、PAN 与免费训练收益

SPP 使用不同尺度的池化汇集更大范围的上下文，并保持空间输出可拼接。PAN 路径则加强不同尺度之间的信息传递。

YOLOv4 将优化分成两类：

- **Bag of Freebies**：训练时使用、通常不增加推理网络开销的策略，如 Mosaic、数据增强和更合适的训练目标。
- **Bag of Specials**：改善精度但可能增加部分推理代价的模块，如 SPP、某些特征融合或激活设计。

Mosaic 将多张图像组合为训练样本，改变目标尺度和场景上下文，使模型见到更丰富的组合。它不是无条件有效：如果任务强依赖真实尺度、固定拍摄位置或完整上下文，过强拼接也可能偏离实际分布。

### 4.3 YOLOv5 的贡献还包括“可稳定训练和导出”

YOLOv5 以 PyTorch 工程体系推动了易用训练、自动 Anchor 检查、模型尺寸缩放、导出和部署。结构随 release 变化，不能把早期 Focus 与后期 Backbone 混成同一个固定版本。

例如早期 Focus 将图像按奇偶位置切片后拼到通道维，实现在保留局部信息的同时缩小空间尺寸；后续版本改用卷积实现输入端处理。SPPF 则串行使用相同大小的池化，形成不同有效感受野，再拼接输出，降低传统并行 SPP 的部分开销。

C3 延续 CSP 思想，通过分流、瓶颈变换和融合组织特征。YOLOv5 并没有仅靠一个“新检测公式”完成升级；它更能说明训练配方、实现细节、部署支持和结构设计共同决定工程价值。具体演进可查 [YOLOv5 官方 release 记录][v5]。

## 5. YOLOX / v6 / v7：分配、解耦和重参数化

[![YOLOX 解耦头、YOLOv6 高效部署结构和 YOLOv7 主辅助头的架构对照]({{ '/assets/img/yolox-v6-v7-architecture.svg' | relative_url }})]({{ '/assets/img/yolox-v6-v7-architecture.svg' | relative_url }})

*依据 [YOLOX][yolox]、[YOLOv6][v6]、[YOLOv7][v7] 的作者资料整理。虚线表示训练辅助关系；锚框辅助和 Auxiliary Head 只对应相应版本／配置。*

### 5.1 解耦头：分类要看语义，回归要看边界

分类希望同类目标在外观变化下保持稳定，定位希望保留精确的空间差异。两项任务完全共用后续卷积时，梯度偏好可能发生冲突。

解耦头在共享特征之后设置不同分支，让分类和框回归分别学习。它并不是把整套网络复制两份，而是在接近输出的位置提供任务专门的变换。[YOLOX][yolox]将这一设计与 Anchor-free 和 SimOTA 组合起来。

### 5.2 SimOTA：正样本数量跟随当前预测质量

YOLOX 的 SimOTA 可以理解为一种计算更简化的动态匹配：

1. 用目标框和中心区域先验筛出候选位置；
2. 综合分类误差、IoU 等构造匹配代价；
3. 根据候选与真实框的 IoU 估计每个目标需要的正样本数量，即 dynamic-k；
4. 选择低代价候选，处理多个目标竞争同一候选的冲突。

与固定“某个 Anchor 最像就负责”的规则相比，它让分配随模型预测质量变化。它也不是在每轮训练中完整求解复杂的最优运输问题，而是采用近似策略降低计算开销。

### 5.3 YOLOv6：训练复杂一点，推理可以更简单

[YOLOv6][v6]围绕工业部署引入 EfficientRep、Rep-PAN 和高效解耦头，并在后续版本迭代训练分配、蒸馏及 Anchor-Aided Training。不同尺寸模型的配置并不完全相同。

结构重参数化的典型例子是训练时使用 3×3、1×1 和恒等映射三个分支，推理时融合成一个 3×3 卷积。先把每个分支中的 BatchNorm 融入卷积：

$$
W'=\frac{\gamma}{\sqrt{\sigma^2+\epsilon}}W,\quad
b'=\beta+\frac{\gamma}{\sqrt{\sigma^2+\epsilon}}(b-\mu)
$$

再把 1×1 核补零到 3×3，把恒等映射表示为单位卷积核，求和得到部署核：

$$
W_{\mathrm{deploy}}=W'_{3\times3}
+\operatorname{Pad}(W'_{1\times1})+W'_{\mathrm{id}}
$$

等价融合要求分支是可合并的线性运算，步长、形状与归一化状态必须兼容；分支中任意插入非线性激活就不能直接这样合并。收益来自让训练拥有更多优化路径，同时让部署图保持规整。

Anchor-Aided Training 则允许训练时保留提供辅助监督的 Anchor-based 分支，推理仍使用目标部署分支。这里再次出现一个重要原则：训练图和推理图不必完全相同。

### 5.4 YOLOv7：关注梯度路径，而不只是加深网络

[YOLOv7][v7]的 E-ELAN 通过扩展、聚合等设计提高特征学习能力，同时维护有效的梯度路径。对拼接型网络做缩放时，层数变化会同时改变拼接后的通道数，所以不能完全照搬只考虑深度或宽度的缩放方法。

辅助头在训练中向中间特征提供监督，Lead Head 引导的标签分配使辅助头与最终头使用相互协调的训练信号。计划式重参数化则考虑网络已有的残差／拼接连接，避免机械地给每个位置都添加同一种多分支结构。

这些设计的共同点是改善优化过程，并尽可能把额外分支留在训练阶段。

## 6. YOLOv8：Anchor-free、任务对齐与分布式框回归

[![YOLOv8 的 C2f Backbone、多尺度融合、分类分支与 DFL 框回归分支]({{ '/assets/img/yolo-v8-architecture.svg' | relative_url }})]({{ '/assets/img/yolo-v8-architecture.svg' | relative_url }})

*依据 [YOLOv8 官方说明与实现][v8]重绘。图中的解耦预测结构在各尺度重复；标签分配和 DFL 损失用于训练，分布期望用于框解码。*

### 6.1 C2f 与 Anchor-free 并非同一层面的变化

YOLOv8 的 C2f 通过较轻的分流与多个瓶颈输出拼接，保留不同深度的特征和梯度路径。Anchor-free 则是输出表示与分配方式的变化，不要求预测围绕预设宽高模板。

典型框回归预测参考点到四条边的距离 $(l,t,r,b)$。若参考点为 $(a_x,a_y)$：

$$
x_1=a_x-l,\quad y_1=a_y-t,\quad
x_2=a_x+r,\quad y_2=a_y+b
$$

实际实现还需乘以对应步长。参考点仍由特征网格生成，所以“代码里存在 anchor_points”与“Anchor-free”并不矛盾。

### 6.2 TAL：让高分类分数与高定位质量一致

任务对齐分配通常使用类似下面的度量：

$$
m=s^\alpha u^\beta
$$

其中 $s$ 是候选对真实类别的预测分数，$u$ 是候选框与真实框的 IoU。训练在空间有效候选中选择对齐分数较好的位置，结合冲突处理与质量相关目标完成监督。

只看类别分数可能选到“知道是什么，但框不准”的候选；只看 IoU 又可能忽略类别判断。TAL 用联合标准缓解二者不一致，但具体 top-k、指数和归一化方式是实现配置的一部分。

### 6.3 DFL：边界不是只能回归成一个数

Distribution Focal Loss 将每条边的距离预测为若干离散位置上的概率分布。若距离 $d$ 位于整数 $i$ 与 $i+1$ 之间，监督可以写成：

$$
\mathcal L_{\mathrm{DFL}}
=-(i+1-d)\log p_i-(d-i)\log p_{i+1}
$$

推理用期望解码：

$$
\hat d=\sum_{j=0}^{K}j\,p_j
$$

例如真实距离为 3.2，可以把相邻位置 3 和 4 的监督权重设为 0.8 与 0.2。这样模型学习的是边界位置分布，允许比直接预测一个标量更细致的定位表示。

DFL 与 IoU 类损失分工不同：DFL 约束各边的分布，IoU 类损失约束整个框的几何质量。YOLOv8 的常见实现结合分类 BCE、CIoU 与 DFL；它不再沿用 YOLOv5 式独立 Objectness 输出的全部设计。[官方说明与实现][v8]是核对具体结构的入口。

代价是每条边需要更多输出通道、Softmax 和积分解码。后面 YOLO26 去掉 DFL，正是在重新权衡这部分定位收益与部署成本。

## 7. YOLOv9 / v10：改善梯度，与改变输出集合

[![YOLOv9 PGI 辅助路径、YOLOv10 一致双分配和 YOLO26 DFL-free 双头架构]({{ '/assets/img/yolo-v9-v10-v26-architecture.svg' | relative_url }})]({{ '/assets/img/yolo-v9-v10-v26-architecture.svg' | relative_url }})

*依据 [YOLOv9][v9]、[YOLOv10][v10] 和 [YOLO26 配置][v26-config]整理，放在一起比较训练图与部署路径。YOLO26 的训练配方在第 9 节展开。*

### 7.1 PGI：给深层网络提供更可靠的学习信号

网络不断压缩和变换特征，可能丢失与目标任务有关的信息。[YOLOv9][v9]提出 PGI，通过辅助可逆分支和多层级辅助信息，为主网络提供更有用的梯度。

可以把主干参数更新理解成：

$$
\nabla_\theta\mathcal L
=\nabla_\theta\mathcal L_{\mathrm{main}}
+\lambda\nabla_\theta\mathcal L_{\mathrm{aux}}
$$

这只是说明主任务与辅助监督共同影响训练，并非 PGI 的完整算法定义。其关键不是“多加一个损失就行”，而是设计辅助路径的信息保留方式与多层监督，缓解中间表征丢失导致的学习困难。

GELAN 负责高效的层聚合架构；PGI 负责训练中的梯度信息设计。辅助分支可在推理时去除，因此 PGI 不要求部署完整的可逆辅助网络。

### 7.2 为什么密集预测常常需要 NMS

如果一个真实物体对应多个正样本位置，模型就有理由为同一个物体输出多个高分框。NMS 通常保留高分框，并抑制与它重叠超过阈值的候选。

这个过程依赖 IoU 阈值、类别处理方式和候选数量。在密集遮挡场景中，两个不同物体可能高度重叠；阈值太低会误删，太高又会留下重复框。NMS 也给导出和端到端延迟带来额外开销。

### 7.3 YOLOv10：训练需要丰富监督，推理需要稀疏结果

[YOLOv10][v10]同时设置一对多和一对一分支：

- 一对多分配使每个目标拥有多个正样本，为特征学习提供较密集的监督。
- 一对一分配让每个目标只对应一个主要正样本，训练模型输出较少重复候选。
- 两个分支采用相互一致的匹配度量，降低“两个头对优质候选的判断相互冲突”的风险。

论文实现的一对一分支使用分离的特征梯度，避免其训练目标直接扰动共享特征提取；共享表征主要受一对多分支的丰富监督。部署时使用一对一分支，去掉训练辅助分支和 NMS。

这里的一对一是**训练匹配约束**，不是推理时对任意新图像保证“每个物体严格只有一个框”。置信度筛选、类别选择与 top-k 等输出处理仍然存在；NMS-free 也不等于没有任何后处理。

结构侧还包括轻量分类头、空间／通道解耦下采样、按冗余程度设计模块、大核卷积和部分自注意力。这些改动一起服务于精度与真实推理延迟的平衡。

## 8. YOLO11 / v12 / v13：从局部特征到高阶关系

[![YOLO11 C2PSA、YOLOv12 Area Attention 和 YOLOv13 HyperACE 与 FullPAD 的结构关系]({{ '/assets/img/yolo-v11-v13-architecture.svg' | relative_url }})]({{ '/assets/img/yolo-v11-v13-architecture.svg' | relative_url }})

*依据 [YOLO11 配置][v11-config]、[YOLOv12 说明][v12] 与 [YOLOv13 作者仓库][v13]整理。该图突出各分支的关键模块，区域注意力与超图信息流不代表完整网络的逐层配置。*

### 8.1 YOLO11：在成熟检测框架内调整模块

[YOLO11 官方配置][v11-config]显示 Backbone/Neck 使用 C3k2，深层包含 SPPF 与 C2PSA。C3k2 在 CSP 风格分流中使用可配置的卷积瓶颈；C2PSA 把部分通道送入注意力模块，另一部分保留旁路，再融合输出。

部分注意力的出发点很直接：全局关系有价值，但让每个通道、每个高分辨率位置都做全局注意力成本太高。优先在较低分辨率的深层特征上处理部分通道，可以保留卷积效率，同时补充长程上下文。

YOLO11 没有一篇与 v1/v4 类似的官方独立论文可作为唯一依据，具体结构应引用仓库配置；也不能因为它晚于 YOLOv10，就推断其默认检测路径继承了 YOLOv10 的去 NMS 设计。

### 8.2 YOLOv12：Area Attention 限制关系计算范围

标准自注意力为：

$$
\operatorname{Attention}(Q,K,V)
=\operatorname{softmax}\!\left(\frac{QK^\top}{\sqrt d}\right)V
$$

若特征图有 $N=H\times W$ 个位置，注意力矩阵的规模约为 $N^2$。[YOLOv12][v12]把特征图划为若干区域，在区域内做注意力。若均匀分成 $r$ 个区域，关系矩阵总规模约为：

$$
r\left(\frac Nr\right)^2=\frac{N^2}{r}
$$

这是注意力矩阵部分的复杂度估计，不包含投影、卷积和其他网络计算，也不是整个模型一定加速 $r$ 倍。区域化减少了全局两两计算，但也限制了单层能够直接交互的位置范围。

R-ELAN 用残差和聚合设计改善深层注意力网络的优化；位置感知卷积为注意力补充空间信息。FlashAttention 主要减少显存读写与中间矩阵存储，并不把所有注意力算法自动变成线性复杂度。论文实现与 Ultralytics 集成实现的可选加速依赖也需要分别看待。

### 8.3 YOLOv13：用超图表达多个位置之间的共同关系

普通图的一条边通常连接两个节点，超图的一条超边可以连接多个节点。[YOLOv13 作者仓库][v13]中的 HyperACE 将多尺度特征位置视为节点，以可学习超边组织更高阶的关联，再通过消息传递聚合信息。

为了帮助理解，可以把其思想抽象为：

$$
Z_e=\sum_i a_{ie}X_i,\qquad
Y_i=\sum_e \tilde a_{ie}\,\phi(Z_e)
$$

第一步把多个节点汇集到超边，第二步把超边聚合后的信息传回节点。该式是机制示意，不替代论文中的超边构建和归一化定义。

相较于为所有位置显式计算两两关系，这种“节点→超边→节点”的通道可以用较少的中间关系单元表达群组依赖。复杂度仍取决于节点数、超边数与具体实现，不能只凭“超图”二字断言成本固定。

FullPAD 将增强后的特征分发到 Backbone 与 Neck 之间、Neck 内部以及 Neck 与 Head 之间，改善整个网络的信息交互；DS 系列深度可分离模块用于控制计算量。这里所谓全流程协同，不应误读成“该模型天然不需要 NMS”。

## 9. YOLO26：把优化重点进一步移向部署路径

[YOLO26 官方文档][v26]与[模型配置][v26-config]明确展示两项变化：支持端到端一对一预测路径，并将框回归的分布设置简化为不使用 DFL 的形式。

### 9.1 去掉 DFL：减少的是回归表示成本

此前四条边各输出一个分布，现在可以使用更直接的回归表示，减少输出通道以及分布解码运算。训练仍然需要几何回归监督，并没有“因为不用 DFL 就不学习框坐标”。

它还避免了离散分布表示本身的有限区间约束。实际可回归范围和数值稳定性仍由框参数化、步长与实现决定。

### 9.2 Progressive Loss 与 STAL：改变监督资源的分配

Progressive Loss 随训练过程调整一对多／一对一分支的关注重点，逐步加强实际端到端推理路径的学习。其思想可以理解为先利用较丰富的监督形成表征，再让训练目标更贴近最终使用的预测头。

STAL 是 Small-Target-Aware Label Assignment。小物体在下采样后的特征图上覆盖位置少，严格的空间候选筛选可能让它缺少有效正样本。STAL 针对这类情况改善正样本覆盖，作用发生在训练标签分配阶段；它不能恢复输入缩放时已经消失的视觉细节。

### 9.3 MuSGD：优化器改变了训练更新，不改变推理算子

MuSGD 结合 Muon 与 SGD 的优化思路。Muon 对适用矩阵参数的更新进行近似正交化，试图改善不同方向的更新尺度；SGD 路径提供另一类稳定更新。实际参数分组、混合比例与调度需要查看对应训练配方。

它属于训练优化器，不是插入在图像 Backbone 中的模块，所以不能把 MuSGD 的训练收益描述成推理时多了一个“智能优化层”。

### 9.4 “支持 NMS-free”与“当前接口默认走哪条路径”要分开

核对时的官方文档说明，一对多路径使用 NMS，端到端路径通过相应参数选择。若想比较去 NMS 的部署收益，必须确认所用库版本、预测参数和导出图确实选择了一对一分支。

~~~python
from ultralytics import YOLO

model = YOLO("yolo26n.pt")
# 对支持该参数语义的当前实现，显式选择端到端预测路径。
results = model.predict("image.jpg", nms=False)
~~~

这段代码用于说明路径选择，不是统一速度基准。历史 release 的默认行为可能不同，应连同 Ultralytics 版本一起记录。

## 10. 如何比较版本，才不会把不同问题混成一个排行榜

| 需要判断的问题 | 应固定或记录的条件 |
| --- | --- |
| 模型是否更准确 | 同一训练／验证划分、输入尺寸、类别体系、训练预算、AP 定义 |
| 模型是否更快 | 相同硬件、后端、精度、batch、线程、预热和同步方式 |
| 是否适合小目标 | 目标像素尺寸分布、AP_small、漏检类型、是否使用切片 |
| NMS-free 是否有收益 | 确认实际推理分支；计入预处理、框解码、NMS/top-k 与数据传输 |
| 能否替换现有模型 | 算子支持、动态尺寸、量化误差、导出格式、权重与配置兼容性 |
| 模块是否贡献了收益 | 在同一基线做消融；一次只改变需要研究的因素 |

YOLOv1 的 VOC mAP、现代 COCO AP50:95、不同输入尺寸下的 AP，以及不同 GPU 上的 FPS 不能直接排成一条性能增长曲线。更低 FLOPs 也不保证更低延迟：算子支持、内存访问和并行度都可能成为瓶颈。

实际选型可以先建立一个工具链成熟、能够复现的基线，再按失败类型推进：小目标漏检先看输入分辨率和尺度分布；分类对但框不准看回归与标注；密集目标误删看分配和后处理；CPU 延迟过高则分析实际耗时与算子，而不是只换更高编号。

开放词汇检测解决的是类别空间问题，与上面的闭集检测架构演进交叉但不等同。YOLO-World、YOLOE 等路线可结合站内[开放词汇模型笔记]({% post_url 2026-07-23-open-world-models %})阅读。

## 参考资料

1. [YOLOv1：You Only Look Once][v1]。
2. [YOLO9000：Better, Faster, Stronger][v2]。
3. [YOLOv3：An Incremental Improvement][v3]。
4. [YOLOv4：Optimal Speed and Accuracy of Object Detection][v4]。
5. [YOLOv5 官方发布记录][v5]。
6. [YOLOX 作者仓库][yolox]、[YOLOv6 作者仓库][v6]、[YOLOv7 作者仓库][v7]。
7. [YOLOv8 官方模型说明][v8]。
8. [YOLOv9：Learning What You Want to Learn Using PGI][v9]。
9. [YOLOv10：Real-Time End-to-End Object Detection][v10]。
10. [YOLO11 官方配置][v11-config]、[YOLOv12 官方集成文档][v12]、[YOLOv13 作者仓库][v13]。
11. [YOLO26 官方模型说明][v26]、[网络配置][v26-config]、[训练配方][v26-recipe]。

[v1]: https://arxiv.org/abs/1506.02640
[v2]: https://arxiv.org/abs/1612.08242
[v3]: https://arxiv.org/abs/1804.02767
[v4]: https://arxiv.org/abs/2004.10934
[v5]: https://github.com/ultralytics/yolov5/releases
[yolox]: https://github.com/Megvii-BaseDetection/YOLOX
[v6]: https://github.com/meituan/YOLOv6
[v7]: https://github.com/WongKinYiu/yolov7
[v8]: https://docs.ultralytics.com/models/yolov8/
[v9]: https://arxiv.org/abs/2402.13616
[v10]: https://arxiv.org/abs/2405.14458
[v11-config]: https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/models/11/yolo11.yaml
[v12]: https://docs.ultralytics.com/models/yolo12/
[v13]: https://github.com/iMoonLab/yolov13
[v26]: https://docs.ultralytics.com/models/yolo26/
[v26-config]: https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/models/26/yolo26.yaml
[v26-recipe]: https://docs.ultralytics.com/guides/yolo26-training-recipe/
