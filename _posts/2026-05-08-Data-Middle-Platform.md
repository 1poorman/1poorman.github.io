---
layout: post
title: 数据中台技术栈
subtitle: 开源框架落地细节
cover-img: /assets/img/path.jpg
thumbnail-img: /assets/img/thumb.png
share-img: /assets/img/path.jpg
tags: [data middle platform]
author: HuaC
mathjax: true
comments: true
---


数据中台的核心是打通数据孤岛、沉淀可复用的数据资产，为前台业务提供高效的数据服务。
![Crepe](/assets/img/数据中台-1.png)

## 🧩 数据中台核心模块与技术栈

| 模块 | 功能定位 | 主流技术栈（开源 / 商业） |
| :---: | :---| :--- |
| 数据集成与采集 | 批量/实时异构数据同步，数据库日志捕获 | **开源**：Apache SeaTunnel、DataX、Flink CDC、Canal、NiFi、Sqoop<br>**商业**：Informatica、Talend、Kettle |
| 消息队列与流处理 | 实时数据缓冲、流式ETL与计算 | **开源**：Apache Kafka、Pulsar；计算引擎 Apache Flink、Spark Structured Streaming<br>**云服务**：AWS Kinesis、阿里云DataHub |
| 数据存储 | 数仓分层、数据湖、实时特征存储 | **湖仓存储**：Apache Hudi、Iceberg、Delta Lake（基于 HDFS/S3））<br>**OLAP 分析**：StarRocks、Doris、ClickHouse、Apache Kylin<br>**搜索/日志**：Elasticsearch<br>**NoSQL**：HBase、Cassandra、MongoDB<br>**关系库**：MySQL、TiDB、PostgreSQL |
| 数据计算与开发 | 批量/实时ETL、机器学习训练 | **引擎**：Spark、Flink、Hive、Presto/Trino<br>**语言**：SQL、Python、Scala、Java<br>**开发平台**：商业版 Dataphin、DataWorks；开源可整合 Zeppelin、Jupyter |
| 任务调度与运维 | 工作流编排、依赖管理与监控 | **开源**：Apache DolphinScheduler、Airflow、Azkaban<br>**商业**：Control-M、阿里云DataWorks调度 |
| 数据治理 | 元数据、血缘、质量、标准、资产目录 | **元数据/血缘**：DataHub、Apache Atlas、Amundsen<br>**数据质量**：Great Expectations、Apache Griffin、Deequ<br>**安全/权限**：Apache Ranger（权限）、数据脱敏算法、Kerberos |
| 数据服务 | 统一API生成、虚拟化查询、服务编排 | **API网关**：Apache APISIX、Kong、Spring Cloud Gateway<br>**查询引擎**：Presto/Trino（直接联邦查询）、GraphQL 引擎<br>**服务开发**：Spring Boot 微服务、Python FastAPI |
| 可视化与BI | 报表、自助分析、大屏展示 | **开源**：Apache Superset、Grafana、Metabase<br>**商业**：Tableau、Power BI、FineReport、Quick BI |
| 基础设施与容器化 | 存算分离、资源弹性、快速部署 | **编排**：Kubernetes + Docker<br>**大数据 on K8s**：Spark/Flink Operator<br>**存储**：MinIO（对象存储）、Ceph |

## 📌 模块核心解读
* 1. 数据集成：流批一体 CDC 成为主流
传统 Sqoop/DataX 做批量同步，现在更多用 Flink CDC 或 SeaTunnel 来实现全量+增量一体化同步，无需侵入业务库，直接解析 binlog 写入数据湖或 Kafka。

* 2. 存储：迈向“湖仓一体”
不再强依赖 Hive 数仓，改用 Apache Hudi / Iceberg 构建的数据湖，同时具备 ACID 事务和时间旅行，上层可用 Spark、Flink、Trino 做近实时入湖和查询。OLAP 侧，StarRocks / Doris 因其极速多表关联和灵活建模，正大量替代 ClickHouse 的粘合场景。

* 3. 数据治理：从“查字典”到自动化
DataHub 和 Atlas 提供强血缘追踪，Great Expectations 在任务中嵌入质量断言，自动拦截脏数据。数据安全围绕 Apache Ranger 做行列级权限管控，并配合动态脱敏。

* 4. 数据服务：让数据资产 API 化
核心是将数仓模型自动发布为数据 API。可通过 Kong / APISIX 管理流量与鉴权，后端查询引擎直接对接 StarRocks 或 Presto，无需再写代码生成单一接口。

## 🏗️ 一套现代数据中台开源参考架构 

* 采集层：Flink CDC / SeaTunnel → Kafka

* 湖仓层：Flink 清洗写入 → Apache Hudi（S3/HDFS）

* 计算引擎：Spark（批）、Flink（流）、Trino（联邦查询）

* OLAP 服务：StarRocks / Doris 做上卷聚合，对接应用报表

* 调度治理：DolphinScheduler + DataHub + Ranger

* 数据服务出口：APISIX 网关暴露统一查询API

* 可视化：Apache Superset 自助分析，Grafana 做运维监控

## 🔧 落地细节


* 实时流处理：使用 Flink 处理 Kafka 数据，写入 Hudi 或 Doris。
    spark structured streaming: [官方文档](https://spark.apache.ac.cn/docs/latest/streaming/index.html)
  

### 📥 1. 采集层：数据的高速入口
采集层的核心任务是将分散在各业务数据库中的原始数据，高效、稳定地汇聚到数据中台。现代架构中，基于CDC（Change Data Capture，变更数据捕获）的技术已成为主流，它通过解析数据库日志来捕获实时变更，避免了传统批量抽取对业务库造成的性能压力。

* Flink CDC：流批一体的利器 [官方文档](https://nightlies.apache.org/flink/flink-cdc-docs-release-3.0/zh/docs/get-started/introduction/)
Flink CDC将复杂的全量+增量同步流程整合到单一作业中，替代了传统的Lambda架构，从根本上解决了数据一致性问题。其实现主要依靠：

  核心算法：基于增量快照算法，该算法能支持无锁读取历史全量数据，并平滑切换到增量同步模式，实现全增量一体化同步以及整库同步。

  配置方式：自3.0版本起，Flink CDC支持通过YAML格式描述数据传递和ETL逻辑，实现零代码开发，大幅降低了使用门槛。一个典型的YAML任务会配置source、sink和可选的transform规则，引擎会自动推导Schema。
  

* SeaTunnel：高性能的集成平台 [官方文档](https://seatunnel.apache.org/zh-CN/)
SeaTunnel是专为海量数据设计的分布式集成平台，它通过标准化的Connector连接器（由Source和Sink构成）打通多源异构数据链路，并提供了丰富的数据处理和转换插件。其关键实现点在于：

    架构解耦：它原生支持Iceberg REST Catalog，数据写入目标数据湖后，可自动完成元数据注册，无需手动维护，实现了数据同步和元数据管理的自动化闭环。

    可观测性：其Event Listener机制能监听任务执行中的各类事件，方便与外部监控系统集成，实现任务的告警与追踪。

### 区别一览

| 对比维度 | Flink CDC | SeaTunnel |
| :--- | :--- | :--- |
| 产品定位 | 数据库 CDC 流式捕获工具 | 通用批流一体数据集成平台 |
| 核心引擎 | 必须依赖 Apache Flink | 自带 Zeta 引擎，可独立运行；也支持 Spark/Flink 引擎 |
| CDC 能力 | 核心优势，基于增量快照算法，支持无锁全量+增量一体化 | 具备但非核心，通过 Debezium 实现 CDC 源，通用性更强 |
| 数据源范围 | 主要面向 关系型数据库（MySQL、PG、Oracle 等） | 极广，支持数据库、文件、SaaS API、消息队列、NoSQL 等数百种 |
| 数据处理能力 | 依赖 Flink SQL/DataStream 进行流式计算，灵活但门槛较高 | 内置大量 Transform 插件（字段映射、过滤、加密等），配置式轻量ETL |
| 任务配置 | 3.0 版本开始支持 YAML 定义管道，零代码 | 原生支持 HOCON/YAML 配置，一套配置可跑批也可跑流 |
| 部署与运维 | 需要独立 Flink 集群（Standalone/YARN/K8s） | 自研引擎纯独立安装，无外部依赖，部署极简 |
| 实时性 | 毫秒级，真正的流式捕获 | 流模式下秒级，满足绝大多数实时集成场景 |
| 典型输出 | 直接写入 Kafka、数据湖（Hudi/Iceberg） | 写入任意支持的 Sink，从对象存储到 ClickHouse/Doris 等 |

* Kafka：高吞吐的消息缓冲(中间层数据传输层) [官方文档](https://kafka.apache.org/)
Apache Kafka作为采集层与计算层之间的消息队列，起到了关键的缓冲和解耦作用。它接收来自Flink CDC和SeaTunnel的实时数据流，下游的计算引擎（如Flink、Spark）再从Kafka中消费数据进行处理。这不仅平衡了上下游的生产与消费速率，也保证了数据不丢失。

### 🗄️ 2. 湖仓层：统一的数据底座
湖仓层是整个中台的存储核心，它需要具备数据湖的灵活性，同时提供数据仓库的ACID事务、高效更新等能力。Apache Hudi是实现这一目标的关键技术。

Hudi（Hadoop Upserts and Incrementals）[官方文档](https://hudi.apache.org/)：它的核心能力是让数据湖支持高效的增量更新（Upsert）、删除和查询。具体实现依赖于：

* 时间线（Timeline）：充当事务日志，记录了表的所有操作（action）及其状态，是实现ACID事务和时间旅行（Time Travel）的基础。

* 文件布局（File Layout）：表被划分为多个分区，每个分区由多个文件组（File Group）构成，更新操作会将增量数据写入日志文件，后续由后台表服务合并，这就是Hudi实现高效Upsert的核心。

* 表类型：提供了COW用于读优化场景，以及MOR用于写密集型场景。

* 智能文件管理：Hudi会自动进行Clustering（将小文件合并为更大的文件）和Compaction（将日志文件合并到基础文件），以优化文件大小和查询性能。

### ⚙️ 3. 计算引擎：批流一体的数据处理
计算引擎负责从消息队列或数据湖中读取数据，进行复杂的ETL（抽取-转换-加载）转换和聚合。

* Apache Spark：通用的批量计算 [官方文档](https://spark.apache.org/)：
Spark主要用于复杂的离线/批量数据处理，如大规模ETL、机器学习训练等。其核心实现是DataFrame API和Spark SQL，通过构建DAG来执行延迟计算和内存级的RDD转换。在与Hudi集成时，Spark可通过编程方式读写Hudi表，实现灵活的数据加工。

* Apache Flink：事件驱动的流计算
Flink是真正的流处理引擎，用于实时ETL和流式分析。其实现细节包括：

    状态与检查点：Flink的状态后端（如RocksDBStateBackend）能存储海量状态，而基于Chandy-Lamport算法的Checkpoint机制，则确保了在发生故障时，状态仍能达到Exactly-Once的语义一致性。

    Flink SQL：允许用户通过标准SQL语句定义流式计算任务，极大地降低了实时开发门槛。

* Apache Trino：即席的联邦查询 [官方文档](https://trino.io/)：
Trino是一个高性能的分布式SQL查询引擎，专为交互式分析设计，充当了计算与查询的统一入口。其核心实现为：

    联邦查询：支持无缝查询Hive、MySQL、Kafka、Hudi等多种异构数据源，对用户而言，它们就像同一个数据库。这是通过Connector插件实现的，每个Connector负责与特定数据源的交互。

    无共享MPP架构：由Coordinator负责解析SQL并生成执行计划，调度Task到Worker节点上并行执行，中间计算结果全内存处理，避免磁盘IO，从而获得秒级响应。

### 📊 4. OLAP/数仓服务：面向应用的高性能查询
在数据中台架构中，经过计算引擎处理后的结果数据，通常会导入到专门的分析型数据库中，以支撑高并发的BI报表和看板。

* StarRocks/Doris：极速的联合分析
这类系统尤其擅长极速的多表关联查询和灵活的数据模型，其实现优势在于：

    统一模型：对外提供单一的、聚合粒度更高的数据接口。一个典型场景是，原始数据经Flink CDC实时写入，StarRocks通过其物化视图功能为DWD、DWS层建模，直接服务应用和报表。

    湖仓一体：通过External Catalog功能，StarRocks可以直接查询存储在Hudi或Iceberg中的数据，避免了数据搬迁，实现查询加速，实现了湖仓的无缝融合。

### 🗓️ 5. 调度与治理：系统的指挥与保障
这层为整个数据中台提供自动化、有序的任务管理和数据质量、安全保障。

* DolphinScheduler：去中心化的任务调度
Apache DolphinScheduler是一个分布式可视化DAG工作流调度平台。其去中心化的架构决定了它的高可用性：

    Master-Worker解耦：Master节点负责DAG的解析与任务分发，Worker节点负责任务的实际执行，两者可以动态扩缩容，互不影响，无单点故障风险。

    任务插件化：支持Spark、Flink、Shell、SQL等多种任务类型，通过简单的配置即可创建复杂的ETL工作流。

* DataHub：元数据与血缘的中心
DataHub是第三代元数据平台，提供数据发现、治理和可观测性。其实现的关键在于：

    Automation (Actions Framework)：这是其自动化治理的核心。平台能实时监听元数据的变更事件（如Schema变化），并自动触发预设的工作流，例如通知负责人或发起数据质量检查，实现主动式治理。

* Ranger：统一的安全策略
Apache Ranger是为Hadoop生态量身定制的集中式安全管理框架。其核心实现是：

    PBAC插件化鉴权：Ranger为各组件（HDFS、Hive、HBase、Kafka等）提供鉴权插件，实施基于策略的访问控制。当用户查询时，组件内的插件会同步并缓存Ranger Admin分发的策略，用于实时鉴权。

    统一审计：所有鉴权请求和访问行为都会被记录下来，用于安全审计和合规分析。

### 🔌 6. 数据服务出口：让数据资产API化
统一对外提供数据服务，API网关是架构中的关键一环，负责安全、流控、协议转换等。

* APISIX：云原生的API管理
APISIX是基于Nginx和Lua的高性能、动态API网关。其实现亮点在于：

    数据面与控制面分离：采用ETCD作为配置中心，网关的Worker节点（数据面）实时监听ETCD的配置变更，实现路由、插件配置的秒级生效，无需重启服务，不影响在线流量。

    插件化扩展：官方提供了60+插件（如JWT认证、限流、降级），并支持通过Lua或WebAssembly编写自定义插件，可以方便地实现数据脱敏、鉴权等业务特定逻辑。

### 📈 7. 可视化：数据的交互与洞见
* Superset：自助式的BI分析
Apache Superset是一款开源的数据可视化与自助分析平台。其架构上，后端不存储任何业务数据，所有数据查询都通过SQL Alchemy直接下推到数据源（如StarRocks、Trino）执行，这保证了其能应对海量数据。通过简单的配置，用户即可创建从实时监控大屏到复杂分析报告的各种仪表盘。

## 💎 整体架构协同工作流
以一个电商订单的实时分析需求为例，数据在这套架构中的流转路径如下：

* 实时接入：Flink CDC以准实时的方式从业务库的orders表中捕获新增和变更的订单数据，并将这些变更以统一格式发送到Kafka的orders_cdc主题中。

* 实时入湖与计算：Flink作为流计算引擎，从Kafka消费数据。它执行一个清理和关联的ETL任务，将订单表与商品表、用户表关联，并将关联后的宽表数据以Upsert方式写入Apache Hudi数据湖中。

* 数据服务：运营人员在Apache Superset中打开一个“实时订单大屏”，Superset将生成的SQL查询发送给Trino。

* 联邦查询与鉴权：Trino通过其Hudi Connector直接查询数据湖中的订单宽表数据，在执行前，Trino的Ranger插件会校验该运营人员是否拥有查看订单数据的权限。

* 结果返回：鉴权通过后，Trino将查询结果快速返回给Superset，大屏上展示出实时的订单金额、销量等关键指标。整个过程，所有数据任务的执行均由DolphinScheduler统一调度，元数据和血缘信息则在DataHub上清晰可见。

