# System Architecture --- AI Product Intelligence Platform

**Version:** 1.0\
**Status:** Draft\
**Scope:** MVP architecture. Product requirements are defined separately
in `prd.md`.

## 1. Overview

The platform collects structured product events from customer
applications, processes them asynchronously, provides behavioral
analytics, and generates evidence-backed product improvement
recommendations using AI.

The architecture separates customer-facing application workloads, event
ingestion, analytical storage, and AI analysis. AI provides decision
support only; customers retain control over product decisions and
implementation.

### Architecture principles

-   Separate transactional application workloads from high-volume
    analytics.
-   Acknowledge event batches after durable queue acceptance, not after
    analytics storage.
-   Perform deterministic calculations before asking AI to interpret
    results.
-   Provide evidence and traceability for every recommendation.
-   Enforce organization and project isolation across APIs, data stores,
    jobs, and AI workflows.
-   Prefer managed services for the MVP.
-   Instrument services and workflows for observability and recovery.

## 2. Proposed Technology Stack

  -----------------------------------------------------------------------
  Layer                   Technology              Responsibility
  ----------------------- ----------------------- -----------------------
  Web application         Next.js                 Customer dashboard

  Backend API             NestJS                  Auth, organizations,
                                                  projects, features,
                                                  recommendations

  API hosting             AWS Lambda              Run API workloads

  API entry point         Amazon API Gateway      HTTP API access

  Transactional database  Amazon RDS PostgreSQL   Application and
                                                  workflow state

  Connection management   RDS Proxy               Manage
                                                  Lambda-to-PostgreSQL
                                                  connections where
                                                  appropriate

  Event queue             Amazon SQS              Buffer and decouple
                                                  event ingestion

  Event processing        AWS Lambda              Validate, normalize,
                                                  and batch events

  Analytics store         ClickHouse              Behavioral event
                                                  storage and analytics

  Scheduler               Amazon EventBridge      Trigger periodic
                                                  analysis

  AI                      Amazon Bedrock          Interpret validated
                                                  evidence and generate
                                                  recommendations

  Object storage          Amazon S3               Exports and object
                                                  artifacts

  Monitoring              Amazon CloudWatch       Logs, metrics, alarms

  Infrastructure as code  Terraform or AWS CDK    Provision cloud
                                                  resources

  ORM and migrations      Prisma                  PostgreSQL access and
                                                  schema management
  -----------------------------------------------------------------------

Validate service sizing, region, availability, and cost before
production deployment.

## 3. Logical Architecture

``` mermaid
flowchart TB
  subgraph Customer["Customer Environment"]
    APP["Customer Web Application"] --> SDK["Tracking SDK"]
  end

  subgraph Ingestion["Event Ingestion"]
    GW["API Gateway"] --> ING["Ingestion Lambda"]
    ING --> Q["SQS"]
    Q --> WORKER["Event Processor Lambda"]
    Q -. failed messages .-> DLQ["Dead-Letter Queue"]
  end

  subgraph Platform["Product Intelligence Platform"]
    WEB["Next.js Dashboard"] --> API["NestJS API"]
    API --> PG[("RDS PostgreSQL")]
    API --> CH[("ClickHouse")]
    SCHED["EventBridge"] --> AIWORKER["AI Analysis Worker"]
    AIWORKER --> PG
    AIWORKER --> CH
    AIWORKER --> BEDROCK["Amazon Bedrock"]
    AIWORKER --> PG
    API --> S3["Amazon S3"]
  end

  SDK --> GW
  WORKER --> CH
```

### Component responsibilities

**Next.js dashboard** - Displays project activity, analytics, insights,
and recommendations. - Supports organization, project, and
recommendation workflows.

**NestJS API** - Authenticates users and enforces organization
membership and roles. - Manages organizations, projects, tracking
credentials, features, and recommendations. - Exposes analytics and
workflow APIs.

**Ingestion Lambda** - Validates project tracking credentials and event
payloads. - Derives organization and project scope from the validated
credential. - Publishes accepted batches to SQS.

**Event processor Lambda** - Consumes queued batches. - Normalizes and
validates events. - Performs batched ClickHouse inserts. - Handles
retries and partial failures.

**PostgreSQL** - Owns transactional application data and workflow state.

**ClickHouse** - Owns behavioral event data and analytical queries.

**AI analysis worker** - Retrieves project context and analytical
aggregates. - Runs deterministic pattern detection. - Prepares evidence
for AI interpretation. - Validates and persists recommendations.

**Amazon Bedrock** - Interprets validated evidence and returns
structured hypotheses. - Does not directly modify customer products or
access unrestricted data.

## 4. Data Ownership and Boundaries

  Data                                            System of record
  ----------------------------------------------- ------------------
  Users, organizations, memberships               PostgreSQL
  Projects and settings                           PostgreSQL
  Tracking credential hashes and metadata         PostgreSQL
  Feature definitions and event mappings          PostgreSQL
  Recommendations, feedback, and status history   PostgreSQL
  Analysis run state                              PostgreSQL
  Behavioral events                               ClickHouse
  Behavioral aggregations                         ClickHouse
  Exports and object artifacts                    S3

**Ownership rule:** PostgreSQL owns application state; ClickHouse owns
behavioral event analytics. Avoid competing sources of truth.

### 4.1 PostgreSQL logical entities

-   Identity and tenancy: `User`, `Organization`, `OrganizationMember`
-   Project management: `Project`, `ProjectApiKey`, `ProjectSetting`
-   Product definition: `Feature`, `FeatureEventMapping`, optional
    `EventSchema`
-   AI and recommendations: `Recommendation`, `RecommendationFeedback`,
    `RecommendationStatusHistory`, `AnalysisRun`
-   Governance: `AuditLog`, `DataRetentionSetting`, `DeletionRequest`

Use stable identifiers, foreign keys, uniqueness constraints, and
explicit organization/project scope. PostgreSQL row-level security may
provide defense in depth, but does not replace application
authorization.

### 4.2 ClickHouse logical event record

  Field                      Description
  -------------------------- -------------------------------------------
  `event_id`                 Stable unique event identifier
  `organization_id`          Organization scope
  `project_id`               Project scope
  `event_name`               Tracked action
  `anonymous_id`             Anonymous user reference
  `user_id`                  Identified user reference, when available
  `session_id`               Session reference
  `event_timestamp`          Time the event occurred
  `page_name`, `page_path`   Page or screen context
  `properties`               Structured event properties
  `sdk_version`              SDK version
  `ingested_at`              Platform ingestion time

Initial physical design can partition by event month and order by
project and event time. Final partitioning, ordering, and retention must
be validated against actual query patterns.

## 5. Event Collection and Processing

### 5.1 SDK responsibilities

The customer-facing SDK should expose conceptual methods:

  Method         Purpose
  -------------- ------------------------------------------------
  `init()`       Initialize tracking for a project
  `track()`      Record a named event
  `identify()`   Associate activity with a known user reference
  `page()`       Record a page or screen view
  `reset()`      Clear the current identity when required
  `flush()`      Send buffered events

SDK behavior: - Batch events and use a bounded queue. - Retry transient
failures with exponential backoff and jitter. - Support session and
identity handling. - Respect consent settings. - Validate event names
and payload sizes. - Avoid collecting sensitive data.

### 5.2 Event flow

``` mermaid
sequenceDiagram
  participant App as Customer App
  participant SDK as Tracking SDK
  participant GW as API Gateway
  participant Ingest as Ingestion Lambda
  participant Q as SQS
  participant Worker as Event Processor
  participant CH as ClickHouse

  App->>SDK: track(event)
  SDK->>GW: Send event batch
  GW->>Ingest: Invoke handler
  Ingest->>Ingest: Validate key and payload
  Ingest->>Q: Publish batch
  Q-->>Ingest: Queue acceptance
  Ingest-->>SDK: Acknowledge accepted batch
  Q->>Worker: Deliver messages
  Worker->>Worker: Normalize and validate
  Worker->>CH: Batch insert
  CH-->>Worker: Insert result
```

An ingestion acknowledgement means the batch was accepted by SQS. It
does not mean the event has already been persisted in ClickHouse.

#### Event validation and isolation policy

Events are validated and normalized at the ingestion boundary, before a
batch is queued.

-   **Request-level rejection (HTTP 400, nothing stored):** malformed
    body, empty batch, more than 100 events, or an event missing
    `eventId` (UUID), `eventName` (1-200 characters), or an ISO 8601
    `timestamp`.
-   **Event-level isolation (HTTP 202):** an event that passes the
    structural check but fails a semantic rule is isolated; the rest of
    the batch is still accepted. Rules: `eventName` not blank and free of
    control characters; `timestamp` no more than 24 hours in the future;
    at least one of `anonymousId` or `userId`; `properties` at most 50
    keys and 8 KB serialized.
-   Isolated events are recorded on the batch as `{ eventId, errors }`
    (error codes only) and are never forwarded to analytics. A batch
    whose events are all isolated is stored with status `INVALID`. The
    original payload is retained on the batch for audit and replay.
-   The response reports `eventCount`, `validEventCount`, and
    `invalidEventCount`.
-   **Normalization:** string fields are trimmed, blank optional fields
    dropped, timestamps converted to UTC, unknown top-level fields
    discarded, and `organizationId`, `projectId`, and `ingestedAt` are set
    by the server from the tracking credential. Payload values can never
    set tenant identifiers.
-   **Observability:** each batch with isolated events emits one
    structured warning containing the batch ID, tenant scope, counts, and
    per-error-code counts. Event content and user identifiers are not
    logged.

### 5.3 Reliability requirements

-   Assume SQS/Lambda delivery is at-least-once.
-   Use stable event identifiers and an explicit deduplication strategy.
-   Do not assume standard ClickHouse MergeTree tables enforce
    uniqueness.
-   Use bounded batches and handle partial insert failures.
-   Configure retries and a dead-letter queue.
-   Define replay and recovery procedures.
-   Monitor queue depth, oldest-message age, processing latency, and DLQ
    volume.

## 6. Analytics Design

### Initial capabilities

-   Total event activity.
-   Active users.
-   Feature adoption and usage trends.
-   Most and least used features.
-   Basic funnels and step-level drop-off.
-   Common event sequences or journeys.
-   Notable increases and decreases in activity.

### Metric definitions

\[ `\text{Feature Adoption Rate}`{=tex} =
`\frac{\text{Unique active users who used the feature}}`{=tex}
{`\text{Total active users}`{=tex}} `\times 100`{=tex} \]

The numerator and denominator must use the same project, period,
identity rules, and eligibility criteria.

Funnel calculations must define ordered steps, identity rules,
conversion window, date range, repeat-event behavior, and re-entry
rules. Analytics responses should include the filters and period used.

### Query boundaries

-   Use PostgreSQL for transactional operations.
-   Use ClickHouse for high-volume event aggregations.
-   Authorize organization and project scope before analytical queries.
-   Apply query timeouts, limits, and pagination.
-   Add pre-aggregations only when measured workload justifies them.

## 7. AI Recommendation Workflow

``` mermaid
flowchart TD
  A["Scheduled or manual trigger"] --> B["Create analysis run"]
  B --> C["Load project context and feature definitions"]
  C --> D["Fetch behavioral aggregates"]
  D --> E["Run deterministic pattern detection"]
  E --> F["Prepare evidence package"]
  F --> G["Amazon Bedrock interpretation"]
  G --> H["Validate schema and evidence"]
  H --> I["Calculate priority"]
  I --> J["Check duplicate recommendations"]
  J --> K["Persist recommendation"]
  K --> L["Customer review"]
```

### Workflow stages

1.  EventBridge or a manual request triggers analysis.
2.  Create an analysis-run record with project, period, status, and
    timestamps.
3.  Load product context, feature definitions, and event mappings.
4.  Retrieve relevant aggregates from ClickHouse.
5.  Run deterministic rules for low adoption, unusual changes, repeated
    patterns, and funnel drop-offs.
6.  Prepare a bounded evidence package.
7.  Ask Bedrock to interpret the evidence and propose improvements.
8.  Validate the response schema and every numerical claim.
9.  Calculate a consistent priority score.
10. Check for substantially duplicate active recommendations.
11. Persist validated recommendations and update run status.
12. Display recommendations for human review.

### AI input boundaries

Permitted context: - Product and project descriptions. - Feature
definitions and event mappings. - Approved event names and property
summaries. - Aggregated metrics, funnel summaries, and journey
summaries. - Metric definitions and date ranges. - Relevant existing
recommendations.

Do not provide unrestricted raw event streams, passwords, payment
credentials, sensitive personal data, or another tenant's information.
Treat event content as untrusted data, never as system instructions.

### Recommendation output

A recommendation should contain: - Title and summary. - Category and
affected feature/product area. - Observed evidence and relevant time
period. - Interpretation or hypothesis. - Suggested action. - Potential
impact and confidence assessments. - Evidence references.

### Prioritization

A simple initial relative ranking model:

\[ `\text{Priority Score}`{=tex} = `\text{Reach}`{=tex}
`\times `{=tex}`\text{Impact}`{=tex}
`\times `{=tex}`\text{Confidence}`{=tex} \]

Normalize each input to a defined range such as 0--1. This is a ranking
aid, not a probability of success. Retain the component values and
explain the scoring approach.

### AI validation and safety

-   Validate model output against a strict schema.
-   Reject unsupported numerical claims.
-   Require evidence references for behavioral claims.
-   Label interpretations as hypotheses.
-   Provide only authorized, read-only analytical capabilities.
-   Persist recommendations only after application-level validation.
-   Never allow AI to make product changes or deployments.

## 8. API Responsibility Groups

Exact endpoint paths and schemas belong in a separate API specification.

  API group         Responsibility
  ----------------- ----------------------------------------------------
  Authentication    Registration, sign-in, sign-out, password reset
  Organizations     Organization and membership management
  Projects          Project lifecycle and settings
  API keys          Tracking credential creation, rotation, revocation
  Event ingestion   Accept and validate tracking batches
  Features          Feature definitions and event mappings
  Analytics         Usage, adoption, trends, funnels, journeys
  Insights          Behavioral insight listing and details
  Recommendations   Listing, details, status changes, feedback
  Analysis          Manual analysis requests and run status
  Data governance   Retention and deletion requests

Dashboard APIs require authenticated users. Public tracking credentials
must only authorize event ingestion, never administrative access.

## 9. Security and Tenant Isolation

### Authentication and authorization

-   Authenticate dashboard users and enforce organization membership and
    roles.
-   Derive event organization/project scope from a validated tracking
    credential.
-   Never trust unverified tenant identifiers supplied by an SDK
    request.
-   Authorize every PostgreSQL and ClickHouse access.

### Credential management

-   Store only secure hashes of project tracking secrets.
-   Support revocation and rotation.
-   Apply ingestion rate and payload-size limits.
-   Keep administrative credentials separate from public tracking
    credentials.

### Cloud security

-   Encrypt data in transit and at rest.
-   Keep databases in private network boundaries.
-   Use least-privilege IAM roles.
-   Store secrets in AWS Secrets Manager.
-   Separate runtime permissions from migration/admin permissions.
-   Avoid logging credentials or sensitive event properties.
-   Audit security-sensitive actions.

### Tenant isolation

Enforce organization and project scope in APIs, databases, analytics
queries, background jobs, AI context, exports, and deletion workflows.
Row-level security can provide defense in depth but is not a substitute
for application authorization.

## 10. Privacy and Data Lifecycle

-   Collect only data required for product analytics.
-   Support consent-aware tracking and provide customer guidance.
-   Avoid passwords, payment details, sensitive form fields, and
    unnecessary personal data.
-   Define and communicate retention policies.
-   Support deletion across PostgreSQL, ClickHouse, queued messages, and
    S3 artifacts as applicable.
-   Apply data minimization to AI prompts and outputs.
-   Assess India's DPDP requirements and GDPR where applicable with
    qualified legal advice.

## 11. Reliability and Scalability

### Lambda and PostgreSQL

-   Reuse database clients where safe.
-   Use RDS Proxy where appropriate.
-   Set Lambda concurrency based on database capacity.
-   Keep transactions short and configure timeouts.
-   Run migrations as a controlled deployment step, not during cold
    starts.

### ClickHouse

-   Use batch inserts.
-   Monitor storage, insert latency, query latency, and expensive
    queries.
-   Establish query limits and timeouts.
-   Add materialized views or pre-aggregations only when justified by
    measured demand.

### AI workflows

-   Run analysis asynchronously.
-   Persist workflow state for retries and investigation.
-   Bound prompt/context size.
-   Apply model timeouts and retry policies.
-   Record model, prompt version, evidence references, and validation
    outcomes.
-   Consider Step Functions if the workflow becomes long-running or
    needs complex branching and recovery.

## 12. Observability

  -----------------------------------------------------------------------
  Area                                Signals
  ----------------------------------- -----------------------------------
  API                                 Request volume, error rate,
                                      latency, throttling

  Ingestion                           Accepted/rejected batches,
                                      validation failures

  SQS                                 Queue depth, oldest-message age,
                                      retries, DLQ count

  Event worker                        Events processed, insert failures,
                                      processing latency

  PostgreSQL                          Connections, CPU, storage, query
                                      latency

  ClickHouse                          Insert/query latency, storage,
                                      failed queries

  AI workflow                         Run duration, failures, token
                                      usage, cost, validation failures

  Product quality                     Event coverage, unmapped events,
                                      recommendation review outcomes
  -----------------------------------------------------------------------

Use correlation IDs to trace event batches and analysis runs across
services. Do not place sensitive user data in logs.

## 13. Deployment and Environments

Maintain separate development, staging, and production environments.

-   Provision resources through infrastructure as code.
-   Use automated build, test, and deployment pipelines.
-   Run database migrations as an explicit deployment step.
-   Keep secrets outside source control.
-   Use backward-compatible event contracts where possible.
-   Verify ingestion and analytics flows after deployment.
-   Define rollback procedures for application releases and
    configuration changes.

## 14. Suggested Repository Structure

``` text
product-intelligence/
├── apps/
│   ├── web/                 # Next.js dashboard
│   ├── api/                 # NestJS application API
│   ├── ingestion/           # Event ingestion handler
│   ├── event-worker/        # Queue consumer and event processor
│   ├── ai-worker/           # Behavioral analysis and AI workflow
│   └── scheduler/           # Scheduled analysis entry point
├── packages/
│   ├── sdk/                 # Customer-facing tracking SDK
│   ├── contracts/           # Shared event and API contracts
│   ├── domain/              # Domain rules and types
│   ├── analytics/           # Metric definitions and analytics logic
│   ├── ai/                  # Prompt templates and AI validation
│   ├── database/            # Prisma schema and migrations
│   └── config/              # Shared configuration
├── infrastructure/
│   ├── aws/
│   └── terraform/
├── docs/
│   ├── prd.md
│   ├── architecture.md
│   ├── api.md
│   └── decisions/
└── package.json
```

This is a suggested monorepo layout. Each folder does not need to become
a separately deployed service in the first iteration.

## 15. Key Architecture Decisions

  -----------------------------------------------------------------------
  Decision                            Rationale
  ----------------------------------- -----------------------------------
  PostgreSQL for application data     Relational entities, transactions,
                                      constraints, evolving workflows

  ClickHouse for behavioral events    Analytical workloads over
                                      high-volume event data

  SQS between ingestion and           Decouples customer requests from
  processing                          downstream processing

  Lambda for event-driven workloads   Managed execution for API,
                                      processing, and scheduled jobs

  Bedrock for AI interpretation       Managed model access for structured
                                      recommendations

  Deterministic analytics before AI   Reproducible calculations and
                                      evidence-backed claims

  Human approval for recommendations  Customer retains control over
                                      product changes

  Separate transactional and          Prevent analytics workloads from
  analytical stores                   overwhelming application
                                      transactions
  -----------------------------------------------------------------------

## 16. MVP Implementation Sequence

1.  Establish web app, API, identity, organizations, and projects.
2.  Add tracking credentials and the first SDK release.
3.  Implement ingestion, SQS buffering, processing, and ClickHouse
    storage.
4.  Implement feature definitions and event mappings.
5.  Add core analytics and dashboard views.
6.  Add deterministic behavioral insights.
7.  Add Bedrock recommendation generation and evidence validation.
8.  Add recommendation review and status management.
9.  Complete privacy, deletion, observability, and reliability testing.
10. Run a controlled pilot with 3--5 businesses.

## 17. Open Technical Decisions

Validate these during implementation:

-   ClickHouse hosting model and deployment topology.
-   AWS region and data residency requirements.
-   Event retention and deletion strategy.
-   Event schema and schema evolution policy.
-   Deduplication strategy and guarantees.
-   ClickHouse partition/order keys based on actual query patterns.
-   RDS sizing, RDS Proxy configuration, and Lambda concurrency.
-   Bedrock model selection, regional availability, evaluation, and cost
    limits.
-   Whether Step Functions is required for the first production release.
-   Whether Redis is justified by measured caching or rate-limiting
    needs.

------------------------------------------------------------------------

**End of document**
