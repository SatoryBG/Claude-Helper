-- Shared i18n helper for the md-to-html filters.
-- Labels live in ../i18n/<lang>.json. English is the fallback for any missing key or language.
-- To add a language, drop a new <lang>.json next to en.json - no code changes needed.
local M = {}

local dir = pandoc.path.join({ pandoc.path.directory(PANDOC_SCRIPT_FILE), "..", "i18n" })

local function read(lang)
  local f = io.open(pandoc.path.join({ dir, lang .. ".json" }), "r")
  if not f then return nil end
  local data = pandoc.json.decode(f:read("a"), false)
  f:close()
  return data
end

local function merge(base, over)
  local out = {}
  for k, v in pairs(base) do out[k] = v end
  for k, v in pairs(over or {}) do
    if type(v) == "table" and type(out[k]) == "table" and #v == 0 then out[k] = merge(out[k], v) else out[k] = v end
  end
  return out
end

-- Normalizes "bg-BG", "BG", "en_US" to "bg", "en".
function M.lang(meta)
  local l = meta and meta.lang and pandoc.utils.stringify(meta.lang) or ""
  l = l:match("^(%a+)")
  return l and l:lower() or "en"
end

-- Guess the language when the front matter has no "lang": mostly Cyrillic text -> "bg", otherwise "en".
function M.detect(doc)
  local text = pandoc.utils.stringify(doc.meta.title or "") .. " " .. pandoc.utils.stringify(doc.blocks)
  local cyr, lat = 0, 0
  for _, cp in utf8.codes(text) do
    if cp >= 0x0400 and cp <= 0x04FF then cyr = cyr + 1
    elseif (cp >= 65 and cp <= 90) or (cp >= 97 and cp <= 122) then lat = lat + 1 end
  end
  return cyr > lat and "bg" or "en"
end

-- Labels for one language, with English fallback.
function M.labels(lang)
  local en = read("en") or {}
  if lang == "en" then return en end
  return merge(en, read(lang))
end

-- Keyword -> CSS class map built from ALL language files, so "[Critical]{.sev}"
-- and "[Критичен]{.sev}" work in a document of any language.
function M.keywords()
  local map = {}
  for _, name in ipairs(pandoc.system.list_directory(dir)) do
    local lang = name:match("^(.+)%.json$")
    local data = lang and read(lang)
    for class, words in pairs(data and data.keywords or {}) do
      for _, w in ipairs(words) do map[pandoc.text.lower(w)] = class end
    end
  end
  return map
end

return M
