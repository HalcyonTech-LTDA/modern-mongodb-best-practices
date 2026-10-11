---
name: modern-mongodb-engineering
description: "Automatically enforces modern MongoDB engineering standards: schema design & data modeling patterns, declarative JSON Schema validation ($jsonSchema), BSON typing hygiene (Decimal128, UTC dates), compound indexing & ESR rule, query diagnostics (explain executionStats, zero COLLSCAN), connection pooling & majority concerns, multi-document ACID transactions, zero-downtime migrations with migrate-mongo, and mandatory dedicated living README.md runbook documentation."
---

# Modern MongoDB Engineering Guardrails & Skill Router

Entry point for this plugin's guardrails in Claude Code. Before acting, read the full standard:

`${CLAUDE_PLUGIN_ROOT}/rules/modern-mongodb-engineering.md`

It routes each kind of task to the specialized skill of this plugin and lists the non-negotiable rules.
In Claude Code those skills are namespaced: invoke `modern-mongodb-best-practices:<skill-name>`.

> Generated from `rules/modern-mongodb-engineering.md`, which is also the Antigravity rule. Edit the rule, not this file.
