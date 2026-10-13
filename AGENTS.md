# Agent instructions

This repository is Deploy Sentinel, an Agentia CLI plugin for post-deployment smoke testing of Salesforce orgs.

- To verify a release after a Copado promotion, follow `.cursor/skills/deploy-sentinel/SKILL.md`.
- For Copado and Robotic Testing operations, use the Agentia managed skills (`agentia setup skills create --target agents`) and the Agentia MCP server (`agentia mcp start`).
- Build with `npm run build` and test with `npm test` before linking the plugin with `agentia plugins link .`.
- Simulation output (`--simulate`) is sample data. Always say so when you show it.
