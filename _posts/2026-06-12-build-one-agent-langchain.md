---
layout: post
title: langchain start up
subtitle: try to build a agent with langchain
cover-img: /assets/img/path.jpg
thumbnail-img: /assets/img/thumb.png
share-img: /assets/img/path.jpg
tags: [agent, langchain]
category: agent
comments: true
mathjax: true
author: HuaC
---


## 1. 创建一个agent
**示例：**
~~~
from langchain.agents import create_agent


def fun_tool(input: str) -> str:
    """一个简单的函数工具"""
    return result

agent = create_agent(
    model=llm_model,  # 模型
    tools=[fun_tool],
    system_prompt="专属提示词",
)

# 运行代理
agent.invoke(
    {"messages": [{"role": "user", "content": "问题"}]}
)
~~~
其中`llm_model`为模型对象，`fun_tool`为工具函数。
~~~
llm_model = "gpt-3.5-turbo" # 官方模型，key_api由环境变量提供
#或者使用自定义模型（第三方提供商或者本地部署）
llm_model = ChatOpenAI(
    base_url=os.getenv("OPENAI_BASE_URL"),
    api_key=os.getenv("OPENAI_API_KEY", "empty"),
    model=os.getenv("MODEL_NAME"),
    temperature=0.7,
    max_tokens=8192,
    streaming=False,
)
~~~
注意，如果是本地部署模型，不要使用Xinference框架，工具调用会报错。

## 2. agent拓展
### 2.1 定义响应格式
~~~
from dataclasses import dataclass

#这里使用 dataclass，但也支持 Pydantic 模型。
@dataclass
class ResponseFormat:
    """代理的响应模式。"""
    # 带双关语的回应（始终必需）
    punny_response: str
    # 天气的任何有趣信息（如果有）
    weather_conditions: str | None = None
~~~
### 2.2 添加记忆
存储对话，用于上下文记忆。
~~~
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()
~~~
### 2.3 中间件middleware
添加中间件，用于处理代理的输入和输出。例如动态选择模型：
~~~
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse


basic_model = ChatOpenAI(model="gpt-4o-mini")
advanced_model = ChatOpenAI(model="gpt-4o")

@wrap_model_call
def dynamic_model_selection(request: ModelRequest, handler) -> ModelResponse:
    """根据对话复杂性选择模型。"""
    message_count = len(request.state["messages"])

    if message_count > 10:
        # 对较长的对话使用高级模型
        model = advanced_model
    else:
        model = basic_model

    request.model = model
    return handler(request)

agent = create_agent(
    model=basic_model,  # 默认模型
    tools=tools,
    middleware=[dynamic_model_selection]
)
~~~