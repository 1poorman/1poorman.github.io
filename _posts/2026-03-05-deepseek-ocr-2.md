---
layout: post
title: deepseek-ocr-2试用
subtitle: 与minerU的比较
cover-img: /assets/img/path.jpg
thumbnail-img: /assets/img/thumb.png
share-img: /assets/img/path.jpg
tags: [books, test]
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
document: <image>\n<|grounding|>Convert the document to markdown.
other image: <image>\n<|grounding|>OCR this image.
without layouts: <image>\nFree OCR.
figures in document: <image>\nParse the figure.
general: <image>\nDescribe this image in detail.
rec: <image>\nLocate <|ref|>xxxx<|/ref|> in the image.
~~~

## 输出文件

result_ori.mmd: 带分类、坐标的识别文件
result_with_boxes.jpg: 布局检测图
result.mmd: 文字
images/*.jpg: 插图
