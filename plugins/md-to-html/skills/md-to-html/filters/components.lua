-- Components for md-to-html:
--   [Critical]{.sev}     - severity badge; class comes from the text (keywords in ../i18n/*.json, any language)
--   [Done]{.sev}         - task status badge: Done / In progress / Planned / New
--   [3]{.score}          - 0-5 score dot (color by value; "4-5" uses the first digit)
--   ::: kpis             - list "- **12** Critical" becomes a row of number cards
--   ```mermaid gantt```  - rendered as a CSS timeline (no JavaScript)
--   ```mermaid``` other  - rendered by mermaid.js from a CDN (needs internet when opened)
--   ![Fig. 1](x.svg)     - SVG inlined so it inherits the page font and colors

local i18n = dofile(pandoc.path.join({ pandoc.path.directory(PANDOC_SCRIPT_FILE), "i18n.lua" }))
local labels = i18n.labels("en")
local SEV = i18n.keywords()

local function esc(s) return (s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;")) end

local function sev_class(text)
  local t = pandoc.text.lower(text):gsub("^%s+", ""):gsub("%s+$", "")
  if SEV[t] then return SEV[t] end
  local w = t:match("^([^%s/,]+)")
  return w and SEV[w]
end

function Span(el)
  if el.classes:includes("sev") then
    el.classes:insert("sev-" .. (sev_class(pandoc.utils.stringify(el)) or "info"))
    return el
  end
  if el.classes:includes("score") then
    local n = tonumber(pandoc.utils.stringify(el):match("%d"))
    if n then el.classes:insert("score-" .. math.min(n, 5)) end
    return el
  end
end

-- Several badges side by side (e.g. "[New]{.sev} [In progress]{.sev}") stay on one line
function Plain(el)
  local n = 0
  for _, x in ipairs(el.content) do
    if x.t == "Span" and x.classes:includes("sev") then n = n + 1
    elseif x.t ~= "Space" then return nil end
  end
  if n < 2 then return nil end
  local spans = {}
  for _, x in ipairs(el.content) do if x.t == "Span" then table.insert(spans, x) end end
  return pandoc.Plain({ pandoc.Span(spans, { class = "sev-group" }) })
end

local function kpis(div)
  local list = div.content[1]
  if not list or list.t ~= "BulletList" then return nil end
  local html = { '<div class="kpis">' }
  for _, item in ipairs(list.content) do
    local inl = item[1] and item[1].content or {}
    local value, rest = "", {}
    for i, x in ipairs(inl) do
      if i == 1 and x.t == "Strong" then value = pandoc.utils.stringify(x) else table.insert(rest, x) end
    end
    local label = pandoc.utils.stringify(rest):gsub("^%s+", "")
    local cls = sev_class(label) or "accent"
    table.insert(html, string.format('<div class="kpi kpi-%s"><div class="kpi-value">%s</div><div class="kpi-label">%s</div></div>',
      cls, esc(value), esc(label)))
  end
  table.insert(html, "</div>")
  return pandoc.RawBlock("html", table.concat(html, "\n"))
end

function Div(el)
  if el.classes:includes("kpis") then return kpis(el) end
end

-- Mermaid gantt -> CSS timeline ---------------------------------------------

local function trim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end
local function date(s)
  local y, m, d = s:match("^(%d%d%d%d)-(%d%d)-(%d%d)$")
  return y and os.time({ year = tonumber(y), month = tonumber(m), day = tonumber(d), hour = 12 })
end
local function add_duration(t, s)
  local n, u = s:match("^(%d+)([dwM])$")
  if not n then return nil end
  n = tonumber(n)
  if u == "d" then return t + n * 86400 end
  if u == "w" then return t + n * 7 * 86400 end
  local dt = os.date("*t", t); dt.month = dt.month + n; return os.time(dt)
end

local function gantt(src)
  local title, sections, cur, ends, last_end = nil, {}, nil, {}, nil
  for line in (src .. "\n"):gmatch("([^\n]*)\n") do
    line = trim(line)
    local kw, rest = line:match("^(%a+)%s+(.*)$")
    if line == "" or line == "gantt" or line:match("^%%%%") then
    elseif kw == "title" then title = rest
    elseif kw == "section" then cur = { name = rest, tasks = {} }; table.insert(sections, cur)
    elseif kw and (kw == "dateFormat" or kw == "axisFormat" or kw == "excludes" or kw == "todayMarker" or kw == "tickInterval" or kw == "weekday") then
    else
      local name, meta = line:match("^(.-)%s*:%s*(.+)$")
      if name then
        if not cur then cur = { name = "", tasks = {} }; table.insert(sections, cur) end
        local tags, parts = {}, {}
        for p in meta:gmatch("[^,]+") do
          p = trim(p)
          if p == "done" or p == "active" or p == "crit" or p == "milestone" then tags[p] = true else table.insert(parts, p) end
        end
        local id, s, e
        if #parts >= 3 then id, s, e = parts[1], parts[2], parts[3]
        elseif #parts == 2 then s, e = parts[1], parts[2]
        else e = parts[1] end
        local start
        if s then
          local after = s:match("^after%s+(%S+)")
          start = after and ends[after] or date(s)
        else start = last_end end
        if not start then return nil end
        local finish = date(e or "") or add_duration(start, e or "")
        if tags.milestone and not finish then finish = start end
        if not finish then return nil end
        if id then ends[id] = finish end
        last_end = finish
        table.insert(cur.tasks, { name = name, s = start, e = finish, tags = tags })
      end
    end
  end
  local lo, hi
  for _, sec in ipairs(sections) do for _, t in ipairs(sec.tasks) do
    lo = (not lo or t.s < lo) and t.s or lo; hi = (not hi or t.e > hi) and t.e or hi
  end end
  if not lo then return nil end
  -- snap to whole months
  local a = os.date("*t", lo); a.day = 1; lo = os.time({ year = a.year, month = a.month, day = 1, hour = 0 })
  local b = os.date("*t", hi); local hi2 = os.time({ year = b.year, month = b.month + ((b.day == 1 and b.hour <= 12) and 0 or 1), day = 1, hour = 0 })
  hi = hi2 > lo and hi2 or hi
  local span = hi - lo
  local function pct(t) return string.format("%.3f", (t - lo) / span * 100) end

  local ticks, months, step = {}, 0, 1
  do local d = os.date("*t", lo); local t = lo
    while t < hi do months = months + 1; d.month = d.month + 1; t = os.time({ year = d.year, month = d.month, day = 1, hour = 0 }) end end
  step = months <= 12 and 1 or (months <= 24 and 3 or 6)
  do local d = os.date("*t", lo); local i = 0
    while true do
      local t = os.time({ year = d.year, month = d.month + i, day = 1, hour = 0 })
      if t >= hi then break end
      local td = os.date("*t", t)
      table.insert(ticks, { p = pct(t), label = (i % step == 0) and ((labels.months or {})[td.month] .. " " .. string.format("%02d", td.year % 100)) or nil })
      i = i + 1
    end end

  local h = { '<figure class="gantt">' }
  if title then table.insert(h, '<figcaption>' .. esc(title) .. '</figcaption>') end
  table.insert(h, '<div class="g-body">')
  local grid = {}
  for _, tk in ipairs(ticks) do table.insert(grid, '<i style="left:' .. tk.p .. '%"></i>') end
  table.insert(h, '<div class="g-grid">' .. table.concat(grid) .. '</div>')
  local axis = {}
  for _, tk in ipairs(ticks) do if tk.label then table.insert(axis, '<span style="left:' .. tk.p .. '%">' .. tk.label .. '</span>') end end
  table.insert(h, '<div class="g-row g-axis"><div class="g-label"></div><div class="g-track">' .. table.concat(axis) .. '</div><div class="g-dur"></div></div>')
  for si, sec in ipairs(sections) do
    if sec.name ~= "" then table.insert(h, '<div class="g-section g-c' .. ((si - 1) % 5 + 1) .. '">' .. esc(sec.name) .. '</div>') end
    for _, t in ipairs(sec.tasks) do
      local cls = "g-bar g-c" .. ((si - 1) % 5 + 1)
      for tag in pairs(t.tags) do cls = cls .. " g-" .. tag end
      local w = math.max(tonumber(pct(t.e)) - tonumber(pct(t.s)), 0.6)
      local tip = os.date("%Y-%m-%d", t.s) .. " - " .. os.date("%Y-%m-%d", t.e)
      local days = (t.e - t.s) / 86400
      local dur = t.tags.milestone and "" or (days >= 28 and string.format("%d%s", math.floor(days / 30.44 + 0.5), labels.duration.month) or string.format("%d%s", math.floor(days + 0.5), labels.duration.day))
      table.insert(h, string.format('<div class="g-row"><div class="g-label">%s</div><div class="g-track"><div class="%s" style="left:%s%%;width:%.3f%%" title="%s"></div></div><div class="g-dur">%s</div></div>',
        esc(t.name), cls, pct(t.s), w, tip, dur))
    end
  end
  table.insert(h, '</div></figure>')
  return table.concat(h, "\n")
end

local has_mermaid = false
function CodeBlock(el)
  if not el.classes:includes("mermaid") then return nil end
  if trim(el.text):match("^gantt") then
    local html = gantt(el.text)
    if html then return pandoc.RawBlock("html", html) end
  end
  has_mermaid = true
  return pandoc.RawBlock("html", '<pre class="mermaid">' .. esc(el.text) .. '</pre>')
end

function Meta(m)
  if has_mermaid then m.has_mermaid = true end
  return m
end

-- ![Fig. 1](diagram.svg) -> the SVG is inlined (inherits the page font and colors)
local base_dir = PANDOC_STATE.input_files[1] and pandoc.path.directory(PANDOC_STATE.input_files[1]) or "."
function Image(el)
  if not el.src:lower():match("%.svg$") or el.src:match("^%a+://") then return nil end
  local path = pandoc.path.is_absolute(el.src) and el.src or pandoc.path.join({ base_dir, el.src })
  local f = io.open(path, "r")
  if not f then return nil end
  local svg = f:read("a"); f:close()
  svg = svg:gsub("^%s*<%?xml.-%?>%s*", ""):gsub("^%s*<!DOCTYPE.->%s*", "")
  return pandoc.RawInline("html", '<span class="svg-figure" role="img" aria-label="' .. esc(pandoc.utils.stringify(el.caption)) .. '">' .. svg .. "</span>")
end

-- Language first (month names, duration units), then the document, then the mermaid flag.
local function load_lang(m) labels = i18n.labels(i18n.lang(m)) end
return {
  { Meta = load_lang },
  { Span = Span, Plain = Plain, Div = Div, CodeBlock = CodeBlock, Image = Image },
  { Meta = Meta },
}
