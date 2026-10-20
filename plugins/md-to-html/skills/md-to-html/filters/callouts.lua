-- GitHub alerts (> [!WARNING]) get a localized title and the "callout" class.
-- Also exposes the page UI labels to the template as metadata "ui".
local i18n = dofile(pandoc.path.join({ pandoc.path.directory(PANDOC_SCRIPT_FILE), "i18n.lua" }))
local labels = i18n.labels("en")

local function set_lang(m)
  labels = i18n.labels(i18n.lang(m))
  local f, c = labels.filter or {}, labels.copy or {}
  m.ui = {
    toc = labels.toc, source = labels.source, generated = labels.generated,
    filter_all = f.all, filter_search = f.search, filter_shown = f.shown,
    copy = c.copy, copied = c.copied, copy_failed = c.failed,
  }
  return m
end

local function Div(el)
  for kind, label in pairs(labels.callouts or {}) do
    if el.classes:includes(kind) and el.content[1]
       and el.content[1].t == "Div" and el.content[1].classes:includes("title") then
      el.content[1].content = { pandoc.Plain({ pandoc.Str(label) }) }
      el.classes:insert("callout")
      return el
    end
  end
end

-- pandoc's commonmark_x does not render task lists, so "[x]" and "[ ]" are replaced by hand.
local function task_mark(inlines)
  local a, b, c = inlines[1], inlines[2], inlines[3]
  if a and a.t == "Str" and (a.text == "[x]" or a.text == "[X]") then return "☑", 1 end
  if a and a.t == "Str" and a.text == "[" and b and b.t == "Space" and c and c.t == "Str" and c.text == "]" then return "☐", 3 end
end

local function BulletList(el)
  local changed = false
  for _, item in ipairs(el.content) do
    local blk = item[1]
    if blk and (blk.t == "Plain" or blk.t == "Para") then
      local mark, n = task_mark(blk.content)
      if mark then
        for _ = 1, n do blk.content:remove(1) end
        if blk.content[1] and blk.content[1].t == "Space" then blk.content:remove(1) end
        blk.content:insert(1, pandoc.RawInline("html", '<span class="task">' .. mark .. '</span> '))
        changed = true
      end
    end
  end
  if changed then return pandoc.Div({ el }, { class = "task-list" }) end
end

-- Settle the language first (front matter "lang", or detected from the text), then process the blocks.
local function settle_lang(doc)
  if not doc.meta.lang then doc.meta.lang = i18n.detect(doc) end
  doc.meta = set_lang(doc.meta)
  return doc
end

return { { Pandoc = settle_lang }, { Div = Div, BulletList = BulletList } }
