# Webinar lifecycle scenarios

Every id below is implemented in `src/lib/webinar` and executed by `tests/webinar-scenarios.test.ts`. A missing id fails that test.

Attendance is push, not poll. Zoom, Demio, GoTo Webinar, and the generic webhook deliver join/leave as they happen. The live-leave call is placed inside that HTTP request. Later steps (redial, SMS, email) are stored with a due time and fired by `POST /api/webinar/tick` (every minute) or by the call-outcome webhook, whichever comes first. A no-answer pulls the rejoin SMS forward immediately instead of waiting out the clock.

WebinarJam and EverWebinar only document registration and "attended". Those map to register/join. A true sub-second leave from those products needs their events relayed in the generic shape (or a provider that emits leave).

Recovery stops in the same turn as a rejoin, any reply, STOP / opt-out, or a booking. Pending steps are cancelled. A step that already left the building cannot be unsent.

| Id | What happens | Expected behavior |
| --- | --- | --- |
| S01_register_schedules_reminders | Person registers before a future start | State `registered`. Email at T-24h, SMS at T-1h and T-10m. No call. |
| S02_join_cancels_reminders | They join | State `in_room`. Pending reminders cancelled. |
| S03_late_join_flagged | Join more than `WEBINAR_LATE_JOIN_SEC` (default 10 min) after start | `late` is set. State is still `in_room`. |
| S04_leave_immediate_call | They leave a live room | State `left`. One call is initiated before the handler returns. SMS stays scheduled (~45s), not sent yet. |
| S05_pitch_drop_copy | Leave inside `WEBINAR_OFFER_WINDOW_SEC` of `offerAt` (default 3 min) | State `pitch_drop`. SMS names the drop-off at the useful part and includes the rejoin link. |
| S06_rejoin_cancels_recovery | They rejoin before the SMS is due | State `in_room`. No further calls or texts. |
| S07_duplicate_event_noop | Provider retries the same event id | Second delivery is a no-op. One call. |
| S08_stale_leave_after_rejoin_ignored | A leave older than the rejoin arrives late | Ignored as stale. Recovery stays cancelled. |
| S09_newer_join_beats_older_leave | Join is already recorded; an older leave arrives | Ignored. They stay `in_room`. No call. |
| S10_no_answer_accelerates_sms | Call outcome is no-answer | Rejoin SMS is sent in that outcome turn, with the one-tap link. |
| S11_voicemail_script_on_first_call_only | First dial, then the next scheduled dial | First call carries a voicemail script (AMD drop where the voice transport supports it). The next call does not. |
| S12_rejoin_after_no_answer_stops | They rejoin after the no-answer SMS | No further calls or texts. |
| S13_sms_stop_opts_out_all_sessions | They reply STOP while registered for two webinars | Both rows become `opted_out`. One confirmation text. Nothing else sends. |
| S14_sms_natural_language_stops_and_replies | They reply in normal language | Escalation stops. One agentic reply (live model when configured, template otherwise). No more redials. |
| S15_booked_terminal | A booking event arrives | State `booked`. Pending steps cancelled. |
| S16_no_show_never_joined | Session ends and they never joined | State `no_show`. A call is due about a minute later (so a late join webhook can still win), then SMS and email with the replay link. |
| S17_replay_stops_live_recovery | Replay starts during live recovery | State `replay`. Live redials and the rejoin SMS are cancelled. |
| S18_replay_complete_followup | They finish the replay and have not booked | State `follow_up`. A follow-up email goes out on its delay, with the replay link. |
| S19_quiet_hours_defer_scheduled_not_live_leave | 23:30 in the lead's zone | The live-leave call still dials (they were just in the room). A no-show call waits until quiet hours end (default 21:00–08:00). |
| S20_sunday_blocks_scheduled_not_live_leave | Sunday afternoon | Live-leave call still dials. Scheduled calls and SMS wait until Monday. Email is not held for Sunday. |
| S21_daily_call_cap_defers | `WEBINAR_MAX_CALLS_PER_DAY` is 1 | The second call is deferred to the next open day, not dropped and not dialed. |
| S22_missing_consent_skips_call_sends_email | No call consent and no SMS consent | The call is skipped (`no_consent`). The rejoin email sends immediately. Registration alone is consent for email about that event, not for a phone call or a text. |
| S23_duplicate_registration_merges | The same email registers twice for one session | One row. Reminders are not duplicated. |
| S24_concurrent_webinars_isolated_until_opt_out | They are in two sessions and leave one | Only that session starts recovery. The other session's reminders stay. |
| S25_provider_failure_retries_then_sms | The voice provider fails twice | The call is tried twice, then the rejoin SMS sends, and an alert fires. |
| S26_wrong_number_stops_calls_keeps_email | Outcome is wrong-number | Phone is marked invalid. Further calls and texts to that number stop. Email continues. |
| S27_short_hangup_stops_redial | Connected for under 8 seconds | Treated as a hangup. Redials stop. One SMS with the link may already have been pulled forward. |
| S28_busy_stays_in_recovery | Outcome is busy | They stay in recovery. The next call still happens inside the caps. |
| S29_dnc_blocks_every_channel | Registration is flagged do-not-contact | State `opted_out`. No call, no marketing email. A single opt-out confirmation is allowed. |
| S30_leave_before_session_live_ignored | A leave arrives while the session is still scheduled | Ignored. No call. |
| S31_webhook_rejects_bad_signature | Production webhook with a bad HMAC | 401. The event is not applied. |
| S32_zoom_url_validation | Zoom `endpoint.url_validation` | Returns `plainToken` and the HMAC `encryptedToken`. |
| S33_zoom_participant_left_normalized | Zoom `webinar.participant_left` | Canonical `attendance.left`, phase `live`, email kept. |
| S34_leave_to_call_latency_under_one_second | Leave, in-process and through `POST /api/webinar/events` | Call initiation is under 1000ms from receipt. This measures our handler, not the provider's delivery delay. |
| S35_demio_webinarjam_goto_normalize | Demio leave, WebinarJam registration, GoTo `registrant.left` | Each becomes the canonical event. WebinarJam "attended" maps to join; it has no native leave. |
| S36_email_reply_stops_recovery | They reply to the email | Escalation stops. One agentic email reply. No more redials. |
| S37_session_call_cap | `WEBINAR_MAX_CALLS_PER_SESSION` is 1 | The next call is skipped, not deferred. |
| S38_connected_call_moves_to_followup | A real conversation (connected, 40s) | Rejoin redials cancel. State `follow_up`. A later follow-up email remains. |
| S39_verbal_opt_out_on_call | The call is flagged opt-out | State `opted_out`. Confirmation text. No further outreach. |
| S40_live_leave_without_prior_join_still_calls | Leave arrives and the join webhook was missed | Still treated as a live leave. The call goes out. |
| S41_replay_drop_near_offer | They drop the replay near the offer | State `pitch_drop`, but the call is not a live-room override (quiet hours and Sunday still apply). |
| S42_session_end_then_stale_leave | They were in the room at the end; an older leave arrives after | State `attended`. The stale leave does not start a recovery call. |

## Compliance defaults

Configurable. Unset means these values, not unlimited.

| Limit | Default | Env |
| --- | --- | --- |
| Calls / day | 3 | `WEBINAR_MAX_CALLS_PER_DAY` |
| SMS / day | 2 | `WEBINAR_MAX_SMS_PER_DAY` |
| Emails / day | 3 | `WEBINAR_MAX_EMAILS_PER_DAY` |
| Calls / session | 4 | `WEBINAR_MAX_CALLS_PER_SESSION` |
| SMS / session | 3 | `WEBINAR_MAX_SMS_PER_SESSION` |
| Emails / session | 3 | `WEBINAR_MAX_EMAILS_PER_SESSION` |
| Voicemail drops / session | 1 | `WEBINAR_MAX_VOICEMAIL_DROPS` |
| Quiet hours (lead timezone) | 21:00–08:00 | `WEBINAR_QUIET_START_HOUR`, `WEBINAR_QUIET_END_HOUR` |
| No Sunday calls or SMS | on | `WEBINAR_BLOCK_SUNDAY` |
| Call consent required | on | `WEBINAR_REQUIRE_CALL_CONSENT` |
| SMS consent required | on | `WEBINAR_REQUIRE_SMS_CONSENT` |
| Live-leave call may bypass the clock | on | `WEBINAR_LIVE_CALL_OVERRIDE` |
| Lead timezone when unknown | `Europe/London` | `WEBINAR_DEFAULT_TIMEZONE` |

UK mobile numbers (`+44`) resolve to `Europe/London`. NANP numbers use the area-code zone already used by the dialer. Quiet hours are inside both the US TCPA window (8:00–21:00) and Ofcom's evening cutoff. STOP, a verbal opt-out, and a do-not-contact flag suppress every session for that email and phone.

## What is not covered

- Provider delivery delay before the webhook hits us. Once the request is in the process, call initiation is under a second (S34). A provider that only polls attendance cannot meet that.
- WebinarJam / EverWebinar native leave events. They do not emit them. Relay leave in the generic payload if you need the instant call.
- Voicemail drop audio on a raw Twilio `CALL_TWIML_URL` that does not run the call gateway. The `voicemail` script is sent on the voice webhook payload. The gateway speaks it when AMD says machine. A bare Twilio URL does not.
- Carrier-level DNC lists we have not been given. A number is suppressed when this system recorded STOP, a verbal opt-out, or `doNotContact`.
- A human-quality live conversation when `ANTHROPIC_API_KEY` is unset. Replies still go out, from the same template brain the rest of the product uses.
