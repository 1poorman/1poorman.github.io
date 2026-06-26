---
layout: post
title: Chronos-2: The best Time Series Forecasting model?   
subtitle: 时序预测大模型
cover-img: /assets/img/Chronos-2-struct.png
thumbnail-img: /assets/img/thumb.png
share-img: /assets/img/Chronos-2-struct.png
tags: [ts forecasting, chronos-2]
category: agent
comments: true
mathjax: true
author: HuaC
---

## 一、结构分析

### 1.1 模型结构

![Chronos-2-struct](/assets/img/Chronos-2-struct.png)

### 1.2 模型特点

- **Chronos-2** 是一个基于 Transformer 的时序预测模型，它结合了自回归 Transformer 和因果 Transformer 的优点，能够有效地处理长序列预测问题。

## 三、模型微调（Fine-Tuning）
官方api提供的‘fit’支持两种模型：`"full"` or `"lora"`。
~~~
The `fit` method accepts:
- `inputs`: Time series for fine-tuning (same format as predict_quantiles)
- `finetune_mode`: `"full"` or `"lora"`
- `lora_config`: The [`LoraConfig`](https://huggingface.co/docs/peft/en/package_reference/lora#peft.LoraConfig), in case `finetune_mode="lora"`
- `prediction_length`: Forecast horizon for fine-tuning
- `validation_inputs`: Optional validation data (same format as inputs)
- `learning_rate`: Optimizer learning rate (default: 1e-6, we recommend a higher learning rate such as 1e-5 for LoRA)
- `num_steps`: Number of training steps (default: 1000)
- `batch_size`: Batch size for training (default: 256)
~~~


### 3.1 全量调整（full fine-tuning）

示例：
~~~
# Fine-tune the model by default full fine-tuning will be performed
(method) def fit(
    inputs: TensorOrArray | Sequence[TensorOrArray] | Sequence[Mapping[str, TensorOrArray | Mapping[str, TensorOrArray | None]]], #微调数据
    prediction_length: int, #预测长度，窗口输出的长度
    validation_inputs: TensorOrArray | Sequence[TensorOrArray] | Sequence[Mapping[str, TensorOrArray | Mapping[str, TensorOrArray | None]]] | None = None,
    finetune_mode: Literal['full', 'lora'] = "full",
    lora_config: LoraConfig | dict | None = None,
    context_length: int | None = None, #上下文长度，窗口输入的长度
    learning_rate: float = 0.000001,
    num_steps: int = 1000,  #训练步数
    batch_size: int = 256,
    output_dir: Path | str | None = None, #微调权重保存路径
    min_past: int | None = None,
    finetuned_ckpt_name: str = "finetuned-ckpt",
    callbacks: list[TrainerCallback] | None = None,
    remove_printer_callback: bool = False,
    disable_data_parallel: bool = True,
    **extra_trainer_kwargs: Any
) -> Chronos2Pipeline
~~~

### 3.2 低秩调整LoRA
