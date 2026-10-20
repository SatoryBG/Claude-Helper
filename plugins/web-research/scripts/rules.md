## Web research (web-research plugin)
- Do not call WebSearch/WebFetch directly in the main conversation. Delegate searches to the `web-research:researcher` agent.
- In every request to the researcher give the concrete question and limits sized to the task: max number of searches, max number of opened pages and answer length in words.
- For many sites or independent subtopics, launch several researcher agents in one message so they run in parallel, each with its own question and limits. The main conversation does the synthesis.
- Do not launch separate agents for small questions one agent can cover - every agent has a fixed startup cost.
- When the result will be reused, ask the agent to save it to a file and return only the path and a short summary.
