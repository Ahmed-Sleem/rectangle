# AI Capabilities Matrix

Scores: 0 = none · 1 = marketing/basic · 2 = useful production · 3 = category-leading  
**Approximate**, synthesized 2026-07-22 from public materials — not lab benchmarks.

| Capability | Tornix | Procore Helix | ACC AI | P6/OPC | Plane | OpenProject | Buildots | ALICE | nPlan | Planner Copilot |
|------------|:------:|:-------------:|:------:|:------:|:-----:|:-----------:|:--------:|:-----:|:-----:|:---------------:|
| NL Q&A on project data | 2 | 3 | 2 | 1 | 3 | 0–1 | 1 | 1 | 1 | 2 |
| Status / report gen | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 1 | 2 | 2 |
| RFI/submittal agents | 1 | 3 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| Daily log agent | 1 | 3 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Schedule explain / delay | 2 | 2 | 2 | 2 | 1 | 0 | 3 | 3 | 3 | 1 |
| Generative scheduling | 2* | 1 | 1 | 1 | 0 | 0 | 1 | 3 | 1 | 1 |
| Monte Carlo / risk ML | 2* | 1 | 2 | 2 | 0 | 1 | 1 | 2 | 3 | 1 |
| Photo / CV progress | 0–1 | 2 | 1 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| Safety vision | 0 | 2 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| Takeoff / BOQ AI | 2* | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| Meeting transcript AI | 2 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 3 |
| Multi-agent orchestration | 2* | 3 | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 1 |
| Agent builder (customer) | 1 | 3 | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 1 |
| Arabic AI UX | 3* | 0–1 | 0–1 | 0 | 0–1 | 1 | 0 | 0 | 0 | 0 |
| Strategy / BSC AI | 2* | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| Human-in-loop controls | ? | 2 | 2 | 2 | 2 | n/a | 2 | 2 | 2 | 2 |

\*Tornix marks are **claims from marketing** (tornix-docs) — production depth UNVERIFIED without app login.

## AI architecture patterns to copy

1. **Intelligence layer** spanning modules (Helix) — single retrieval graph  
2. **Citations** mandatory in UI  
3. **Prebuilt agents + builder**  
4. **Agents as principals** (identity, permissions, audit)  
5. **MCP/tool APIs** for external systems  
6. **Domain specialists via integration** (CV, generative schedule) not reimplemented  
7. **Daily autonomous brief** with escalate-only (Tornix AI Twin story)

## Data prerequisites for AI that works
Without structured RFIs, cost codes, and schedule activities, LLMs hallucinate.  
**AI quality = data model discipline + retrieval**, not only model choice.
