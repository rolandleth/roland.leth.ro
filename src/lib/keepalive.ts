/**
 * Key written by both the scheduled cron (`/api/cron/ping`) and the manual
 * admin trigger (`/api/admin/keepalive`) to keep the Upstash free-tier DB out
 * of the idle-detector. Centralized so a future rename touches both routes at
 * once instead of silently desyncing.
 */
export const KEEPALIVE_KEY = "keepalive:last"
