# Auto-allow sanctioned dev commands so they skip the permission prompt.
#
# Grammar:
#   line        := cmd (sep cmd)* trailing-spaces
#   sep         := optional-space ('&&' | ';') optional-space
#   cmd         := (yarn_test | yarn_lint | yarn_tsc | search_log | read_log | count_log) tail?
#   search_log  := rg [flags] <pattern> <log_path>+ [flags]
#   read_log    := (head|tail) [-n] N <log_path>+
#   count_log   := wc [-lwcm] <log_path>+
#   tail        := redir_template | [stderr_redir] pipe_chain | stderr_redir
#   stderr_redir:= '2>&1' | '2>/dev/null'
#   pipe_chain  := (| pipe_cmd)+
#   pipe_cmd    := head|tail [-n] N | wc [-lwcm] | sort [-urnhdiVfb] | uniq [-cdiu] [-fsw N] | rg [flags] <pattern>
#   args        := space-separated tokens; each token is either a strict
#                   char ALLOWLIST run or a single-quoted string
#
# Notes:
#   - Outside quotes, arg chars use an ALLOWLIST (`arg_char_re`): kills
#     control-char / backslash / quote injection in one shot. Oniguruma
#     `[^...]` matches newlines by default, so a denylist there would let
#     `yarn lint foo\nrm -rf /` through.
#   - Inside rg quoted patterns, bash's interpretation rules are narrow and
#     well-defined, so a tight denylist of bash's actual escape set + control
#     chars is exhaustive: single quotes block only `'` + cntrl (bash
#     interprets nothing else inside `'...'`); double quotes block
#     `"`, backtick, `$`, `\` + cntrl. This lets common regex meta
#     (`^ $ ( ) [ ] { } | + ? *`) through inside quotes, where it's safe.
#   - `\A` / `\z` (not `^` / `$`): anchor to absolute string start/end,
#     immune to multi-line trickery.
#   - Redirect template `; echo "<label>=$?"` is consumed atomically inside
#     `tail`, so its inner `;` can never be confused with a chain separator.
#     <label> is any identifier ([A-Za-z_][A-Za-z0-9_]*) — purely cosmetic,
#     so chained stages can be distinguished (`exit=`, `lint=`, `tsc=`).

def log_path_re:
  "/tmp/rlr-(test|tsc|lint|build)\\.log";

def arg_char_re: "[A-Za-z0-9_./:=@,+%-]";

# Single-quoted only: bash interprets nothing inside `'...'`, so the deny set
# collapses to `'` + cntrl. Double quotes would still leak `$`/backtick/`\`,
# and yarn args never need those literal — single is strictly safer here.
def safe_arg_re:
  "(?:\(arg_char_re)+|'[^'[:cntrl:]]*')";
def safe_args_re: "(?: \(safe_arg_re))*";

def redir_label_re: "[A-Za-z_][A-Za-z0-9_]*";
def redir_template_re:
  " > \(log_path_re) 2>&1; echo \"\(redir_label_re)=\\$\\?\"";

# Shared by rg and grep — same shape: short-flag bundles with optional numeric arg.
def grep_like_flags_re:
  "(?: -[a-zA-Z]+(?: ?[1-9][0-9]{0,4})?)*";

def grep_like_pattern_re:
  "(?:\"[^\"`$\\\\[:cntrl:]]*\"|'[^'[:cntrl:]]*'|\(arg_char_re)+)";

def head_tail_re:
  "(?:head|tail)(?: -n)? -?[1-9][0-9]{0,4}";

def wc_re:
  "wc(?: -[lwcm]+)?";

# `sort` flags are an explicit allowlist: omits `-o` (writes file), `-S` (size
# arg can be any string), `-T`/`-t` (paths/separators). Bundles like `-ur` ok.
# `uniq` is a pure stream filter — no file-write flag (unlike sort's `-o`);
# arg-taking flags (`-f`/`-s`/`-w`) are numeric-only.
# `rg` in pipe: any rg flag taking a non-numeric arg (`-r`/`-f`/`-e`/`-t`/`-g`)
# collapses under our value-must-be-numeric rule, so reusing grep_like_flags_re
# is safe (grep is denied at the user-global level, so no recursion concern).
def pipe_cmd_re:
  "(?:\(head_tail_re)"
  + "|\(wc_re)"
  + "|sort(?: -[urnhdiVfb]+)*"
  + "|uniq(?: -[cdiu]+)*(?: -[fsw] [1-9][0-9]{0,4})*"
  + "|rg\(grep_like_flags_re) \(grep_like_pattern_re))";

def stderr_redir_re:
  " (?:2>&1|2>/dev/null)";

def pipe_chain_re:
  "(?: \\| \(pipe_cmd_re))+";

def output_tail_re:
  "(?:"
  + "\(redir_template_re)"
  + "|(?:\(stderr_redir_re))?\(pipe_chain_re)"
  + "|\(stderr_redir_re)"
  + ")?";

def cmd_re:
  "(?:"
  + "yarn test(?: run)?\(safe_args_re)"
  + "|yarn lint\(safe_args_re)"
  + "|yarn(?: run)? tsc --noEmit\(safe_args_re)"
  + "|yarn(?: run)? build\(safe_args_re)"
  + "|rg\(grep_like_flags_re) \(grep_like_pattern_re)(?: \(log_path_re))+\(grep_like_flags_re)"
  + "|\(head_tail_re)(?: \(log_path_re))+"
  + "|\(wc_re)(?: \(log_path_re))+"
  + ")\(output_tail_re)";

def sep_re: "(?: ?(?:&&|;) ?)";

def line_re:
  "\\A\(cmd_re)(?:\(sep_re)\(cmd_re))* *\\z";

# `strings` filters non-string values to an empty stream so `// ""` triggers;
# guards against `test()` erroring if a field arrives as a number/array.
def is_sanctioned_cmd:
  ((.tool_input.command | strings) // "") | test(line_re);

def is_read_log:
  .tool_name == "Read"
  and (((.tool_input.file_path | strings) // "") | test("\\A\(log_path_re)\\z"));

if is_sanctioned_cmd or is_read_log
then { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }
else empty
end
