## Web research (web-research plugin)
- Do not call WebSearch/WebFetch or the browser tools directly in the main conversation. Delegate searches to the `web-research:researcher` agent.
- Use `web-research:browser-researcher` (a real browser) only when the researcher is not enough: content rendered with JavaScript, behind clicks/tabs/pagination/search forms, cookie walls, or WebFetch returning empty or blocked content. It costs more, so try the researcher first unless the site is known to need a browser.
- In every request give the concrete question and limits sized to the task: for the researcher - max searches, max opened pages, answer length in words; for the browser-researcher - start URLs if known, max pages, max interactions, answer length in words.
- For many sites or independent subtopics, launch several agents in one message so they run in parallel, each with its own question and limits. The main conversation does the synthesis.
- Do not launch separate agents for small questions one agent can cover - every agent has a fixed startup cost.
- When the result will be reused, ask the agent to save it to a file and return only the path and a short summary.
