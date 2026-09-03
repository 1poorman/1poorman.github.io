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

注意，本地部署模型如果是Xinference框架，大概率不支持工具调用。

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
#临时存储，内存中，重启后消失
checkpointer = InMemorySaver()

agent = create_agent(
    model=llm_model,  # 模型
    tools=[fun_tool],
    system_prompt="专属提示词",
    checkpointer=checkpointer,
)
~~~
~~~
#持久化存储，重启后不会消失，redis中
from langgraph.checkpoint.memory import RedisSaver
checkpointer = RedisSaver(redis_url="redis://localhost:6379")
#或者使用文件存储
from langgraph.checkpoint.memory import FileSaver
checkpointer = FileSaver(file_path="/path/to/checkpoint.json")
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

## 3. agent长期运行的常见问题与解决方案

agent在长时间运行（多轮对话、复杂任务、无人值守）时，会遇到一些典型问题。

### 3.1 上下文窗口溢出

**问题**：对话历史不断累积，超出模型上下文长度限制，导致报错或早期信息被截断丢失。

**解决方案：消息裁剪（Trimming）**
~~~
from langchain_core.messages import SystemMessage, trim_messages

trimmer = trim_messages(
    max_tokens=4000,            # 保留的最大token数
    strategy="last",            # 保留最近的消息
    token_counter=llm_model,    # token计数器
    include_system=True,        # 始终保留system prompt
    allow_partial=False,
    start_on="human",
)

# 在调用模型前裁剪消息
trimmed = trimmer.invoke(state["messages"])
~~~

**解决方案：消息摘要（Summarization）**
~~~
from langchain.agents.middleware import SummarizationMiddleware

agent = create_agent(
    model=llm_model,
    tools=[fun_tool],
    middleware=[
        SummarizationMiddleware(
            model=llm_model,
            max_tokens_before_summary=4000,  # 超过阈值触发摘要
            messages_to_keep=10,             # 摘要后保留最近消息数
        )
    ],
)
~~~

### 3.2 无限循环与重复调用

**问题**：agent陷入死循环，反复调用同一工具，或对失败的操作不断重试，消耗大量token。

**解决方案：限制迭代步数**
~~~
agent = create_agent(
    model=llm_model,
    tools=[fun_tool],
    recursion_limit=25,  # 最大递归/循环次数
)
~~~

**解决方案：中间件检测循环**
~~~
@wrap_model_call
def detect_loop(request: ModelRequest, handler) -> ModelResponse:
    messages = request.state["messages"]
    # 检查最近消息是否高度重复
    recent_tools = [m.name for m in messages[-6:] if m.type == "tool"]
    if len(recent_tools) >= 4 and len(set(recent_tools)) <= 1:
        # 强制注入提示，打破循环
        request.messages.append(
            SystemMessage(content="检测到重复操作，请换一种方法或直接给出结论。")
        )
    return handler(request)
~~~

### 3.3 工具调用失败与错误恢复

**问题**：外部API超时、网络波动、工具返回异常，导致整个agent任务中断。

**解决方案：工具重试与降级**
~~~
import time
from functools import wraps

def with_retry(max_retries=3, delay=1):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for i in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if i == max_retries - 1:
                        return f"工具执行失败: {e}"  # 返回错误信息而非抛出异常
                    time.sleep(delay * (2 ** i))   # 指数退避
        return wrapper
    return decorator

@tool
@with_retry(max_retries=3)
def fun_tool(input: str) -> str:
    """带重试机制的工具"""
    return call_external_api(input)
~~~

**要点**：工具失败时返回错误描述字符串（而不是抛出异常），让agent自己决定下一步，避免任务直接崩溃。

### 3.4 状态丢失与持久化

**问题**：长时间任务中途失败（进程崩溃、服务重启），所有进度丢失，只能从头开始。

**解决方案：持久化checkpointer + 断点恢复**
~~~
# 使用Redis/Postgres等持久化存储，而不是InMemorySaver
from langgraph.checkpoint.redis import RedisSaver

checkpointer = RedisSaver.from_conn_string("redis://localhost:6379")

# 每次调用指定固定的thread_id，进度自动保存
config = {"configurable": {"thread_id": "task-2026-001"}}
agent.invoke({"messages": [...]}, config=config)

# 崩溃后从断点恢复
state = agent.get_state(config)
print(f"恢复到步骤: {state.next}")
~~~

### 3.5 成本失控

**问题**：无人值守的agent可能产生大量token消耗，成本不可控。

**解决方案：token用量追踪与预算限制**
~~~
from langchain.agents.middleware import wrap_model_call

@wrap_model_call
def budget_guard(request: ModelRequest, handler) -> ModelResponse:
    total_tokens = sum(
        m.usage_metadata["total_tokens"]
        for m in request.state["messages"]
        if hasattr(m, "usage_metadata") and m.usage_metadata
    )
    if total_tokens > 100_000:  # 预算上限
        raise RuntimeError(f"Token预算已耗尽: {total_tokens}")
    return handler(request)
~~~

### 3.6 问题与方案速查表

| 问题 | 典型表现 | 核心方案 |
| :--- | :--- | :--- |
| 上下文溢出 | 报错超长 / 早期信息丢失 | trim_messages、SummarizationMiddleware |
| 无限循环 | 反复调用同一工具 | recursion_limit、循环检测中间件 |
| 工具失败 | 任务中断 | 重试+降级、返回错误而非抛异常 |
| 状态丢失 | 重启后从头再来 | 持久化checkpointer + thread_id恢复 |
| 成本失控 | token消耗爆炸 | 用量追踪 + 预算熔断 |