# Auto-allow sanctioned dev commands so they skip the permission prompt.
def log_path_re: "/tmp/rlr-(test|tsc|lint)\\.log";
def redirect_tail_re: "( > \(log_path_re) 2>&1; echo \"exit=\\$\\?\")?";
def safe_args_re: "( [^`$>;&|]*)?";

def is_yarn_test:
  (.tool_input.command // "")
  | test("^yarn test( run)?\(safe_args_re)\(redirect_tail_re) *$");
def is_yarn_lint:
  (.tool_input.command // "")
  | test("^yarn lint\(safe_args_re)\(redirect_tail_re) *$");
def is_rg_log:
  (.tool_input.command // "")
  | test("^rg\(safe_args_re) \(log_path_re)\(safe_args_re)\(redirect_tail_re) *$");
def is_tsc_noemit:
  (.tool_input.command // "")
  | test("^yarn( run)? tsc --noEmit\(safe_args_re)\(redirect_tail_re) *$");
def is_read_log:
  .tool_name == "Read"
  and ((.tool_input.file_path // "") | test("^\(log_path_re)$"));

if
	is_yarn_test
	or is_rg_log
	or is_tsc_noemit
	or is_yarn_lint
  or is_read_log
then
  { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }
else
  empty
end
