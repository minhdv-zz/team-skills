---
name: "model-routing-dang"
author: "dangpbh"
description: "Lets the lead choose which AI model runs each task of the 3D Automation - Dangpbh pipeline (GPT image model for concepts, Claude model and effort for 3D work, Claude or GPT model for skill creation and updates) through popups, stores it in model_routing.json, and makes each stage use its routed model. Use at the kick-off, when a chat opens a new phase, before any skill is created or updated, or when the lead says to change models."
---

# Model routing (who runs which task)

The lead controls the model for every AI task. Routing file: `D:\AI - Dang\3D Automation - Dangpbh\model_routing.json` (tasks: `concept_image`, `intake_analysis`, `build_3d`, `tripo_cleanup`, `topology_tris_colour`, `review_fix`, `verdict_export`, `skill_work`; each with provider, model, effort, how).

## 1. Routing popup (inside the kick-off; and on "change models")

Kick-off question: "AI models for this model?" → `same as last routing` (default), `change routing`.

On `change routing`, one AskUserQuestion (4 questions; first option = current value):
1. **Concept images (ChatGPT)**: `astra`, `sol`, `terra`, Other (type the model name).
2. **3D work (build, Tripo clean-up, topology, review fixes)**: `Claude Opus 5.5`, `Claude Fable 5.1`, `Claude Sonnet 5.5`, Other.
3. **Effort for 3D work**: `medium`, `high`, `low`, Other (`xhigh`, `max`).
4. **Skill creation and updates**: `Claude Sonnet 5.5`, `Claude Opus 5.5`, `GPT (type model: astra, sol, ...)`, Other (e.g. `Claude Haiku 5.5`).

Light tasks (intake, verdict, export) follow question 4's Claude choice at low effort unless the lead types another model. Write the answers to `model_routing.json` (`last_changed` = today). A GPT model name is stored exactly as typed; it is not verified.

## 2. How a routed model is used

A chat cannot switch its own model. So:

| `how` | What happens |
|---|---|
| `chat` | The handoff note for the next chat starts with "Open this chat with **<model>, <effort>**". At the start of a chat, if the chat's model differs from the routing for its stage, say so in one line and offer: `continue on this model`, `delegate this stage to <model>` (subagent), `stop and reopen`. |
| `subagent` | Claude runs the task in a helper on the routed Claude model (Agent tool `model`: opus / fable / sonnet / haiku), gives it the skill files to read, and checks the result before saving. |
| `by_hand` | Concept images and GPT skill drafts: Claude writes the exact prompt and states the model to pick in ChatGPT; the lead pastes or uploads the result. |
| GPT through T3 | If the lead routes skill work to GPT and the T3 GPT provider is available, delegate there. If it fails (this account returned "not eligible for subscription sharing" on 2026-10-29), fall back to `by_hand` and say so. |

## 3. Per-stage routing table

| Stage | Task key | Default |
|---|---|---|
| Concept image (if needed) | `concept_image` | GPT astra, by hand |
| Intake, analysis, tri allocation | `intake_analysis` | Sonnet 5.5 medium |
| Claude build | `build_3d` | Opus 5.5 medium |
| Tripo clean-up and fit | `tripo_cleanup` | Opus 5.5 medium |
| Topology, tris, colour | `topology_tris_colour` | Opus 5.5 medium |
| Review loop fixes | `review_fix` | Opus 5.5 medium |
| Verdict, export, logging | `verdict_export` | Sonnet 5.5 low |
| New skill / skill update | `skill_work` | Sonnet 5.5 medium (subagent) |

## Rules

- Never change `model_routing.json` without the popup.
- Log the model actually used per stage in `<master>\Notes\handoff_*.md` and in `quality_log.csv` (tokens per model if known), so the batch step can compare models.
- Model names offered are the current Claude family (Opus 5.5, Fable 5.1, Sonnet 5.5, Haiku 5.5) and the GPT names the lead uses; Other always allows a typed name.
