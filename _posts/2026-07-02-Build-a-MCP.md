---
layout: post
title: Build un custom MCP   
subtitle: 本地项目构建为MCP，并配置到智能体中
tags: [ts forecasting, chronos-2]
category: 时间序列
comments: true
mathjax: true
author: HuaC
---

## MCP是什么

MCP是一个接口协议，用于将应用、函数、数据库等封装为AI智能体可调用的工具。

![Crepe](/assets/img/mcp.gif)

## MCP的构建

以python为例，构建MCP的步骤如下：
~~~
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("vae-diffusion-anomaly")

#注册工具
@mcp.tool()
def detect_anomaly(
    values: list[float],
    normalize: bool = True,
    config_path: str = "configs/config.yaml",
) -> str:

    """核心函数，用于检测时序是否存在异常"""
    return results

if __name__ == "__main__":
    mcp.run()
~~~

## MCP的配置
### 以codebuddy为例，配置本地MCP
~~~
{
  "mcpServers": {
    "vae-diffusion-anomaly": {
      "command": "/path/to/conda/path/bin/python",
      "args": [
        "/path/to/subject/mcp_server.py"
      ]
    }
  }
}
~~~

即配置conda环境变量（command），并指定MCP执行文件的路径(args)。

### 远程MCP的配置

~~~
{
  "mcpServers": {
    "vae-diffusion-anomaly": {
      "url": "http://xx.xx.xx.xx:port/sse"
    }
  }
}
~~~

类似api的配置，指定MCP的url即可。注意，codebuddy暂不支持sse模式（截止2026-07-02）。
