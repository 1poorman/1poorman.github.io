---
layout: post
title: deepseek-ocr-2试用
subtitle: 与minerU的比较
cover-img: /assets/img/path.jpg
thumbnail-img: /assets/img/thumb.png
share-img: /assets/img/path.jpg
tags: [books, test]
comments: true
mathjax: true
author: HuaC
---

## 显存占用
| 子任务 | 占用（Gb） | 作用 |
| :------ |:--- | :--- |
| model  weights load | 6.33 | 加载权重 |
| non_torch_memory | 0.06 | 非Pytorch程序占用|
| Pytorch activation peak memory | 1.07 | 激活数据占用 |
| KV Cache | 13.86 | 键值缓存，预留，避免重复计算 |

## 常见功能
~~~
TODO commonly used prompts
1. markdowm: <image>\n<|grounding|>Convert the document to markdown.
2. OCR: <image>\n<|grounding|>OCR this image.
3. without layouts: <image>\nFree OCR.
4. figures in document: <image>\nParse the figure.
5. general: <image>\nDescribe this image in detail.
6. rec: <image>\nLocate <|ref|>xxxx<|/ref|> in the image.
~~~

## 输出文件

* result_ori.mmd: 带分类、坐标的识别文件
结构示例：
~~~
<|ref|>sub_title<|/ref|><|det|>[[268, 133, 494, 145]]<|/det|>
文本类别 坐标
文本块
~~~
* result_with_boxes.jpg: 布局检测图  / _layouts.pdf: PDF布局检测结果
* result.mmd: 文字
* images/*.jpg: 页面中的插图


## 与mineru比较
1. 效率和成本：deepseek-ocr2仅需 256-1120个视觉Token，minerU基于传统管线和架构处理单页需消耗6000+个Token，算力和时间成本更高。
2. 处理任务：deepseek-ocr2可以实现多种格式的输出，minerU至支持markdown