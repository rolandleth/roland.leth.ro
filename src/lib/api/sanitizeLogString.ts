/** Longest payload `sanitizeLogString` keeps before it clamps and appends `…`. */
const MAX_LOG_MESSAGE_LEN = 200

/**
 * Renders an arbitrary string as a single, bounded log payload — strips
 * CR / LF / TAB / NUL so attacker-controlled bytes (a multipart parser's error
 * message, a request header) can't forge fake log lines beneath the real one,
 * and clamps the length so a megabyte-sized value can't blow up the log line.
 */
export function sanitizeLogString(value: string): string {
	const collapsed = value.replace(/[\r\n\t\0]+/g, " ")

	return collapsed.length > MAX_LOG_MESSAGE_LEN
		? `${collapsed.slice(0, MAX_LOG_MESSAGE_LEN)}…`
		: collapsed
}
