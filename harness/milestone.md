# Project Milestones

## AI Product Intelligence Platform

**Document version:** 1.0\
**Status:** Draft\
**Delivery horizon:** 10 weeks\
**Purpose:** Define milestone outcomes, exit criteria, dependencies, and
release gates for the MVP.

------------------------------------------------------------------------

## 1. Milestone Summary

  -------------------------------------------------------------------------
  ID               Milestone                       Target Primary outcome
  ---------------- ---------------- --------------------- -----------------
  M1               Application                     Week 1 Users can
                   Foundation                             register and
                                                          create an
                                                          organization

  M2               Project Setup                   Week 2 A customer can
                   and SDK                                configure a
                                                          project and send
                                                          a test event

  M3               Event Ingestion                 Week 3 Events are
                   Pipeline                               reliably queued,
                                                          processed, and
                                                          stored

  M4               Feature                         Week 4 Features can be
                   Management and                         mapped to events
                   Analytics                              and core metrics
                   Foundation                             validated

  M5               Product                         Week 5 Customers can
                   Analytics                              understand
                   Dashboard                              product usage and
                                                          feature adoption

  M6               Funnels and                     Week 6 Customers can
                   Behavioral                             identify
                   Insights                               drop-offs and
                                                          usage patterns

  M7               AI                              Week 7 Evidence-backed
                   Recommendation                         AI
                   Engine                                 recommendations
                                                          can be generated

  M8               Recommendation                  Week 8 Customers can
                   Review Workflow                        review and manage
                                                          recommendations

  M9               Security and                    Week 9 Critical
                   Pilot Readiness                        security,
                                                          reliability, and
                                                          privacy checks
                                                          pass

  M10              Production MVP                 Week 10 MVP is released
                   and Pilot Launch                       and pilot
                                                          customers are
                                                          onboarded
  -------------------------------------------------------------------------

## 2. Detailed Milestones

### M1 --- Application Foundation

`<badge color="info">`{=html}Target: Week 1`</badge>`{=html}

**Objective:** Establish the application foundation and user identity.

**Scope** - Repository and workspace setup. - Next.js web application. -
NestJS API application. - Development, staging, and production
environment foundations. - PostgreSQL and Prisma setup. - Authentication
and session handling. - Organization creation and membership
foundation. - CI pipeline, linting, formatting, and baseline tests.

**Deliverables** - Running web application and API. - User registration
and sign-in. - Organization creation. - Initial CI pipeline. -
Development deployment.

**Exit criteria** - \[ \] A user can register and sign in. - \[ \] A
user can create an organization. - \[ \] Application and API are
deployed to the development environment. - \[ \] CI checks run
successfully. - \[ \] Secrets are managed outside source control.

**Dependencies:** None.

### M2 --- Project Setup and Tracking SDK

`<badge color="info">`{=html}Target: Week 2`</badge>`{=html}

**Objective:** Enable customers to configure a project and begin
tracking product activity.

**Scope** - Project create, view, update, and archive operations. -
Tracking credential generation, rotation, and revocation. - Secure
credential hash storage. - Event contract definition. - SDK
initialization and core tracking methods. - Event batching and bounded
buffering. - Consent-aware tracking behavior. - Sample React
application. - Developer onboarding documentation.

**Deliverables** - Project management UI and APIs. - Tracking credential
lifecycle. - Initial web tracking SDK. - Sample integration and
documentation.

**Exit criteria** - \[ \] A user can create and manage a project. - \[
\] A project tracking credential can be generated and revoked. - \[ \]
SDK can initialize using a project credential. - \[ \] SDK supports
`track`, `identify`, `page`, `reset`, and `flush`. - \[ \] A developer
can send a test event from the sample application. - \[ \] Consent
behavior and sensitive-data guidance are documented.

**Dependencies:** M1.

### M3 --- Event Ingestion Pipeline

`<badge color="info">`{=html}Target: Week 3`</badge>`{=html}

**Objective:** Reliably receive, process, and store product events.

**Scope** - Event ingestion endpoint. - Credential and payload
validation. - Organization and project scope derivation. - SQS queue and
dead-letter queue. - Event processor. - ClickHouse setup and initial
event table. - Batch inserts. - Stable event identifiers and
deduplication strategy. - Retry and partial-failure handling. - Queue
and ingestion monitoring.

**Deliverables** - Working event ingestion flow. - Asynchronous event
processing. - ClickHouse event storage. - Retry and DLQ handling. -
Basic operational metrics.

**Exit criteria** - \[ \] Valid event batches are accepted. - \[ \]
Invalid credentials and malformed events are rejected. - \[ \] Accepted
batches are queued for processing. - \[ \] Events are persisted in
ClickHouse. - \[ \] Duplicate delivery does not inflate the agreed test
metrics. - \[ \] Failed messages can be inspected and recovered. - \[ \]
Ingestion acknowledgement semantics are documented.

**Dependencies:** M2.

### M4 --- Feature Management and Analytics Foundation

`<badge color="info">`{=html}Target: Week 4`</badge>`{=html}

**Objective:** Define product features and establish trustworthy core
metrics.

**Scope** - Feature create, edit, view, and archive. - Event-to-feature
mapping. - Unmapped event visibility. - Active-user calculation. -
Feature usage and adoption calculation. - Date range and timezone
rules. - Anonymous and identified user handling. - Deterministic
analytics test datasets.

**Deliverables** - Feature management UI and APIs. - Event mapping
workflow. - Core metric calculation functions. - Documented metric
definitions. - Analytics validation datasets.

**Exit criteria** - \[ \] Users can create and manage features. - \[ \]
Users can map events to features. - \[ \] Unmapped events can be
identified. - \[ \] Active-user and adoption metrics are implemented. -
\[ \] Calculations match expected results on agreed test datasets. - \[
\] Identity and date-boundary rules are documented.

**Dependencies:** M3.

### M5 --- Product Analytics Dashboard

`<badge color="info">`{=html}Target: Week 5`</badge>`{=html}

**Objective:** Make product usage understandable through the customer
dashboard.

**Scope** - Project overview dashboard. - Event activity. - Active
users. - Feature adoption. - Feature usage trends. - Most and least used
features. - Date-range filters. - Feature detail views. - Loading,
empty, and error states. - Tenant authorization checks.

**Deliverables** - Product analytics dashboard. - Feature usage detail
views. - Date filtering and metric context.

**Exit criteria** - \[ \] Dashboard displays event activity and active
users. - \[ \] Feature adoption and usage trends are visible. - \[ \]
Users can select a date range. - \[ \] Metric definitions and date
ranges are clear. - \[ \] Empty projects show useful setup guidance. -
\[ \] Users cannot view analytics for unauthorized projects.

**Dependencies:** M4.

### M6 --- Funnels and Behavioral Insights

`<badge color="info">`{=html}Target: Week 6`</badge>`{=html}

**Objective:** Identify meaningful behavior patterns and possible
friction points.

**Scope** - Basic funnel definition and reporting. - Funnel step
counts. - Conversion and drop-off calculations. - Funnel identity and
conversion-window rules. - Deterministic behavioral patterns: - High and
low feature usage. - Significant activity increases or decreases. -
Funnel drop-off. - Repeated behavior patterns where evidence is
sufficient. - Evidence and time-period display. - Low-volume data
safeguards.

**Deliverables** - Basic funnel analytics. - Behavioral insights. -
Insight details with supporting evidence.

**Exit criteria** - \[ \] Users can define and view a basic funnel. - \[
\] Funnel conversion and drop-off are calculated consistently. - \[ \]
Behavioral insights are generated from deterministic rules. - \[ \] Each
insight includes supporting metrics and a time period. - \[ \] Observed
facts are distinguished from possible explanations. - \[ \] Low-volume
data does not produce misleading conclusions.

**Dependencies:** M5.

### M7 --- AI Recommendation Engine

`<badge color="info">`{=html}Target: Week 7`</badge>`{=html}

**Objective:** Generate product improvement recommendations from
validated behavioral evidence.

**Scope** - Recommendation data contract. - Analysis-run lifecycle. -
Scheduled and manual analysis triggers. - Project and feature context
retrieval. - Behavioral aggregate retrieval. - Evidence package
generation. - Amazon Bedrock integration. - Structured output and schema
validation. - Numerical claim validation. - Reach × impact × confidence
prioritization. - Basic duplicate recommendation detection. -
Recommendation persistence.

**Deliverables** - AI analysis workflow. - Bedrock integration. -
Structured recommendations. - Evidence and validation layer. - Initial
priority scoring.

**Exit criteria** - \[ \] Analysis runs can be triggered and tracked. -
\[ \] AI receives authorized project context and bounded evidence. - \[
\] Recommendations follow the agreed response schema. - \[ \] Every
numerical claim is supported by validated analytics. - \[ \] Evidence
and interpretation are clearly separated. - \[ \] Unsupported
recommendations are rejected or corrected. - \[ \] AI cannot execute
product changes.

**Dependencies:** M6.

### M8 --- Recommendation Review Workflow

`<badge color="info">`{=html}Target: Week 8`</badge>`{=html}

**Objective:** Give customers control over evaluating and managing AI
recommendations.

**Scope** - Recommendation list and detail views. - Evidence, metrics,
and time-period display. - Accept, reject, and defer actions. -
Recommendation status history. - Optional rejection reason. -
Analysis-run status display. - Audit events for review actions. -
End-to-end user journey improvements.

**Deliverables** - Recommendation management UI. - Review and status
workflow. - Complete primary MVP journey.

**Exit criteria** - \[ \] Users can view recommendations. - \[ \] Users
can inspect recommendation evidence. - \[ \] Users can accept, reject,
or defer recommendations. - \[ \] Status changes are persisted. - \[ \]
Review history is available. - \[ \] The journey from account creation
to recommendation review works end to end.

**Dependencies:** M7.

### M9 --- Security and Pilot Readiness

`<badge color="warning">`{=html}Target: Week 9`</badge>`{=html}

**Objective:** Verify that the MVP is safe and reliable enough for
controlled pilot use.

**Scope** - Organization and project isolation tests. - IAM and secrets
review. - Tracking credential rotation and revocation tests. - Event
volume and retry testing. - Duplicate delivery and DLQ recovery tests. -
PostgreSQL connection and Lambda concurrency review. - ClickHouse query
performance and retention review. - Project data deletion validation. -
Sensitive-data logging review. - Operational alarms. - Dependency and
application security checks. - High-priority defect fixes.

**Deliverables** - Security and reliability test report. - Operational
dashboards and alarms. - Pilot-readiness issue list. - Release-blocker
decisions.

**Exit criteria** - \[ \] No unauthorized cross-tenant access is
observed in the test suite. - \[ \] Critical event failure and recovery
paths are tested. - \[ \] Tracking credentials can be revoked. - \[ \]
Data deletion behavior is verified and documented. - \[ \] Critical
operational failures generate alerts. - \[ \] No unresolved critical
security or reliability issue remains.

**Dependencies:** M8.

### M10 --- Production MVP and Pilot Launch

`<badge color="success">`{=html}Target: Week 10`</badge>`{=html}

**Objective:** Release the MVP and validate it with initial businesses.

**Scope** - End-to-end regression testing. - SDK integration testing in
representative web applications. - Analytics accuracy verification. -
Recommendation relevance evaluation. - AI cost and quality review. -
Release-blocking defect resolution. - Onboarding documentation. -
Production deployment. - Pilot customer onboarding. - Feedback
collection and next-iteration planning.

**Deliverables** - Production MVP. - Pilot onboarding guide. - Release
notes and known limitations. - Pilot feedback summary. - Prioritized
post-MVP backlog.

**Exit criteria** - \[ \] Core user journeys work in production. - \[ \]
Pilot customers can integrate tracking. - \[ \] Customers can view
product analytics. - \[ \] Recommendations are evidence-backed and
reviewable. - \[ \] Monitoring and support procedures are active. - \[
\] 3--5 pilot businesses are onboarded or have confirmed onboarding
dates. - \[ \] Feedback is captured and converted into prioritized
product work.

**Dependencies:** M9.

## 3. Milestone Dependency Flow

``` mermaid
flowchart TD
  M1["M1 Application Foundation"] --> M2["M2 Project Setup and SDK"]
  M2 --> M3["M3 Event Ingestion Pipeline"]
  M3 --> M4["M4 Feature and Analytics Foundation"]
  M4 --> M5["M5 Analytics Dashboard"]
  M5 --> M6["M6 Funnels and Behavioral Insights"]
  M6 --> M7["M7 AI Recommendation Engine"]
  M7 --> M8["M8 Recommendation Review"]
  M8 --> M9["M9 Security and Pilot Readiness"]
  M9 --> M10["M10 Production MVP and Pilot"]
```

Some work can run in parallel where contracts and dependencies are
stable. For example, dashboard design and test dataset preparation can
begin before all analytics APIs are complete.

## 4. Cross-Milestone Quality Gates

These quality gates apply throughout delivery.

  Gate                 Required evidence
  -------------------- --------------------------------------------------------
  Code quality         Review completed, linting and automated checks pass
  Functional quality   Milestone acceptance criteria pass
  Data quality         Event and analytics calculations validated
  Security             Authentication, authorization, and tenant scope tested
  Reliability          Failure, retry, and recovery behavior verified
  Observability        Important operations produce useful logs and metrics
  Documentation        User and developer documentation updated
  Release readiness    No unresolved release-blocking defects

## 5. Key Project-Level KPIs

These are initial targets for the MVP and should be confirmed against
pilot workload.

  -----------------------------------------------------------------------
  KPI                                                      Initial target
  ------------------------------ ----------------------------------------
  SDK setup time for a supported                         Under 15 minutes
  web application                

  Event processing success under                             At least 99%
  agreed test conditions         

  Analytics accuracy against                                         100%
  deterministic test datasets    

  Published recommendations with                                     100%
  traceable evidence             

  Unauthorized cross-tenant                                             0
  access in security tests       

  Standard dashboard query          p95 under 3 seconds under agreed test
  latency                                                            load

  Pilot businesses                                                   3--5
  -----------------------------------------------------------------------

## 6. Release Decision

The MVP can move from pilot readiness to production pilot when:

-   M1--M8 functional outcomes are complete.
-   M9 security and reliability exit criteria are satisfied.
-   M10 release checks pass.
-   Critical privacy, security, and data-integrity risks have been
    addressed.
-   A named owner is available for pilot support.
-   Known limitations are documented and communicated to pilot
    customers.

## 7. Post-MVP Milestones

Post-MVP work should be prioritized using pilot feedback and observed
usage.

  -----------------------------------------------------------------------
  Candidate milestone                 Potential outcome
  ----------------------------------- -----------------------------------
  P1 --- Conversational Analytics     Ask questions about product usage
                                      in natural language

  P2 --- Team Collaboration           Comments and shared decisions on
                                      recommendations

  P3 --- Proactive Notifications      Alerts for meaningful behavioral
                                      changes

  P4 --- Advanced Segmentation        Cohort and segment-level analytics

  P5 --- Integrations                 Project management and
                                      issue-tracking workflows

  P6 --- Recommendation Outcomes      Measure whether accepted
                                      recommendations improve product
                                      metrics

  P7 --- Additional SDKs              Broader web and mobile platform
                                      support
  -----------------------------------------------------------------------

------------------------------------------------------------------------

**End of document**
